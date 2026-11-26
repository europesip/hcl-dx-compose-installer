// SPDX-License-Identifier: MIT
// Copyright (c) 2026 EUROPESIP
// Headless mode (#23): the engine of the wizard without its web UI, for Node (a Backstage scaffolder action, a CI job,
// a script). It takes the answers of the wizard (the same keys as the form, src/state.js DEFAULTS) and returns exactly
// what the wizard downloads: the dx-install/ folder (install.sh or prepare.sh + demo.sh, RUNBOOK.md, values, secrets,
// BUILD-INFO.txt).
//
// The folder is still run by a person with real helm, following the RUNBOOK: HCL DX is never installed by Argo CD.
//
//   import {generateInstall, schema} from "hcl-dx-compose-installer/headless";
//   const r = generateInstall({answers: {preset: "all", DX_HOST: "dx.example.com", HCL_HARBOR_USER: "me@example.com"}});
//   r.check.err      // [] when the folder is valid
//   r.files          // files without any secret: safe to commit to Git (a merge request, for example)
//   r.secretFiles    // files that hold secrets: keep them out of Git (OpenBao, a password manager, the user's PC)
//   r.zip            // the whole folder, as the wizard downloads it
//
// Secrets: by default (secrets: "omit") the answers must not carry any credential (HCL Harbor CLI secret, API keys,
// passwords): the folder leaves them as commented placeholders in env.sh, to be filled in on the machine that runs it,
// and the passwords the folder needs anyway (wpsadmin, the demo users...) are generated at random for this call and
// only appear in secretFiles. With secrets: "include" the answers may carry them, as in the web wizard.
import {readFileSync} from "node:fs";
import {randomBytes} from "node:crypto";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
// BUILD-INFO.txt and the scripts name the installer version (src/support.js reads it when it is first loaded)
if (typeof globalThis.__APP_VERSION__ !== "string") globalThis.__APP_VERSION__ = pkg.version;
const {DEFAULTS, applyPreset, SECRET_KEYS} = await import("./state.js");
const {generate, zipBytes, secretValues} = await import("./bundle.js");
const {tzError} = await import("./dxconfig.js");

export const VERSION = pkg.version;
export const SCHEMA_VERSION = 1;

