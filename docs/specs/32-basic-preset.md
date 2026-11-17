# Headless preset basic: a simple test portal in the same cluster

Issue: #32 · Status: Implemented · Release: 2.8.0

## Summary
`preset: "basic"` (headless only) generates Lab 1 (DX Compose with Derby, Web Engine and the default HCL components,
no directory, external database, IQ or Search) for an unattended Job in the same cluster. It uses a pull secret that
already exists and a Harbor proxy of hclcr.io, so no personal HCL token is needed. First consumer: the button
*Install a new portal › Basic* of the HCL DX plugin of Backstage (plataforma/backstage-europesip F6).

## Specification
- `PRESETS.basic`: dir none, db none, no lab1b, lab3, lab3b, iqdb, iqrag, lab4 or lab5. `normalise` switches off
  CI/CD, Keycloak and SOPS. Not offered on the web page.
- An output layer, `src/basic.js` `applyBasic`, runs after `applyRegistry`. The frozen engine is untouched, and the
  other presets produce the same folder (test).
  - `lab-base/namespaces.yaml`: only `DX_NS`. `install.sh` (`--cleanup`, the summary) and `uninstall.sh` never name
    `SHARED_NS`.
  - `IMAGE_PULL_SECRET`: no `regcred` document. The values use that Secret. Step 1-1 reads its
    `.dockerconfigjson` into a temporary file, and every `helm pull oci://` gets `--registry-config`.
  - `TLS_ISSUER`: the Ingress gets the `cert-manager.io/cluster-issuer` annotation and TLS Secret `dx-tls-public`.
    HAProxy keeps `dx-tls-cert`, which is self-signed.
- `BASIC_DAM` true (default, asked by Andrés): Lab 1 complete. false: `persistence`, `digitalAssetManagement`,
  `imageProcessor` and `contentComposer` off (Web Engine, HAProxy, Ring API, runtime controller).
- `IMAGE_PULL_SECRET`, `TLS_ISSUER` and `BASIC_DAM` are refused for the other presets.
- Image: `src/`, `bin/` and `openssl`, so a Job with the installer image runs `node bin/dx-installer.mjs generate`
  and then `install.sh --yes`.

## Test plan
- Unit tests in `test/headless.test.mjs`:
  - namespaces, pull secret, registry config, issuer, `bash -n`;
  - the chosen password with `secrets: "include"`;
  - the options refused for other presets.
- Lab, EUROPESIP cluster: a Job installs `dx-basic-1` through `harbor.k3s.europesip.com/hclcr-proxy` with the
  ExternalSecret `harbor-hclcr-pull`, and `uninstall.sh` removes it (done with Backstage F6).
