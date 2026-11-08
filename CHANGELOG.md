# Release history

**English** · [Español](CHANGELOG.es.md)

To go back to an earlier release, run its image (`ghcr.io/europesip/hcl-dx-compose-installer:<version>`) or its chart
(`helm upgrade dx-installer oci://ghcr.io/europesip/charts/hcl-dx-compose-installer --version <version> --reuse-values`,
with `image.tag` set to that version if you pinned it). The new options are off by default: without them, the generated
installation is the same as in 2.0.x.

## 2.4.0 · 2026-11-08 · Script Application operator 0.3.0

- The operator is installed at **0.3.0**, whose resources all have the DX prefix: the hello sample is now a
  `DXScriptApplication` (and `DXPage`), and the Argo CD health checks and `--cleanup` use `DXScriptApplication`,
  `DXDamCollection` and `DXDatabase` (DXDatabase now supports PostgreSQL, Oracle and SQL Server).
- Re-running an older installation: the new hello sample adopts the application already in DX; the old
  `ScriptApplication` stays in Kubernetes (see the migration notes of the operator 0.3.0 to remove it).

## 2.3.1 · 2026-11-08 · Script Application operator 0.2.1

- The operator is installed at **0.2.1**: it manages DX **themes** too (DXTheme), and it no longer stays in `DXError` (HTTP
  401) after DX restarts — which happens in every installation, since DX is upgraded after the operator is installed.
- Its CRDs are applied from the operator's tag before its chart: Helm only installs CRDs on the first install, so
  re-running the installation over an older operator now gets the new DXTheme CRD too.
- Argo CD health check and `--cleanup` cover DXTheme.

## 2.3.0 · 2026-11-08 · Keycloak theme, logout, retries and resources

- **Keycloak login theme**: the default Keycloak theme (with the Keycloak logo) or, ticking *EUROPESIP login theme*, an
  EUROPESIP theme (logo, colours, gradient background) mounted from a ConfigMap. **Full logout**: "Log out" in DX also
  ends the Keycloak session.
- **Downloads are retried** in `install.sh` (charts, repositories, manifests); a `helm upgrade` is retried only when the
  chart could not be downloaded.
- **Resource estimate**: the deployment pages, the download page and RUNBOOK.md show the CPU and memory the chosen
  installation asks for, split into HCL software, prerequisites and extras, with the warning that the HCL requirement only
  covers the HCL software. The AWS sizes are checked against the biggest installation.
- **AWS**: cost per hour, per day and per month (24×7) in the breakdown of the chosen size.
- **Webinar script (Word / PDF)**: an appendix on the advanced options and the resources.
- `install.sh --collect` no longer warns "could not copy the Liberty logs" when they were copied.

## 2.2.0 · 2026-11-08 · Own image registry, Keycloak, version on screen

- **Version and build date in the footer**, so it is clear which release is running.
- **Use another image registry** (replaces the "air-gapped, under construction" option): the HCL images and charts come
  from your Harbor, Quay, Artifactory... instead of hclcr.io, with a dialog explaining the conditions (a copy of the
  images with the same names, or a proxy / mirror). The HCL account e-mail is asked separately, only for the PostgreSQL
  table script.
- **Keycloak (single sign-on)**, pre-integrated with the OpenLDAP of the installation, optional and independent of
  OpenBao: official operator, realm with LDAP federation, and the OIDC layer of DX. The optional IQ checks sign in with
  the portal form when it is on, and ÓRBITA 3.1.2 is used. Why each setting is there: [docs/third-party.md](docs/third-party.md).
- The Script Application operator is installed at 0.1.3 (works with DX on OpenID Connect).
- [docs/third-party.md](docs/third-party.md): the peculiarities of every third-party product (OpenLDAP, PostgreSQL,
  LiteLLM, MCP, OpenBao, Argo CD, Keycloak).

## 2.1.2 · 2026-11-08 · Advanced CI/CD

- **Advanced CI/CD** in the Custom deployment: OpenBao (secrets manager) with External Secrets Operator, Argo CD and the
  Script Application operator; off by default, not on OpenShift yet.
- **Use the secrets manager**: no credential in the zip; only the Harbor user is asked. [docs/openbao.md](docs/openbao.md).
- The image build retries its downloads (2.1.0 and 2.1.1 were tagged but never published because of a GitHub outage
  and a fix of that fix).

## 2.0.x · 2026-11-07

- 2.0.0: the new installer (React + Tailwind, own engine, AWS environments, quick deployments including the webinar).
- 2.0.1 - 2.0.3: ROSA sign-in, documentation, webinar script in Word and PDF, folders named after their content, MCP over
  HTTPS, Claude directly (Anthropic API) as AI provider.
