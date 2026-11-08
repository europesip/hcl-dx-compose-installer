// What the installer downloads, built on the engine (src/engine/core.js) and its stages:
//   - All / Custom: the dx-install/ zip (install.sh, uninstall.sh, RUNBOOK.md and every file filled in);
//   - Webinar: the same zip with prepare.sh (phase 1) and demo.sh (phase 2, stages 0-5), plus the
//     Word script of the webinar inside it (src/word.js).
import {createEngine} from "./engine/core.js";
import {renumber, webinarPhases, buildRunbook} from "./engine/stages.js";
import {toEngineState, SECRET_KEYS} from "./state.js";
import {altRegistryOn, registryForm, applyRegistry, REGISTRY_NOTE} from "./registry.js";
import {applyCicd, cicdInstallSh, cicdRunbook, cicdOn, vaultOn, vaultForm, CICD_DIR} from "./cicd.js";
export {zipBytes} from "./zip.js";

export const engine = createEngine();
export const ZIP_NAME = "dx-compose-install.zip";
export const ZIP_NAME_WEBINAR = "dx-compose-webinar.zip";
export const WORD_NAME_EN = "DX-Compose-webinar-script.docx";
export const WORD_NAME_ES = "Guion-webinar-DX-Compose.docx";

const DIRS = {
  en: {"install.sh": "runs every step, by stages", "prepare.sh": "webinar phase 1: the prerequisites except LiteLLM", "demo.sh": "webinar phase 2: stages 0 to 5, one command at a time",
       "uninstall.sh": "deletes everything that was installed", "RUNBOOK.md": "this document", "charts/": "HCL charts, downloaded by the first steps"},
  es: {"install.sh": "ejecuta todos los pasos, por etapas", "prepare.sh": "fase 1 del webinar: los pre-requisitos salvo LiteLLM", "demo.sh": "fase 2 del webinar: etapas 0 a 5, comando a comando",
       "uninstall.sh": "borra todo lo instalado", "RUNBOOK.md": "este documento", "charts/": "charts de HCL, los descargan los primeros pasos"},
};

const finishPrep = lang => lang === "es"
  ? ["echo \"${G}${B}✔ Entorno preparado para la sesión en $(( (SECONDS-T0)/60 )) min.${N}\"",
     "echo \"  Detente aquí. El día de la demo: ./demo.sh (etapas 0 a 5, empezando por el paso 0 con LiteLLM).\""]
  : ["echo \"${G}${B}✔ Environment ready for the session in $(( (SECONDS-T0)/60 )) min.${N}\"",
     "echo \"  Stop here. On the day of the demo: ./demo.sh (stages 0 to 5, starting with step 0 and LiteLLM).\""];

// The folders of the zip are named after what they hold (lab-base, lab-ldap, lab-bbdd...), not after
// the numbered labs of the repository (1-dx, 2a-ldap, 2b-postgres...). The engine keeps the lab names
// (the golden test compares it with the frozen wizard): the installer renames them in its output.
export const FOLDERS = [["0-poc", "lab-poc"], ["1-dx", "lab-base"], ["1b-scriptapp", "lab-scriptapp"], ["2a-ldap", "lab-ldap"], ["2a-ad", "lab-ldap-ad"],
  ["2b-postgres", "lab-bbdd"], ["2b-oracle", "lab-bbdd-oracle"], ["3-iq", "lab-iq"], ["3b-mcp", "lab-mcp"], ["4-search", "lab-search"], ["5-orbita", "lab-orbita"]];
const FOLDER_RE = FOLDERS.map(([a, b]) => [new RegExp(`(?<![\\w.-])${a}/`, "g"), b + "/"]);
// "Lab 2B", "Lab 3" and so on in the comments and messages: the name of the folder instead
const LABEL_RE = [[/\(Lab 2 guide, 2B step 3\)/g, "(RUNBOOK.md)"], [/\bLab 0\b/g, "lab-poc"], [/\bLab 1B\b/g, "lab-scriptapp"], [/\bLab 1\b/g, "lab-base"],
  [/\bLab 2A\b/g, "lab-ldap"], [/\bLab 2B?\b/g, "lab-bbdd"], [/\bLab 3B\b/g, "lab-mcp"], [/\bLab 3A?\b/g, "lab-iq"], [/\bLab 4\b/g, "lab-search"], [/\bLab 5\b/g, "lab-orbita"]];
