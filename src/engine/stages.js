// The installation as stages, the numbering shown everywhere in the installer (HCL feedback for the
// webinar of 12 November 2026): 0 Prerequisites · 1 Base DX installation · 2 LDAP configuration ·
// 3 Transfer to an external database · 4 AI Assistant · 5 Search, plus the extras (Script
// Application, EUROPESIP MCP, IQ sessions and memory, ÓRBITA) as named steps.
//
// The engine (core.js) produces the steps with their original lab ids (D-2, 2A-3, 3-4...). Here they
// are given their stage and a new id "<stage>-<n>", and the webinar is split into its two phases.

export const STAGES = {
  en: ["Prerequisites", "Base DX installation", "LDAP configuration", "Transfer to an external database", "AI Assistant", "Search", "ÓRBITA (extra)"],
  es: ["Pre-requisitos", "Instalación base de DX", "Configuración del LDAP", "Transferencia a base de datos externa", "Asistente de IA", "Búsqueda", "ÓRBITA (extra)"],
};
// The official HCL documentation (CF239) of each stage, for reference
const HD = "https://help.hcl-software.com/digital-experience";
export const STAGE_DOCS = [
  [["DX Compose · Preparation", `${HD}/dx-compose/CF239/deploy_dx/install/kubernetes_deployment/preparation/`]],
  [["DX Compose · Installation", `${HD}/dx-compose/CF239/deploy_dx/install/kubernetes_deployment/install/`]],
  [["DX Compose · LDAP configuration", `${HD}/dx-compose/CF239/deploy_dx/manage/cfg_webengine/ldap_configuration/`]],
  [["DX Compose · Database transfer", `${HD}/dx-compose/CF239/deploy_dx/manage/cfg_webengine/external_db_database_transfer/`]],
  [["HCL DX IQ · Installation", `${HD}/9.5/CF239/build_sites/iq/installation/`], ["HCL DX IQ · Deploying LiteLLM", `${HD}/9.5/CF239/build_sites/iq/installation/deploy-litellm/`]],
  [["DX Compose · Enabling search", `${HD}/dx-compose/CF239/deploy_dx/manage/cfg_dx_compose/enable_search/`]],
  [],
];
export const stageLabel = (n, lang) => `${n} · ${(STAGES[lang] || STAGES.en)[n]}`;

// Original id -> [stage, extra]
function stageOf(id){
  if (/^C-/.test(id)) return [0, true];       // advanced CI/CD (src/cicd.js)
  if (/^OP-/.test(id)) return [1, true];
  if (/^0-|^D-/.test(id)) return [0, id === "D-7"];
  if (id === "1B-1") return [1, true];
  if (/^1-/.test(id)) return [1, false];
  if (/^2A-|^AD-/.test(id)) return [2, false];
  if (/^2B-|^ORA-/.test(id)) return [3, false];
  if (id === "A1" || id === "3B-3") return [4, true];
  if (/^3-/.test(id)) return [4, false];
  if (/^4-|^F-/.test(id)) return [5, false];
  if (/^5-/.test(id)) return [6, true];
  return [0, false];
}
const EXTRA = {en: "Extra", es: "Extra"};

