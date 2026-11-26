# Release history

**English** · [Español](CHANGELOG.es.md)

To go back to an earlier release, run its image (`ghcr.io/europesip/hcl-dx-compose-installer:<version>`) or its chart
(`helm upgrade dx-installer oci://ghcr.io/europesip/charts/hcl-dx-compose-installer --version <version> --reuse-values`,
with `image.tag` set to that version if you pinned it). The new options are off by default: without them, the generated
installation is the same as in 2.0.x.

## 2.14.0 · 2026-11-26

Traefik is the Ingress controller installed by default, and two fixes found in the end-to-end test of 2.13.0 on AWS.

- **Traefik, installed by default** (#60). The Ingress class was already Traefik by default, but the folder expected
  the controller to be in the cluster: k3s brings one, a generic cluster without it left DX unreachable. Now, on
  Kubernetes, the first step of stage 0 installs Traefik with Helm (chart `traefik/traefik` 42.4.3, Traefik v3.7.20,
  namespace `traefik`, `LoadBalancer` Service, IngressClass `traefik` that is not the default class, 10 minute read
  timeouts for DAM uploads, `lab-base/traefik-values.yaml`) **only when the cluster has no IngressClass `traefik`**; with
  one (k3s on the EC2 instance or the PoC, a Traefik installed before) it does nothing. Every decision is a default:
  the wizard option *Install Traefik if the cluster has none* and the headless answers `INGRESS_INSTALL` (`true`),
  `TRAEFIK_NS` (`traefik`) and `TRAEFIK_SERVICE` (`LoadBalancer`, `NodePort`, `ClusterIP`). ingress-nginx and other
  classes work as before (never installed), OpenShift keeps its Routes, and the basic preset never installs it. With
  your own registry for every image (#51) Traefik's chart and image are in the inventory and its namespace gets the pull
  secret. `server/aws/eks-create.sh` puts Traefik behind the Network Load Balancer by default (`INGRESS=nginx` keeps
  ingress-nginx, whose project is retired upstream); `eks-destroy.sh` deletes either. `uninstall.sh` leaves the
  controller in place (it is shared by the cluster): `helm uninstall traefik -n traefik` removes it.

- **ÓRBITA on Traefik.** The ÓRBITA chart creates its Ingress with class `nginx` by default, which a Traefik never
  serves: `/orbita-api` answered 404 from DX on the EC2 environment, a PoC k3s or any cluster with Traefik. The step
  now sets `ingress.className` to the class of the cluster (Traefik or the one written in *Other*); with ingress-nginx
  nothing changes. Existing installations: `helm upgrade orbita … --reuse-values --set ingress.className=traefik`.
- **`install.sh --yes` without a terminal** (a CI job, a Pod, a background shell) with OpenBao: `lab-cicd/openbao-secrets.sh`
  stopped with `/dev/tty: No such device or address`. It now says which variable to export (`HCL_HARBOR_TOKEN`,
  `WPSADMIN_PASSWORD`...) and the demo users take the wpsadmin password, as pressing Enter does.

## 2.13.0 · 2026-11-26

DX Delivery Operator 0.17.0, your own LDAP or Active Directory, your own registry for every image (air-gapped), time zone and HCL prerequisites checker, version pinning of older folders, and `install.sh` inside a Pod.

- **Own registry for every image and chart, for air-gapped installations** (#51). *Use another image registry* gets a
  scope: *HCL images only* (default, the folder is the same as before) or **All images and charts**. With the second
  one nothing comes from a public registry: the folder brings an inventory for the chosen preset (`mirror/IMAGES.txt`,
  `mirror/images.json`, source → target), `mirror/mirror-images.sh` (skopeo, crane or oras for the images, helm pull +
  helm push for the charts, `--dry-run`, `--save` / `--load` for a registry with no Internet; logins as environment
  placeholders, no secrets) and a pre-flight, `mirror/check-images.sh`, that `install.sh` runs as its first step after
  creating the pull secret in every namespace (and on their `default` ServiceAccount). Every image and chart reference is
  rewritten: values and manifests, the Helm repositories (`helm repo add` → `oci://`), the operator charts, the
  Keycloak operator and DX Delivery Operator CRD manifests (downloaded into `mirror/manifests/`), and the images the
  charts use by default (`mirror/values/<chart>.yaml`). Also the ldapsearch test pod of an existing directory (#52) and the DX Delivery Operator 0.17.0. Path layout: `<registry>/<original registry>/<path>` (default)
  or flat. The CA of the registry goes to `internals-ca/registry-ca.crt`. Headless answers: `REGISTRY_SCOPE`,
  `REGISTRY_LAYOUT`, `REGISTRY_CHARTS_PATH`, `MIRROR_TOOL`, `MIRROR_PREFLIGHT`. Guide and known limits:
  [docs/air-gapped.md](docs/air-gapped.md). The frozen engine is untouched (output layer `src/mirror.js`).
- **Directory: your LDAP or Active Directory, not only the demo OpenLDAP** (#52). Stage 2 of the page now offers
  *OpenLDAP with demo users* (default, unchanged), *Your LDAP*, *Your Active Directory* or *No directory*. With an
  existing directory no OpenLDAP is installed: `lab-directory/custom-values.directory.yaml` gives DX the native LDAP
  block of the chart (`type: other`, `serverType` Custom or Microsoft Active Directory, `customLdapSecret`), LDAPS with
  the CA of the directory, `preferredLanguage`, and, only when the directory is not shaped like the chart expects, a
  configuration override with its filters, object classes, search bases and login attribute (`uid`, `mail`,
  `sAMAccountName`, `userPrincipalName`). `install.sh` tests the connection before DX (ldapsearch from a temporary
  pod), gives the Administrator role to the admin group (XMLAccess), and Keycloak federates the same directory
  (read-only, vendor `ad` for Active Directory). **The bind password is never written in the folder**: `install.sh`
  asks for it or reads `DIR_BIND_PASSWORD` (OpenBao: `dx/<DX_NS>/ad bindPassword`; or an existing Secret). ÓRBITA does
  not give its demo roles to users of your directory unless `ORBITA_DEMO_PEOPLE` says so. Every setting is a default
  that can be changed, also in headless mode (`dir` `ldap` / `ad`, `DIR_*`). The Active Directory option changes: the
  folder is `lab-directory/` (was `lab-ldap-ad/`), there is no `dx-ad-bind` Secret with the password in clear, and the
  `AD_*` keys are still read; the basic preset keeps `BASIC_LDAP_*` with the same values and also takes `DIR_*`.
  BUILD-INFO.txt names the directory (it said OpenLDAP without one). See [docs/directory.md](docs/directory.md).
- **DX Delivery Operator 0.17.0** (was 0.13.0; #53). The CI/CD extra installs chart
  `oci://ghcr.io/europesip/charts/dx-delivery-operator` 0.17.0 and applies its twelve CRDs first, the new
  `DXJavaExtension` included (also deleted by `--cleanup` and with an Argo CD health check). The installer still sets
  only `dxclient.acceptLicense=true`: the 0.15.0 security context defaults (no fixed UID, `runAsNonRoot`,
  `RuntimeDefault` seccomp, works on OpenShift `restricted-v2`) and `javaExtensions.enabled: false` (no webhook, no
  cert-manager) are kept as they come. The hello sample and the other CRDs are unchanged. A newer operator already in
  the cluster is never downgraded (#2). Docs: docs/openbao.md.
- **Older folders against a newer cluster** (#2). A generated folder records what it was generated with: bundle format
  2, the installer version and the pinned charts at the top of `install.sh` (also `prepare.sh` and `demo.sh`), in its
  header and in `BUILD-INFO.txt` (`bundle.format`, `operator`). The DX Delivery Operator, OpenBao, External Secrets
  Operator and Argo CD are never downgraded: if the cluster already runs a newer chart, the step keeps it and says so
  (the operator is looked for in every namespace, its CRDs are cluster-wide, and its CRDs are not re-applied).
  `install.sh` stops at the start, with the versions that differ, when a newer operator in the cluster does not serve
  the kinds of the folder; step OP-2 checks them before applying the hello sample. `--cleanup` deletes every kind of the
  operator the cluster serves, one by one. Without CI/CD only the version lines are new.
  See [docs/troubleshooting.md](docs/troubleshooting.md).
- **DX settings in the Advanced section: time zone and HCL prerequisites checker** (#3). Two new options on the
  details page, each with an (i) explanation: *Time zone of the DX containers* (IANA name, default `Europe/Madrid`,
  with suggestions; an invalid name is refused with a clear message) and *HCL prerequisites checker* (on by default, as
  in the chart). They set `configuration.containerTimezone` (also in the Search values, so DX and Search stay in the
  same zone) and `configuration.prereqsChecker.enabled` of `lab-base/custom-values.yaml`. The comment of the checker is
  corrected: it is a sidecar in the pods with volumes that checks them every day at 08:00 and only writes to its log; it
  never blocks a pod. RUNBOOK.md, the webinar Word/PDF script and BUILD-INFO.txt describe both settings, with the HCL
  warning: with WCM syndication or DAM Staging, every DX environment must use the same time zone. Headless answers:
  `DX_TIMEZONE`, `prereqsChecker`. With the defaults the values are the same as before (only the comments change);
  the frozen engine is untouched (output layer `src/dxconfig.js`).
- **`install.sh` inside a Pod** (#34): the cluster check uses `kubectl get --raw /version` instead of
  `kubectl version`, which goes to `localhost:8080` with kubectl 1.35 when there is only the in-cluster ServiceAccount
  and no kubeconfig. The summary shows `in-cluster (ServiceAccount)` when there is no kubeconfig context. Output layer
  (`src/retry.js`): the engine and the golden test are unchanged.
- **DX Delivery Operator 0.13.0** (was the *Script Application operator* 0.11.0; operator #52): the CI/CD extra
  installs the renamed operator, chart `oci://ghcr.io/europesip/charts/dx-delivery-operator` and CRDs from
  `europesip/dx-delivery-operator`; every text of the wizard, the RUNBOOK and the docs uses the new name. Includes the
  operator 0.12.0 changes (artifact kinds `theme` and `app`).

## 2.12.0 · 2026-11-22

- **Script Application operator 0.11.0** (was 0.3.1; operator #44, #45, installer #43). The CI/CD extra installs operator
  0.11.0 and applies its 11 CRDs before `helm upgrade` (new: DXWCMLibraryImport, DXWCMLibraryExport, DXExport,
  DXXMLAccess, DXWCMAdminTask); Argo CD health checks and the cleanup cover the new kinds. The hello sample's
  DXConnection uses the new field names `portalCredentialsSecret` and `tlsCASecret` (the old `credentialsSecret` and
  `caSecret` are still accepted by the operator, with a `DeprecatedField` warning) and states `runtime: compose`. The
  operator now asks for 500m CPU / 512 MiB (resource estimator updated). Existing installations: apply the CRDs of
  0.11.0 and `helm upgrade dxop … --version 0.11.0` (RUNBOOK step OP-1 does both); their resources keep working.

- **Docs: DX Core vs Web Engine and external databases** (#41). [docs/core-vs-webengine.md](docs/core-vs-webengine.md): every difference found with #38 in one page — measured product versions (WebSphere ND 9.0.5.29 on IBM Java 8 vs Open Liberty 26.0.0.9 on Semeru 21, RHEL 8.10 vs 9.8), chart values and credentials, tools (ConfigEngine and Config Wizard only on Core, DXClient common, XMLAccess on both), LDAP, database (the Core transfer is only possible with ConfigEngine), import/export (DXConnect vs dxFileTransfer, WCM formats), login, URLs. [docs/databases.md](docs/databases.md): existing server vs test instance per database and runtime, editions and licences, HCL CF239 support, what the installer and the operator create (#40). No change to the generated installation.

## 2.11.0 · 2026-11-22

- **The DX server: DX Compose or DX Core** (#38). *Choose what to install* → *DX server*: **DX Compose (Web Engine)**,
  preselected as always, or **DX Core**, the traditional HCL Digital Experience 9.5 server on WebSphere Application
  Server, from the same chart. Headless: `DX_RUNTIME=compose|core` (default `compose`), also with the `basic` preset.
  Phase 1 for Core: the base portal, with or without DAM, on Derby; the directory, the external database, IQ, Search,
  HCL Leap, the Script Application extra and the CI/CD and Keycloak options are switched off with a note. Core values:
  image `dx/core` (the chart default `dx-compose/core` does not exist in hclcr.io), the secrets `dx-core-wps`,
  `dx-core-was` and `dx-core-configwizard`, `volumes.core` (profile, log, tranlog on `SC_RWO`), `networking.core.host`.
  What Core configures differently, for phase 2: [docs/dx-core-phase2.md](docs/dx-core-phase2.md).
- **Label `dx.europesip.com/runtime`** (`compose` | `core`) on the DX namespace: always with Core and with the `basic`
  preset, so Backstage and the operator can tell the two apart. With DX Compose outside the `basic` preset the
  generated folder is exactly the same as in 2.10.0.

## 2.10.0 · 2026-11-18

- **Preset `basic`: its own PostgreSQL** (#35, `BASIC_PG`): a CloudNativePG Cluster in the DX namespace (the shared
  namespace of the labs is the DX namespace), made with the CNPG operator that is already in the cluster (its install
  and removal are taken out; the install stops if the operator is missing), then the transfer from Derby (~15 min more),
  as Lab 2B. Copy `setup-postgres-dx.sql` into `lab-bbdd/` before `install.sh`. Off by default.

## 2.9.0 · 2026-11-18

- **Preset `basic`: an LDAP that already exists** (#35): `BASIC_LDAP_HOST`, `BASIC_LDAP_PORT`, `BASIC_LDAP_SUFFIX` and
  `BASIC_LDAP_SECRET` (a Secret with `bindUser`/`bindPassword` already in the DX namespace). DX authenticates against
  that directory as in Lab 2A (wpsadmin still works); nothing is installed in another namespace. Off by default.

## 2.8.0 · 2026-11-18

- **Headless preset `basic`** (#32): a simple test portal (Lab 1: DX Compose with Derby) for an unattended Job in
  the same cluster, such as the *Install a new portal › Basic* button of the HCL DX plugin of Backstage. Only the DX
  namespace is created and cleaned up. `IMAGE_PULL_SECRET` uses a pull secret that already exists (no personal HCL
  token; `helm pull` reads it too), and `TLS_ISSUER` gives the Ingress a cert-manager certificate. `BASIC_DAM` (default true: Lab 1
  complete with DAM and Content Composer; false: Web Engine only, about half the resources). Off by default:
  the other presets produce the same folder.
- **Image:** the headless CLI (`node bin/dx-installer.mjs`) and `openssl`, so a Job with the installer image can
  generate the folder and run `install.sh`.

- `catalog-info.yaml` (commented) so that the EUROPESIP developer portal (Backstage) shows the wizard in its catalog
  (#21). Metadata only: no change to the wizard, its image or its chart.

- The demo LDAP users get **`displayName`** ("<name> <surname>", for example Macarena Cortés): HCL People Service
  shows it (its LDAP mapping is `displayName=displayName`); before, the directory listed people without a display name.

- **SOPS (age) for the base secrets of the webinar**, optional and off by default (*Your details › SOPS: encrypted
  secrets*): one or more age **public** keys, each with an optional name; a private key is refused. The zip gets
  `.sops.yaml` (every key, names as comments), prepare.sh a last step that encrypts `lab-base/secret-harbor.yaml` and
  `lab-base/secrets.yaml` with the real `sops` CLI (again, if a demo decrypted them), step 1-1 decrypts them, and the
  RUNBOOK says who can decrypt and how to add or remove a key (`sops updatekeys`). BUILD-INFO.txt names the keys.
- **Webinar, step 0-3:** the HCL Harbor CLI secret is no longer on the command line (nor in RUNBOOK.md / demo.sh): only
  the user, Helm asks for the password; then `ls -l charts/`. Without a terminal, demo.sh reads it from the pull secret.
  The pull secret has its own file, `lab-base/secret-harbor.yaml`.
- **Webinar, IQ deployment key:** back in `lab-iq/custom-iq-values.yaml`, with a comment that says why (hcl-dx-iq 1.0.3
  cannot read it from a Secret) and how to keep it out of Git in clear text (SOPS or `--set`); the Secret
  `iq-deployment-key` and the `--set` of step 4-3 are gone.
- **Webinar, step 0-1:** `kubectl top nodes` (CPU and memory in use on each node), as in the video; it does not stop
  the demo when the cluster has no metrics-server.
- Webinar: no Keycloak/ÓRBITA mentions in the comments of the PostgreSQL cluster and the LDAP layer.

- **Headless mode**: the engine runs without the web page, in Node. `import {generateInstall, schema} from
  "hcl-dx-compose-installer/headless"` and the CLI `dx-installer generate --answers answers.json --out dir` take the
  answers of the wizard (same keys as the page) and return the same `dx-install/` folder. For automation, e.g. a
  Backstage template "New HCL DX environment"; the folder is still installed by a person with real `helm`.
- **No secrets by default**: credentials are refused in the answers; the passwords the installation needs are generated
  at random into `secrets.env`, which the scripts read; `secretFiles` lists the files to keep out of Git. With
  `secrets: "include"` the folder is the same as the page download.
- `schema()` / `dx-installer schema`: JSON Schema of the answers. Examples in `docs/headless-examples/`. Docs:
  [docs/headless.md](docs/headless.md). No change to the web page or the generated folder.

- **TechDocs for Backstage** (#28): `mkdocs.yml`, an overview page for the catalog, a **requirements** page
  (installer and generated installation) and the headless page, in English and Spanish; `catalog-info.yaml` gets
  `backstage.io/techdocs-ref`, so the EUROPESIP Internal Developer Portal shows the docs. Links to files outside
  `docs/` are absolute GitHub links now.

## 2.7.1 · 2026-11-10 · New name: DX Installer Wizard, by EuropeSIP

- **The installer is now called "DX Installer Wizard"** (by EuropeSIP), in the web page, the README, the generated
  files, the Word and PDF scripts and the chart notes: the old name, "HCL DX Compose Installer", could suggest an HCL
  product. It is not: it is an open-source tool by EuropeSIP for HCL DX Compose. Nothing else changes (same repository,
  image and chart names).

## 2.7.0 · 2026-11-10 · Corporate CAs (LDAPS, PostgreSQL over SSL), sign-in by e-mail, the webinar showroom

- **OpenLDAP and PostgreSQL always come with SSL** (any configuration that installs them), as a corporate directory and
  database would: two corporate root CAs, *EUROPESIP Corporate Directory Root CA* and *EUROPESIP Corporate Database
  Root CA*, whose certificates stay in `internals-ca/` (what corporate IT would give you); `prep-pki/` plays the part
  of corporate IT (CA keys and server certificates, preparation only). OpenLDAP serves LDAPS (636) and requires TLS
  (`olcSecurity: tls=1`); PostgreSQL (CloudNativePG) uses its own server certificate and rejects any connection
  without SSL (`hostnossl all all all reject`). The OpenSearch CA stays separate.
- **DX trusts the corporate CAs** through `configuration.webEngine.customTruststoreSecrets` (secret `dx-corporate-cas`),
  connects to the LDAP over LDAPS (`port: 636`, `sslEnabled: true`) and to PostgreSQL with
  `?sslmode=verify-full` (the only form that works in every step of CF239 and validates the certificate: see the
  showroom `issues.md`). Keycloak federates the LDAP over LDAPS with the directory CA in its truststore.
- **Sign in with the e-mail or the short name**: a configuration override (`loginProperty` `uid` and `mail` on the
  `ldapRegistry` of the chart), next to the `preferredLanguage` one.
- **The demo LDAP users carry the real EUROPESIP names and e-mails** (uid, groups and passwords unchanged).
- **Webinar, stage 2**: a basic LDAP layer first (`custom-values.ldap-basic.yaml`, plain 389), then step 2-3 uploads the
  corporate CAs and applies the complete layer (overrides + LDAPS), and step 2-4 closes plain LDAP live. The webinar
  folder also includes `lab-ldap/example-active-directory.yaml`, an advanced Active Directory example (not applied).
- **IQ 1.0.3 ignores `dbTlsEnabled`**: with the IQ database in PostgreSQL, `pg_hba` keeps an exception for `iqdb` only.
- **The webinar showroom**: the generated webinar files (credentials redacted), the slides and the video are published
  in their own repository, [hcl-dx-compose-showroom](https://github.com/europesip/hcl-dx-compose-showroom).

## 2.6.0 · 2026-11-10 · Webinar more live, supportability

- **Webinar, stage 0 live**: `prepare.sh` now only creates the namespace of the third-party tools and installs OpenLDAP
  and PostgreSQL. The demo creates the DX namespace (it shows the generic YAML and the OpenShift one, with the SCC
  annotations HCL requires, then applies one), signs in to the HCL Harbor and pulls the charts.
  The OpenLDAP admin secret moves to `lab-ldap/secrets.openldap.yaml`; the DX bind secret is applied in step 2-1.
- **LiteLLM opens stage 4, with IQ** (HCL feedback: installing it before DX was confusing), in the installation and in
  the webinar: only IQ uses it, and the HCL documentation has it under IQ. Without IQ it is not installed.
- **DX checked with `kubectl port-forward` before the Ingress** (new step after the DX install, installation and webinar):
  most installation problems come from the network, so DX is reached first through a tunnel to its HAProxy, without
  Ingress, DNS or open ports; it shows the HTTP code and never fails.
- **Administrator role for dxadmins (XMLAccess), new step 2-2** with its file `lab-ldap/admin-role.xml`, generated by the
  installer (demo OpenLDAP only; until now the webinar added it by hand).
- **Search Admin UI enabled** (`configuration.searchMiddleware.adminUI.enabled: true` in `custom-values.search.yaml`, off
  by default in the chart): content sources, crawlers and field mappings at `/dx/ui/search/admin-ui`.
- **OpenSearch certificates, one step each** (5-1 to 5-5): the CA, the admin, node and client certificates and the
  secrets, every command visible instead of a loop.
- **IQ deployment key with `--set`**: it leaves `custom-iq-values.yaml` for the Secret `iq-deployment-key`
  (`lab-iq/secrets.yaml`); the IQ install reads it into a variable and passes it with `--set`, because chart 1.0.3
  cannot read it from a secret yet.
- RUNBOOK and Word/PDF script: the two usual ways to create Kubernetes objects (imperative and declarative) and why the
  webinar follows the declarative one (GitOps); the values layers, `--reuse-values` and the single values file.
- **Supportability** (user feedback): `BUILD-INFO.txt` in the folder (installer version, platform, Ingress, Helm and
  options, no secrets) and the same stamp at the top of the scripts and the RUNBOOK; `support/environment-info.sh`
  (workstation, tools, cluster, Ingress and the access to DX layer by layer), also added to `--collect`; an access
  diagnosis step after the Ingress (DX through `kubectl port-forward`, Ingress controller, port 443, DNS).
- **Fixes found in the release tests**: the single-node PoC (WSL2 / Linux) waits for the ServiceAccount `default` of a
  k3s installed seconds before (step 0-1 failed); the new VPC of the AWS EC2 environment uses `10.100.0.0/16` instead of
  `10.42.0.0/16`, which is the pod network of k3s (the pods could not reach the Kubernetes API and Longhorn never got
  ready). A VPC range inside the k3s networks is now refused. The access diagnosis tries every address of the Ingress
  (LoadBalancer, node external and internal, the resolved one) before saying that port 443 fails: in a cloud the k3s
  LoadBalancer shows a private address.
- **Helm 3 compatibility**: the scripts generated for Helm 4 adapt `--wait=legacy` and `--force-conflicts` by themselves
  when they find Helm 3.
- **Frequent errors** page ([docs/troubleshooting.md](docs/troubleshooting.md)): k3s inside WSL and ports 80/443, `nip.io`
  blocked by DNS, Helm 3, `ImagePullBackOff`, the LiteLLM variables; linked from the README and the FAQ.

## 2.5.0 · 2026-11-09 · Scope disclaimer

- **Scope disclaimer** ([#5](https://github.com/europesip/hcl-dx-compose-installer/issues/5)): *Get started* opens a dialog
  with what the installer is for and what it is not (demos and PoCs, no production tuning, the most frequent options,
  Professional Services for large environments, provided as is under the MIT licence). It must be accepted every time
  the wizard starts. The same text opens the generated RUNBOOK.md and the webinar Word/PDF guide.

## 2.4.1 · 2026-11-08 · Script Application operator 0.3.1

- The operator is installed at **0.3.1**: one XMLAccess request at a time to DX (concurrent ones were sometimes answered
  empty and a page or a theme showed `DXError` for a while).

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