// The HCL MCP Server over HTTPS, as in the example values of the HCL documentation ("Deploying IQ services"):
// the engine keeps the HTTP of the frozen wizard; the installer enables HTTPS in its output (the custom MCP
// servers, such as the EUROPESIP one, stay on HTTP).
const HCL_RE = [[/http:\/\/([\w.-]+-mcp-server):3000/g, "https://$1:3000"]];
const MCP_HTTPS = `  mcpServer:
    # HTTPS, as in the example values of the HCL documentation ("Deploying IQ services"): the MCP Server uses
    # the HAProxy certificate (dx-tls-cert) and the chart writes https://<IQ_RELEASE>-mcp-server:3000 in the
    # Integrator ConfigMap. Custom MCP servers can stay on HTTP.
    httpsEnabled: true
    tlsCertSecret: "dx-tls-cert"
`;
const alignFile = (p, text) => p.endsWith("lab-iq/custom-iq-values.yaml") ? text.replace(/\n  mcpServer:\n/, "\n" + MCP_HTTPS) : text;
export const renameText = text => typeof text !== "string" ? text : [...FOLDER_RE, ...LABEL_RE, ...HCL_RE].reduce((x, [re, b]) => x.replace(re, b), text);
const renamePath = p => FOLDER_RE.reduce((x, [re, b]) => x.replace(re, b), p);
const renameStep = st => ({...st, title: renameText(st.title), note: renameText(st.note), cmd: renameText(st.cmd), manual: renameText(st.manual)});

export function generate(form, lang){
  engine.setLang(lang);
  const vault = vaultOn(form), cicd = cicdOn(form);
  const rf = registryForm(form);                              // own image registry (src/registry.js)
  const s = toEngineState(vault ? vaultForm(rf) : rf);   // with the secrets manager the engine gets sentinels, not secrets (src/cicd.js)
  const check = engine.validate(s);
  if (vault) check.warn = check.warn.filter(w => !/password|contraseña/i.test(w));
  if (form.cicdOperator && cicd && !form.dxcLicense) check.err.push(lang === "es" ? "El operador de Script Applications incluye HCL DXClient: acepta su licencia." : "The Script Application operator includes HCL DXClient: accept its license.");
  if (form.altRegistry && !altRegistryOn(form)) check.err.push(lang === "es" ? "Indica la dirección de tu repositorio de imágenes." : "Enter the address of your image registry.");
  if (cicd && form.cicdSameNs === false && !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test((form.CICD_NS || "").trim())) check.err.push(lang === "es" ? "Namespace de CI/CD no válido." : "Invalid CI/CD namespace.");
  engine.ensureLitellmKey();                 // the same key in every file of this page load
  const lk = t => vault && typeof t === "string" ? t.split(engine.litellmKey).join("@@OB:litellm:masterKey@@") : t;
  let files = Object.fromEntries(Object.entries(engine.bundleFiles(s)).map(([p, f]) =>
    [renamePath(p), /\.sql$/.test(p) ? f : {...f, text: lk(alignFile(renamePath(p), renameText(f.text)))}]));   // the HCL table script is left as it is
  let raw = engine.directSteps(s).map(renameStep).map(st => ({...st, cmd: lk(st.cmd)}));
  ({files, steps: raw} = applyCicd(form, s, files, raw, lang));
  const webinar = form.preset === "webinar";
  const pgSql = !!engine.pgSqlFor(s);
  const out = [], P = "dx-install/";
  let steps, prep, demo, runbook;
  const dirs = {};
  if (webinar) {
    ({prep, demo} = webinarPhases(raw, s, lang));
    steps = [...prep, ...demo];
    out.push({name: P + "prepare.sh", mode: 0o100755, text: engine.buildInstallSh(s, prep, {name: "prepare.sh", headline: lang === "es" ? "preparación del webinar" : "webinar preparation",
      purpose: "Webinar phase 1: installs every prerequisite except LiteLLM, then stops (the environment is ready for the session).", finish: finishPrep(lang), reinstall: "prepare.sh"})});
    out.push({name: P + "demo.sh", mode: 0o100755, text: engine.buildInstallSh(s, demo, {name: "demo.sh", pause: true, verify: true, headline: lang === "es" ? "demo del webinar" : "webinar demo",
      purpose: "Webinar phase 2 (the day of the demo): stages 0 to 5, showing each command and waiting for Enter.", reinstall: "prepare.sh"})});
    out.push({name: P + "uninstall.sh", mode: 0o100755, text: engine.buildUninstallSh(s, "prepare.sh")});
    for (const k of ["prepare.sh", "demo.sh", "uninstall.sh"]) dirs[k] = DIRS[lang][k];
  } else {
    steps = renumber(raw, lang);
    out.push({name: P + "install.sh", mode: 0o100755, text: cicdInstallSh(form, s, engine.buildInstallSh(s, steps, {headline: lang === "es" ? "instalación" : "installation"}))});
    out.push({name: P + "uninstall.sh", mode: 0o100755, text: engine.buildUninstallSh(s, "install.sh")});
    for (const k of ["install.sh", "uninstall.sh"]) dirs[k] = DIRS[lang][k];
    if (cicd) dirs["lab-cicd/"] = CICD_DIR[lang] || CICD_DIR.en;
  }
  runbook = cicdRunbook(form, s, buildRunbook(s, webinar ? {prep, demo} : {steps}, files, lang, {pgSql, dirs}), lang);
  out.unshift({name: P + "RUNBOOK.md", text: runbook});
  for (const e of out) e.text = renameText(e.text);   // install.sh, demo.sh, uninstall.sh and RUNBOOK.md
  for (const [p, f] of Object.entries(files)) out.push({name: P + p, text: f.text, mode: f.mode});
  if (altRegistryOn(form)) {
    out.splice(0, out.length, ...applyRegistry(form, out));
    out[0] = {...out[0], text: out[0].text.replace(/^(> (?:⚠️|🔐)[^\n]*\n)/m, `$1\n${(REGISTRY_NOTE[lang] || REGISTRY_NOTE.en).replace("REG", form.REGISTRY.trim())}\n`)};
    for (const e of out) if (files[e.name.slice(P.length)]) files[e.name.slice(P.length)] = {...files[e.name.slice(P.length)], text: e.text};
  }
  runbook = out[0].text;
  if (vault) {   // nothing secret may be left in the zip
    const left = out.filter(e => typeof e.text === "string" && /@@OB:/.test(e.text)).map(e => e.name);
    if (left.length) check.err.push("internal: secret sentinels left in " + left.join(", "));
  }
  return {s, check, files, steps, prep, demo, webinar, entries: out, runbook, litellmKey: vault ? "" : engine.litellmKey, pgSql, pgMissing: s.db === "postgres" && !pgSql, vault};
}

