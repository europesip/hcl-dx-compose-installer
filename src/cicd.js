// Advanced CI/CD (optional, off by default, not on OpenShift yet): OpenBao + External Secrets Operator (the
// secrets manager), Argo CD (GitOps) and the HCL DX Script Application operator, installed in their own
// namespace (by default the shared one of the external dependencies).
//
// With "use the secrets manager" no credential is written in the zip: the engine (core.js, frozen: the golden
// test compares it with the old wizard) is fed sentinel values instead of the secrets, and this module turns
// its output into the OpenBao version:
//   - every */secrets.yaml becomes ExternalSecrets with the same names, types and labels (ESO creates the Secrets
//     from OpenBao), and so do the Web Engine database properties, the HAProxy certificate and the OpenSearch
//     certificates;
//   - a command that needs a value at run time (helm registry login, the optional checks) reads it from OpenBao
//     ("obv path key"), so it is never in a file of the zip;
//   - the operator enters the external secrets once (Harbor, wpsadmin, the AI key, AD/Oracle), when install.sh
//     asks for them or in the OpenBao UI; the internal ones (PostgreSQL, LDAP admin, LiteLLM, certificates) are
//     generated at random inside OpenBao.
import {SECRET_KEYS} from "./state.js";
import {EUROPESIP_WHITE_PNG} from "./brand/europesip-white.js";

export const VERSIONS = {openbao: "0.30.7", openbaoApp: "2.7.2", eso: "2.14.0", argocd: "10.15.0", argocdApp: "3.6.1", operator: "0.3.1", keycloak: "26.8.2", orbitaOidc: "3.1.2"};
const OP_CRDS = ["dxconnections", "dxscriptapplications", "dxpages", "dxdamcollections", "dxdatabases", "dxthemes"].map(k => `dx.europesip.com_${k}`);
const OP_CRD_URL = `https://raw.githubusercontent.com/europesip/hcl-dx-scriptapp-operator/v${VERSIONS.operator}/charts/hcl-dx-scriptapp-operator/crds/`;
const DIR = "lab-cicd";
const OB = "lab-cicd/openbao";                    // created by install.sh: init keys, operator password (mode 700)

export const keycloakOn = f => !!f.keycloak && f.dir === "openldap" && f.platform !== "openshift" && f.preset !== "webinar";
export const cicdOn = f => (!!(f.cicdOpenbao || f.cicdArgo || f.cicdOperator) || keycloakOn(f)) && f.platform !== "openshift" && f.preset !== "webinar";
export const vaultOn = f => cicdOn(f) && !!f.cicdOpenbao && !!f.useVault;
export const cicdNs = f => (f.cicdSameNs !== false ? f.SHARED_NS : f.CICD_NS || "dx-cicd").trim();

// ---------------------------------------------------------------------------------------------------------
// Sentinels: what the engine writes instead of each secret ("@@OB:<path>:<key>@@", path under dx/<DX_NS>/)
// ---------------------------------------------------------------------------------------------------------
const S = (path, key) => `@@OB:${path}:${key}@@`;
const LAB = "@@OB:LAB@@";                          // the lab password: its meaning depends on where it is used
export function vaultForm(f){
  return {...f, HCL_HARBOR_TOKEN: S("registry", "password"), LAB_PASSWORD: LAB, demoSame: false, DEMO_PASSWORD: S("demo-users", "password"),
    OPENROUTER_API_KEY: S("ai", "key"), BEDROCK_API_KEY: S("ai", "key"), ANTHROPIC_API_KEY: S("ai", "key"),
    AD_BIND_PASSWORD: S("ad", "bindPassword"), ORACLE_DX_PASSWORD: S("oracle", "password")};
}
// The lab password, by the Secret that holds it
const LAB_BY_SECRET = {"openldap-admin": "ldap-admin", "dx-ldap-bind": "ldap-admin", "dx-pg-superuser": "pg-superuser", "dx-pg-dxuser": "pg-dxuser",
  "dx-pg-iquser": "pg-iquser", "custom-external-db-credentials": "pg-iquser"};
const labRef = secret => S(LAB_BY_SECRET[secret] || "wpsadmin", "password");

