#!/bin/bash
# User data of the single EC2 instance: k3s (one node, its Traefik as the Ingress controller),
# Helm, Longhorn and the two StorageClasses the labs expect (dx-deploy-rwo / dx-deploy-rwx).
# Progress in /var/log/dx-installer-setup.log; /var/lib/dx-installer/ready when it is finished.
set -euxo pipefail
exec > >(tee -a /var/log/dx-installer-setup.log) 2>&1
K3S_VERSION="__K3S_VERSION__"
HELM_VERSION="__HELM_VERSION__"
LONGHORN_VERSION="__LONGHORN_VERSION__"
mkdir -p /var/lib/dx-installer

echo "== packages (Longhorn needs iSCSI, and the NFS client for RWX volumes)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q open-iscsi nfs-common jq curl
systemctl enable --now iscsid
modprobe iscsi_tcp || true
# OpenSearch (search) needs a large vm.max_map_count
echo "vm.max_map_count=1048576" > /etc/sysctl.d/90-dx.conf
sysctl --system >/dev/null

echo "== k3s $K3S_VERSION"
T=$(curl -sX PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 300')
PUBIP=$(curl -s -H "X-aws-ec2-metadata-token: $T" http://169.254.169.254/latest/meta-data/public-ipv4)
curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION="$K3S_VERSION" sh -s - --write-kubeconfig-mode 644 --tls-san "$PUBIP"
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
until kubectl get nodes 2>/dev/null | grep -q " Ready"; do sleep 5; done

echo "== Helm $HELM_VERSION"
curl -sfL "https://get.helm.sh/helm-$HELM_VERSION-linux-amd64.tar.gz" | tar xz -C /tmp
install -m 755 /tmp/linux-amd64/helm /usr/local/bin/helm

echo "== Traefik: 10 minute timeouts for large DAM uploads"
cat > /var/lib/rancher/k3s/server/manifests/traefik-config.yaml <<'EOF'
apiVersion: helm.cattle.io/v1
kind: HelmChartConfig
metadata:
  name: traefik
  namespace: kube-system
spec:
  valuesContent: |-
    additionalArguments:
      - "--entryPoints.web.transport.respondingTimeouts.readTimeout=600s"
      - "--entryPoints.websecure.transport.respondingTimeouts.readTimeout=600s"
EOF

echo "== Longhorn $LONGHORN_VERSION (one replica: a single node)"
helm repo add longhorn https://charts.longhorn.io
helm upgrade --install longhorn longhorn/longhorn --version "$LONGHORN_VERSION" -n longhorn-system --create-namespace \
  --set defaultSettings.defaultReplicaCount=1 --set persistence.defaultClassReplicaCount=1 \
  --set persistence.defaultClass=false --wait --timeout 15m

echo "== StorageClasses dx-deploy-rwo and dx-deploy-rwx"
kubectl apply -f - <<'EOF'
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: dx-deploy-rwo
  labels: {app: dx-installer}
provisioner: driver.longhorn.io
allowVolumeExpansion: true
reclaimPolicy: Delete
volumeBindingMode: Immediate
parameters: {numberOfReplicas: "1", dataLocality: disabled, fsType: ext4}
---
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: dx-deploy-rwx
  labels: {app: dx-installer}
provisioner: driver.longhorn.io
allowVolumeExpansion: true
reclaimPolicy: Delete
volumeBindingMode: Immediate
parameters: {numberOfReplicas: "1", dataLocality: disabled, fsType: ext4}
EOF

echo "== RWX test: two pods share a Longhorn volume"
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata: {name: rwx-test, namespace: default}
spec: {accessModes: [ReadWriteMany], storageClassName: dx-deploy-rwx, resources: {requests: {storage: 1Gi}}}
---
apiVersion: v1
kind: Pod
metadata: {name: rwx-writer, namespace: default}
spec:
  containers: [{name: c, image: busybox:1.37, command: [sh, -c, "echo ok > /d/test && sleep 3600"], volumeMounts: [{name: d, mountPath: /d}]}]
  volumes: [{name: d, persistentVolumeClaim: {claimName: rwx-test}}]
---
apiVersion: v1
kind: Pod
metadata: {name: rwx-reader, namespace: default}
spec:
  containers: [{name: c, image: busybox:1.37, command: [sh, -c, "until [ -f /d/test ]; do sleep 2; done; cat /d/test; sleep 3600"], volumeMounts: [{name: d, mountPath: /d}]}]
  volumes: [{name: d, persistentVolumeClaim: {claimName: rwx-test}}]
EOF
kubectl wait pod/rwx-writer pod/rwx-reader --for=condition=Ready --timeout=600s
sleep 5; kubectl logs rwx-reader | grep -q ok
kubectl delete pod rwx-writer rwx-reader --wait=true
kubectl delete pvc rwx-test

touch /var/lib/dx-installer/ready
echo "== READY"
