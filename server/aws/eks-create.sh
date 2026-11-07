#!/usr/bin/env bash
# Creates an Amazon EKS cluster ready for the HCL DX Compose installation:
#   - managed node group (NODES x NODE_TYPE) in its own VPC (eksctl), one NAT gateway;
#   - EBS CSI driver  -> StorageClass dx-deploy-rwo (gp3, ReadWriteOnce);
#   - EFS CSI driver + an EFS file system -> StorageClass dx-deploy-rwx (ReadWriteMany, DAM binaries);
#   - ingress-nginx behind a Network Load Balancer (IngressClass nginx);
#   - a kubeconfig with a token of its own (it does not need the AWS CLI to use it).
# Everything carries the tag dx-installer=NAME, so eks-destroy.sh finds and deletes it.
#
#   NAME=dx-compose-eks REGION=eu-west-1 ./eks-create.sh
#
# It costs money while it exists (control plane, nodes, NAT gateway, load balancer, disks):
# delete it with eks-destroy.sh when you finish.
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/lib.sh"
: "${NODE_TYPE:=m6i.2xlarge}"
: "${NODES:=2}"
: "${NODE_DISK_GB:=100}"
: "${INGRESS_NGINX_VERSION:=4.15.1}"
need aws eksctl kubectl helm python3
check_name
whoami_aws

step "Checking that the cluster $NAME does not exist yet"
if aws_ eks describe-cluster --name "$NAME" >/dev/null 2>&1; then die "the EKS cluster $NAME already exists: delete it first (eks-destroy.sh) or use another NAME"; fi

step "Creating the EKS cluster with eksctl (~20 min)"
CFG="$OUT/eksctl-cluster.yaml"
cat > "$CFG" <<EOF
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig
metadata:
  name: $NAME
  region: $REGION
  tags: {$TAG_KEY: $NAME}
iam:
  withOIDC: true
vpc:
  nat: {gateway: Single}
addons:
  - name: vpc-cni
  - name: coredns
  - name: kube-proxy
  - name: aws-ebs-csi-driver
    wellKnownPolicies: {ebsCSIController: true}
    configurationValues: '{"controller":{"extraVolumeTags":{"$TAG_KEY":"$NAME"}}}'
  - name: aws-efs-csi-driver
    wellKnownPolicies: {efsCSIController: true}
managedNodeGroups:
  - name: workers
    instanceType: $NODE_TYPE
    desiredCapacity: $NODES
    minSize: $NODES
    maxSize: $NODES
    volumeSize: $NODE_DISK_GB
    volumeType: gp3
    privateNetworking: true
    tags: {$TAG_KEY: $NAME}
    labels: {app: dx-installer}
EOF
export KUBECONFIG="$OUT/kubeconfig-admin"
eksctl create cluster -f "$CFG" --kubeconfig "$KUBECONFIG" 2>&1 | sed -u 's/^/  /'
kubectl get nodes | sed 's/^/  /'

step "EFS file system for the ReadWriteMany volumes"
VPC=$(aws_ eks describe-cluster --name "$NAME" --query cluster.resourcesVpcConfig.vpcId)
CIDR=$(aws_ ec2 describe-vpcs --vpc-ids "$VPC" --query 'Vpcs[0].CidrBlock')
EFS_SG=$(aws_ ec2 describe-security-groups --filters Name=vpc-id,Values="$VPC" Name=group-name,Values="$NAME-efs" --query 'SecurityGroups[0].GroupId')
if [ -z "$EFS_SG" ] || [ "$EFS_SG" = None ]; then
  EFS_SG=$(aws_ ec2 create-security-group --group-name "$NAME-efs" --description "EFS for $NAME" --vpc-id "$VPC" --tag-specifications "$(tags security-group)" --query GroupId)
  aws_ ec2 authorize-security-group-ingress --group-id "$EFS_SG" --protocol tcp --port 2049 --cidr "$CIDR" >/dev/null