// ---------------------------------------------------------------------------------------------------------
// The secrets.yaml of the engine -> ExternalSecrets
// ---------------------------------------------------------------------------------------------------------
const unysq = v => v.startsWith("'") ? v.slice(1, -1).replace(/''/g, "'") : v.replace(/^"|"$/g, "");
const ysq = v => "'" + String(v).replace(/'/g, "''") + "'";
function parseSecrets(text){
  const out = [];
  for (const chunk of text.split(/^---$/m).slice(1)) {
    const d = {labels: {}, data: {}, type: "Opaque"}; let sec = "";
    for (const l of chunk.split("\n")) {
      let m;
      if ((m = l.match(/^  name: (.+)$/)) && !sec) d.name = m[1].trim();
      else if ((m = l.match(/^  namespace: (.+)$/))) d.namespace = m[1].trim();
      else if (/^  labels:$/.test(l)) sec = "labels";
      else if ((m = l.match(/^    ([\w./-]+): (.+)$/)) && sec === "labels") d.labels[m[1]] = unysq(m[2]);
      else if ((m = l.match(/^type: (.+)$/))) { d.type = m[1].trim(); sec = ""; }
      else if (/^stringData:$/.test(l)) sec = "data";
      else if ((m = l.match(/^  ('(?:[^']|'')*'|[\w.-]+): (.*)$/)) && sec === "data") d.data[unysq(m[1])] = unysq(m[2]);
    }
    if (d.name) out.push(d);
  }
  return out;
}
// A value with sentinels -> an ESO template ({{ .vN }}) and the OpenBao references it needs
function templateOf(value, secret, refs, s){
  const v = value.split(LAB).join(labRef(secret));
  return v.replace(/\{\{|\}\}/g, m => `{{ "${m}" }}`).replace(/@@OB:([\w-]+):([\w.-]+)@@/g, (_, path, key) => {
    const k = `${path}:${key}`;
    if (!refs.has(k)) refs.set(k, `v${refs.size}`);
    return `{{ .${refs.get(k)} }}`;
  });
}
function externalSecret(s, d){
  const refs = new Map(), tdata = {};
  for (const [k, v] of Object.entries(d.data)) tdata[k] = templateOf(v, d.name, refs, s);
  const L = ["---", "apiVersion: external-secrets.io/v1", "kind: ExternalSecret", "metadata:", `  name: ${d.name}`, `  namespace: ${d.namespace}`,
    "spec:", "  refreshInterval: 5m", "  secretStoreRef: { kind: ClusterSecretStore, name: openbao-dx }", "  target:", `    name: ${d.name}`, "    template:",
    `      type: ${d.type}`];
  if (Object.keys(d.labels).length) L.push("      metadata:", "        labels:", ...Object.entries(d.labels).map(([k, v]) => `          ${k}: ${ysq(v)}`));
  L.push("      data:");
  for (const [k, v] of Object.entries(tdata)) {
    if (v.includes("\n")) L.push(`        ${/^[\w-]+$/.test(k) ? k : ysq(k)}: |`, ...v.replace(/\n$/, "").split("\n").map(x => "          " + x));
    else L.push(`        ${/^[\w-]+$/.test(k) ? k : ysq(k)}: ${ysq(v)}`);
  }
  if (refs.size) {
    L.push("  data:");
    for (const [k, name] of refs) { const [path, key] = k.split(":"); L.push(`    - secretKey: ${name}`, `      remoteRef: { key: ${s.DX_NS}/${path}, property: ${ysq(key)} }`); }
  }
  return L.join("\n");
}
const esFile = (title, docs) => `# ${title}\n# Generated by the HCL DX Compose Installer. No credentials here: External Secrets Operator creates these Secrets\n# from OpenBao (dx/<namespace>/...) and keeps them in sync (every 5 minutes).\n` + docs.join("\n") + "\n";
const waitEs = (ns, names) => `kubectl -n ${ns} wait externalsecret ${names.join(" ")} --for=condition=Ready --timeout=120s`;

// ---------------------------------------------------------------------------------------------------------
// Files of lab-cicd/
// ---------------------------------------------------------------------------------------------------------
function openbaoValues(){
  return `# OpenBao ${VERSIONS.openbaoApp} (chart openbao/openbao ${VERSIONS.openbao}): the secrets manager of this installation.
# OpenBao is the open-source fork of HashiCorp Vault (Linux Foundation, MPL 2.0): same API and CLI.
# One server with its data on a volume and the web UI. Production: server.ha with Raft (3 replicas), TLS on the
# listener and auto-unseal (KMS/HSM); see the installer documentation (docs/openbao.md).
global:
  tlsDisable: true          # plain HTTP inside the cluster; the UI is reached with kubectl port-forward
injector:
  enabled: false            # External Secrets Operator delivers the secrets
server:
  standalone:
    enabled: true
  dataStorage:
    enabled: true
    size: 2Gi
  resources:
    requests: { cpu: 100m, memory: 128Mi }
    limits: { memory: 512Mi }
ui:
  enabled: true
`;
}
function argoValues(op){
  const health = `hs = { status = "Progressing", message = "Waiting for the operator" }
if obj.metadata.generation ~= nil and obj.status ~= nil and obj.status.observedGeneration ~= nil
   and obj.status.observedGeneration < obj.metadata.generation then
  return hs
end
if obj.status ~= nil and obj.status.conditions ~= nil then
  for _, c in ipairs(obj.status.conditions) do
    if c.type == "Ready" then
      hs.message = c.message
      if c.status == "True" then hs.status = "Healthy"
      elseif c.reason == "Suspended" then hs.status = "Suspended"
      elseif c.reason == "Waiting" then hs.status = "Progressing"
      else hs.status = "Degraded" end
    end
  end
end
return hs`;
  const kinds = ["DXScriptApplication", "DXPage", "DXDamCollection", "DXDatabase", "DXConnection", "DXTheme"];
  return `# Argo CD ${VERSIONS.argocdApp} (chart oci://ghcr.io/argoproj/argo-helm/argo-cd ${VERSIONS.argocd}): GitOps, it keeps the cluster equal to a Git repository.
# The UI is reached with kubectl port-forward (see RUNBOOK.md); no Application is created: point it at your repository.
dex:
  enabled: false
notifications:
  enabled: false
configs:
  params:
    server.insecure: false
  cm:
    # Health of the resources of the HCL DX Script Application operator, from their Ready condition${op ? "" : " (harmless without it)"}
${kinds.map(k => `    resource.customizations.health.dx.europesip.com_${k}: |\n${health.split("\n").map(x => "      " + x).join("\n")}`).join("\n")}
`;
}
const helloYaml = (s, cns) => `# HCL DX Script Application operator · the "hello" sample (samples/01-hello of
# github.com/europesip/hcl-dx-scriptapp-operator): one HTML file in a ConfigMap, pushed to DX and put on a page.
apiVersion: dx.europesip.com/v1alpha1
kind: DXConnection
metadata:
  name: dx
  namespace: ${cns}
spec:
  url: https://${s.DX_HOST}
  credentialsSecret: { name: dxop-dx-admin }
  caSecret: { name: dxop-dx-ca }
  resyncInterval: 5m
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: dxop-hello-files
  namespace: ${cns}
data:
  index.html: |
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          .dxop-hello { font-family: sans-serif; padding: 1.5rem; border: 2px solid #0040ff; border-radius: 12px; }
          .dxop-hello h2 { margin: 0 0 .5rem; color: #0040ff; }
          .dxop-hello p { margin: 0; }
        </style>
      </head>
      <body>
        <div class="dxop-hello">
          <h2>\${GREETING}</h2>
          <p>Deployed by the <b>HCL DX Script Application operator</b> from a ConfigMap · version \${VERSION}</p>
        </div>
      </body>
    </html>
---
apiVersion: dx.europesip.com/v1alpha1
kind: DXScriptApplication
metadata:
  name: dxop-hello
  namespace: ${cns}
spec:
  connectionRef: { name: dx }
  source:
    configMap: { name: dxop-hello-files }
  wcm:
    title: "DXOP · Hello"
  substitutions:
    - { name: GREETING, value: "Hello from Kubernetes!" }
    - { name: VERSION, value: "1.0.0" }
---
apiVersion: dx.europesip.com/v1alpha1
kind: DXPage
metadata:
  name: dxop-hello
  namespace: ${cns}
spec:
  connectionRef: { name: dx }
  titles: { en: "DXOP Hello", es: "DXOP Hola" }
  applications:
    - name: dxop-hello
`;

// The OpenBao helpers every generated script shares (sourced): no secret ever goes on a command line or in a file
// of the zip; values travel through stdin of "kubectl exec" into the bao CLI of the OpenBao pod.
function obLib(cns){
  return `# lab-cicd/openbao-lib.sh · OpenBao helpers sourced by install.sh and the openbao-*.sh scripts.
# Values travel through stdin into the bao CLI of the pod: never on a command line, never in a file of the zip.
OB_NS=${cns}
OB_DIR=\${OPENBAO_DIR:-$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)/openbao}
OB_POD=openbao-0
obx(){ kubectl -n "$OB_NS" exec -i "$OB_POD" -- "$@"; }
ob_status(){ obx bao status -format=json 2>/dev/null || true; }   # bao status exits 2 while sealed
ob_sealed(){ ob_status | grep -q '"sealed": *true'; }
ob_root(){ awk -F': ' '/^Initial Root Token/{print $2}' "$OB_DIR/openbao-init.txt"; }
# A token of the operator (userpass "operador"): login with the password read from stdin
ob_token(){ obx sh -c 'read -r p; bao write -field=token auth/userpass/login/operador password="$p"' < "$OB_DIR/operador.password"; }
# obv <path> <key>: one value of dx/<DX_NS>/<path> (the install steps and optional checks use it)
obv(){ { ob_token; echo; } | obx sh -c 'read -r t; BAO_TOKEN=$t bao kv get -mount=dx -field="$2" "$1"' sh "$OB_PATH/$1" "$2"; }
ob_has(){ { echo "$OB_TOKEN"; } | obx sh -c 'read -r t; BAO_TOKEN=$t bao kv get -mount=dx -field="$2" "$1" >/dev/null 2>&1' sh "$OB_PATH/$1" "$2" 2>/dev/null; }
# ob_put <path> <key>  (the value on stdin, it may have several lines)
ob_put(){ { echo "$OB_TOKEN"; cat; } | obx sh -c 'read -r t; export BAO_TOKEN=$t; bao kv get -mount=dx "$1" >/dev/null 2>&1 || bao kv put -mount=dx "$1" created-by=dx-installer >/dev/null; bao kv patch -mount=dx "$1" "$2"=- >/dev/null' sh "$OB_PATH/$1" "$2"; }
`;
}

function obInit(s, cns){
  return `#!/usr/bin/env bash
# lab-cicd/openbao-init.sh · one-off setup of OpenBao for this installation (run by install.sh):
#   init (5 keys, 3 to unseal) -> ${OB}/openbao-init.txt  (KEEP IT SAFE: without 3 keys the data is lost)
#   unseal · KV engine dx/ · user "operador" (enters the secrets: UI or openbao-secrets.sh) with its policy
#   Kubernetes auth: External Secrets Operator reads dx/${s.DX_NS}/* only (ServiceAccount openbao-eso, read-only)
set -Eeuo pipefail
source "$(dirname "$0")/openbao-lib.sh"
umask 077; mkdir -p "$OB_DIR"; chmod 700 "$OB_DIR"
kubectl -n "$OB_NS" wait pod/$OB_POD --for=jsonpath='{.status.phase}'=Running --timeout=300s >/dev/null
if ob_status | grep -q '"initialized": *false'; then
  echo "  initialising OpenBao: keys in $OB_DIR/openbao-init.txt"
  obx bao operator init -key-shares=5 -key-threshold=3 > "$OB_DIR/openbao-init.txt"
fi
[ -s "$OB_DIR/openbao-init.txt" ] || { echo "OpenBao is already initialised but $OB_DIR/openbao-init.txt is missing: copy it from the installation that created it (or set OPENBAO_DIR)"; exit 1; }
"$(dirname "$0")/openbao-unseal.sh"
R=$(ob_root)
rb(){ { echo "$R"; cat; } | obx sh -c 'read -r t; export BAO_TOKEN=$t; '"$1"; }
rb 'bao secrets list | grep -q "^dx/" || bao secrets enable -path=dx -version=2 -description="HCL DX installations" kv' </dev/null
rb 'bao auth list | grep -q "^userpass/" || bao auth enable userpass; bao auth list | grep -q "^kubernetes/" || bao auth enable kubernetes' </dev/null
rb 'bao write auth/kubernetes/config kubernetes_host=https://kubernetes.default.svc:443 >/dev/null' </dev/null
rb 'bao policy write dx-operator - >/dev/null' <<'EOF'
path "dx/data/*"     { capabilities = ["create", "read", "update", "patch", "delete", "list"] }
path "dx/metadata/*" { capabilities = ["read", "list", "delete"] }
EOF
rb 'bao policy write dx-${s.DX_NS}-read - >/dev/null' <<'EOF'
path "dx/data/${s.DX_NS}/*" { capabilities = ["read"] }
EOF
rb 'bao write auth/kubernetes/role/eso-${s.DX_NS} bound_service_account_names=openbao-eso bound_service_account_namespaces=${cns} token_policies=dx-${s.DX_NS}-read token_ttl=1h audience=openbao >/dev/null' </dev/null
[ -s "$OB_DIR/operador.password" ] || openssl rand -base64 24 | tr -d '/+=\\n' > "$OB_DIR/operador.password"
{ cat "$OB_DIR/operador.password"; echo; } | rb 'read -r p; bao write auth/userpass/users/operador password="$p" token_policies=dx-operator >/dev/null'
echo "  OpenBao ready: KV dx/, user operador (password in $OB_DIR/operador.password), Kubernetes role eso-${s.DX_NS}"
`;
}

function obUnseal(){
  return `#!/usr/bin/env bash
# lab-cicd/openbao-unseal.sh · OpenBao starts SEALED after every restart of its pod (its data is encrypted and the
# key is not stored anywhere): unseal it with 3 of the 5 keys of openbao/openbao-init.txt. While it is sealed,
# External Secrets Operator cannot refresh the Secrets (the existing Secrets keep working).
#   ./lab-cicd/openbao-unseal.sh            (OPENBAO_DIR=... if the keys are somewhere else)
set -Eeuo pipefail
source "$(dirname "$0")/openbao-lib.sh"
kubectl -n "$OB_NS" wait pod/$OB_POD --for=jsonpath='{.status.phase}'=Running --timeout=300s >/dev/null
if ! ob_sealed; then echo "  OpenBao is not sealed"; exit 0; fi
for i in 1 2 3; do
  awk -F': ' -v n="Unseal Key $i" '$1==n{print $2}' "$OB_DIR/openbao-init.txt" | obx sh -c 'read -r k; bao operator unseal "$k" >/dev/null'
done
ob_sealed && { echo "OpenBao is still sealed"; exit 1; }
echo "  OpenBao unsealed"
`;
}

// The secrets of this installation in OpenBao: external ones asked (hidden) or taken from the environment,
// internal ones generated at random. Only what is missing: running it again changes nothing.
function obSecrets(s, f){
  const ext = [["registry", "password", "HCL_HARBOR_TOKEN", "HCL Harbor CLI secret"], ["wpsadmin", "password", "WPSADMIN_PASSWORD", "wpsadmin password (DX administrator)"]];
  if (s.deps.ldap) ext.push(["demo-users", "password", "DEMO_PASSWORD", "password of the demo users (Enter = the same as wpsadmin)"]);
  if (s.deps.llm) ext.push(["ai", "key", s.LLM_PROVIDER === "bedrock" ? "AWS_BEARER_TOKEN_BEDROCK" : s.LLM_PROVIDER === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENROUTER_API_KEY",
    s.LLM_PROVIDER === "bedrock" ? "AWS Bedrock API key" : s.LLM_PROVIDER === "anthropic" ? "Anthropic API key" : "OpenRouter API key"]);
  if (s.dir === "ad") ext.push(["ad", "bindPassword", "AD_BIND_PASSWORD", "Active Directory bind password"]);
  if (s.db === "oracle") ext.push(["oracle", "password", "ORACLE_DX_PASSWORD", `Oracle password of ${s.ORACLE_DX_USER}`]);
  const int = [];
  if (s.deps.ldap) int.push(["ldap-admin", "password"]);
  if (s.deps.pg) int.push(["pg-superuser", "password"], ["pg-dxuser", "password"], ["pg-iquser", "password"]);
  if (s.deps.llm) int.push(["litellm", "masterKey"]);
  if (keycloakOn(f)) int.push(["keycloak", "adminPassword"], ["keycloak", "dbPassword"], ["keycloak", "clientSecret"]);
  const tls = s.TLS_CERT ? `ob_has tls tls.crt || { ob_put tls tls.crt < ${sqs(s.TLS_CERT)}; ob_put tls tls.key < ${sqs(s.TLS_KEY)}; echo "  tls: your certificate"; }`
    : `if ! ob_has tls tls.crt; then
  T=$(mktemp -d); openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 365 -keyout "$T/k" -out "$T/c" -subj "/CN=${s.DX_HOST}" -addext "subjectAltName=DNS:${s.DX_HOST}" 2>/dev/null
  ob_put tls tls.crt < "$T/c"; ob_put tls tls.key < "$T/k"; rm -rf "$T"; echo "  tls: self-signed certificate for ${s.DX_HOST} (generated)"
fi`;
  const search = !s.lab4 ? "" : `if ! ob_has search-certs root-ca.pem; then
  T=$(mktemp -d); ( cd "$T"
  printf 'basicConstraints = CA:FALSE\\nkeyUsage = digitalSignature, keyEncipherment\\nextendedKeyUsage = serverAuth, clientAuth\\n' > ext.cnf
  openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 730 -keyout root-ca-key.pem -out root-ca.pem -subj "/C=ES/O=EUROPESIP/OU=DX Compose Labs/CN=dx-search-root-ca" 2>/dev/null
  for n in admin node client; do
    case $n in admin) cn=admin ;; node) cn=opensearch-node ;; client) cn=opensearch-client ;; esac
    openssl req -new -newkey rsa:2048 -nodes -keyout $n-key.pem -out $n.csr -subj "/C=ES/O=EUROPESIP/OU=DX Compose Labs/CN=$cn" 2>/dev/null
    openssl x509 -req -in $n.csr -CA root-ca.pem -CAkey root-ca-key.pem -CAcreateserial -sha256 -days 730 -extfile ext.cnf -out $n.pem 2>/dev/null
  done )
  for x in root-ca.pem root-ca-key.pem admin.pem admin-key.pem node.pem node-key.pem client.pem client-key.pem; do ob_put search-certs $x < "$T/$x"; done
  rm -rf "$T"; echo "  search-certs: OpenSearch CA and admin/node/client certificates (generated)"
fi`;
  const ssha = !s.deps.ldap ? "" : `if ! ob_has demo-users ssha; then   # {SSHA} hash of the demo users password, for the LDIF
  T=$(mktemp -d); openssl rand -out "$T/s" 4; P=$(obv demo-users password)
  { printf '%s' "$P"; cat "$T/s"; } | openssl dgst -sha1 -binary > "$T/h"; printf '{SSHA}%s' "$(cat "$T/h" "$T/s" | openssl base64 -A)" | ob_put demo-users ssha; rm -rf "$T"
fi`;
  return `#!/usr/bin/env bash
# lab-cicd/openbao-secrets.sh · the secrets of this installation in OpenBao, under dx/${s.DX_NS}/ (run by install.sh).
# Only what is missing is added, so running it again changes nothing. The operator can also enter them in the
# OpenBao UI (user "operador"), before running install.sh.
#   External, entered by the operator (asked here with hidden input, or taken from these environment variables):
${ext.map(([p, k, env, label]) => `#     dx/${s.DX_NS}/${p}  ${k}  <- \$${env}  (${label})`).join("\n")}
#   Internal, generated at random: ${int.map(([p]) => p).join(", ") || "-"}${s.lab4 ? ", search-certs" : ""}, tls${s.TLS_CERT ? " (your certificate files)" : " (self-signed)"}
set -Eeuo pipefail
source "$(dirname "$0")/openbao-lib.sh"
OB_PATH=${s.DX_NS}
OB_TOKEN=$(ob_token)
ext(){   # ext <path> <key> <ENV> <label>
  ob_has "$1" "$2" && return 0
  local v="\${!3:-}"
  if [ -z "$v" ]; then
    if [ "$1" = demo-users ]; then read -r -s -p "  $4: " v </dev/tty; echo; [ -n "$v" ] || v=$(obv wpsadmin password)
    else while [ -z "$v" ]; do read -r -s -p "  $4: " v </dev/tty; echo; done; fi
  fi
  printf '%s' "$v" | ob_put "$1" "$2"; echo "  $1/$2: stored"
}
int(){ ob_has "$1" "$2" || { openssl rand -base64 24 | tr -d '/+=\\n' | ob_put "$1" "$2"; echo "  $1/$2: generated"; }; }
printf '%s' ${sqs(s.HCL_HARBOR_USER)} | ob_put registry username
${ext.map(([p, k, env, label]) => `ext ${p} ${k} ${env} ${sqs(label)}`).join("\n")}
${int.map(([p, k]) => `int ${p} ${k}`).join("\n")}
${tls}
${search}
${ssha}
echo "  dx/${s.DX_NS}: complete"
`;
}
const sqs = v => "'" + String(v).replace(/'/g, "'\\''") + "'";

function storeYaml(s, cns){
  const nss = [...new Set([s.DX_NS, s.SHARED_NS, cns])];
  return `# External Secrets Operator -> OpenBao: one ClusterSecretStore for the namespaces of this installation.
# It logs in to OpenBao with the ServiceAccount openbao-eso (Kubernetes auth, role eso-${s.DX_NS}: read-only, dx/${s.DX_NS}/*).
apiVersion: v1
kind: ServiceAccount
metadata:
  name: openbao-eso
  namespace: ${cns}
---
apiVersion: external-secrets.io/v1
kind: ClusterSecretStore
metadata:
  name: openbao-dx
spec:
  conditions:
    - namespaces: [${nss.join(", ")}]
  provider:
    vault:
      server: http://openbao.${cns}.svc.cluster.local:8200
      path: dx
      version: v2
      auth:
        kubernetes:
          mountPath: kubernetes
          role: eso-${s.DX_NS}
          serviceAccountRef: { name: openbao-eso, namespace: ${cns}, audiences: [openbao] }
`;
}


// ---------------------------------------------------------------------------------------------------------
// Keycloak (optional, needs the OpenLDAP of the installation, independent of OpenBao): SSO with OpenID Connect for DX,
// with the users of the OpenLDAP (User Federation). Official Keycloak operator, database in the PostgreSQL of the
// installation, realm imported with the LDAP federation and the DX client, and the OIDC layer of DX (Liberty
// openidConnectClient). Everything learnt in the lab is in docs/third-party.md.
// ---------------------------------------------------------------------------------------------------------
const KC_DIR = "lab-keycloak";
const KC_RAW = `https://raw.githubusercontent.com/keycloak/keycloak-k8s-resources/${VERSIONS.keycloak}/kubernetes`;
export const kcHost = f => (f.KC_HOST || "").trim() || (() => { const h = (f.DX_HOST || "").trim(), i = h.indexOf(".");
  return i > 0 ? "keycloak" + h.slice(i) : "keycloak." + h; })();
const rnd = () => { const b = new Uint8Array(18); globalThis.crypto.getRandomValues(b); return btoa(String.fromCharCode(...b)).replace(/[+/=]/g, ""); };

function kcSecrets(s, f, vault){
  const sh = s.SHARED_NS, ns = s.DX_NS;
  if (vault) return esFile("Keycloak: administrator, database user and the client secret of DX (from OpenBao, dx/" + ns + "/keycloak)", [
    externalSecret(s, {name: "keycloak-admin", namespace: sh, type: "Opaque", labels: {}, data: {username: "admin", password: S("keycloak", "adminPassword")}}),
    externalSecret(s, {name: "keycloak-db", namespace: sh, type: "Opaque", labels: {}, data: {username: "keycloak", password: S("keycloak", "dbPassword")}}),
    externalSecret(s, {name: "keycloak-realm", namespace: sh, type: "Opaque", labels: {}, data: {clientSecret: S("keycloak", "clientSecret")}}),
    externalSecret(s, {name: "dx-keycloak-oidc", namespace: ns, type: "Opaque", labels: {}, data: {OIDC_CLIENT_SECRET: S("keycloak", "clientSecret")}})]);
  const cs = rnd(), doc = (name, n, data) => ["---", "apiVersion: v1", "kind: Secret", "metadata:", `  name: ${name}`, `  namespace: ${n}`, "type: Opaque", "stringData:",
    ...Object.entries(data).map(([k, v]) => `  ${k}: ${ysq(v)}`)].join("\n");
  return `# Keycloak: administrator, database user and the client secret of DX (random, generated by the installer).\n# Contains credentials in PLAIN TEXT: keep it private.\n` + [
    doc("keycloak-admin", sh, {username: "admin", password: rnd()}), doc("keycloak-db", sh, {username: "keycloak", password: rnd()}),
    doc("keycloak-realm", sh, {clientSecret: cs}), doc("dx-keycloak-oidc", ns, {OIDC_CLIENT_SECRET: cs})].join("\n") + "\n";
}


// The EUROPESIP login theme (optional, f.kcTheme): it extends keycloak.v2 with the EUROPESIP logo, colours and a gradient
// background. Mounted from a ConfigMap (no custom Keycloak image). Without it, Keycloak keeps its own default theme.
const KC_THEME_CSS = `/* EUROPESIP theme for the Keycloak login page (extends keycloak.v2) */
:root {
  --keycloak-logo-url: url('../img/europesip-white.png');
  --keycloak-logo-height: 54px;
  --keycloak-logo-width: 360px;
  --keycloak-card-top-color: #FF0A6C;
  --keycloak-bg-logo-url: none;
  --pf-v5-global--primary-color--100: #0040FF;
  --pf-v5-global--primary-color--200: #0030C0;
  --pf-v5-global--link--Color: #0040FF;
  --pf-v5-global--link--Color--hover: #FF0A6C;
  --pf-v5-global--FontFamily--text: "Inter", "Segoe UI", Roboto, Arial, sans-serif;
  --pf-v5-global--FontFamily--heading: "Inter", "Segoe UI", Roboto, Arial, sans-serif;
}
.login-pf body, body#keycloak-bg {
  background: radial-gradient(circle at 15% 20%, #2B4BC8 0%, #0B1B3A 52%, #060E22 100%) fixed !important;
}
body#keycloak-bg::before {
  content: ""; position: fixed; inset: auto -10% -35% auto; width: 70vw; height: 70vw; border-radius: 50%;
  background: radial-gradient(circle, rgba(255,10,108,0.28) 0%, rgba(255,10,108,0) 65%); pointer-events: none; z-index: -1;
}
.pf-v5-c-login__header { margin-bottom: 1.5rem; }
.dx-subtitle { color: #C9D3F5; font-size: 1.05rem; letter-spacing: 0.35em; text-transform: uppercase; text-align: center; margin-top: 0.9rem; }
.pf-v5-c-login__main { border-radius: 20px; overflow: hidden; box-shadow: 0 30px 80px rgba(0,0,0,0.45); }
.pf-v5-c-login__main-header { border-top: 6px solid transparent; border-image: linear-gradient(90deg, #FF0A6C, #0040FF) 1; }
.pf-v5-c-login__main-header h1, #kc-page-title { font-weight: 700; color: #0B1B3A; }
.pf-v5-c-button.pf-m-primary {
  background: linear-gradient(135deg, #FF0A6C 0%, #0040FF 100%); border: 0; border-radius: 999px; font-weight: 600;
  box-shadow: 0 10px 25px rgba(0,64,255,0.25);
}
.pf-v5-c-button.pf-m-primary:hover { filter: brightness(1.08); }
.pf-v5-c-form-control { border-radius: 10px; }
.pf-v5-c-login__container::after {
  content: "HCL DX Compose · EUROPESIP"; display: block; text-align: center; color: #8FA3D9; font-size: 0.85rem;
  letter-spacing: 0.08em; margin-top: 1.5rem;
}
`;
function kcTheme(s){
  return `# EUROPESIP login theme for Keycloak (extends keycloak.v2): mounted at /opt/keycloak/themes/europesip by the Keycloak CR.
# Change the colours in europesip.css or the logo (europesip-white.png) and re-apply; Keycloak reads it when its pod starts.
apiVersion: v1
kind: ConfigMap
metadata:
  name: keycloak-theme-europesip
  namespace: ${s.SHARED_NS}
data:
  theme.properties: |
    parent=keycloak.v2
    import=common/keycloak
    styles=css/styles.css css/europesip.css
    darkMode=false
  europesip.css: |
${KC_THEME_CSS.split("\n").map(x => "    " + x).join("\n")}
binaryData:
  europesip-white.png: ${EUROPESIP_WHITE_PNG}
`;
}

function kcCr(s, f){
  const host = kcHost(f), cls = s.INGRESS_CLASS;
  return `# Keycloak ${VERSIONS.keycloak} (official operator): database in the PostgreSQL of the installation, administrator from a Secret.
# The browser uses https://${host}; DX talks to it inside the cluster (http://keycloak-service.${s.SHARED_NS}.svc:8080)
# thanks to hostname.backchannelDynamic, so DX needs no CA for Keycloak.
apiVersion: k8s.keycloak.org/v2beta1
kind: Keycloak
metadata:
  name: keycloak
  namespace: ${s.SHARED_NS}
spec:
  instances: 1
  db:
    vendor: postgres
    host: ${s.PG_HOST}
    database: keycloak
    usernameSecret: { name: keycloak-db, key: username }
    passwordSecret: { name: keycloak-db, key: password }
  bootstrapAdmin:
    user: { secret: keycloak-admin }
  http:
    httpEnabled: true
  hostname:
    hostname: https://${host}
    backchannelDynamic: true
  proxy:
    headers: xforwarded
  ingress:
    enabled: true
    className: ${cls}
    tlsSecret: keycloak-tls     # self-signed certificate created by the install step (replace it with yours)
  resources:
    requests: { cpu: 200m, memory: 768Mi }
    limits: { memory: 1536Mi }
${f.kcTheme ? `  # The EUROPESIP login theme (ConfigMap keycloak-theme-europesip), mounted as /opt/keycloak/themes/europesip
  unsupported:
    podTemplate:
      spec:
        containers:
          - volumeMounts:
              - { name: theme-europesip, mountPath: /opt/keycloak/themes/europesip/login, readOnly: true }
        volumes:
          - name: theme-europesip
            configMap:
              name: keycloak-theme-europesip
              items:
                - { key: theme.properties, path: theme.properties }
                - { key: europesip.css, path: resources/css/europesip.css }
                - { key: europesip-white.png, path: resources/img/europesip-white.png }
` : ""}`;
}

function kcRealm(s, lang, f = {}){
  const dx = `https://${s.DX_HOST}`;
  return `# Realm "dx": the users of the OpenLDAP (User Federation, read-only, imported on login) and DX Compose as an OIDC client.
# The secrets come in as placeholders from Secrets (LDAP bind password from openldap-admin, client secret from
# keycloak-realm). A realm import only creates the realm: later changes go through the Keycloak admin console.
apiVersion: k8s.keycloak.org/v2beta1
kind: KeycloakRealmImport
metadata:
  name: realm-dx
  namespace: ${s.SHARED_NS}
spec:
  keycloakCRName: keycloak
  placeholders:
    LDAP_BIND_PASSWORD: { secret: { name: openldap-admin, key: LDAP_ADMIN_PASSWORD } }
    DX_CLIENT_SECRET: { secret: { name: keycloak-realm, key: clientSecret } }
  realm:
    realm: dx
    displayName: "HCL DX Compose"
    # Header of the login page: ${f.kcTheme ? "the EUROPESIP logo of its theme" : "the Keycloak logo (the default Keycloak theme)"} and the product name
    displayNameHtml: '<div class="kc-logo-text"><span>${f.kcTheme ? "EUROPESIP" : "Keycloak"}</span></div><div class="dx-subtitle">HCL DX Compose</div>'
${f.kcTheme ? "    loginTheme: europesip\n" : ""}    enabled: true
    internationalizationEnabled: true
    supportedLocales: [es, en]
    defaultLocale: ${lang === "es" ? "es" : "en"}
    clients:
      - clientId: dx-compose
        name: HCL DX Compose
        protocol: openid-connect
        publicClient: false
        clientAuthenticatorType: client-secret
        secret: "\${DX_CLIENT_SECRET}"
        standardFlowEnabled: true
        directAccessGrantsEnabled: false
        rootUrl: ${dx}
        redirectUris: ["${dx}/oidcclient/redirect/keycloak"]
        webOrigins: ["${dx}"]
        attributes:
          post.logout.redirect.uris: "${dx}/wps/portal"
    components:
      org.keycloak.storage.UserStorageProvider:
        - name: openldap
          providerId: ldap
          config:
            enabled: ["true"]
            vendor: ["other"]
            connectionUrl: ["ldap://${s.LDAP_HOST}:389"]
            authType: ["simple"]
            bindDn: ["cn=admin,dc=dxdemo,dc=com"]
            bindCredential: ["\${LDAP_BIND_PASSWORD}"]
            usersDn: ["ou=users,dc=dxdemo,dc=com"]
            searchScope: ["1"]
            userObjectClasses: ["inetOrgPerson"]
            usernameLDAPAttribute: ["uid"]
            rdnLDAPAttribute: ["uid"]
            uuidLDAPAttribute: ["entryUUID"]
            editMode: ["READ_ONLY"]
            importEnabled: ["true"]
            syncRegistrations: ["false"]
            trustEmail: ["true"]
            pagination: ["false"]
          subComponents:
            org.keycloak.storage.ldap.mappers.LDAPStorageMapper:
              - { name: username, providerId: user-attribute-ldap-mapper, config: { ldap.attribute: [uid], user.model.attribute: [username], read.only: ["true"], always.read.value.from.ldap: ["false"], is.mandatory.in.ldap: ["true"] } }
              - { name: first name, providerId: user-attribute-ldap-mapper, config: { ldap.attribute: [givenName], user.model.attribute: [firstName], read.only: ["true"], always.read.value.from.ldap: ["true"], is.mandatory.in.ldap: ["false"] } }
              - { name: last name, providerId: user-attribute-ldap-mapper, config: { ldap.attribute: [sn], user.model.attribute: [lastName], read.only: ["true"], always.read.value.from.ldap: ["true"], is.mandatory.in.ldap: ["true"] } }
              - { name: email, providerId: user-attribute-ldap-mapper, config: { ldap.attribute: [mail], user.model.attribute: [email], read.only: ["true"], always.read.value.from.ldap: ["false"], is.mandatory.in.ldap: ["false"] } }
              - { name: locale, providerId: user-attribute-ldap-mapper, config: { ldap.attribute: [preferredLanguage], user.model.attribute: [locale], read.only: ["true"], always.read.value.from.ldap: ["true"], is.mandatory.in.ldap: ["false"] } }
`;
}

function kcDxLayer(s, f){
  const host = kcHost(f), sh = s.SHARED_NS;
  return `# DX layer: sign-in through Keycloak (OpenID Connect), on top of the LDAP layer. Added to every DX helm upgrade from
# the LDAP step on. Documentation: DX Compose CF239 > Configuring DX Compose to use an OIDC identity provider.
# Peculiarities found in the lab (docs/third-party.md of the installer):
#  - Keycloak federates the same OpenLDAP as DX: mapIdentityToRegistryUser="true" makes the OIDC user the LDAP user of DX
#    (its groups, roles and preferredLanguage).
#  - No discovery URL: Liberty only accepts an HTTPS one. The browser signs in at the public URL; DX gets the token and the
#    keys inside the cluster (http), so it needs no CA for Keycloak. The issuer is the public URL.
#  - With openidConnectClient-1.0 Liberty names the SSO cookie WAS_n<hash> instead of LtpaToken2 (it cannot be changed).
#    The DX REST login (/dx/api/core/v1/auth/login) then answers without a cookie: tools sign in with the portal form
#    (j_security_check), which is why it and Basic auth (DXClient, scripts) are left out of OIDC below.
#  - wpsadmin and the LDAP login page are still there: https://${s.DX_HOST}/wps/portal/poc?uri=nm:oid:wps.Login
configuration:
  webEngine:
    customSecrets:
      keycloak-oidc: "dx-keycloak-oidc"      # environment variable OIDC_CLIENT_SECRET
    # Full logout (HCL step 4): "Log out" in DX also ends the Keycloak session, then returns to the portal
    propertiesFilesOverrides:
      ConfigService.properties:
        redirect.logout: "true"
        redirect.logout.ssl: "true"
        redirect.logout.url: "https://${host}/realms/dx/protocol/openid-connect/logout?client_id=dx-compose&post_logout_redirect_uri=https%3A%2F%2F${s.DX_HOST}%2Fwps%2Fportal"
    configOverrideFiles:
      oidc-keycloak.xml: |
        <server description="DX Web Engine - sign-in with Keycloak (OIDC)">
          <featureManager>
            <feature>openidConnectClient-1.0</feature>
          </featureManager>
          <authFilter id="oidcAuthFilter">
            <requestUrl id="xmlaccess" urlPattern="/wps/config" matchType="notContain"/>
            <requestUrl id="seedlist" urlPattern="/wps/seedlist/myserver" matchType="notContain"/>
            <requestUrl id="siteBuilder" urlPattern="TASK_CREATE_SITE=" matchType="notContain"/>
            <requestUrl id="wcmLogin" urlPattern="/wps/wcm/login" matchType="notContain"/>
            <requestUrl id="webdav" urlPattern="/wps/webdav" matchType="notContain"/>
            <requestUrl id="syndication" urlPattern="/wcm/basicauth/SyndicationServlet" matchType="notContain"/>
            <requestUrl id="wcmConnect" urlPattern="/wcm/connect" matchType="notContain"/>
            <requestUrl id="wcmMyConnect" urlPattern="/wcm/myconnect" matchType="notContain"/>
            <requestUrl id="dxApiLogin" urlPattern="/dx/api/core/v1/auth" matchType="notContain"/>
            <requestUrl id="pocLogin" urlPattern="nm:oid:wps.Login" matchType="notContain"/>
            <requestUrl id="formLogin" urlPattern="j_security_check" matchType="notContain"/>
            <requestHeader id="basicAuth" name="Authorization" value="Basic" matchType="notContain"/>
          </authFilter>
          <openidConnectClient id="keycloak"
              clientId="dx-compose" clientSecret="\${OIDC_CLIENT_SECRET}"
              issuerIdentifier="https://${host}/realms/dx"
              authorizationEndpointUrl="https://${host}/realms/dx/protocol/openid-connect/auth"
              tokenEndpointUrl="http://keycloak-service.${sh}.svc:8080/realms/dx/protocol/openid-connect/token"
              jwkEndpointUrl="http://keycloak-service.${sh}.svc:8080/realms/dx/protocol/openid-connect/certs"
              signatureAlgorithm="RS256" scope="openid profile email"
              userIdentityToCreateSubject="preferred_username" mapIdentityToRegistryUser="true"
              httpsRequired="false" authFilterRef="oidcAuthFilter"/>
        </server>
`;
}

// ---------------------------------------------------------------------------------------------------------
// The transformation of the generated installation
// ---------------------------------------------------------------------------------------------------------
const T = (lang, en, es) => lang === "es" ? es : en;

export function applyCicd(form, s, files, steps, lang){
  if (!cicdOn(form)) return {files, steps};
  const cns = cicdNs(form), vault = vaultOn(form), ns = s.DX_NS, sh = s.SHARED_NS;
  const W = s.helm === "3" ? "--wait" : "--wait=legacy";
  const F = {...files}, add = (p, text, mode) => F[p] = {text, mode};
  const mk = (id, title, note, cmd, o = {}) => ({lab: "", id, title, note, cmd, opt: !!o.opt, manual: o.manual || ""});
  const newNs = cns !== ns && cns !== sh ? `kubectl create namespace ${cns} --dry-run=client -o yaml | kubectl apply -f -\n` : "";
  const C = [];
  if (form.cicdOpenbao) {
    add(`${DIR}/openbao-values.yaml`, openbaoValues());
    add(`${DIR}/openbao-lib.sh`, obLib(cns), 0o100644);
    add(`${DIR}/openbao-init.sh`, obInit(s, cns), 0o100755);
    add(`${DIR}/openbao-unseal.sh`, obUnseal(), 0o100755);
    add(`${DIR}/secret-store.yaml`, storeYaml(s, cns));
    add(`${DIR}/openbao-secrets.sh`, obSecrets(s, form), 0o100755);
    const install = form.openbaoMode === "existing" ? "" : `helm repo add openbao https://openbao.github.io/openbao-helm
helm upgrade --install openbao openbao/openbao --version ${VERSIONS.openbao} -n ${cns} -f ${DIR}/openbao-values.yaml \\
  --set server.dataStorage.storageClass=${s.SC_RWO}
`;
    C.push(mk("C-1", T(lang, "Secrets manager: OpenBao and External Secrets Operator", "Gestor de secretos: OpenBao y External Secrets Operator"),
      T(lang, `OpenBao (open-source Vault) keeps the secrets; External Secrets Operator turns them into Kubernetes Secrets. The unseal keys are written to ${OB}/openbao-init.txt: keep them safe.`,
              `OpenBao (Vault de código abierto) guarda los secretos; External Secrets Operator los convierte en Secrets de Kubernetes. Las claves de desbloqueo se escriben en ${OB}/openbao-init.txt: guárdalas bien.`),
      `${newNs}${install}helm repo add external-secrets https://charts.external-secrets.io
helm upgrade --install external-secrets external-secrets/external-secrets --version ${VERSIONS.eso} -n ${cns} --set installCRDs=true ${W} --timeout 10m
./${DIR}/openbao-init.sh`));
    C.push(mk("C-2", T(lang, "The secrets of this installation in OpenBao", "Los secretos de esta instalación en OpenBao"),
      T(lang, "It asks (hidden) for the external secrets that are not in OpenBao yet and generates the internal ones at random. The operator can also enter them beforehand in the OpenBao UI (see RUNBOOK.md).",
              "Pide (oculto) los secretos externos que aún no están en OpenBao y genera los internos al azar. El operador también puede darlos de alta antes en la interfaz de OpenBao (ver RUNBOOK.md)."),
      `./${DIR}/openbao-secrets.sh
kubectl apply -f ${DIR}/secret-store.yaml
kubectl wait clustersecretstore/openbao-dx --for=condition=Ready --timeout=120s`,
      {manual: T(lang, `OpenBao UI: kubectl -n ${cns} port-forward svc/openbao 8200:8200, then http://localhost:8200/ui (method Username, user operador, password in ${OB}/operador.password). After a restart of its pod, unseal it: ./${DIR}/openbao-unseal.sh`,
                       `Interfaz de OpenBao: kubectl -n ${cns} port-forward svc/openbao 8200:8200 y http://localhost:8200/ui (método Username, usuario operador, contraseña en ${OB}/operador.password). Si su pod se reinicia, desbloquéalo: ./${DIR}/openbao-unseal.sh`)}));
  }
  if (form.cicdArgo) {
    add(`${DIR}/argocd-values.yaml`, argoValues(!!form.cicdOperator));
    C.push(mk("C-3", "Argo CD (GitOps)", T(lang, "Keeps the cluster equal to a Git repository. No Application is created: point it at your own repository.", "Mantiene el clúster igual que un repositorio Git. No se crea ninguna Application: apúntalo a tu propio repositorio."),
      `${form.cicdOpenbao ? "" : newNs}helm upgrade --install argocd oci://ghcr.io/argoproj/argo-helm/argo-cd --version ${VERSIONS.argocd} -n ${cns} -f ${DIR}/argocd-values.yaml ${W} --timeout 10m
kubectl -n ${cns} rollout status deploy/argocd-server --timeout=300s`,
      {manual: T(lang, `Argo CD UI: kubectl -n ${cns} port-forward svc/argocd-server 8080:443, then https://localhost:8080 (user admin; password: kubectl -n ${cns} get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d).`,
                       `Interfaz de Argo CD: kubectl -n ${cns} port-forward svc/argocd-server 8080:443 y https://localhost:8080 (usuario admin; contraseña: kubectl -n ${cns} get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d).`)}));
  }
  const OP = [];
  if (form.cicdOperator) {
    add(`${DIR}/dxop-hello.yaml`, helloYaml(s, cns));
    const adm = vault
      ? (add(`${DIR}/dxop-secrets.yaml`, esFile("Operator: the DX administrator it pushes with", [externalSecret(s, {name: "dxop-dx-admin", namespace: cns, type: "Opaque", labels: {}, data: {username: "wpsadmin", password: labRef("dxop-dx-admin")}})])),
         `kubectl apply -f ${DIR}/dxop-secrets.yaml\n${waitEs(cns, ["dxop-dx-admin"])}`)
      : (add(`${DIR}/dxop-secrets.yaml`, `# Operator: the DX administrator it pushes with (in a real project, a technical user). Contains credentials in PLAIN TEXT: keep it private.\n---\napiVersion: v1\nkind: Secret\nmetadata:\n  name: dxop-dx-admin\n  namespace: ${cns}\ntype: Opaque\nstringData:\n  username: wpsadmin\n  password: ${ysq(form.LAB_PASSWORD || "EuropeS1P")}\n`, 0o100600),
         `kubectl apply -f ${DIR}/dxop-secrets.yaml`);
    OP.push(mk("OP-1", T(lang, "HCL DX Script Application operator", "Operador de Script Applications de HCL DX"),
      T(lang, "Deploys Script Applications, pages, DAM files and databases from Kubernetes resources and keeps them in DX (github.com/europesip/hcl-dx-scriptapp-operator). Its image includes HCL DXClient: you accepted its license in the installer.",
              "Despliega Script Applications, páginas, ficheros del DAM y bases de datos desde recursos de Kubernetes y los mantiene en DX (github.com/europesip/hcl-dx-scriptapp-operator). Su imagen incluye HCL DXClient: aceptaste su licencia en el instalador."),
      `${form.cicdOpenbao || form.cicdArgo ? "" : newNs}# The CRDs of this version first: Helm only installs CRDs on the first install, not on upgrades
kubectl apply --server-side --force-conflicts ${OP_CRDS.map(c => `-f ${OP_CRD_URL}${c}.yaml`).join(" ")}
helm upgrade --install dxop oci://ghcr.io/europesip/charts/hcl-dx-scriptapp-operator --version ${VERSIONS.operator} -n ${cns} \\
  --set dxclient.acceptLicense=true ${W} --timeout 10m`));
    OP.push(mk("OP-2", T(lang, "Operator check: the hello sample on a page", "Comprobación del operador: el ejemplo hello en una página"),
      T(lang, "A DXConnection, one HTML file in a ConfigMap and its page. Delete it with: kubectl delete -f lab-cicd/dxop-hello.yaml", "Una DXConnection, un HTML en un ConfigMap y su página. Para borrarlo: kubectl delete -f lab-cicd/dxop-hello.yaml"),
      `${adm}
kubectl -n ${ns} get secret dx-tls-cert -o jsonpath='{.data.tls\\.crt}' | base64 -d > ${DIR}/dx-ca.crt
kubectl -n ${cns} create secret generic dxop-dx-ca --from-file=ca.crt=${DIR}/dx-ca.crt --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f ${DIR}/dxop-hello.yaml
kubectl -n ${cns} wait dxscriptapplication/dxop-hello dxpage/dxop-hello --for=condition=Ready --timeout=600s`,
      {manual: T(lang, `Open https://${s.DX_HOST}/wps/myportal and the "DXOP Hello" page.`, `Abre https://${s.DX_HOST}/wps/myportal y la página «DXOP Hola».`)}));
  }

  const KC = [];
  if (keycloakOn(form)) {
    const host = kcHost(form), pg = `${s.PG_CLUSTER}-1`;
    add(`${KC_DIR}/keycloak-secrets.yaml`, kcSecrets(s, form, vault), vault ? 0o100644 : 0o100600);
    add(`${KC_DIR}/keycloak.yaml`, kcCr(s, form));
    add(`${KC_DIR}/realm-dx.yaml`, kcRealm(s, lang, form));
    if (form.kcTheme) add(`${KC_DIR}/theme-europesip.yaml`, kcTheme(s));
    add(`${KC_DIR}/custom-values.keycloak.yaml`, kcDxLayer(s, form));
    KC.push(mk("K-1", T(lang, "Keycloak (SSO) with the OpenLDAP users", "Keycloak (SSO) con los usuarios del OpenLDAP"),
      T(lang, `Official Keycloak operator, its database in PostgreSQL and the realm "dx" with the LDAP federation and the DX client. DX starts signing in through Keycloak with the LDAP step (stage 2).`,
              `Operador oficial de Keycloak, su base de datos en PostgreSQL y el realm «dx» con la federación del LDAP y el cliente de DX. DX empieza a entrar por Keycloak con el paso del LDAP (etapa 2).`),
`for c in keycloaks keycloakrealmimports keycloakoidcclients keycloaksamlclients; do
  kubectl apply --server-side -f ${KC_RAW}/$c.k8s.keycloak.org-v1.yml >/dev/null
done
curl -fsSL --retry 5 --retry-all-errors ${KC_RAW}/kubernetes.yml | sed 's/namespace: keycloak$/namespace: ${sh}/' | kubectl -n ${sh} apply -f -
kubectl -n ${sh} rollout status deploy/keycloak-operator --timeout=300s
kubectl apply -f ${KC_DIR}/keycloak-secrets.yaml${vault ? `
${waitEs(sh, ["keycloak-admin", "keycloak-db", "keycloak-realm"])}
${waitEs(ns, ["dx-keycloak-oidc"])}` : ""}
# its database and owner in PostgreSQL (the password through stdin, never on a command line)
{ printf "SELECT 'CREATE ROLE keycloak LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='keycloak')\\gexec\n"
  printf "\\set pw '%s'\nALTER ROLE keycloak PASSWORD :'pw';\n" "$(kubectl -n ${sh} get secret keycloak-db -o jsonpath='{.data.password}' | base64 -d)"
  printf "SELECT 'CREATE DATABASE keycloak OWNER keycloak' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='keycloak')\\gexec\n"; } \
  | kubectl -n ${sh} exec -i ${pg} -c postgres -- psql -U postgres -q -v ON_ERROR_STOP=1 -f -
[ -f ${KC_DIR}/keycloak-tls.crt ] || openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 365 -keyout ${KC_DIR}/keycloak-tls.key -out ${KC_DIR}/keycloak-tls.crt \
  -subj "/CN=${host}" -addext "subjectAltName=DNS:${host}" 2>/dev/null
kubectl -n ${sh} create secret tls keycloak-tls --cert=${KC_DIR}/keycloak-tls.crt --key=${KC_DIR}/keycloak-tls.key --dry-run=client -o yaml | kubectl apply -f -
${form.kcTheme ? `kubectl apply -f ${KC_DIR}/theme-europesip.yaml
` : ""}kubectl apply -f ${KC_DIR}/keycloak.yaml
kubectl -n ${sh} wait keycloak/keycloak --for=condition=Ready --timeout=900s
kubectl apply -f ${KC_DIR}/realm-dx.yaml
kubectl -n ${sh} wait keycloakrealmimport/realm-dx --for=condition=Done --timeout=600s`,
      {manual: T(lang, `Keycloak console: https://${host}/admin (user admin; password: kubectl -n ${sh} get secret keycloak-admin -o jsonpath='{.data.password}' | base64 -d). The DX login page goes to Keycloak from stage 2; wpsadmin still signs in at https://${s.DX_HOST}/wps/portal/poc?uri=nm:oid:wps.Login`,
                       `Consola de Keycloak: https://${host}/admin (usuario admin; contraseña: kubectl -n ${sh} get secret keycloak-admin -o jsonpath='{.data.password}' | base64 -d). El login de DX pasa a Keycloak desde la etapa 2; wpsadmin sigue entrando en https://${s.DX_HOST}/wps/portal/poc?uri=nm:oid:wps.Login`)}));
  }

  let out = steps.map(st => ({...st}));
  if (vault) out = vaultSteps(s, F, out, cns, lang);
  if (keycloakOn(form)) out = out.map(st => {
    let cmd = st.cmd.split("  -f lab-ldap/custom-values.ldap.yaml \\\n").join("  -f lab-ldap/custom-values.ldap.yaml \\\n  -f lab-keycloak/custom-values.keycloak.yaml \\\n");
    // the optional IQ checks: with OIDC the DX REST login answers without a cookie, the portal login form opens the session
    cmd = cmd.replace(/curl -sk -c cookies\.txt -o \/dev\/null -H 'Content-Type: application\/json' \\\n  -d '\{"username":"([^"]*)","password":"(.*?)"\}' (https:\/\/\S+)\/dx\/api\/core\/v1\/auth\/login/g,
      (_, u, p, base) => `curl -sk -c cookies.txt -o /dev/null --data-urlencode 'j_username=${u}' --data-urlencode 'j_password=${p}' ${base}/wps/j_security_check   # OIDC: form login`);
    if (/helm upgrade --install orbita /.test(cmd)) cmd = cmd.replace(/hcl-dx-orbita --version [\d.]+/, `hcl-dx-orbita --version ${VERSIONS.orbitaOidc}`);
    return cmd === st.cmd ? st : {...st, cmd};
  });
  const at = id => out.findIndex(x => x.id === id);
  out.splice(at("D-1") + 1, 0, ...C);
  if (KC.length) { let i = at("D-4"); out.splice(i + 1, 0, ...KC); }
  if (OP.length) { let i = at("1-6"); if (i < 0) i = at("1-5"); out.splice(i + 1, 0, ...OP); }
  return {files: F, steps: out};
}

// The OpenBao version of the files and steps
function vaultSteps(s, F, steps, cns, lang){
  const ns = s.DX_NS, sh = s.SHARED_NS;
  const waits = {};                                  // secrets.yaml path -> wait command
  for (const [p, f] of Object.entries(F)) {
    if (!/\/secrets\.yaml$/.test(p) || p.startsWith(DIR)) continue;
    const docs = parseSecrets(f.text);
    if (p === "lab-base/secrets.yaml") docs.push({name: "dx-tls-cert", namespace: ns, type: "kubernetes.io/tls", labels: {}, data: {"tls.crt": S("tls", "tls.crt"), "tls.key": S("tls", "tls.key")}});
    F[p] = {text: esFile((f.text.match(/^# (.+)$/m) || [])[1] || p, docs.map(d => externalSecret(s, d))), mode: 0o100644};
    const byNs = {};
    for (const d of docs) (byNs[d.namespace] ||= []).push(d.name);
    waits[p] = Object.entries(byNs).map(([n, names]) => waitEs(n, names)).join("\n");
  }
  // Web Engine database properties (they hold the database password)
  for (const dir of ["lab-bbdd", "lab-bbdd-oracle"]) {
    const prop = F[`${dir}/dx_dbdomain.properties`];
    if (!prop) continue;
    const text = dir === "lab-bbdd" ? prop.text.split(LAB).join(S("pg-dxuser", "password")) : prop.text;
    F[`${dir}/dbdomain-secret.yaml`] = {text: esFile("Web Engine database properties (they hold the database password)",
      [externalSecret(s, {name: "custom-credentials-webengine-dbdomain-secret", namespace: ns, type: "Opaque", labels: {}, data: {"dx_dbdomain.properties": text}})])};
    delete F[`${dir}/dx_dbdomain.properties`];
  }
  if (s.lab4) F["lab-search/certs-secrets.yaml"] = {text: esFile("OpenSearch certificates (a lab CA and the admin, node and client certificates, generated in OpenBao)",
    ["admin", "node", "client"].map(n => externalSecret(s, {name: `search-${n}-cert`, namespace: ns, type: "Opaque", labels: {},
      data: {[`${n}.pem`]: S("search-certs", `${n}.pem`), [`${n}-key.pem`]: S("search-certs", `${n}-key.pem`), "root-ca.pem": S("search-certs", "root-ca.pem")}})))};
  // The LDIF: the {SSHA} hashes are filled in at install time from OpenBao
  if (F["lab-ldap/demo-users.ldif"]) F["lab-ldap/demo-users.ldif"] = {...F["lab-ldap/demo-users.ldif"],
    text: F["lab-ldap/demo-users.ldif"].text.replace(/\{SSHA\}[A-Za-z0-9+/=]+/g, "@@SSHA@@").replace(/salted \{SSHA\} hash of "[^"]*"/, "salted {SSHA} hash of the demo users password (OpenBao, dx/" + ns + "/demo-users)")};

  const ref = (path, key) => `'"$(obv ${path} ${key})"'`;
  const swap = (cmd, labTo) => cmd.split(LAB).join(S(labTo, "password")).replace(/@@OB:([\w-]+):([\w.-]+)@@/g, (_, p, k) => ref(p, k));
  return steps.map(st => {
    let cmd = st.cmd;
    for (const [p, w] of Object.entries(waits)) cmd = cmd.split(`kubectl apply -f ${p}`).join(`kubectl apply -f ${p}\n${w}`);
    if (st.id === "1-3") cmd = "kubectl apply -f lab-base/secrets.yaml\n" + waits["lab-base/secrets.yaml"];
    if (st.id === "D-2") cmd = cmd.replace(/kubectl -n (\S+) create configmap openldap-demo-ldif --from-file=00-demo-users\.ldif=lab-ldap\/demo-users\.ldif/,
      `sed "s#@@SSHA@@#$(obv demo-users ssha)#g" lab-ldap/demo-users.ldif | kubectl -n $1 create configmap openldap-demo-ldif --from-file=00-demo-users.ldif=/dev/stdin`);
    cmd = cmd.replace(/kubectl -n \S+ create secret generic custom-credentials-webengine-dbdomain-secret --from-file=(lab-bbdd(?:-oracle)?)\/dx_dbdomain\.properties [^\n]*/,
      (_, dir) => `kubectl apply -f ${dir}/dbdomain-secret.yaml\n${waitEs(ns, ["custom-credentials-webengine-dbdomain-secret"])}`);
    if (st.id === "4-1") cmd = `kubectl apply -f lab-search/certs-secrets.yaml\n${waitEs(ns, ["search-admin-cert", "search-node-cert", "search-client-cert"])}`;
    if (st.id === "1-2") cmd = cmd.replace(/helm registry login hclcr\.io -u (\S+) -p \S+/, (_, u) => `obv registry password | helm registry login hclcr.io -u ${u} --password-stdin`);
    cmd = swap(cmd, st.id === "D-3" ? "ldap-admin" : "wpsadmin");
    const note = st.id === "1-3" ? T(lang, "Pull secret, wpsadmin and the HAProxy TLS certificate: External Secrets Operator creates them from OpenBao.", "Pull secret, wpsadmin y el certificado TLS de HAProxy: External Secrets Operator los crea desde OpenBao.")
      : st.id === "4-1" ? T(lang, "The lab CA and the admin, node and client certificates were generated in OpenBao (step C-2): External Secrets Operator creates the secrets.", "La CA del lab y los certificados admin, node y client se generaron en OpenBao (paso C-2): External Secrets Operator crea los secrets.") : st.note;
    return {...st, cmd, note};
  });
}

// install.sh / uninstall: the OpenBao helpers, the collector without secrets and a cleanup that keeps the CI/CD tools
export function cicdInstallSh(form, s, text){
  if (!cicdOn(form)) return text;
  const cns = cicdNs(form), vault = vaultOn(form);
  let t = text;
  if (keycloakOn(form))   // Keycloak first, while its operator still runs (it removes the finalizers of its resources)
    t = t.replace(`  for r in $(helm list -n ${s.SHARED_NS} -q);`, `  kubectl -n ${s.SHARED_NS} delete keycloakrealmimports,keycloaks --all --wait=true --timeout=5m 2>/dev/null
  kubectl -n ${s.SHARED_NS} delete deploy/keycloak-operator svc/keycloak-operator secret/keycloak-admin secret/keycloak-db secret/keycloak-realm secret/keycloak-tls --ignore-not-found
  for r in $(helm list -n ${s.SHARED_NS} -q);`);
  const tools = !!(form.cicdOpenbao || form.cicdArgo || form.cicdOperator);
  // ExternalSecrets first, while External Secrets Operator still runs: it removes their finalizers (otherwise the
  // deletion of the namespaces hangs once the operator is uninstalled)
  if (form.cicdOpenbao) t = t.replace("  set +e\n", `  set +e\n  for n in ${[...new Set([s.DX_NS, s.SHARED_NS, cns])].join(" ")}; do kubectl -n $n delete externalsecret --all --wait=true --timeout=2m 2>/dev/null; done\n`);
  // The resources of the Script Application operator too, while it runs (it removes their finalizers; deletionPolicy
  // Retain by default, so nothing is deleted in DX)
  if (form.cicdOperator) t = t.replace("  set +e\n", `  set +e\n  kubectl -n ${cns} delete dxpages,dxthemes,dxscriptapplications,dxdamcollections,dxdatabases,dxconnections --all --wait=true --timeout=3m 2>/dev/null\n`);
  if (vault) {
    t = t.replace('cd "$(dirname "$0")"\n', `cd "$(dirname "$0")"\nsource lab-cicd/openbao-lib.sh; OB_PATH=${s.DX_NS}   # obv <path> <key>: a value from OpenBao\n`);
    t = t.split(LAB).join(S("wpsadmin", "password")).replace(/'@@OB:([\w-]+):([\w.-]+)@@'/g, (_, p, k) => `"$(obv ${p} ${k} 2>/dev/null)"`);
    t = t.replace(/ LITELLM_MASTER_KEY='[^']*'/, ` LITELLM_MASTER_KEY="$(obv litellm masterKey 2>/dev/null)"`);
  }
  const keep = ["openbao", "external-secrets", "argocd", "dxop"];
  if (!tools) return t;
  if (cns === s.SHARED_NS) {
    t = t.replace(`  for r in $(helm list -n ${s.SHARED_NS} -q); do echo "helm uninstall $r"; helm uninstall $r -n ${s.SHARED_NS} --wait --timeout 10m; done\n  kubectl -n ${s.SHARED_NS} delete pvc --all --wait=false\n  kubectl delete namespace ${s.DX_NS} ${s.SHARED_NS} --ignore-not-found --wait=true --timeout=10m`,
`  # The CI/CD tools (${keep.join(", ")}) share ${s.SHARED_NS}: they are kept unless --all (OpenBao holds the secrets)
  for r in $(helm list -n ${s.SHARED_NS} -q); do case " ${keep.join(" ")} " in *" $r "*) [ "$ALL" = 1 ] || continue ;; esac; echo "helm uninstall $r"; helm uninstall $r -n ${s.SHARED_NS} --wait --timeout 10m; done
  kubectl -n ${s.SHARED_NS} get pvc -o name | grep -v openbao | xargs -r kubectl -n ${s.SHARED_NS} delete --wait=false
  # What the steps created in ${s.SHARED_NS} without Helm (the namespace stays, so it is deleted one by one)
  kubectl -n ${s.SHARED_NS} delete externalsecret --all 2>/dev/null
  kubectl -n ${s.SHARED_NS} delete deploy/europesip-mcp svc/europesip-mcp cm/openldap-demo-ldif cm/dx-pg-setup-sql secret/scriptapp-dx-ca secret/orbita-dx-ca \\
    secret/openldap-admin secret/dx-pg-superuser secret/dx-pg-dxuser secret/dx-pg-iquser secret/litellm-env secret/scriptapp-dx secret/orbita-dx --ignore-not-found
  kubectl delete namespace ${s.DX_NS} --ignore-not-found --wait=true --timeout=10m
  if [ "$ALL" = 1 ]; then kubectl delete clustersecretstore openbao-dx --ignore-not-found 2>/dev/null; kubectl -n ${s.SHARED_NS} delete pvc --all --wait=false; kubectl delete namespace ${s.SHARED_NS} --ignore-not-found --wait=true --timeout=10m
  else echo "Kept in ${s.SHARED_NS}: ${keep.join(", ")} (./install.sh --cleanup --all removes them too)"; fi`);
  } else {
    t = t.replace(`  kubectl delete namespace ${s.DX_NS} ${s.SHARED_NS} --ignore-not-found --wait=true --timeout=10m`,
`  kubectl delete namespace ${s.DX_NS} ${s.SHARED_NS} --ignore-not-found --wait=true --timeout=10m
  if [ "$ALL" = 1 ]; then for r in $(helm list -n ${cns} -q); do helm uninstall $r -n ${cns} --wait --timeout 10m; done; kubectl delete clustersecretstore openbao-dx --ignore-not-found 2>/dev/null; kubectl delete namespace ${cns} --ignore-not-found --wait=true --timeout=10m
  else echo "Kept: the CI/CD tools in ${cns} (./install.sh --cleanup --all removes them too)"; fi`);
  }
  t = t.replace("CLEANUP=0\n", "CLEANUP=0; ALL=0\n").replace("--cleanup) CLEANUP=1 ;;", "--cleanup) CLEANUP=1 ;; --all) ALL=1 ;;")
       .replace('#         ./install.sh --cleanup    delete everything this installation created, to start again', '#         ./install.sh --cleanup    delete everything this installation created, to start again (--all: also the CI/CD tools)');
  return t;
}

// RUNBOOK.md: what changes with the secrets manager and how to reach the tools
export function cicdRunbook(form, s, text, lang){
  if (!cicdOn(form)) return text;
  const cns = cicdNs(form), es = lang === "es";
  let t = text;
  if (vaultOn(form)) {
    t = t.replace(/^> ⚠️ \*\*PoC[^\n]*$/m, es
      ? `> 🔐 **Secretos en OpenBao:** esta carpeta no contiene credenciales. El paso C-2 pide los secretos externos (o los toma de la interfaz de OpenBao, si el operador ya los dio de alta) y genera los internos; External Secrets Operator crea los Secrets de Kubernetes. Las claves de desbloqueo de OpenBao se guardan en \`${OB}/openbao-init.txt\` al instalar: guárdalas en lugar seguro.`
      : `> 🔐 **Secrets in OpenBao:** this folder holds no credentials. Step C-2 asks for the external secrets (or takes them from the OpenBao UI, if the operator already entered them) and generates the internal ones; External Secrets Operator creates the Kubernetes Secrets. The OpenBao unseal keys are saved in \`${OB}/openbao-init.txt\` when installing: keep them somewhere safe.`);
    t = t.replace(/\(wpsadmin \/ (your lab password|tu contraseña del lab)\)/, es ? "(wpsadmin / la contraseña guardada en OpenBao)" : "(wpsadmin / the password stored in OpenBao)");
  }
  const rows = [];
  if (form.cicdOpenbao) rows.push(es
    ? ["OpenBao (gestor de secretos)", `\`kubectl -n ${cns} port-forward svc/openbao 8200:8200\` → http://localhost:8200/ui · usuario \`operador\`, contraseña en \`${OB}/operador.password\`. Tras reiniciarse su pod: \`./${DIR}/openbao-unseal.sh\`. Si cambias una contraseña de DX en OpenBao, DX solo la aplica con un \`helm upgrade\` de DX y reiniciando el Web Engine (ver docs/openbao.md del instalador).`]
    : ["OpenBao (secrets manager)", `\`kubectl -n ${cns} port-forward svc/openbao 8200:8200\` → http://localhost:8200/ui · user \`operador\`, password in \`${OB}/operador.password\`. After its pod restarts: \`./${DIR}/openbao-unseal.sh\`. If you change a DX password in OpenBao, DX only applies it after a DX \`helm upgrade\` and a restart of the Web Engine (see docs/openbao.md of the installer).`]);
  if (form.cicdArgo) rows.push(["Argo CD", `\`kubectl -n ${cns} port-forward svc/argocd-server 8080:443\` → https://localhost:8080 · admin · \`kubectl -n ${cns} get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d\``]);
  if (keycloakOn(form)) rows.push(["Keycloak", es
    ? `https://${kcHost(form)}/admin · usuario \`admin\`, contraseña: \`kubectl -n ${s.SHARED_NS} get secret keycloak-admin -o jsonpath='{.data.password}' | base64 -d\`. Los usuarios del OpenLDAP entran en DX por Keycloak desde la etapa 2; wpsadmin, en \`/wps/portal/poc?uri=nm:oid:wps.Login\`. Certificado autofirmado: sustituye el Secret \`keycloak-tls\` por el tuyo.`
    : `https://${kcHost(form)}/admin · user \`admin\`, password: \`kubectl -n ${s.SHARED_NS} get secret keycloak-admin -o jsonpath='{.data.password}' | base64 -d\`. The OpenLDAP users sign in to DX through Keycloak from stage 2; wpsadmin at \`/wps/portal/poc?uri=nm:oid:wps.Login\`. Self-signed certificate: replace the \`keycloak-tls\` Secret with yours.`]);
  if (form.cicdOperator) rows.push([es ? "Operador de Script Applications" : "Script Application operator", `\`kubectl -n ${cns} get dxscriptapplications,dxpages\` · github.com/europesip/hcl-dx-scriptapp-operator`]);
  const block = [`## ${es ? "CI/CD avanzado" : "Advanced CI/CD"} (${es ? "namespace" : "namespace"} \`${cns}\`)`, "", "| | |", "|---|---|", ...rows.map(([a, b]) => `| **${a}** | ${b} |`), ""].join("\n");
  const i = t.indexOf(es ? "\n## Ejecutarlo" : "\n## Run it");
  return i < 0 ? t + "\n" + block : t.slice(0, i + 1) + block + "\n" + t.slice(i + 1);
}

export const CICD_DIR = {en: "Advanced CI/CD: OpenBao, External Secrets, Argo CD and the Script Application operator", es: "CI/CD avanzado: OpenBao, External Secrets, Argo CD y el operador de Script Applications"};
export {SECRET_KEYS};
