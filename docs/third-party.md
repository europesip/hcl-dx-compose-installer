# Third-party software: what the installer does and why

**English** · [Español](third-party.es.md) · [README](../README.md)

HCL DX Compose needs, or works better with, software that HCL does not supply. The installer deploys it for a PoC. This
page collects the **peculiarities and tricks** we needed to make each piece work with DX **without breaking anything
else**, as found on our lab cluster (DX Compose CF239). Each item says where the installer applies it.

## OpenLDAP (chart `openldap-stack-ha` 4.3.3) · stage 2

- **The LDIF must include the root entry** (`dn: dc=dxdemo,dc=com`). Without it, the first `ldapadd` fails and the LDAP
  starts empty.
- **Groups are `groupOfUniqueNames` / `uniqueMember`**, which is what the native LDAP block of the DX chart (type `other`)
  expects.
- **`preferredLanguage` needs `wplc-add-property`**: the DX Compose user registry does not declare it, so DX would not read
  it from the LDAP. The DX layer adds it (`configOverrideFiles`), and a Web Engine restart is needed after a change.
  Script Applications such as ÓRBITA use it for the user's language.
- **The basic registry is kept** (`wpsadmin`): the federated repository has both. `webEngineAdminGroup` does **not** point
  at an LDAP group; it creates a group with that name in the basic registry. Two groups with the same name make Liberty
  fail ("multiple entities found"). Give the Administrator role to the LDAP group in the portal instead.
- **The demo users' passwords** go in the LDIF as salted `{SSHA}` hashes. With OpenBao, the hash is computed at install
  time from the password stored in OpenBao.

## PostgreSQL (CloudNativePG 0.29.1, PostgreSQL 18) · stages 0 and 3

- PostgreSQL is **not yet supported by HCL** for the Web Engine. HCL is validating it, and the table script
  (`setup-postgres-dx.sql`) is an early release.
- **`max_prepared_transactions` > 0**: DX uses XA transactions (two-phase commit).
- **The JCR tablespaces** are declared in the Cluster, each with its own volume.
- **Password changes**: the user Secrets carry the label `cnpg.io/reload: "true"`, so CloudNativePG applies a new
  password by itself. This also works with OpenBao.
- **On Rancher**, `kubectl get cluster` clashes with Cluster API: use `clusters.postgresql.cnpg.io`.
- Keycloak, ÓRBITA and the IQ sessions get their own databases and users in the same cluster.

## LiteLLM (official BerriAI chart 1.106.5) · stage 0

- **`LITELLM_BASE_URL` is required but undocumented** in IQ 1.0.2 and 1.0.3. Without it, the Integrator does not send the
  requests to LiteLLM.
- **MCP tool names contain dots**, which the Anthropic and OpenAI APIs reject. LiteLLM uses its `anthropic/` provider
  (directly, or through the Anthropic-compatible endpoint of OpenRouter), which sanitises the names.
- **OpenAI reasoning models** (gpt-5.x) inject `reasoning_effort` and break the IQ tools: use Claude.
- **AWS Bedrock**: the documented Sonnet 4.6 ID does not exist (use `us.anthropic.claude-sonnet-4-6`). Set
  `aws_region_name`, and submit the Anthropic "use case details" once per AWS account.
- **An exhausted provider credit** shows up as `PaymentRequiredError` (HTTP 402) in the LiteLLM log, and as "An unknown
  error occurred" in the IQ chat.

## EUROPESIP MCP Server (example, not HCL) · stage 0, extra

- **Registered by patching the Integrator ConfigMap** (`mcp_server_list`), then restarting the Integrator. The documented
  variable has no effect (HCL case CS1479102).
- With **Helm 4**, a later IQ `helm upgrade` needs `--force-conflicts`, because the field now belongs to `kubectl patch`.
- The Integrator forwards the user's DX cookies on every `tools/call`. With OpenID Connect the session cookie is `WAS_n...`;
  it is forwarded too, so the MCP tools keep working.

## OpenBao 2.7.2 + External Secrets Operator 2.14.0 · stage 0, extra

The details are in [Advanced CI/CD: OpenBao](openbao.md). The peculiarities:

- **OpenBao starts sealed after every restart**: `./lab-cicd/openbao-unseal.sh` unseals it with 3 of the 5 keys. In
  production, use auto-unseal with a KMS or HSM.
- **`bao status` exits with code 2 while sealed.** Scripts with `set -o pipefail` must not pipe it directly into `grep`;
  the helper captures its output first.
- **No secret on a command line**: every value goes through the stdin of `kubectl exec` into the `bao` CLI of the pod.
  An unseal key is passed with `bao operator unseal <key>` inside the pod, never from the workstation's argv.
- **Liberty only reads Secrets at start-up, and the DX chart copies them**: a password changed in OpenBao reaches the
  Kubernetes Secret within 5 minutes. DX only applies it after a DX `helm upgrade` (the chart copies `web-engine-secret`
  with Helm `lookup` into `<release>-web-engine-wps`) and a restart of the Web Engine.
- **The ESO template engine uses `{{ }}`**, so literal braces in a templated value (such as the `}}}` closing a
  `.dockerconfigjson`) are escaped as `{{ "}}" }}`.
- **Kubernetes auth**: the role is bound to one ServiceAccount (`openbao-eso`) and one path (`dx/<DX namespace>/*`),
  read-only. The ClusterSecretStore only serves the namespaces of the installation.
- **`--cleanup` keeps OpenBao** (it holds the secrets); `--cleanup --all` removes it.

## Argo CD 3.6.1 (chart 10.15.0) · stage 0, extra

