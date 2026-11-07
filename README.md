# HCL DX Compose Installer

**English** · [Español](README.es.md)

A web installer for **HCL DX Compose** and the [EUROPESIP HCL DX Compose labs](https://github.com/europesip/hcl-dx-compose-labs).
Answer a few questions (platform, host name, what to install, credentials) and download a
**ready-to-run installation**:

- **`dx-compose-labs-install.zip`**: the `dx-install/` folder with `install.sh`, `uninstall.sh`,
  `RUNBOOK.md` and every file (Helm values, Secrets, LDIF, properties…) already filled in with your
  values, plus the Word guide.
- **`RUNBOOK.md`**: every step with its command, in order.
- **A Word guide (`.docx`)**: what will be installed, how to run it, the commands of every step, the
  commands that create Secrets and keys, the **key values each YAML file sets** compared with the lab
  template, and the YAML files themselves. Credentials can be hidden in it (on by default).

It runs as a **pod** in your cluster (Helm chart) or as a **Docker container**, and works in English
and Spanish.

## Your credentials stay in your browser

The installer is a static page. Everything is generated **in the browser**: nothing you type,
credentials included, reaches the pod or any other server. The page is served with a
Content-Security-Policy with `connect-src 'none'`, so the browser itself blocks any network request
from it. The choices you make (never the credentials) are remembered in your browser only.

## Run it with Docker

```bash
docker run --rm -p 8080:8080 ghcr.io/europesip/hcl-dx-compose-installer:1.0.0
```

Open http://localhost:8080. The image runs as a non-root user and works with a read-only root file
system (`--read-only --tmpfs /tmp`).

Basic authentication (optional): mount an htpasswd file and a two-line configuration:

```bash
htpasswd -nbB admin 'S3cret!' > htpasswd
printf 'auth_basic "DX installer";\nauth_basic_user_file /etc/nginx/htpasswd/htpasswd;\n' > auth.conf
docker run --rm -p 8080:8080 -v "$PWD/auth.conf:/etc/nginx/auth/auth.conf:ro" \
  -v "$PWD/htpasswd:/etc/nginx/htpasswd/htpasswd:ro" ghcr.io/europesip/hcl-dx-compose-installer:1.0.0
```

## Install it in Kubernetes or OpenShift (Helm)

```bash
helm upgrade --install dx-installer oci://ghcr.io/europesip/charts/hcl-dx-compose-installer \
  --version 1.0.0 -n dx-installer --create-namespace \
  --set ingress.enabled=true --set ingress.className=traefik --set ingress.host=installer.example.com
```

| Value | Default | What it does |
|---|---|---|
| `image.repository` / `image.tag` | `ghcr.io/europesip/hcl-dx-compose-installer` / chart appVersion | Image (use a mirror in air-gapped clusters) |
| `imagePullSecrets` | `[]` | For a private registry |
| `replicaCount` | `1` | Replicas (the page has no state) |
| `service.type` / `service.port` / `service.nodePort` | `ClusterIP` / `80` | `ClusterIP`, `NodePort` or `LoadBalancer` |
| `ingress.enabled` / `className` / `host` / `annotations` | `false` | Kubernetes Ingress |
| `ingress.tls.enabled` / `ingress.tls.secretName` | `false` | HTTPS; empty secret name: the controller's default certificate |
| `route.enabled` / `route.host` / `route.tls.termination` | `false` / generated / `edge` | OpenShift Route instead of the Ingress |
| `auth.enabled` / `auth.htpasswd` / `auth.existingSecret` | `false` | Basic authentication (htpasswd line, or a Secret with the key `htpasswd`) |
| `resources` | 10m / 32Mi requests | CPU and memory |
| `podSecurityContext` / `securityContext` | non-root, read-only root FS, no capabilities, seccomp | Runs under the OpenShift `restricted-v2` SCC |
| `nodeSelector` / `tolerations` / `affinity` / `priorityClassName` | empty | Scheduling |
| `podAnnotations` / `podLabels` | empty | Extra metadata |
| `networkPolicy.enabled` / `networkPolicy.from` | `false` | Only lets traffic in to the pod port; no egress |
| `podDisruptionBudget.enabled` | `false` | PDB with `minAvailable` |

Without an Ingress or a Route: `kubectl -n dx-installer port-forward svc/dx-installer-hcl-dx-compose-installer 8080:80`.

## Then, run the installation

On a machine with `bash`, `kubectl`, `helm`, `curl` and `python3` pointing to your cluster:

```bash
unzip dx-compose-labs-install.zip && cd dx-install
./install.sh            # every step, showing the lab and the step it is in
./install.sh --list     # list of steps
./install.sh --from 1-4 # resume from a step
./uninstall.sh          # delete everything it created
```

## How it works

The installer is **option C (direct installation) of the configuration wizard** of the labs, with a
new interface. To keep one single source of truth, the generation engine is not rewritten: it is
**extracted from the wizard** (`docs/index.html` of the labs) by `scripts/sync-engine.mjs` into
`src/engine/wizard-engine.js`, so the lab files, the steps, `RUNBOOK.md` and `install.sh` are
exactly the ones of the wizard. The test `test/golden.e2e.mjs` checks it: for the same answers, the
installer and the wizard produce the same files. This app adds the React interface, the Word guide
(`src/word.js`, with [docx](https://github.com/dolanmiu/docx)) and the container.

| Path | What it is |
|---|---|
| `src/App.jsx`, `src/i18n.js`, `src/styles.css` | Interface (five steps, English and Spanish) |
| `src/state.js` | Form values, dependencies between options, mapping to the engine state |
| `src/bundle.js` | Zip, credential masking, key values of each YAML file |
| `src/word.js` | Word guide |
| `src/engine/wizard-engine.js` | Engine extracted from the wizard (generated, do not edit) |
| `nginx.conf`, `Dockerfile` | Container: unprivileged nginx with security headers |
| `chart/hcl-dx-compose-installer` | Helm chart |

## Development

```bash
npm ci
npm run dev                         # http://localhost:5173
npm test                            # unit tests
npm run sync-engine -- /path/to/hcl-dx-compose-labs/docs/index.html   # after the labs change
WIZARD=/path/to/hcl-dx-compose-labs/docs/index.html node test/golden.e2e.mjs
npm run build && npm run preview    # production build
```

GitHub Actions runs the tests, the golden test against the labs, builds the image (amd64 and arm64),
tests the container (headers, read-only, the whole interface with downloads) and publishes
`ghcr.io/europesip/hcl-dx-compose-installer` (`:main` on every push, `:X.Y.Z` and the Helm chart on a
`vX.Y.Z` tag).

## Licence

[Apache License 2.0](LICENSE), like the labs. See [NOTICE](NOTICE). HCL, HCL Digital Experience and
HCL DX Compose are trademarks of HCL Technologies; this project is not an HCL product. The charts and
images of HCL are downloaded from HCL's registry with your own HCL account.

## Contact

EUROPESIP · https://www.europesip.com · info@europesip.com