const UI_ONLY = ["envConfirmed"];   // state of the pages, not an answer
const ENUMS = {
  envSource: ["", "own", "wsl", "linux", "aws"], awsKind: ["ec2", "eks", "rosa"], platform: ["kubernetes", "openshift", "poc"],
  INGRESS_KIND: ["traefik", "nginx", "other"], helm: ["3", "4"], preset: ["all", "custom", "webinar", "basic"],
  dir: ["openldap", "ad", "none"], db: ["postgres", "oracle", "none"], IQ_LLM: ["claude", "qwen"],
  LLM_PROVIDER: ["openrouter", "bedrock", "anthropic"], openbaoMode: ["install", "existing"], DX_RUNTIME: ["compose", "core"],
  REGISTRY_SCOPE: ["hcl", "all"], REGISTRY_LAYOUT: ["host", "flat"], MIRROR_TOOL: ["auto", "skopeo", "crane", "oras"], MIRROR_PREFLIGHT: ["strict", "warn", "off"],
};
const DESCRIPTIONS = {
  preset: "all: every stage and extra · webinar: stages 0-5 as in the webinar (prepare.sh + demo.sh) · custom: what you choose · basic: a simple test portal as Lab 1 (Derby), only the DX namespace, for an unattended Job",
  IMAGE_PULL_SECRET: "basic: name of a kubernetes.io/dockerconfigjson Secret that already exists in DX_NS (no regcred, no personal HCL token); helm pull uses it too",
  TLS_ISSUER: "basic: cert-manager ClusterIssuer of the public certificate of the Ingress (Secret dx-tls-public)",
  BASIC_DAM: "basic: true (default) = Lab 1 complete (DAM, Content Composer, image processor and the persistence of DAM); false = the lightest portal, Web Engine with Derby, HAProxy and the Ring API only (about half the resources)",
  BASIC_PG: "basic: true = its own PostgreSQL (a CloudNativePG Cluster in DX_NS, made with the CNPG operator already in the cluster; never installs one) and the transfer from Derby (~15 min more); the setup SQL must be copied into lab-bbdd/ before install.sh, as in Lab 2B; false (default) = Derby",
  BASIC_LDAP_HOST: "basic: host of a directory that already exists (e.g. openldap.identity.svc.cluster.local); empty = no LDAP, only wpsadmin",
  BASIC_LDAP_PORT: "basic: port of that directory (389, no TLS)",
  BASIC_LDAP_SUFFIX: "basic: base DN of the searches (e.g. dc=example,dc=com)",
  BASIC_LDAP_SECRET: "basic: Secret that already exists in DX_NS with bindUser and bindPassword (e.g. made by an ExternalSecret)",
  DX_RUNTIME: "The DX server: compose (default) = DX Compose, the Web Engine on Open Liberty · core = DX Core, the traditional HCL DX 9.5 server on WebSphere Application Server (phase 1: base portal and DAM on Derby; only with the custom and basic presets; no LDAP, external database, IQ, Search, Leap or CI/CD options yet)",
  DX_TIMEZONE: "Time zone of every DX container (configuration.containerTimezone of hcl-dx-deployment, and the same in hcl-dx-search): an IANA name such as Europe/Madrid (default), Europe/London, America/New_York or UTC. With WCM syndication or DAM Staging, every DX environment must use the same time zone",
  prereqsChecker: "true (default, as the chart) = the HCL prerequisites checker: a sidecar (prereqs-checker) in the pods with volumes (DAM, Persistence Node) that checks them every day at 08:00 and writes the result to its log, never blocking a pod; false = no sidecar",
  platform: "kubernetes (your cluster), openshift, or poc (k3s on one machine)",
  DX_HOST: "Host name of the portal (e.g. dx.example.com); poc defaults to dx-demo.127.0.0.1.nip.io",
  DX_NS: "Namespace of HCL DX", SHARED_NS: "Namespace of the third-party tools (OpenLDAP, PostgreSQL, LiteLLM...)",
  dxcLicense: "true = you accept the HCL DXClient licence (needed by the DX Delivery Operator)",
  REGISTRY_SCOPE: "With altRegistry: hcl (default) = only the HCL charts and images come from REGISTRY · all = every image and chart (air-gapped): inventory mirror/IMAGES.txt, mirror/mirror-images.sh, pull secrets in every namespace and a pre-flight in install.sh (docs/air-gapped.md)",
  REGISTRY_LAYOUT: "REGISTRY_SCOPE all: host (default) = <REGISTRY>/<original registry>/<path> (e.g. .../docker.io/library/postgres, .../hclcr.io/dx-compose/webengine) · flat = <REGISTRY>/<path>",
  REGISTRY_CHARTS_PATH: "REGISTRY_SCOPE all, layout flat: folder of the charts that come from Helm repositories that are not OCI (default charts: <REGISTRY>/charts/<chart>)",
  MIRROR_TOOL: "REGISTRY_SCOPE all: tool of mirror/mirror-images.sh for the images: auto (default, the first of skopeo, crane, oras), skopeo, crane or oras",
  MIRROR_PREFLIGHT: "REGISTRY_SCOPE all: pre-flight of install.sh (mirror/check-images.sh): strict (default) stops if an image or chart is missing · warn only reports · off skips it (MIRROR_PREFLIGHT in the environment overrides it)",
};

/** JSON Schema (draft 2020-12) of the answers: the keys of the wizard form, their types and allowed values. */
export function schema(){
  const properties = {schemaVersion: {const: SCHEMA_VERSION, description: "Version of this answers format"}};
  for (const [k, v] of Object.entries(DEFAULTS)) {
    if (UI_ONLY.includes(k)) continue;
    const p = ENUMS[k] ? {type: "string", enum: ENUMS[k]} : {type: typeof v === "boolean" ? "boolean" : "string"};
    p.default = v;
    if (DESCRIPTIONS[k]) p.description = DESCRIPTIONS[k];
    if (SECRET_KEYS.includes(k)) { p.writeOnly = true; p.description = (p.description ? p.description + ". " : "") + "Secret: refused unless secrets is \"include\""; }
    properties[k] = p;
  }
  return {$schema: "https://json-schema.org/draft/2020-12/schema", $id: `https://github.com/europesip/hcl-dx-compose-installer/headless/answers-v${SCHEMA_VERSION}.json`,
    title: "DX Installer Wizard answers", type: "object", additionalProperties: false, required: ["preset"], properties};
}