- **Installed from the OCI chart** `oci://ghcr.io/argoproj/argo-helm/argo-cd`. The downloads of the GitHub releases
  returned 503 and 504 for a while on 2026-11-08 (a GitHub incident); the OCI copy on ghcr.io kept working.
- **Health checks of the operator resources** are written into `argocd-cm` through the chart values, so a
  DXScriptApplication shows as Healthy, Progressing or Degraded from what the operator sees in DX.
- **No Application is created**: point it at your own repository.

## Keycloak 26.8.2 (official operator) · stage 0, extra; DX layer from stage 2

Keycloak federates the **same OpenLDAP** as DX (read-only), and DX signs users in through it with the OpenID Connect
client of Liberty. These are the tricks needed to make it work without breaking anything:

1. **The operator needs five CRDs**: `keycloaks`, `keycloakrealmimports`, and from 26.8 also `keycloakoidcclients` and
   `keycloaksamlclients`. Without the last two, the operator crash-loops ("Not Found" on their informers). Its
   ClusterRoleBinding names the namespace `keycloak`: the installer changes it to the shared namespace.
2. **Two URLs, one issuer**: the browser uses the public URL. DX talks to Keycloak inside the cluster
   (`http://keycloak-service.<ns>.svc:8080`) thanks to `hostname.backchannelDynamic`, so DX needs no CA for Keycloak.
3. **No discovery URL in DX**: Liberty only accepts an **HTTPS** `discoveryEndpointUrl`, even with
   `httpsRequired="false"`. The DX layer declares the endpoints instead: the authorization endpoint at the public URL,
   the token and keys endpoints inside the cluster, and the public issuer.
4. **`mapIdentityToRegistryUser="true"`**: the OIDC user (`preferred_username` = `uid`) is mapped to the LDAP user of DX,
   so DX keeps its groups, roles and `preferredLanguage`. No transient users are needed.
5. **Liberty renames the session cookie.** With `openidConnectClient-1.0`, the LTPA cookie is called `WAS_n<hash>`
   instead of `LtpaToken2`, and `ssoCookieName="LtpaToken2"` is ignored (Open Liberty issue 18803). Consequences:
   - the DX REST login (`/dx/api/core/v1/auth/login`) answers "Login successful" **without a cookie**. This is an HCL
     component, and HCL should be asked about it;
   - anything that looked for `LtpaToken2` by name broke. Our **operator** (0.1.2, switch `dx.oidcCompatibility`) and
     **ÓRBITA** (3.1.2, switch `dx.oidcSupport`) now sign in with the portal login form and accept the new cookie;
   - the Ring API, the DAM API and IQ accept the new cookie when they receive it.
6. **The DAM API answers 401 "Token is expired"** if it receives a `LtpaToken2` cookie, or the already-expired
   `WASReqURL` cookie, next to the real session cookie. Send only the SSO cookie.
7. **`authFilter`**: the URLs HCL documents (XMLAccess, Search seedlist, Site Builder, WCM login, WebDAV, syndication and
   connect) are left out of OIDC, plus:
   - `/dx/api/core/v1/auth`;
   - the login page (`nm:oid:wps.Login`), so `wpsadmin` still signs in at `/wps/portal/poc?uri=nm:oid:wps.Login`;
   - `j_security_check`;
   - requests with `Authorization: Basic`, used by DXClient and scripts.
8. **The optional IQ checks** of `install.sh` sign in with the portal form when Keycloak is on.
9. **Realm import**: the realm is created declaratively (`KeycloakRealmImport`). Its secrets (LDAP bind password, client
   secret) are placeholders read from Secrets, so the file holds no credentials. An import only creates the realm; later
   changes go through the admin console.
10. **Certificate**: the Keycloak Ingress uses a self-signed certificate created by the install step. Replace the
    `keycloak-tls` Secret with yours; DX does not need to trust it.
11. **Full logout**: `redirect.logout`, `redirect.logout.ssl` and `redirect.logout.url` in `ConfigService.properties`
    (step 4 of the HCL page, through `propertiesFilesOverrides`). "Log out" in DX goes to the Keycloak end-session
    endpoint (`client_id` + `post_logout_redirect_uri`, registered in the client), which ends the Keycloak session and
    returns to the portal. Changing these properties restarts the Web Engine.
12. **Login theme**: by default, the default Keycloak theme (`keycloak.v2`) with the Keycloak logo, so it is clear that
    Keycloak is used. With *EUROPESIP login theme*, a theme `europesip` that extends `keycloak.v2` (its CSS variables: logo,
    colours, background) is mounted from a ConfigMap through `spec.unsupported.podTemplate` of the Keycloak CR: no custom
    image. The header uses the realm `displayNameHtml` (logo + "HCL DX Compose"). Keycloak reads themes when its pod
    starts.

## Downloads during the installation

`install.sh` downloads charts and manifests from GitHub, Helm repositories and registries. Since 2.3.0 it retries them:
`retry` repeats a download (`helm repo add`, `helm pull`, `helm registry login`, `kubectl apply -f https://...`) up to 5
times, and `rhelm` repeats a `helm upgrade` only when it failed because the chart could not be downloaded (503, 504,
"failed to fetch"...), never when the installation itself failed.

## HCL DX itself: things worth knowing

- **Re-apply the DX configuration with the LAST DX step** of `install.sh`. Each DX `helm upgrade` step carries only the
  layers up to its stage. Running an earlier one alone (for example the LDAP step) takes out the layers of the later
  stages (database, IQ, search) until the last step is run again.
- **Helm 4**: `--wait=legacy`. The new watcher strategy aborts when DAM fails while its database starts, which is normal.
- **Search V2 behind an Ingress**: `automatedSetup.haproxyProtocol: https`, otherwise the crawlers use `http` and index
  nothing. The File Processor is an undocumented dependency.
