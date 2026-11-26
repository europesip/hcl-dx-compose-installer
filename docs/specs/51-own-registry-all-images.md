# Own registry for every image and chart (full mirror, air-gapped)

Issue: #51 · Status: Implemented · Release: Unreleased

## Summary
*Use another image registry* only swapped `hclcr.io` (the HCL charts and the images of DX, IQ and Search). Every other
component still pulled from public registries, so an air-gapped installation was not possible. The option gets a
scope: *HCL images only* (default, as before) or *All images and charts*.

## Current behaviour
`src/registry.js` (output layer) rewrites `oci://hclcr.io/`, `repository: "hclcr.io"`, the pull secret host and the
registry login. Keycloak, OpenLDAP, OpenBao, External Secrets Operator, CloudNativePG, Argo CD, LiteLLM, ÓRBITA, the
DX Delivery Operator, the EUROPESIP MCP server and helper images keep their public registries; `install.sh` adds Helm
repositories and downloads manifests from GitHub.

## Specification
- New answers (`src/state.js`, headless schema): `REGISTRY_SCOPE` `hcl` (default) | `all`; `REGISTRY_LAYOUT` `host`
  (default, `<registry>/<original host>/<path>`) | `flat` (`<registry>/<path>`); `REGISTRY_CHARTS_PATH` (`charts`, non-OCI
  charts with `flat`); `MIRROR_TOOL` `auto` | `skopeo` | `crane` | `oras`; `MIRROR_PREFLIGHT` `strict` | `warn` | `off`.
- With `hcl` the folder is byte-identical to before (test).
- With `all` (output layer `src/mirror.js`, before `applyRegistry`; the engine stays frozen):
  - `mirror/IMAGES.txt`, `images.json`, `images.list`, `charts.list`, `files.list`: images, charts and manifests of the
    chosen preset, source → target;
  - `mirror/mirror-images.sh` (skopeo / crane / oras, helm pull + helm push, `--dry-run`, `--only`, `--save` /
    `--load` with skopeo, logins from environment placeholders, no secrets) and `mirror/check-images.sh`;
  - every `image:`, `imageName:`, `repository:`, `helm repo add`, `oci://` chart and raw GitHub manifest is rewritten;
    the images a chart uses by default go into `mirror/values/<chart>.yaml`, added as the last `-f` of its upgrade;
  - the HCL images and charts follow the layout (`<registry>/hclcr.io/...` with `host`);
  - a first step (after the namespaces; in the webinar, in `prepare.sh` with a password prompt) signs Helm in,
    creates the pull secret in every namespace used (and on its `default` ServiceAccount) and runs the pre-flight;
    CNPG `Cluster` and `Keycloak` get `imagePullSecrets`;
  - the CA of the registry is `internals-ca/registry-ca.crt` (the corporate CA folder of `src/corporate-ca.js`), added
    to `SSL_CERT_FILE` by the scripts;
  - two sources with the same target, or a chart version without its image list, are generation errors.

## Acceptance criteria
- [x] With `all`, no public registry host (docker.io, quay.io, ghcr.io, registry.k8s.io, gcr.io, hclcr.io,
  mcr.microsoft.com, public.ecr.aws, ecr-public.aws.com, raw.githubusercontent.com, `*.github.io` Helm repositories...)
  is left outside comments and the `mirror/` inventory, for every preset and the main options (`test/mirror.test.mjs`).
- [x] Every image of the values and manifests and every chart of the scripts is in the inventory.
- [x] `helm template` of every third-party chart with the folder values renders only registry images (checked by hand
  for the pinned versions; LiteLLM's `helm test` pod is the only exception, see the limits).
- [ ] An installation from a mirrored Harbor succeeds (lab cluster).

## Out of scope
The cluster images (k3s, CNI, Ingress controller), the CA of the registry on the nodes, images named later in the
user's own resources. See [docs/air-gapped.md](../air-gapped.md), *Known limits*.

## Test plan
- Unit: `test/mirror.test.mjs` (no public host, inventory, bash, pull secrets, layouts, `--dry-run`, pre-flight
  strict/warn, HCL-only unchanged); `npm test`.
- Golden: `node test/golden.e2e.mjs` (engine untouched).
- Lab: mirror to a Harbor project with `mirror-images.sh`, then `install.sh` on a cluster without Internet egress.