// Before publishing DX (HCL webinar feedback): most installation problems come from the network (DNS, firewall, load
// balancer, the ports of the workstation), so DX is checked first through kubectl port-forward, without Ingress, DNS
// or open ports. It never fails: it shows the HTTP code.
export function portForwardStep(s, lang){
  const es = lang === "es", svc = `svc/${s.DX_RELEASE}-haproxy`;
  return {id: "1-4p", lab: "", opt: false, manual: "",
    title: es ? "Comprobar DX con kubectl port-forward (antes del Ingress)" : "Check DX with kubectl port-forward (before the Ingress)",
    note: es ? "La mayoría de los problemas de una instalación vienen de las particularidades de la red (DNS, cortafuegos, balanceador, puertos del equipo). kubectl port-forward abre un túnel, a través de la API de Kubernetes, desde un puerto de tu equipo hasta el Service de HAProxy de DX: sin Ingress, sin DNS y sin abrir puertos. Si DX responde aquí y después falla por el Ingress, el problema está en la ruta o en la red, no en DX."
      : "Most installation problems come from the particularities of the network (DNS, firewall, load balancer, the ports of the workstation). kubectl port-forward opens a tunnel, through the Kubernetes API, from a port of your workstation to the HAProxy Service of DX: no Ingress, no DNS and no open ports. If DX answers here and later fails through the Ingress, the problem is in the route or the network, not in DX.",
    cmd: `kubectl -n ${s.DX_NS} port-forward ${svc} 8443:443 >/dev/null 2>&1 & PF=$!; sleep 5   # a tunnel: localhost:8443 -> HAProxy of DX
curl -sk -o /dev/null -w 'https://localhost:8443/wps/portal -> HTTP %{http_code}\\n' https://localhost:8443/wps/portal || true
kill $PF`};
}

// Small improvements over the engine commands that the frozen wizard does not have (the golden test
// compares the engine itself): the portal check waits until the new Ingress answers (it gives 404 for
// a few seconds after it is created), so a live demo does not show a false error.
function polish(st){
  if (st.id === "1-6") {
    const url = (st.cmd.match(/https:\/\/\S+\/wps\/portal/) || [])[0];
    if (url) return {...st, cmd: st.cmd.replace(/curl -sk -o \/dev\/null -w '[^']*' \S+/,
      `for i in $(seq 1 30); do c=$(curl -sk -o /dev/null -w '%{http_code}' ${url}); [ "$c" != 404 ] && [ "$c" != 000 ] && break; sleep 5; done\necho "${url} -> HTTP $c"`)};
  }
  return st;
}

// Give every step its stage, its label and a new id. Steps are kept in the engine order, then
// sorted by stage (the order of the engine is already by stage except for the fast demo).
// LiteLLM (D-5) and its check (D-6) are only used by IQ: they open stage 4 when IQ is installed (HCL feedback:
// installing them before DX was confusing; the HCL documentation also has them under IQ)
const LLM_IDS = new Set(["D-5", "D-6"]);
export function renumber(steps, lang){
  const iq = steps.some(x => x.id === "3-4");
  const out = steps.map((st, i) => { const [stage, extra] = st.stageAs != null ? [st.stageAs, false] : iq && LLM_IDS.has(st.id) ? [4, false] : stageOf(st.id);
    const {stageAs, ...rest} = st; return {...polish(rest), origId: st.id, stage, extra, _i: i}; });
  out.sort((a, b) => a.stage - b.stage || a._i - b._i);
  const n = {};
  return out.map(({_i, ...st}) => {
    n[st.stage] = (n[st.stage] || 0) + 1;
    return {...st, id: `${st.stage}-${n[st.stage]}`, lab: stageLabel(st.stage, lang),
      title: st.extra ? `${EXTRA[lang] || "Extra"} · ${st.title}` : st.title};
  });
}

// ---------------------------------------------------------------------------------------------
// Webinar: preparation (before the session) and the demo (stages 0 to 5)
// ---------------------------------------------------------------------------------------------
const PREP_IDS = new Set(["0-1", "0-2", "D-1", "D-2", "D-3", "D-4"]);

