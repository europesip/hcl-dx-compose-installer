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

export const VERSIONS = {openbao: "0.30.7", openbaoApp: "2.7.2", eso: "2.14.0", argocd: "10.15.0", argocdApp: "3.6.1", operator: "0.1.1"};
const DIR = "lab-cicd";
const OB = "lab-cicd/openbao";                    // created by install.sh: init keys, operator password (mode 700)

export const cicdOn = f => !!(f.cicdOpenbao || f.cicdArgo || f.cicdOperator) && f.platform !== "openshift" && f.preset !== "webinar";
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
  const kinds = ["ScriptApplication", "DXPage", "DAMCollection", "PostgresDatabase", "DXConnection"];
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
kind: ScriptApplication
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
      `${form.cicdOpenbao || form.cicdArgo ? "" : newNs}helm upgrade --install dxop oci://ghcr.io/europesip/charts/hcl-dx-scriptapp-operator --version ${VERSIONS.operator} -n ${cns} \\
  --set dxclient.acceptLicense=true ${W} --timeout 10m`));
    OP.push(mk("OP-2", T(lang, "Operator check: the hello sample on a page", "Comprobación del operador: el ejemplo hello en una página"),
      T(lang, "A DXConnection, one HTML file in a ConfigMap and its page. Delete it with: kubectl delete -f lab-cicd/dxop-hello.yaml", "Una DXConnection, un HTML en un ConfigMap y su página. Para borrarlo: kubectl delete -f lab-cicd/dxop-hello.yaml"),
      `${adm}
kubectl -n ${ns} get secret dx-tls-cert -o jsonpath='{.data.tls\\.crt}' | base64 -d > ${DIR}/dx-ca.crt
kubectl -n ${cns} create secret generic dxop-dx-ca --from-file=ca.crt=${DIR}/dx-ca.crt --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f ${DIR}/dxop-hello.yaml
kubectl -n ${cns} wait scriptapplication/dxop-hello dxpage/dxop-hello --for=condition=Ready --timeout=600s`,
      {manual: T(lang, `Open https://${s.DX_HOST}/wps/myportal and the "DXOP Hello" page.`, `Abre https://${s.DX_HOST}/wps/myportal y la página «DXOP Hola».`)}));
  }

  let out = steps.map(st => ({...st}));
  if (vault) out = vaultSteps(s, F, out, cns, lang);
  const at = id => out.findIndex(x => x.id === id);
  out.splice(at("D-1") + 1, 0, ...C);
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
  if (vault) {
    t = t.replace('cd "$(dirname "$0")"\n', `cd "$(dirname "$0")"\nsource lab-cicd/openbao-lib.sh; OB_PATH=${s.DX_NS}   # obv <path> <key>: a value from OpenBao\n`);
    t = t.split(LAB).join(S("wpsadmin", "password")).replace(/'@@OB:([\w-]+):([\w.-]+)@@'/g, (_, p, k) => `"$(obv ${p} ${k} 2>/dev/null)"`);
    t = t.replace(/ LITELLM_MASTER_KEY='[^']*'/, ` LITELLM_MASTER_KEY="$(obv litellm masterKey 2>/dev/null)"`);
  }
  const keep = ["openbao", "external-secrets", "argocd", "dxop"];
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
  if [ "$ALL" = 1 ]; then kubectl delete clustersecretstore openbao-dx --ignore-not-found; kubectl -n ${s.SHARED_NS} delete pvc --all --wait=false; kubectl delete namespace ${s.SHARED_NS} --ignore-not-found --wait=true --timeout=10m
  else echo "Kept in ${s.SHARED_NS}: ${keep.join(", ")} (./install.sh --cleanup --all removes them too)"; fi`);
  } else {
    t = t.replace(`  kubectl delete namespace ${s.DX_NS} ${s.SHARED_NS} --ignore-not-found --wait=true --timeout=10m`,
`  kubectl delete namespace ${s.DX_NS} ${s.SHARED_NS} --ignore-not-found --wait=true --timeout=10m
  if [ "$ALL" = 1 ]; then for r in $(helm list -n ${cns} -q); do helm uninstall $r -n ${cns} --wait --timeout 10m; done; kubectl delete clustersecretstore openbao-dx --ignore-not-found; kubectl delete namespace ${cns} --ignore-not-found --wait=true --timeout=10m
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
  if (form.cicdOperator) rows.push([es ? "Operador de Script Applications" : "Script Application operator", `\`kubectl -n ${cns} get scriptapplications,dxpages\` · github.com/europesip/hcl-dx-scriptapp-operator`]);
  const block = [`## ${es ? "CI/CD avanzado" : "Advanced CI/CD"} (${es ? "namespace" : "namespace"} \`${cns}\`)`, "", "| | |", "|---|---|", ...rows.map(([a, b]) => `| **${a}** | ${b} |`), ""].join("\n");
  const i = t.indexOf(es ? "\n## Ejecutarlo" : "\n## Run it");
  return i < 0 ? t + "\n" + block : t.slice(0, i + 1) + block + "\n" + t.slice(i + 1);
}

export const CICD_DIR = {en: "Advanced CI/CD: OpenBao, External Secrets, Argo CD and the Script Application operator", es: "CI/CD avanzado: OpenBao, External Secrets, Argo CD y el operador de Script Applications"};
export {SECRET_KEYS};
