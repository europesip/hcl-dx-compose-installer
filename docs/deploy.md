# Deploying the installer: Docker and Helm

**English** · [Español](deploy.es.md) · [README](../README.md)

> ⚠️ **Reachable from outside? Turn on authentication.** If you deploy the installer on a machine or cluster that can be
> reached from the Internet or from other networks, enable its user and password (`auth.enabled=true` in the Helm chart,
> or `AUTH_USER` / `AUTH_PASSWORD` in Docker). Otherwise anyone who reaches the page can use it, including its AWS
> functions with their own keys (or disable those with `aws.enabled=false`).

## Run it with Docker

```bash
docker run --rm -p 8080:8080 ghcr.io/europesip/hcl-dx-compose-installer:2.3.0
```

Open http://localhost:8080. The image runs as a non-root user and works with a read-only root file system
(`--read-only --tmpfs /tmp`). It includes the tools for the AWS environments: AWS CLI, eksctl, ROSA CLI,
oc, kubectl, Helm and ssh.

Basic authentication (optional): `-e AUTH_USER=admin -e AUTH_PASSWORD='S3cret!'`. Without the AWS
functions: `-e AWS_ENABLED=false`.

## Install it in Kubernetes or OpenShift (Helm)

```bash
helm upgrade --install dx-installer oci://ghcr.io/europesip/charts/hcl-dx-compose-installer \
  --version 2.3.0 -n dx-installer --create-namespace \
  --set ingress.enabled=true --set ingress.className=nginx --set ingress.host=installer.example.com \
  --set auth.enabled=true --set auth.username=admin --set auth.password='S3cret!'   # if it is reachable from outside
```

| Value | Default | What it does |
|---|---|---|
| `image.repository` / `image.tag` | `ghcr.io/europesip/hcl-dx-compose-installer` / chart appVersion | Image (use a mirror in air-gapped clusters) |
| `imagePullSecrets` | `[]` | For a private registry |
| `replicaCount` | `1` | Replicas (AWS jobs live in the pod that started them: keep 1 if you use them) |
| `service.type` / `service.port` / `service.nodePort` | `ClusterIP` / `80` | `ClusterIP`, `NodePort` or `LoadBalancer` |
| `ingress.enabled` / `className` / `host` / `annotations` | `false` | Kubernetes Ingress |
| `ingress.tls.enabled` / `ingress.tls.secretName` | `false` | HTTPS; empty secret name: the controller's default certificate |
| `route.enabled` / `route.host` / `route.tls.termination` | `false` / generated / `edge` | OpenShift Route instead of the Ingress |
| `auth.enabled` / `auth.username` / `auth.password` / `auth.existingSecret` | `false` | Basic authentication (or a Secret with the keys `username` and `password`) |
| `aws.enabled` | `true` | Create and delete AWS environments from the page |
| `workDir.sizeLimit` | `1Gi` | Space for the AWS jobs (SSH key, kubeconfig, logs) |
| `resources` | 20m / 96Mi requests | CPU and memory |
| `podSecurityContext` / `securityContext` | non-root, read-only root FS, no capabilities, seccomp | Runs under the OpenShift `restricted-v2` SCC |
| `nodeSelector` / `tolerations` / `affinity` / `priorityClassName` | empty | Scheduling |
| `networkPolicy.enabled` / `networkPolicy.from` | `false` | Only lets traffic in to the pod port; outbound only DNS and HTTPS/SSH/6443 (AWS), nothing without AWS |
| `podDisruptionBudget.enabled` | `false` | PDB with `minAvailable` |

## Then, run the installation

On a machine with `bash`, `kubectl`, `helm`, `openssl`, `curl` and `python3` pointing to your cluster:

```bash
unzip dx-compose-install.zip && cd dx-install
./install.sh            # every step, stage by stage
./install.sh --list     # list of steps
./install.sh --from 4-1 # resume from a step
./install.sh --pause    # show each command and wait for Enter
./uninstall.sh          # delete everything it created
```

Webinar:

```bash
unzip dx-compose-webinar.zip && cd dx-install
./prepare.sh            # phase 1, before the session: stops when the environment is ready
./demo.sh               # phase 2, the day of the demo: stages 0 to 5, one command at a time
./uninstall.sh          # after the webinar
```
