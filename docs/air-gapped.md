# Air-gapped: your own registry for every image and chart

**English** · [Español](air-gapped.es.md)

With *Use another image registry* the HCL images and charts come from your own registry (Harbor, Quay, Artifactory,
Nexus...) instead of hclcr.io. Choose **All images and charts** (headless: `REGISTRY_SCOPE: "all"`, #51) and nothing
of the installation comes from a public registry any more: not the HCL images, not the third-party ones (OpenLDAP,
CloudNativePG and PostgreSQL, Keycloak, OpenBao, External Secrets Operator, Argo CD, LiteLLM, the DX Delivery Operator,
ÓRBITA, the EUROPESIP MCP server, the helper images of Jobs), and not the Helm charts.

The default scope, **HCL images only** (`REGISTRY_SCOPE: "hcl"`), keeps the behaviour of earlier releases: the folder
is exactly the same.

## What the folder brings

| Path | What it is |
|---|---|
| `mirror/IMAGES.txt` | The inventory for the chosen preset and options: every image, chart and manifest, **source → target** |
| `mirror/images.json` | The same inventory as JSON, for your tools (vulnerability scanning, approval workflows) |
| `mirror/images.list`, `charts.list`, `files.list` | The plain lists the scripts read |
| `mirror/mirror-images.sh` | Copies everything to your registry and downloads the manifests (see below) |
| `mirror/check-images.sh` | Pre-flight: checks that every image, chart and manifest is in your registry |
| `mirror/values/<chart>.yaml` | The images each third-party chart uses by default, moved to your registry |
| `mirror/manifests/` | Filled in by `mirror-images.sh`: the manifests the installation applies from GitHub (Keycloak operator, CRDs of the DX Delivery Operator), already rewritten to your registry |

And every reference of the generated files points to your registry:

- `image:`, `imageName:` and `repository:` of the values and manifests (EUROPESIP MCP server, CloudNativePG cluster,
  LiteLLM, the DAM volume pod of the single-node PoC...);
- the HCL charts and images (`images.repository` of DX, IQ and Search);
- the third-party charts: `helm repo add` disappears and every `helm upgrade` uses `oci://<your registry>/...`;
- the images the charts use by default (they are not written in the folder): `install.sh` adds
  `-f mirror/values/<chart>.yaml` as the last values file of each `helm upgrade`;
- the manifests downloaded from `raw.githubusercontent.com` are read from `mirror/manifests/`.

## Path layout

| `REGISTRY_LAYOUT` | Target of `docker.io/library/postgres:18.1-alpine` | Target of the DX Web Engine |
|---|---|---|
| `host` (default) | `<registry>/docker.io/library/postgres:18.1-alpine` | `<registry>/hclcr.io/dx-compose/webengine:<tag>` |
| `flat` | `<registry>/library/postgres:18.1-alpine` | `<registry>/dx-compose/webengine:<tag>` (as with *HCL images only*) |

`host` keeps the original registry as the first folder, so two registries can never collide; it is the one we
recommend. `flat` keeps the original path without its registry. The generation stops with an error if two sources
would land on the same target. Charts from Helm repositories that are not OCI go to
`<registry>/<repository host>/<path>/<chart>` (`host`) or `<registry>/<REGISTRY_CHARTS_PATH>/<chart>` (`flat`,
default `charts`). `<registry>` is the address you typed, with its project (for Harbor, `harbor.example.com/mirror`).

## Steps

1. **Generate the folder** with *Use another image registry · All images and charts* (or the headless keys below).
2. **Copy the images and charts** with `mirror/mirror-images.sh` on a machine that reaches the Internet and your
   registry. It needs `helm` (3.8 or later), `curl` and one of `skopeo`, `crane` or `oras`:

   ```bash
   export SRC_HCL_USER='<e-mail of your HCL account>' SRC_HCL_TOKEN='<CLI secret of hclcr.io>'   # HCL images are not public
   export DEST_USER='<user of your registry>' DEST_PASSWORD='<password or token>'
   export DOCKERHUB_USER='<user>' DOCKERHUB_TOKEN='<token>'     # optional: the Docker Hub pull rate limit
   ./mirror/mirror-images.sh --dry-run    # what it would do
   ./mirror/mirror-images.sh              # images (every platform), charts (helm pull + helm push) and manifests
   ```

   No machine reaches both sides? Run `./mirror/mirror-images.sh --save /media/usb/dx` on the Internet side (images as
   OCI archives with skopeo, the chart `.tgz` and the manifests), carry the folder and the directory, and run
   `./mirror/mirror-images.sh --load /media/usb/dx` on the registry side (copy `DIR/mirror/manifests` into `mirror/`).
   Nothing is stored in the folder: the logins are environment variables, or sign in yourself first with
   `skopeo login` / `crane auth login` / `oras login` and `helm registry login`.
3. **Copy the whole folder**, with `mirror/manifests/`, to the machine that runs `install.sh`.
4. **Trust the CA of your registry** if it is not a public one:
   - this machine: copy it to `internals-ca/registry-ca.crt` (the folder of the corporate CAs). `install.sh`,
     `mirror-images.sh` and `check-images.sh` add it to the CAs of helm, skopeo, crane and oras (`SSL_CERT_FILE`);
   - the cluster nodes: the container runtime must trust it, which the folder cannot do for you: containerd
     (`/etc/containerd/certs.d/<host>/hosts.toml` or the system CAs), k3s (`/etc/rancher/k3s/registries.yaml`),
     CRI-O (`/etc/containers/certs.d/<host>/ca.crt`) or OpenShift (`image.config.openshift.io/cluster`,
     `additionalTrustedCA`).
5. **Run `./install.sh`.** Its first step (after the namespaces) signs Helm in, creates the pull secret `regcred` in
   every namespace the installation uses (`DX_NS`, `SHARED_NS`, the CI/CD namespace, `default` with the PoC) and sets it
   on their `default` ServiceAccount, for the helper pods and Jobs. Then it runs `mirror/check-images.sh`: if an image,
   chart or manifest is missing, the installation stops before anything is installed and lists what is missing.
   The webinar does the same at the start of `prepare.sh` and asks for the password (or reads `REGISTRY_PASSWORD`), so
   it never lands in the script.

## Options (also headless)

| Key | Default | What it does |
|---|---|---|
| `REGISTRY_SCOPE` | `hcl` | `hcl`: only the HCL images and charts · `all`: every image and chart |
| `REGISTRY_LAYOUT` | `host` | `host` or `flat` (table above) |
| `REGISTRY_CHARTS_PATH` | `charts` | Folder of the non-OCI charts with the `flat` layout |
| `MIRROR_TOOL` | `auto` | Tool of `mirror-images.sh` for the images: `auto` (the first of skopeo, crane, oras), `skopeo`, `crane`, `oras`; `--tool` overrides it |
| `MIRROR_PREFLIGHT` | `strict` | Pre-flight: `strict` stops when something is missing, `warn` only reports, `off` skips it; the `MIRROR_PREFLIGHT` environment variable overrides it when `install.sh` runs |

`REGISTRY`, `REGISTRY_USER` and `REGISTRY_PASSWORD` are the same as with *HCL images only*. An empty user means
anonymous pulls: no pull secret, no Helm login. With the `basic` preset the pull secret is `IMAGE_PULL_SECRET` (it
already exists) and the pre-flight uses the logins of skopeo, crane or oras on the machine that runs it.

```json
{"preset": "all", "DX_HOST": "dx.example.com", "altRegistry": true, "REGISTRY": "harbor.example.com/mirror",
 "REGISTRY_USER": "robot$dx", "REGISTRY_SCOPE": "all", "REGISTRY_LAYOUT": "host"}
```

## Known limits

- **The cluster itself.** Kubernetes, the CNI, CoreDNS, the Ingress controller and the CSI drivers are not part of the
  folder. A single-node k3s (platform PoC) needs its air-gap images tarball or `registries.yaml` (see the k3s
  documentation); Traefik comes with k3s.
- **The CA of the registry on the nodes** has to be configured by the cluster administrator (step 4).
- **Chart test pods.** `helm test` of LiteLLM uses `busybox` written in the chart template, with no value to change
  it; the installation never runs `helm test`.
- **New chart versions.** The images a chart uses by default are listed per chart version in `src/mirror.js`
  (measured with `helm template` and the values of the folder). The unit tests fail if a pinned chart version has no
  list, so a new version cannot silently leave a public image behind; the list must then be measured again.
- **What you deploy later is yours to mirror.** The folder knows the images of the installation. The OCI artifacts
  and images you name later in your own resources (DX Delivery Operator imports, exports and Script Application
  bundles, your own Script Applications) come from the registries you write there.
- **Digests.** Images are copied by tag (every platform). If your policy requires digests, pin them in your registry
  (for example with Harbor immutability rules) after the copy.