// Webinar files (output layer; the engine stays as the frozen wizard): the namespace of the third-party tools
// alone for the preparation, and the DX one shown and created live in the demo (generic and OpenShift versions);
// the OpenLDAP admin secret apart from the DX bind secret (dx-demo does not exist during the preparation); and
// the IQ deployment key in a Secret instead of the IQ values (the chart cannot read it from a secret yet, so
// demo.sh passes it with --set).
const splitDocs = text => { const parts = text.split(/^---\s*$/m); return {head: parts[0], docs: parts.slice(1)}; };
export function webinarFiles(files, s){
  const ns = s.DX_NS, sh = s.SHARED_NS, out = {...files};
  const shared = out["lab-base/namespaces.yaml"];
  delete out["lab-base/namespaces.yaml"];
  out["lab-base/namespace-shared.yaml"] = {text: `# Namespace of the third-party tools (OpenLDAP, PostgreSQL, LiteLLM), created by prepare.sh.
# It needs no annotations, on OpenShift either (they run with the range that restricted-v2 assigns).
apiVersion: v1
kind: Namespace
metadata:
  name: ${sh}
  labels: { lab: hcl-dx-compose }
`};
  out["lab-base/namespace-dx.yaml"] = {text: `# Namespace of the HCL software (DX Compose, IQ, Search), created live in the demo (step 0-2).
# Any Kubernetes (k3s, RKE2, EKS, AKS, GKE...). On OpenShift use namespace-dx.openshift.yaml instead.
apiVersion: v1
kind: Namespace
metadata:
  name: ${ns}
  labels: { lab: hcl-dx-compose }
`};
  out["lab-base/namespace-dx.openshift.yaml"] = {text: `# Namespace of the HCL software on OpenShift: the annotations HCL requires, so that the restricted-v2 SCC
# gives the pods the UID range and groups of the DX containers (UID/GID 1000-1001).
# Documentation: DX Compose CF239 > Preparation > Mandatory tasks > Preparing the namespace.
apiVersion: v1
kind: Namespace
metadata:
  name: ${ns}
  labels: { lab: hcl-dx-compose }
  annotations:
    openshift.io/sa.scc.mcs: "s0:c24,c4"
    openshift.io/sa.scc.supplemental-groups: "1001/10000"
    openshift.io/sa.scc.uid-range: "1000/10000"
`};
  if (!shared) { delete out["lab-base/namespace-dx.yaml"]; delete out["lab-base/namespace-dx.openshift.yaml"]; delete out["lab-base/namespace-shared.yaml"]; }
  // lab-ldap/secrets.yaml: the OpenLDAP admin (dx-shared) goes to secrets.openldap.yaml, applied by prepare.sh
  const ld = out["lab-ldap/secrets.yaml"];
  if (ld) {
    const {head, docs} = splitDocs(ld.text), inNs = d => new RegExp(`^\\s*namespace:\\s*${sh}\\s*$`, "m").test(d);
    if (docs.some(inNs) && docs.some(d => !inNs(d))) {
      out["lab-ldap/secrets.openldap.yaml"] = {...ld, text: head.replace(/^(# .*)$/m, `$1 (OpenLDAP, namespace ${sh}: applied by prepare.sh)`) + docs.filter(inNs).map(d => "---" + d).join("")};
      out["lab-ldap/secrets.yaml"] = {...ld, text: head + docs.filter(d => !inNs(d)).map(d => "---" + d).join("")};
    }
  }
  // the IQ deployment key: from custom-iq-values.yaml to a Secret in lab-iq/secrets.yaml
  let iqKey = false;
  const iv = out["lab-iq/custom-iq-values.yaml"], is = out["lab-iq/secrets.yaml"];
  const m = iv && iv.text.match(/^(\s*)deploymentKey:\s*(.+?)\s*$/m);
  if (m && is && /^kind: Secret$/m.test(is.text) && !/ExternalSecret/.test(is.text)) {
    iqKey = true;
    out["lab-iq/custom-iq-values.yaml"] = {...iv, text: iv.text.replace(/^([ \t]*)licensing:[ \t]*\n[ \t]*deploymentKey:.*$/m,
      `$1# licensing.deploymentKey is NOT here: the chart cannot read it from a secret yet (only from its values), so\n$1# demo.sh reads it from the Secret iq-deployment-key (lab-iq/secrets.yaml) and passes it with --set.`)};
    out["lab-iq/secrets.yaml"] = {...is, text: is.text.replace(/\n*$/, "\n") + `---
# The IQ deployment key. The chart hcl-dx-iq 1.0.3 cannot read it from a secret yet, only from its values: the
# install command (step 4-1) reads it from here into a variable and passes it with --set, so it is never written
# in a values file nor shown on screen.
apiVersion: v1
kind: Secret
metadata:
  name: iq-deployment-key
  namespace: ${ns}
type: Opaque
stringData:
  deploymentKey: ${m[2]}
`};
  }
  return {files: out, iqKey};
}

export function webinarPhases(rawSteps, s, lang, {iqKey = false} = {}){
  const es = lang === "es", t = (en, sp) => es ? sp : en;
  const ns = s.DX_NS, sh = s.SHARED_NS, by = id => rawSteps.find(x => x.id === id);
  const prep = [];
  const P = t("Webinar preparation", "Preparación del webinar");
  const add = (arr, st, extra = {}) => st && arr.push({...st, ...extra});

  // ---- Preparation: cluster check, the namespace of the third-party tools, OpenLDAP and PostgreSQL. The DX
  // namespace, the HCL registry (login and charts) and every DX secret are done live in the demo.
  add(prep, {id: "P-1", lab: P, title: t("Check the cluster", "Comprobar el clúster"), note: "", opt: false, manual: "",
    cmd: by("D-0").cmd.replace(/\n?kubectl get ingressclass.*/, "") + (s.openshift ? "" : `\nkubectl get ingressclass ${s.INGRESS_CLASS} || echo "IngressClass ${s.INGRESS_CLASS} not found (k3s creates traefik when it starts)"`)});
  let i = 2;
  for (const st of rawSteps) {
    if (!PREP_IDS.has(st.id)) continue;
    if (st.id === "D-1") { add(prep, {...st, id: `P-${i++}`, lab: P, title: t("Namespace for the third-party tools", "Namespace de las herramientas de terceros"),
      note: t(`${sh}: OpenLDAP and PostgreSQL now, LiteLLM in stage 4. The DX namespace, ${ns}, is created live in the demo.`, `${sh}: OpenLDAP y PostgreSQL ahora, LiteLLM en la etapa 4. El namespace de DX, ${ns}, se crea en directo en la demo.`),
      cmd: "kubectl apply -f lab-base/namespace-shared.yaml"}); continue; }
    if (st.id === "D-2") { add(prep, {...st, cmd: st.cmd.replace("kubectl apply -f lab-ldap/secrets.yaml", "kubectl apply -f lab-ldap/secrets.openldap.yaml")}, {id: `P-${i++}`, lab: P}); continue; }
    add(prep, st, {id: `P-${i++}`, lab: P});
  }

  // ---- Demo: stage 0 checks the preparation, creates the DX namespace, signs in to the HCL registry and pulls
  // the charts; then stages 1 to 5 (LiteLLM opens stage 4, see renumber)
  const check = {id: "D-0", title: t("Check that the environment is ready", "Comprobar que el entorno está preparado"),
    note: t(`What the preparation left ready: the cluster and, in ${sh}, OpenLDAP and PostgreSQL.`, `Lo que dejó listo la preparación: el clúster y, en ${sh}, OpenLDAP y PostgreSQL.`),
    opt: false, manual: "", lab: "",
    cmd: [`kubectl get nodes`, `kubectl get storageclass ${s.SC_RWO} ${s.SC_RWX}`,
      `kubectl -n ${sh} get pods                      # OpenLDAP and PostgreSQL: Running`,
      `kubectl -n ${sh} get clusters.postgresql.cnpg.io   # ${s.PG_CLUSTER}: Cluster in healthy state`].join("\n")};
  const nsFile = s.openshift ? "lab-base/namespace-dx.openshift.yaml" : "lab-base/namespace-dx.yaml";
  const nsStep = {id: "W-NS", stageAs: 0, title: t(`Namespace for DX: ${ns}`, `Namespace de DX: ${ns}`), opt: false, manual: "", lab: "",
    note: t("Two versions of the same namespace: the generic one, for any Kubernetes, and the OpenShift one, with the annotations HCL requires for the restricted-v2 SCC.",
            "Dos versiones del mismo namespace: la genérica, para cualquier Kubernetes, y la de OpenShift, con las anotaciones que HCL exige para la SCC restricted-v2."),
    cmd: `cat lab-base/namespace-dx.yaml              # any Kubernetes
cat lab-base/namespace-dx.openshift.yaml    # OpenShift
kubectl apply -f ${nsFile}`};
  const charts = by("1-2") && {...by("1-2"), stageAs: 0, title: t("HCL Harbor (hclcr.io): sign in and pull the charts", "Harbor de HCL (hclcr.io): login y descarga de los charts"),
    note: t("The Helm charts of DX, IQ and Search, with your Harbor user and CLI secret. The images are pulled by the cluster itself, with the regcred pull secret (stage 1).",
            "Los charts de Helm de DX, IQ y Search, con tu usuario y CLI secret de Harbor. Las imágenes las descarga el propio clúster, con el pull secret regcred (etapa 1)."),
    cmd: by("1-2").cmd.replace(/^\[ -f \S+ \] \|\| /gm, "")};
  const certs = webinarCerts(ns, t);
  const demoRaw = [];
  for (const st of rawSteps) {
    if (PREP_IDS.has(st.id) || st.id === "D-0" || st.id === "1-2") continue;
    if (st.id === "1-3") { demoRaw.push({...st, note: st.note + " " + DECL[lang === "es" ? "es" : "en"]}); continue; }
    if (/^2A-/.test(st.id) && !demoRaw.some(x => x.ldapSecret)) {
      demoRaw.push({...st, ldapSecret: true, cmd: `kubectl apply -f lab-ldap/secrets.yaml     # the bind secret dx-ldap-bind (${ns})\n${st.cmd}`}); continue; }
    if (st.id === "4-1") { demoRaw.push(...certs); continue; }
    if (st.id === "3-4" && iqKey) { demoRaw.push({...st, cmd: iqWithSet(st.cmd, ns)}); continue; }
    demoRaw.push(st);
  }
  demoRaw.unshift(nsStep, ...(charts ? [charts] : []));
  const demo = renumber([check, ...demoRaw.filter(Boolean).map(({ldapSecret, ...x}) => x)], lang);
  return {prep, demo};
}

// Two usual ways to create Kubernetes objects such as secrets (webinar feedback): imperative and declarative
const DECL = {
  en: "There are two usual ways to create Kubernetes objects such as these secrets: imperative, with commands like kubectl create secret, and declarative, describing them in YAML files applied with kubectl apply. GitOps works with the declarative one, so it is the one this webinar follows (the TLS secret is built from the certificate files).",
  es: "Hay dos formas habituales de crear objetos de Kubernetes como estos secrets: la imperativa, con comandos como kubectl create secret, y la declarativa, describiéndolos en ficheros YAML que se aplican con kubectl apply. GitOps trabaja con la declarativa, así que es la que sigue este webinar (el secret TLS se construye a partir de los ficheros del certificado).",
};
export const DECLARATIVE_NOTE = DECL;

// The IQ install with the deployment key read from its Secret and passed with --set
function iqWithSet(cmd, ns){
  return `IQ_DEPLOYMENT_KEY=$(kubectl -n ${ns} get secret iq-deployment-key -o jsonpath='{.data.deploymentKey}' | base64 -d)\n` +
    cmd.replace(/(-f lab-iq\/custom-iq-values\.yaml)/, `$1 \\\n  --set configuration.licensing.deploymentKey="$IQ_DEPLOYMENT_KEY"`);
}

// The OpenSearch certificates of the webinar: one step per certificate, every command visible (the engine
// builds them in a loop)
function webinarCerts(ns, t){
  const subj = cn => `"/C=ES/O=EUROPESIP/OU=DX Compose Labs/CN=${cn}"`;
  const cert = (n, cn) => `openssl req -new -newkey rsa:2048 -nodes -keyout ${n}-key.pem -out ${n}.csr \\
  -subj ${subj(cn)}
openssl x509 -req -in ${n}.csr -CA root-ca.pem -CAkey root-ca-key.pem -CAcreateserial -sha256 -days 730 \\
  -extfile ext.cnf -out ${n}.pem`;
  const st = (id, en, es, note, cmd) => ({id, stageAs: 5, title: t(en, es), note, opt: false, manual: "", lab: "", cmd});
  const dir = "cd lab-search/certs";
  return [
    st("W-C1", "OpenSearch certificates: a CA for the lab", "Certificados de OpenSearch: una CA para el lab",
      t("Mutual TLS between OpenSearch and the Search Middleware: first a small certificate authority that signs the three certificates.", "TLS mutuo entre OpenSearch y el Search Middleware: primero una pequeña autoridad de certificación que firma los tres certificados."),
      `mkdir -p lab-search/certs && ${dir}
printf 'basicConstraints = CA:FALSE\\nkeyUsage = digitalSignature, keyEncipherment\\nextendedKeyUsage = serverAuth, clientAuth\\n' > ext.cnf
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 730 -keyout root-ca-key.pem -out root-ca.pem \\
  -subj ${subj("dx-search-root-ca")}
cd ../..`),
    st("W-C2", "OpenSearch certificates: admin", "Certificados de OpenSearch: admin",
      t("Its subject (CN=admin) is the adminDN of the search values.", "Su sujeto (CN=admin) es el adminDN de los values de búsqueda."), `${dir}\n${cert("admin", "admin")}\ncd ../..`),
    st("W-C3", "OpenSearch certificates: node", "Certificados de OpenSearch: node",
      t("For the OpenSearch nodes, between themselves.", "Para los nodos de OpenSearch, entre ellos."), `${dir}\n${cert("node", "opensearch-node")}\ncd ../..`),
    st("W-C4", "OpenSearch certificates: client", "Certificados de OpenSearch: client",
      t("For the Search Middleware towards OpenSearch.", "Para el Search Middleware hacia OpenSearch."), `${dir}\n${cert("client", "opensearch-client")}\ncd ../..`),
    st("W-C5", "One secret per certificate", "Un secret por certificado",
      t("Each one with its certificate, its key and the CA.", "Cada uno con su certificado, su clave y la CA."),
      ["admin", "node", "client"].map(n => `kubectl -n ${ns} create secret generic search-${n}-cert \\
  --from-file=lab-search/certs/${n}.pem --from-file=lab-search/certs/${n}-key.pem --from-file=lab-search/certs/root-ca.pem \\
  --dry-run=client -o yaml | kubectl apply -f -`).join("\n")),
  ];
}

// ---------------------------------------------------------------------------------------------
// RUNBOOK.md of the installer (by stages; the webinar with its two phases)
// ---------------------------------------------------------------------------------------------
const RB = {
  en: {
    title: "HCL DX Compose installation", webinar: "HCL DX Compose · webinar runbook",
    gen: "Generated by the HCL DX Compose Installer on",
    intro: "A tailor-made installation built from your answers. **This folder is self-contained**: every file is already filled in (values, properties, LDIF, secrets) and the commands run from this folder.",
    warn: "> ⚠️ **PoC, not production. Credentials in plain text:** passwords and keys are written in the files of this folder so that everything is easy to follow. Keep it private and rotate the secrets afterwards.",
    need: "You need `kubectl` (with access to the cluster), `helm`, `openssl`, `curl` and `python3`.",
    sql: "**PostgreSQL for the Web Engine:** stage 3 needs `setup-postgres-dx.sql`, the table script from HCL (early release, as PostgreSQL is not yet officially supported for the Web Engine): contact HCL to get it and copy it into `lab-bbdd/` before you start.",
    ph: "Some values were left empty: replace every `PUT-YOUR-...-HERE` in this folder (`grep -rn PUT-YOUR- .`).",
    docs: "HCL documentation", prep: "Before you start", run: "Run it", stages: "Stages", opt: "Optional check", manual: "Manual step", end: "Done",
    runAll: ["./install.sh            # every step (without the optional checks)", "./install.sh --verify   # also the optional checks",
             "./install.sh --list     # list of steps", "./install.sh --from 4-1 # resume from a step", "./install.sh --pause    # show each command and wait for Enter", "./uninstall.sh          # delete everything it created"],
    phase1: "Phase 1 · Preparation (before the session)",
    phase1T: "Run it a day or a few hours before the webinar. It creates the namespace of the third-party tools and installs OpenLDAP and PostgreSQL, then stops: the environment is then ready for the session. The DX namespace and the sign-in to the HCL Harbor with the charts are done live in the demo, and LiteLLM at the start of stage 4, with IQ.",
    phase2: "Phase 2 · The demo (the day of the webinar)",
    phase2T: "`demo.sh` shows each command and waits for **Enter** before running it (s = skip, q = quit). It runs the checks too.\n\n> **Imperative or declarative.** There are two usual ways to create Kubernetes objects such as secrets: imperative, with commands like `kubectl create secret`, and declarative, describing them in YAML files applied with `kubectl apply`. GitOps works with the declarative one, so it is the one this webinar follows.",
    runPrep: ["./prepare.sh             # phase 1: OpenLDAP and PostgreSQL, then it stops"],
    runDemo: ["./demo.sh                # phase 2: stages 0 to 5, one command at a time", "./demo.sh --from 3-1      # resume from a step", "./demo.sh --no-pause      # without stopping before each step", "./uninstall.sh           # after the webinar: delete everything"],
    ready: "When `prepare.sh` finishes, the environment is **ready for the session**: stop there and continue on the day of the demo.",
    endT: url => `Portal: ${url} (wpsadmin / your lab password).`,
  },
  es: {
    title: "Instalación de HCL DX Compose", webinar: "HCL DX Compose · runbook del webinar",
    gen: "Generado por el Instalador de HCL DX Compose el",
    intro: "Una instalación a medida, construida con tus respuestas. **Esta carpeta es autónoma**: todos los ficheros ya están rellenos (values, properties, LDIF, secrets) y los comandos se ejecutan desde esta carpeta.",
    warn: "> ⚠️ **PoC, no producción. Credenciales en claro:** las contraseñas y claves están escritas en los ficheros de esta carpeta para que todo sea fácil de seguir. Guárdala en privado y rota los secretos después.",
    need: "Necesitas `kubectl` (con acceso al clúster), `helm`, `openssl`, `curl` y `python3`.",
    sql: "**PostgreSQL para el Web Engine:** la etapa 3 necesita `setup-postgres-dx.sql`, el table script from HCL (early release, porque PostgreSQL aún no está soportado oficialmente para el Web Engine): pídeselo a HCL y cópialo en `lab-bbdd/` antes de empezar.",
    ph: "Algunos valores se dejaron vacíos: sustituye cada `PUT-YOUR-...-HERE` de esta carpeta (`grep -rn PUT-YOUR- .`).",
    docs: "Documentación de HCL", prep: "Antes de empezar", run: "Ejecutarlo", stages: "Etapas", opt: "Comprobación opcional", manual: "Paso manual", end: "Fin",
    runAll: ["./install.sh            # todos los pasos (sin las comprobaciones opcionales)", "./install.sh --verify   # también las comprobaciones opcionales",
             "./install.sh --list     # lista de pasos", "./install.sh --from 4-1 # continuar desde un paso", "./install.sh --pause    # muestra cada comando y espera a Enter", "./uninstall.sh          # borra todo lo que creó"],
    phase1: "Fase 1 · Preparación (antes de la sesión)",
    phase1T: "Ejecútala un día o unas horas antes del webinar. Crea el namespace de las herramientas de terceros e instala OpenLDAP y PostgreSQL, y se detiene: el entorno queda preparado para la sesión. El namespace de DX y el login en el Harbor de HCL con los charts se hacen en directo en la demo, y LiteLLM al principio de la etapa 4, con IQ.",
    phase2: "Fase 2 · La demo (el día del webinar)",
    phase2T: "`demo.sh` muestra cada comando y espera a **Enter** antes de ejecutarlo (s = saltar, q = salir). También ejecuta las comprobaciones.\n\n> **Imperativa o declarativa.** Hay dos formas habituales de crear objetos de Kubernetes como los secrets: la imperativa, con comandos como `kubectl create secret`, y la declarativa, describiéndolos en ficheros YAML que se aplican con `kubectl apply`. GitOps trabaja con la declarativa, así que es la que sigue este webinar.",
    runPrep: ["./prepare.sh             # fase 1: OpenLDAP y PostgreSQL, y se detiene"],
    runDemo: ["./demo.sh                # fase 2: etapas 0 a 5, comando a comando", "./demo.sh --from 3-1      # continuar desde un paso", "./demo.sh --no-pause      # sin parar antes de cada paso", "./uninstall.sh           # después del webinar: borra todo"],
    ready: "Cuando `prepare.sh` termina, el entorno está **preparado para la sesión**: detente ahí y continúa el día de la demo.",
    endT: url => `Portal: ${url} (wpsadmin / tu contraseña del lab).`,
  },
};

function stepsMd(o, steps, d){
  let lab = "";
  for (const st of steps) {
    if (st.lab !== lab) {
      lab = st.lab; o.push(`### ${lab}`, "");
      const docs = /^P-/.test(st.id) ? [] : STAGE_DOCS[st.stage] || [];
      if (docs.length) o.push(`📖 ${d.docs}: ` + docs.map(([n, u]) => `[${n}](${u})`).join(" · "), "");
    }
    o.push(`#### ${st.id} · ${st.title}`, "");
    if (st.opt) o.push(`*${d.opt}.*`, "");
    if (st.note) o.push(st.note, "");
    o.push("```bash", st.cmd, "```", "");
    if (st.manual) o.push(`> **${d.manual}:** ${st.manual}`, "");
  }
}

export function buildRunbook(s, {steps, prep, demo}, files, lang, {pgSql = false, dirs = {}} = {}){
  const d = RB[lang] || RB.en, o = [], now = new Date().toISOString().slice(0, 16).replace("T", " ");
  const webinar = !!prep;
  const missing = Object.values(files).some(f => f.text.includes("PUT-YOUR-")) || (steps || [...prep, ...demo]).some(x => x.cmd.includes("PUT-YOUR-"));
  o.push(`# ${webinar ? d.webinar : d.title}`, "", `${d.gen} ${now} UTC · https://${s.DX_HOST}`, "", d.intro, "", d.warn, "");
  const entries = Object.keys(dirs);
  if (entries.length) o.push("| | |", "|---|---|", ...entries.map(k => `| \`${k}\` | ${dirs[k]} |`), "");
  o.push(`## ${d.prep}`, "", `- ${d.need}`);
  if (s.db === "postgres" && !pgSql) o.push(`- ${d.sql}`);
  if (missing) o.push(`- ${d.ph}`);
  o.push("");
  if (!webinar) {
    o.push(`## ${d.run}`, "", "```bash", "cd dx-install", ...d.runAll, "```", "", `## ${d.stages}`, "");
    stepsMd(o, steps, d);
  } else {
    o.push(`## ${d.phase1}`, "", d.phase1T, "", "```bash", "cd dx-install", ...d.runPrep, "```", "");
    stepsMd(o, prep, d);
    o.push(`> ✅ ${d.ready}`, "", `## ${d.phase2}`, "", d.phase2T, "", "```bash", ...d.runDemo, "```", "");
    stepsMd(o, demo, d);
  }
  o.push(`## ${d.end}`, "", d.endT(`https://${s.DX_HOST}/wps/portal`), "");
  return o.join("\n");
}