fi
FS=$(aws_ efs describe-file-systems --query "FileSystems[?Tags[?Key=='$TAG_KEY' && Value=='$NAME']].FileSystemId | [0]")
if [ -z "$FS" ] || [ "$FS" = None ]; then
  FS=$(aws_ efs create-file-system --encrypted --performance-mode generalPurpose --throughput-mode elastic \
        --tags "Key=$TAG_KEY,Value=$NAME" "Key=Name,Value=$NAME" --query FileSystemId)
fi
until [ "$(aws_ efs describe-file-systems --file-system-id "$FS" --query 'FileSystems[0].LifeCycleState')" = available ]; do sleep 5; done
NG_SUBNETS=$(aws_ eks describe-nodegroup --cluster-name "$NAME" --nodegroup-name workers --query 'nodegroup.subnets')
for sn in $NG_SUBNETS; do
  aws_ efs create-mount-target --file-system-id "$FS" --subnet-id "$sn" --security-groups "$EFS_SG" >/dev/null 2>&1 || true
done
until [ "$(aws_ efs describe-mount-targets --file-system-id "$FS" --query "length(MountTargets[?LifeCycleState!='available'])")" = 0 ]; do sleep 10; done
log "EFS $FS, mount targets in $(echo $NG_SUBNETS | wc -w) subnets, NFS allowed from $CIDR"

step "StorageClasses dx-deploy-rwo (EBS gp3) and dx-deploy-rwx (EFS)"
kubectl apply -f - <<EOF
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata: {name: dx-deploy-rwo, labels: {app: dx-installer}}
provisioner: ebs.csi.aws.com
parameters: {type: gp3, encrypted: "true"}
reclaimPolicy: Delete
allowVolumeExpansion: true
volumeBindingMode: WaitForFirstConsumer
---
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata: {name: dx-deploy-rwx, labels: {app: dx-installer}}
provisioner: efs.csi.aws.com
# One EFS access point per volume; files are owned by the uid/gid of DAM (1000/1001)
parameters: {provisioningMode: efs-ap, fileSystemId: $FS, directoryPerms: "775", uid: "1000", gid: "1001", basePath: /dx}
reclaimPolicy: Delete
volumeBindingMode: Immediate
EOF

step "RWO and RWX test volumes"
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata: {name: rwx-test, namespace: default}
spec: {accessModes: [ReadWriteMany], storageClassName: dx-deploy-rwx, resources: {requests: {storage: 1Gi}}}
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata: {name: rwo-test, namespace: default}
spec: {accessModes: [ReadWriteOnce], storageClassName: dx-deploy-rwo, resources: {requests: {storage: 1Gi}}}
---
apiVersion: v1
kind: Pod
metadata: {name: sc-test, namespace: default}
spec:
  containers: [{name: c, image: busybox:1.37, command: [sh, -c, "echo ok > /x/t && echo ok > /o/t && sleep 3600"], volumeMounts: [{name: x, mountPath: /x}, {name: o, mountPath: /o}]}]
  volumes: [{name: x, persistentVolumeClaim: {claimName: rwx-test}}, {name: o, persistentVolumeClaim: {claimName: rwo-test}}]
EOF
kubectl wait pod/sc-test --for=condition=Ready --timeout=600s
kubectl exec sc-test -- sh -c 'cat /x/t /o/t' | sed 's/^/  /'
kubectl delete pod sc-test --wait=true
kubectl delete pvc rwx-test rwo-test --wait=true

step "ingress-nginx behind a Network Load Balancer"
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx >/dev/null 2>&1 || true
helm repo update ingress-nginx >/dev/null
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx --version "$INGRESS_NGINX_VERSION" -n ingress-nginx --create-namespace \
  --set controller.service.annotations."service\.beta\.kubernetes\.io/aws-load-balancer-type"=nlb \
  --set controller.service.annotations."service\.beta\.kubernetes\.io/aws-load-balancer-additional-resource-tags"="$TAG_KEY=$NAME" \
  --set controller.config.proxy-body-size=0 --wait --timeout 10m 2>&1 | tail -3 | sed 's/^/  /'
