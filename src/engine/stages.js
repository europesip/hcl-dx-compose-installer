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
  [["DX Compose · Preparation", `${HD}/dx-compose/CF239/deploy_dx/install/kubernetes_deployment/preparation/`], ["HCL DX IQ · Deploying LiteLLM", `${HD}/9.5/CF239/build_sites/iq/installation/deploy-litellm/`]],
  [["DX Compose · Installation", `${HD}/dx-compose/CF239/deploy_dx/install/kubernetes_deployment/install/`]],
  [["DX Compose · LDAP configuration", `${HD}/dx-compose/CF239/deploy_dx/manage/cfg_webengine/ldap_configuration/`]],
  [["DX Compose · Database transfer", `${HD}/dx-compose/CF239/deploy_dx/manage/cfg_webengine/external_db_database_transfer/`]],
  [["HCL DX IQ · Installation", `${HD}/9.5/CF239/build_sites/iq/installation/`]],
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
export function renumber(steps, lang){
  const out = steps.map((st, i) => { const [stage, extra] = stageOf(st.id); return {...polish(st), origId: st.id, stage, extra, _i: i}; });
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

export function webinarPhases(rawSteps, s, lang){
  const es = lang === "es", t = (en, sp) => es ? sp : en;
  const ns = s.DX_NS, sh = s.SHARED_NS, by = id => rawSteps.find(x => x.id === id);
  const prep = [];
  const P = t("Webinar preparation", "Preparación del webinar");
  const add = (arr, st, extra = {}) => st && arr.push({...st, ...extra});

  // ---- Preparation: cluster check, namespaces, OpenLDAP, PostgreSQL, the pull secret and the HCL charts
  add(prep, {id: "P-1", lab: P, title: t("Check the cluster", "Comprobar el clúster"), note: "", opt: false, manual: "",
    cmd: by("D-0").cmd.replace(/\n?kubectl get ingressclass.*/, "") + (s.openshift ? "" : `\nkubectl get ingressclass ${s.INGRESS_CLASS} || echo "IngressClass ${s.INGRESS_CLASS} not found (k3s creates traefik when it starts)"`)});
  let i = 2;
  for (const st of rawSteps) if (PREP_IDS.has(st.id)) add(prep, st, {id: `P-${i++}`, lab: P});
  add(prep, {id: `P-${i++}`, lab: P, title: t("HCL pull secret and charts (downloaded in advance)", "Pull secret de HCL y charts (descargados por adelantado)"),
    note: t("Done in advance so that the demo does not depend on the download speed. In the demo, stage 1 shows these same commands again (they do nothing the second time).",
            "Se hace por adelantado para que la demo no dependa de la velocidad de descarga. En la demo, la etapa 1 vuelve a mostrar estos mismos comandos (la segunda vez no hacen nada)."),
    opt: false, manual: "", cmd: `kubectl apply -f lab-base/secrets.yaml\n${by("1-2").cmd}`});

  // ---- Demo: stage 0 checks the preparation and installs LiteLLM, then stages 1 to 5
  const demoRaw = rawSteps.filter(x => !PREP_IDS.has(x.id) && x.id !== "D-0");
  const check = {id: "D-0", title: t("Check that the environment is ready", "Comprobar que el entorno está preparado"),
    note: t("Everything installed during the preparation, except LiteLLM, which is installed now.", "Todo lo instalado en la preparación, salvo LiteLLM, que se instala ahora."),
    opt: false, manual: "", lab: "",
    cmd: [`kubectl get nodes`, `kubectl get storageclass ${s.SC_RWO} ${s.SC_RWX}`,
      `kubectl -n ${sh} get pods                      # OpenLDAP and PostgreSQL: Running`,
      `kubectl -n ${sh} get clusters.postgresql.cnpg.io   # ${s.PG_CLUSTER}: Cluster in healthy state`,
      `kubectl -n ${ns} get secret regcred            # HCL pull secret`,
      `ls charts/                                     # the HCL charts, downloaded in advance`].join("\n")};
  const demo = renumber([check, ...demoRaw], lang);
  return {prep, demo};
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
    phase1T: "Run it a day or a few hours before the webinar. It installs every prerequisite **except LiteLLM** and stops: the environment is then ready for the session.",
    phase2: "Phase 2 · The demo (the day of the webinar)",
    phase2T: "`demo.sh` shows each command and waits for **Enter** before running it (s = skip, q = quit). It runs the checks too.",
    runPrep: ["./prepare.sh             # phase 1: prerequisites except LiteLLM, then it stops"],
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
    phase1T: "Ejecútala un día o unas horas antes del webinar. Instala todos los pre-requisitos **salvo LiteLLM** y se detiene: el entorno queda preparado para la sesión.",
    phase2: "Fase 2 · La demo (el día del webinar)",
    phase2T: "`demo.sh` muestra cada comando y espera a **Enter** antes de ejecutarlo (s = saltar, q = salir). También ejecuta las comprobaciones.",
    runPrep: ["./prepare.sh             # fase 1: pre-requisitos salvo LiteLLM, y se detiene"],
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
