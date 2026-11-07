# HCL DX Compose Installer

**English** · [Español](README.es.md)

A guided web installer for **HCL DX Compose**, by [EUROPESIP](https://www.europesip.com). It takes you
from the environment to a working portal, one screen at a time, in English or Spanish (it starts in the
language of your browser):

1. **What DX Compose is** and what it needs (Kubernetes).
2. **Your environment.**
   - **Your own cluster:** the requirements, the commands to validate it (StorageClasses RWO and RWX,
     Ingress) and a confirmation before going on.
   - **No cluster:** it helps you create one.
     - On your **Windows PC (WSL2)** or a **Linux machine**: a single-node k3s, the guides with every command.
     - On **AWS**, with a price estimate and a clear cost warning:
       - a **single EC2 instance** with k3s and Longhorn;
       - **Amazon EKS**;
       - **ROSA** (Red Hat OpenShift on AWS, experimental).

     The installer creates the AWS environment for you, shows its progress, gives you the kubeconfig and
     deletes everything when you finish.
3. **Quick deployments:**
   - **Everything**: every stage and every extra;
   - **Custom**: choose the stages;
   - **Webinar · Showroom**: exactly what the webinar shows, in two phases (a preparation before the
     session and the demo).
4. **Your details**: the HCL registry, OpenRouter (for the AI assistant), passwords.
5. **Download** a ready-to-run installation:
   - **All / Custom**: `dx-compose-install.zip`, with `install.sh`, `uninstall.sh`, `RUNBOOK.md` and every
     file (Helm values, Secrets, LDIF, properties) already filled in.
   - **Webinar**: `dx-compose-webinar.zip`, with `prepare.sh` (phase 1: every prerequisite except
     LiteLLM, then it stops), `demo.sh` (phase 2: stages 0 to 5, one command at a time) and the
     **presenter's script in Word**. The script covers each stage, what to tell, the commands, the values
     to look at in the YAML files and the secrets that are created.

The stages are the same in every mode:

| Stage | What it does |
|---|---|
| 0 · Prerequisites | Namespaces and the dependencies the chosen stages need (OpenLDAP, PostgreSQL, LiteLLM) |
| 1 · Base DX installation | DX Compose, its secrets, the HCL charts from hclcr.io and external access |
| 2 · LDAP configuration | DX authenticates against OpenLDAP (demo users) or your Active Directory |
| 3 · Transfer to an external database | The Web Engine moves from Derby to PostgreSQL or Oracle |
| 4 · AI Assistant | HCL DX IQ with LiteLLM and OpenRouter (extras: EUROPESIP MCP, IQ sessions, RAG) |
| 5 · Search | OpenSearch and Search V2 |
| Extras | Sample Script Application (Hello DX), [ÓRBITA](https://github.com/europesip/orbita) |

> It is meant for **proofs of concept and test environments**, not for production.

## Your data

- **Installation details:** the installation (scripts, RUNBOOK, Word script) is generated **in your
  browser**. What you type in the steps of the installation, credentials included, is not sent to any
  server. Your choices are remembered in your browser (never the credentials).
- **AWS keys:** they are sent only when you ask the installer to create or delete an AWS environment.
  They go to the installer's own server (the pod or container you run), which passes them to the AWS
  CLI for that operation only. They are never written to disk or to the logs.
- **Auditing:** the source code is here for you to audit.

> ⚠️ **Reachable from outside? Turn on authentication.** If you deploy the installer on a machine or cluster that can be
> reached from the Internet or from other networks, enable its user and password (`auth.enabled=true` in the Helm chart,
> or `AUTH_USER` / `AUTH_PASSWORD` in Docker). Otherwise anyone who reaches the page can use it, including its AWS
> functions with their own keys (or disable those with `aws.enabled=false`).

## Run it with Docker

```bash
docker run --rm -p 8080:8080 ghcr.io/europesip/hcl-dx-compose-installer:2.0.0
```

Open http://localhost:8080. The image runs as a non-root user and works with a read-only root file system
(`--read-only --tmpfs /tmp`). It includes the tools for the AWS environments: AWS CLI, eksctl, ROSA CLI,
oc, kubectl, Helm and ssh.

Basic authentication (optional): `-e AUTH_USER=admin -e AUTH_PASSWORD='S3cret!'`. Without the AWS
functions: `-e AWS_ENABLED=false`.

## Install it in Kubernetes or OpenShift (Helm)

```bash
helm upgrade --install dx-installer oci://ghcr.io/europesip/charts/hcl-dx-compose-installer \
  --version 2.0.0 -n dx-installer --create-namespace \
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

## AWS environments from your own machine

The scripts the page runs are in [`server/aws`](server/aws). You can run them yourself with the AWS CLI
(and eksctl for EKS, rosa and oc for ROSA):

```bash
cd server/aws
NAME=dx-compose-poc REGION=eu-west-1 ./ec2-create.sh     # or eks-create.sh / rosa-create.sh
NAME=dx-compose-poc REGION=eu-west-1 ./ec2-destroy.sh    # deletes everything tagged dx-installer=NAME
```

| Script | What it creates | Approx. price (eu-west-1) |
|---|---|---|
| `ec2-create.sh` | one m6i.4xlarge (Ubuntu 24.04, 200 GB gp3) with k3s, Helm, Longhorn and the StorageClasses `dx-deploy-rwo` / `dx-deploy-rwx`, Traefik; DX at `dx-demo.<IP>.nip.io` | ~0.89 USD/hour |
| `eks-create.sh` | EKS with 2 × m6i.2xlarge in its own VPC, EBS CSI (RWO), EFS CSI and an EFS file system (RWX), ingress-nginx behind an NLB, a kubeconfig with its own token | ~1.08 USD/hour |
| `rosa-create.sh` | ROSA with hosted control planes, 2 workers, EBS and EFS (experimental) | ~2 USD/hour |

They cost money while they exist: delete them when you finish.

## How it works

| Path | What it is |
|---|---|
| `src/App.jsx`, `src/views.jsx`, `src/aws-view.jsx`, `src/ui.jsx`, `src/i18n.js` | Interface (React + Tailwind CSS, English and Spanish) |
| `src/state.js` | Form values, quick deployments, dependencies between stages |
| `src/engine/core.js` | Generation engine: lab files, steps, `install.sh` |
| `src/engine/stages.js` | Stages 0-5 and extras, the two phases of the webinar, `RUNBOOK.md` |
| `src/bundle.js`, `src/zip.js` | The zip, credential masking, the key values of each YAML file |
| `src/word.js` | Word script of the webinar |
| `src/aws.js`, `server/aws/*.sh` | AWS sizes and price estimates; the scripts that create and delete the environments |
| `server/index.mjs` | Server: the page, and the API that runs the AWS scripts and streams their output |
| `Dockerfile`, `chart/hcl-dx-compose-installer` | Container image and Helm chart |

The engine started as option C of the configuration wizard of the
[labs](https://github.com/europesip/hcl-dx-compose-labs), which is frozen now. `test/golden.e2e.mjs`
checks that, for the same state, the engine still produces the same lab files and commands as that wizard.

## Development

```bash
npm ci
PORT=8080 npm start &               # the server (API), with the AWS tools in the PATH
npm run dev                         # http://localhost:5173 (sends /api to :8080)
npm test                            # unit tests
WIZARD=/path/to/hcl-dx-compose-labs/docs/index.html node test/golden.e2e.mjs
npm run build && npm start          # production build on http://localhost:8080
```

GitHub Actions runs the tests, the golden test and the build. It builds the image (amd64 and arm64) and
tests the container: tools, headers, API, read-only, and the whole interface with the downloads. It then
publishes `ghcr.io/europesip/hcl-dx-compose-installer` (`:main` on every push; `:X.Y.Z` and the Helm chart
on a `vX.Y.Z` tag).

## Contributing

Contributions are welcome: new options, environments, languages or fixes. Open an issue or a pull request.

## Licence

[MIT](LICENSE). See [NOTICE](NOTICE). HCL, HCL Digital Experience and HCL DX Compose are trademarks of HCL
Technologies; this project is not an HCL product. The charts and images of HCL are downloaded from HCL's
registry with your own HCL account.

## Contact

EUROPESIP · https://www.europesip.com · info@europesip.com