LB=""
for i in $(seq 1 60); do
  LB=$(kubectl -n ingress-nginx get svc ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
  [ -n "$LB" ] && break; sleep 10
done
[ -n "$LB" ] || die "the load balancer has no name after 10 minutes"
IP=""
for i in $(seq 1 60); do
  IP=$(python3 -c "import socket,sys; print(socket.gethostbyname(sys.argv[1]))" "$LB" 2>/dev/null || true)
  [ -n "$IP" ] && break; sleep 10
done
[ -n "$IP" ] || die "the load balancer name $LB does not resolve yet: try again in a few minutes"
log "load balancer $LB ($IP)"

step "kubeconfig with its own token"
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: ServiceAccount
metadata: {name: dx-installer-admin, namespace: kube-system}
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata: {name: dx-installer-admin}
roleRef: {apiGroup: rbac.authorization.k8s.io, kind: ClusterRole, name: cluster-admin}
subjects: [{kind: ServiceAccount, name: dx-installer-admin, namespace: kube-system}]
---
apiVersion: v1
kind: Secret
metadata: {name: dx-installer-admin-token, namespace: kube-system, annotations: {kubernetes.io/service-account.name: dx-installer-admin}}
type: kubernetes.io/service-account-token
EOF
for i in $(seq 1 30); do TOKEN=$(kubectl -n kube-system get secret dx-installer-admin-token -o jsonpath='{.data.token}' | base64 -d); [ -n "$TOKEN" ] && break; sleep 2; done
SERVER=$(aws_ eks describe-cluster --name "$NAME" --query cluster.endpoint)
CA=$(aws_ eks describe-cluster --name "$NAME" --query cluster.certificateAuthority.data)
KC="$OUT/kubeconfig"
cat > "$KC" <<EOF
apiVersion: v1
kind: Config
clusters: [{name: $NAME, cluster: {server: $SERVER, certificate-authority-data: $CA}}]
users: [{name: dx-installer-admin, user: {token: $TOKEN}}]
contexts: [{name: $NAME, context: {cluster: $NAME, user: dx-installer-admin}}]
current-context: $NAME
EOF
chmod 600 "$KC"
KUBECONFIG="$KC" kubectl get nodes | sed 's/^/  /'

HOST="dx-demo.$IP.nip.io"
cat > "$OUT/README.txt" <<EOF
HCL DX Compose on Amazon EKS ($NAME, $REGION)
  nodes         : $NODES x $NODE_TYPE
  kubeconfig    : export KUBECONFIG=$KC
  DX host name  : $HOST  (nip.io resolves it to one IP of the load balancer $LB;
                  for a stable name, create a DNS CNAME to $LB)
  Ingress class : nginx  ·  StorageClasses: dx-deploy-rwo (EBS gp3) / dx-deploy-rwx (EFS $FS)
It costs money while it exists. Delete everything with:
  NAME=$NAME REGION=$REGION ./eks-destroy.sh
EOF
sed 's/^/  /' "$OUT/README.txt"
python3 - "$NAME" "$REGION" "$HOST" "$KC" "$LB" "$FS" "$NODE_TYPE" "$NODES" <<'EOF'
import json, sys
n, r, h, kc, lb, fs, t, c = sys.argv[1:]
print("::result:: " + json.dumps({"type": "eks", "name": n, "region": r, "dxHost": h, "ingress": "nginx", "loadBalancer": lb,
  "efs": fs, "nodes": f"{c} x {t}", "scRwo": "dx-deploy-rwo", "scRwx": "dx-deploy-rwx", "platform": "kubernetes", "kubeconfig": kc}))
EOF
