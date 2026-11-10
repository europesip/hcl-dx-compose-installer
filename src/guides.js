// Commands shown in the environment views (they are copied by the user, not run by the installer).
export const K3S_VERSION = "v1.35.5+k3s1";

export const ownChecks = f => {
  const oc = f.platform === "openshift", k = oc ? "oc" : "kubectl";
  return [
    `${k} version\n${k} get nodes -o wide`,
    `# Allocatable capacity of each node
${k} get nodes -o custom-columns=NODE:.metadata.name,CPU:.status.allocatable.cpu,MEMORY:.status.allocatable.memory
# Already requested on each node (the free part is the difference)
${k} describe nodes | grep -A 6 "Allocated resources"
# Real usage now (needs metrics-server; k3s brings it)
${oc ? "oc adm top nodes" : "kubectl top nodes"}`,
    `${k} get storageclass ${f.SC_RWO || "dx-deploy-rwo"} ${f.SC_RWX || "dx-deploy-rwx"}`,
    oc ? "oc get ingresscontroller -n openshift-ingress-operator default -o jsonpath='{.status.domain}'; echo"
       : "kubectl get ingressclass",
    `cat <<'EOF' | ${k} apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata: {name: rwx-test, namespace: default}
spec: {accessModes: [ReadWriteMany], storageClassName: ${f.SC_RWX || "dx-deploy-rwx"}, resources: {requests: {storage: 1Gi}}}
---
apiVersion: v1
kind: Pod
metadata: {name: rwx-writer, namespace: default}
spec:
  containers: [{name: c, image: busybox:1.37, command: [sh, -c, "echo ok > /d/t; sleep 600"], volumeMounts: [{name: d, mountPath: /d}]}]
  volumes: [{name: d, persistentVolumeClaim: {claimName: rwx-test}}]
---
apiVersion: v1
kind: Pod
metadata: {name: rwx-reader, namespace: default}
spec:
  containers: [{name: c, image: busybox:1.37, command: [sh, -c, "until [ -f /d/t ]; do sleep 2; done; cat /d/t; sleep 600"], volumeMounts: [{name: d, mountPath: /d}]}]
  volumes: [{name: d, persistentVolumeClaim: {claimName: rwx-test}}]
EOF
${k} wait pod/rwx-writer pod/rwx-reader --for=condition=Ready --timeout=300s && ${k} logs rwx-reader
${k} delete pod rwx-writer rwx-reader && ${k} delete pvc rwx-test`,
  ];
};

const k3s = `curl -sfL https://get.k3s.io | sudo INSTALL_K3S_VERSION=${K3S_VERSION} sh -s - --write-kubeconfig-mode 644
mkdir -p ~/.kube && sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config && sudo chown $USER:$USER ~/.kube/config && chmod 600 ~/.kube/config
curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash`;

export const wslCmds = [
  {lang: "powershell", cmd: "wsl --update\nwsl --install Ubuntu-24.04 --name dx-poc"},
  {lang: "ini", cmd: "[wsl2]\nmemory=24GB"},
  {lang: "bash", cmd: "cd ~\n" + k3s},
  {lang: "bash", cmd: "kubectl get nodes && helm version --short"},
];
export const linuxCmds = [
  {lang: "bash", cmd: "echo 'vm.max_map_count=1048576' | sudo tee /etc/sysctl.d/90-dx.conf && sudo sysctl --system >/dev/null"},
  {lang: "bash", cmd: k3s},
  {lang: "bash", cmd: "kubectl get nodes && helm version --short"},
];
export const LAB0_GUIDE = {en: "https://github.com/europesip/hcl-dx-compose-labs/blob/main/lab0-poc-wsl/GUIDE.md",
                           es: "https://github.com/europesip/hcl-dx-compose-labs/blob/main/lab0-poc-wsl/GUIDE.es.md"};