/** Checks the answers against schema(): returns a list of errors (empty = valid). */
export function validateAnswers(answers, {secrets = "omit"} = {}){
  const errs = [], props = schema().properties;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return ["answers must be an object"];
  for (const [k, v] of Object.entries(answers)) {
    const p = props[k];
    if (!p) { errs.push(`unknown answer: ${k}`); continue; }
    if (k === "schemaVersion") { if (v !== SCHEMA_VERSION) errs.push(`schemaVersion ${v} is not supported (this installer reads ${SCHEMA_VERSION})`); continue; }
    if (p.type === "boolean" && typeof v !== "boolean") errs.push(`${k} must be true or false`);
    if (p.type === "string" && typeof v !== "string") errs.push(`${k} must be a string`);
    if (p.enum && !p.enum.includes(v)) errs.push(`${k} must be one of: ${p.enum.filter(Boolean).join(", ")}`);
    if (secrets === "omit" && SECRET_KEYS.includes(k) && v) errs.push(`${k} is a secret: leave it out (it is asked for when the folder runs) or call with secrets: "include"`);
  }
  if (!answers.preset) errs.push("preset is required (all, webinar, custom or basic)");
  if (answers.preset !== "basic" && (answers.IMAGE_PULL_SECRET || answers.TLS_ISSUER || answers.BASIC_DAM !== undefined || answers.BASIC_LDAP_HOST || answers.BASIC_PG)) errs.push("IMAGE_PULL_SECRET, TLS_ISSUER, BASIC_DAM, BASIC_PG and BASIC_LDAP_* are only for the basic preset");
  if (answers.DX_RUNTIME === "core") {
    if (answers.preset === "all" || answers.preset === "webinar") errs.push("DX_RUNTIME core is only for the custom and basic presets (all and webinar need the Web Engine of DX Compose)");
    if (answers.BASIC_PG || answers.BASIC_LDAP_HOST) errs.push("BASIC_PG and BASIC_LDAP_* are not available with DX_RUNTIME core yet (phase 1: Derby, no LDAP)");
    const off = ["lab1b", "lab3", "lab3b", "iqdb", "iqrag", "lab4", "lab5", "cicdOpenbao", "cicdArgo", "cicdOperator", "keycloak"].filter(k => answers[k] === true);
    if (off.length) errs.push(`not available with DX_RUNTIME core yet: ${off.join(", ")}`);
    if (answers.dir && answers.dir !== "none") errs.push("dir must be none with DX_RUNTIME core (no LDAP yet)");
    if (answers.db && answers.db !== "none") errs.push("db must be none with DX_RUNTIME core (Derby only for now)");
  }
  if (typeof answers.DX_TIMEZONE === "string") { const e = tzError(answers); if (e) errs.push(`DX_TIMEZONE: ${e}`); }
  if (answers.BASIC_LDAP_HOST) {
    if (!/^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/i.test(answers.BASIC_LDAP_HOST)) errs.push("BASIC_LDAP_HOST must be a host name");
    if (!/^[0-9]{2,5}$/.test(answers.BASIC_LDAP_PORT ?? "389")) errs.push("BASIC_LDAP_PORT must be a port number");
    if (!/^[A-Za-z]+=[^\s"'\\]+$/.test(answers.BASIC_LDAP_SUFFIX ?? "")) errs.push("BASIC_LDAP_SUFFIX is required with BASIC_LDAP_HOST (a DN such as dc=example,dc=com)");
    if (!/^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/.test(answers.BASIC_LDAP_SECRET ?? "dx-ldap-bind")) errs.push("BASIC_LDAP_SECRET must be a Secret name");
  }
  return errs;
}

const randomPassword = () => "Dx" + randomBytes(15).toString("base64url").replace(/[-_]/g, "x") + "9";
// Files that hold a secret: a known secret value, a password hash, or a private key
const SECRET_PATTERNS = [/\{SSHA\}[A-Za-z0-9+/=]{8,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];

/**
 * Generates the installation folder.
 * @param {object} o
 * @param {object} o.answers   the wizard answers (see schema()); preset is required
 * @param {"en"|"es"} [o.lang] language of the RUNBOOK and the messages
 * @param {"omit"|"include"} [o.secrets] "omit" (default): no credential in the answers, folder safe to split for Git
 * @returns {{ok: boolean, check: {err: string[], warn: string[]}, files: object, secretFiles: object, zip: Uint8Array|null,
 *            runbook: string, version: string, schemaVersion: number, generatedPasswords: string[]}}
 */
export function generateInstall({answers, lang = "en", secrets = "omit"} = {}){
  if (!["en", "es"].includes(lang)) throw new Error(`lang must be "en" or "es"`);
  if (!["omit", "include"].includes(secrets)) throw new Error(`secrets must be "omit" or "include"`);
  const errs = validateAnswers(answers, {secrets});
  const base = {version: VERSION, schemaVersion: SCHEMA_VERSION, files: {}, secretFiles: {}, zip: null, runbook: "", generatedPasswords: []};
  if (errs.length) return {...base, ok: false, check: {err: errs, warn: []}};

  const {schemaVersion, ...given} = answers;   // eslint-disable-line no-unused-vars
  let form = {...DEFAULTS, ...given};
  const generatedPasswords = [];
  if (secrets === "omit") {   // the folder needs these passwords anyway: random for this call, never the documented default
    form.LAB_PASSWORD = randomPassword(); generatedPasswords.push("LAB_PASSWORD");
    if (form.demoSame === false) { form.DEMO_PASSWORD = randomPassword(); generatedPasswords.push("DEMO_PASSWORD"); }
  }
  form = applyPreset(form, form.preset);   // as the wizard does: the preset, then the dependencies between options
  const r = generate(form, lang);

  if (secrets === "include") {   // as the web wizard: the folder holds every value; secretFiles says which files have them
    const values = [...new Set([...secretValues(r.s), form.LAB_PASSWORD, form.DEMO_PASSWORD].filter(v => v && String(v).length >= 4))];
    const {files, secretFiles} = split(r.entries, values);
    return {...base, ok: r.check.err.length === 0, check: r.check, files, secretFiles, zip: zipBytes(r.entries), runbook: r.runbook, generatedPasswords};
  }
  // secrets: "omit": the scripts and the RUNBOOK read the generated values from secrets.env (kept out of Git)
  const vars = [[form.LAB_PASSWORD, "DX_LAB_PASSWORD"], [form.DEMO_PASSWORD, "DX_DEMO_PASSWORD"], [r.litellmKey, "LITELLM_MASTER_KEY"]]
    .filter(([v], i, a) => v && String(v).length >= 4 && a.findIndex(([w]) => w === v) === i);
  // credentials left out of the answers: the scripts read them from secrets.env too, where they are filled in
  const SCRIPT = /\/(install|prepare|demo|uninstall)\.sh$/, holes = [];
  for (const e of r.entries) if (SCRIPT.test(e.name) && typeof e.text === "string")
    for (const [ph, key] of e.text.matchAll(/PUT-YOUR-([A-Z-]+?)-HERE/g))
      if (!holes.some(([p]) => p === ph)) holes.push([ph, PLACEHOLDER_VARS[key] || key.replace(/-/g, "_")]);
  const entries = r.entries.map(e => {
    if (typeof e.text !== "string" || !(SCRIPT.test(e.name) || /\/RUNBOOK\.md$/.test(e.name))) return e;
    const subst = SCRIPT.test(e.name) ? [...vars, ...holes] : vars;   // the RUNBOOK keeps naming the placeholders
    let text = e.text.split("\n").map(line => subst.reduce((l, [v, name]) => shellSubst(l, v, name), line)).join("\n");
    const used = subst.filter(([, name]) => text.includes("$" + name) || text.includes("${" + name + "}"));
    if (used.length && e.name.endsWith(".sh")) text = scriptPrologue(text, used.map(([, n]) => n));
    if (e.name.endsWith("RUNBOOK.md")) text = text.replace(/^(# .*\n)/m, m => m + "\n" + RUNBOOK_NOTE[lang] + "\n");
    return {...e, text};
  });
  const now = new Date().toISOString().slice(0, 16).replace("T", " ");
  entries.push({name: "dx-install/secrets.env", mode: 0o100600, text: `# Secrets of this installation, generated by the DX Installer Wizard ${VERSION} (headless) on ${now} UTC.\n` +
    "# Keep this file OUT of Git (password manager, OpenBao...). The scripts read it from their own folder.\n" +
    vars.map(([v, name]) => `export ${name}='${v}'`).join("\n") + "\n" +
    (holes.length ? "# To fill in before running (the scripts stop while a PUT-YOUR-...-HERE is left):\n" + holes.map(([ph, name]) => `export ${name}='${ph}'`).join("\n") + "\n" : "")});
  const values = vars.map(([v]) => v);
  const {files, secretFiles} = split(entries, values);
  const left = Object.entries(files).filter(([, f]) => typeof f.text === "string" && values.some(v => f.text.includes(v))).map(([p]) => p);
  if (left.length) r.check.err.push("internal: secret values left in " + left.join(", "));
  const runbook = (entries.find(e => e.name.endsWith("/RUNBOOK.md")) || {}).text || r.runbook;
  return {...base, ok: r.check.err.length === 0, check: r.check, files, secretFiles, zip: zipBytes(entries), runbook, generatedPasswords};
}

// Which files hold a secret (a known value, a password hash, a private key): they go to secretFiles
function split(entries, values){
  const files = {}, secretFiles = {};
  for (const e of entries) {
    const path = e.name.replace(/^dx-install\//, ""), f = {text: e.text, mode: e.mode};
    const secret = path === "secrets.env" || (typeof e.text === "string" && (values.some(v => e.text.includes(v)) || SECRET_PATTERNS.some(re => re.test(e.text))));
    (secret ? secretFiles : files)[path] = f;
  }
  return {files, secretFiles};
}

// Replaces a literal value by a shell variable, keeping the quoting valid: inside '...' -> '"$VAR"', inside "..." ->
// ${VAR}, elsewhere -> "${VAR}"
export function shellSubst(line, value, name){
  let out = "", i = 0;
  for (let at = line.indexOf(value); at >= 0; at = line.indexOf(value, i)) {
    const before = line.slice(0, at);
    let sq = false, dq = false;
    for (let k = 0; k < before.length; k++) {
      const c = before[k];
      if (c === "\\" && !sq) { k++; continue; }
      if (c === "'" && !dq) sq = !sq; else if (c === '"' && !sq) dq = !dq;
    }
    out += line.slice(i, at) + (sq ? `'"\${${name}}"'` : dq ? `\${${name}}` : `"\${${name}}"`);
    i = at + value.length;
  }
  return out + line.slice(i);
}

function scriptPrologue(text, names){
  const code = "# Headless mode: the generated passwords are in secrets.env, next to this script (it is not in Git)\n" +
    'if [ -f "$(dirname "$0")/secrets.env" ]; then . "$(dirname "$0")/secrets.env"; else echo "secrets.env not found next to $0 (it is not in Git): ' +
    'copy it here before running" >&2; fi\n' + `: "\${${names[0]}:=}"` + names.slice(1).map(n => ` "\${${n}:=}"`).join("") + "\n";
  const m = text.match(/^set -[^\n]*\n/m);
  if (m) return text.slice(0, m.index + m[0].length) + code + text.slice(m.index + m[0].length);
  const nl = text.indexOf("\n");
  return text.slice(0, nl + 1) + code + text.slice(nl + 1);
}

const PLACEHOLDER_VARS = {"HCL-HARBOR-CLI-SECRET": "HCL_HARBOR_TOKEN", "HCL-ACCOUNT-EMAIL": "HCL_HARBOR_USER", "BEDROCK-API-KEY": "AWS_BEARER_TOKEN_BEDROCK"};

const RUNBOOK_NOTE = {
  en: "> 🔐 **Generated without secrets (headless mode).** The passwords of this installation are in `secrets.env`, which is not in Git: put it next to the scripts before running them, and run `source secrets.env` before copying a command of this RUNBOOK. The HCL Harbor CLI secret and the API keys are asked for when they are needed.",
  es: "> 🔐 **Generado sin secretos (modo headless).** Las contraseñas de esta instalación están en `secrets.env`, que no está en Git: ponlo junto a los scripts antes de ejecutarlos, y ejecuta `source secrets.env` antes de copiar un comando de este RUNBOOK. El secreto CLI de HCL Harbor y las claves de API se piden cuando hacen falta.",
};