// Values that must not appear in a document meant to be shared
export function secretValues(s){
  const v = SECRET_KEYS.map(k => s[k]).filter(x => x && String(x).length >= 4);
  if (engine.litellmKey) v.push(engine.litellmKey);
  return [...new Set(v)].sort((a, b) => b.length - a.length);
}
export function maskText(text, values){
  let t = text;
  for (const v of values) t = t.split(v).join("********");
  return t;
}

// Which template a generated file comes from ("# Based on <path> (hcl-dx-compose-labs)")
export const sourceOf = text => (text.match(/^# Based on (\S+) \(hcl-dx-compose-labs\)/m) || [])[1] || "";

// The values a file sets compared with the lab template: the lines that are new or changed
// (comments and blank lines left out), with the template line they replace when there is one.
export function keyChanges(text){
  const src = sourceOf(text), tpl = src && engine.TPL[src];
  if (!tpl) return [];
  const norm = l => l.trim();
  const isCode = l => norm(l) && !norm(l).startsWith("#");
  const before = new Set(tpl.split("\n").filter(isCode).map(norm));
  const keyOf = l => { const m = norm(l).match(/^(-\s*)?([^:=\s]+)\s*[:=]/); return m ? m[2] : ""; };
  const byKey = new Map();
  for (const l of tpl.split("\n").filter(isCode)) { const k = keyOf(l); if (k && !byKey.has(k)) byKey.set(k, norm(l)); }
  const out = [];
  for (const l of text.split("\n").filter(isCode)) {
    if (before.has(norm(l))) continue;
    const k = keyOf(l);
    out.push({line: norm(l), was: (k && byKey.get(k)) || ""});
  }
  return out;
}

// Files a step uses (-f file, --from-file=file, file=path)
export function filesOfStep(st, files){
  const out = new Set();
  for (const m of st.cmd.matchAll(/(?:-f\s+|--from-file=(?:[\w.-]+=)?)([\w./-]+)/g)) if (files[m[1]]) out.add(m[1]);
  return [...out];
}

// Steps that create credentials or keys: secrets, certificates, registry logins, keys
export const isSecretStep = st => !st.opt && /kubectl (apply -f \S*secret|create secret)|kind: Secret|htpasswd|openssl|registry login|ssha|master.?key/i.test(st.cmd);

export function download(name, data, type){
  const blob = data instanceof Blob ? data : new Blob([data], {type});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
