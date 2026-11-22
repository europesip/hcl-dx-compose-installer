// The DX server (#38): DX Compose (the Web Engine on Open Liberty, the default) or DX Core (the traditional HCL Digital
// Experience 9.5 server on WebSphere Application Server). Both come from the same chart (hcl-dx-deployment 2.50.0,
// CF239): applications.webEngine / applications.core. Output layer, like src/registry.js and src/basic.js: the engine
// (core.js) is not touched, so with DX_RUNTIME "compose" every folder is exactly the same as before.
//
// What DX Core changes in the folder (phase 1: Lab 1 base, optional DAM, Derby):
// - lab-base/custom-values.yaml: applications.core true / webEngine false; the Core image name (dx/core: the chart
//   default dx-compose/core does not exist in hclcr.io, measured on CF239); volumes.core (profile with Derby, logs,
//   transaction logs); networking.core.host; security.core with the custom secrets of wpsadmin, the WebSphere
//   administrator and the Config Wizard; the PoC layer lowers resources.core instead of resources.webEngine;
// - lab-base/secrets.yaml: dx-core-wps, dx-core-was and dx-core-configwizard (the same user and password as wpsadmin)
//   instead of web-engine-secret;
// - the DX namespace gets the label dx.europesip.com/runtime=core (the basic preset of Backstage also labels
//   compose namespaces, so the plugin can tell them apart); the titles of the scripts and the RUNBOOK say DX Core;
// - support/collect-support-data.sh copies the WebSphere Portal logs of the Core pod instead of the Liberty ones.
// With the basic preset, an existing LDAP (BASIC_LDAP_HOST) uses configuration.core.ldap with the settings both servers
// share (src/basic.js). What it does not offer yet with Core (normalise() in state.js switches them off): the OpenLDAP
// and Active Directory stage of the wizard, the external
// database, IQ, Search, HCL Leap, the Script Application extras and the CI/CD and Keycloak options.

export const RUNTIMES = ["compose", "core"];
export const coreOn = f => f.DX_RUNTIME === "core";
export const RUNTIME_LABEL = "dx.europesip.com/runtime";
export const CORE_IMAGE = "dx/core";

const SECRETS = ["dx-core-wps", "dx-core-was", "dx-core-configwizard"];

// The options that need the Web Engine in phase 1 (state.js normalise() applies them)
export const CORE_OFF = {lab1b: false, dir: "none", db: "none", lab3: false, lab3b: false, iqdb: false, iqrag: false, lab4: false, lab5: false,
  cicdOpenbao: false, cicdArgo: false, cicdOperator: false, keycloak: false, BASIC_PG: false};

// Applied to every text of the zip, after the own-registry and basic layers
export function applyRuntime(f, s, entries){
  const core = coreOn(f), basic = f.preset === "basic";
  if (!core && !basic) return entries;   // DX Compose outside the basic preset: the folder of always
  const rt = core ? "core" : "compose", ns = s.DX_NS, rel = s.DX_RELEASE;
  return entries.map(e => {
    if (typeof e.text !== "string") return e;
    let t = e.text;
    if (e.name.endsWith("lab-base/namespaces.yaml"))   // the label that tells Compose and Core apart (Backstage, the operator)
      t = t.replace(new RegExp(`(name: ${esc(ns)}\\n\\s*labels: \\{ )`), `$1${RUNTIME_LABEL}: ${rt}, `);
    if (!core) return t === e.text ? e : {...e, text: t};
    if (e.name.endsWith("lab-base/custom-values.yaml")) t = coreValues(t);
    if (e.name.endsWith("custom-values.poc.yaml"))
      t = t.replace(/^(\s*)webEngine:\n(\s*)requests: \{ cpu: "1000m", memory: "3072Mi" \}\s*# default 2000m \/ 4096Mi/m,
        `$1core:\n$2requests: { cpu: "1000m", memory: "3072Mi" }      # default 2000m / 4096Mi`)
        .replace(/the Web Engine uses ~2\.7 GiB/, "DX Core uses ~3 GiB");
    if (e.name.endsWith("lab-base/secrets.yaml")) t = coreSecrets(t);
    if (/\/(install|uninstall|prepare|demo)\.sh$|RUNBOOK\.md$/.test(e.name))
      t = t.replace(/Install DX Compose \(15-25 min the first time\)/g, "Install DX Core, traditional (15-25 min the first time)")
        .replace(/Instalar DX Compose \(15-25 min la primera vez\)/g, "Instalar DX Core, tradicional (15-25 min la primera vez)")
        .replace(/HCL DX Compose · /g, "HCL DX Core · ")
        .replace(/kubectl apply -f lab-base\/secrets\.yaml/g, "kubectl apply -f lab-base/secrets.yaml   # dx-core-wps, dx-core-was, dx-core-configwizard");
    if (e.name.endsWith("support/collect-support-data.sh")) t = coreCollector(t, rel);
    if (e.name.endsWith("BUILD-INFO.txt"))
      t = t.replace(/^(dx\.url\s*: .*)$/m, `$1\ndx.server         : DX Core (traditional, WebSphere Application Server) · applications.core · image ${CORE_IMAGE}`);
    return t === e.text ? e : {...e, text: t};
  });
}

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function coreValues(t){
  return t
    .replace(/^# lab-base · Base DX Compose values/m, "# lab-base · Base DX Core values (the traditional server, WebSphere Application Server)")
    .replace(/^(images:\n\s*repository: .*\n)/m, `$1  names:\n    core: "${CORE_IMAGE}"          # the chart default dx-compose/core does not exist in hclcr.io: Core is in the dx project\n`)
    // the Web Engine volumes -> the Core ones: profile (with Derby), logs and transaction logs
    .replace(/^  webEngine:\n    customization:[^\n]*\n      storageClassName: ("[^"]*")\n      requests:\n        storage: "[^"]*"\n    log:\n      storageClassName: "[^"]*"\n      requests:\n        storage: "[^"]*"\n/m,
      (m, sc) => `  core:\n    profile:                 # wp_profile of WebSphere Portal, with Derby (the chart default is 10Gi)\n      storageClassName: ${sc}\n      requests:\n        storage: "20Gi"\n` +
        `    log:\n      storageClassName: ${sc}\n      requests:\n        storage: "2Gi"\n    tranlog:                 # transaction logs of WebSphere\n      storageClassName: ${sc}\n      requests:\n        storage: "1Gi"\n`)
    .replace(/^# What is deployed: DX Compose = Web Engine \(not Core\)\./m, "# What is deployed: DX Core = the traditional server (not the Web Engine of DX Compose).")
    .replace(/^(\s*)core: false\n(\s*)webEngine: true/m, "$1core: true\n$2webEngine: false")
    .replace(/^networking:\n  webEngine:\n    host:/m, "networking:\n  core:\n    host:")
    .replace(/^security:\n  webEngine:\n(?:    .*\n)+/m,
      "security:\n  core:\n    # wpsadmin, the WebSphere administrator and the Config Wizard in secrets (lab-base/secrets.yaml). With the\n" +
      "    # custom secrets, the plain-text users and passwords must be empty (otherwise the chart refuses to install).\n" +
      "    wpsUser: null\n    wpsPassword: null\n    wasUser: null\n    wasPassword: null\n    configWizardUser: null\n    configWizardPassword: null\n" +
      `    customWpsSecret: "${SECRETS[0]}"\n    customWasSecret: "${SECRETS[1]}"\n    customConfigWizardSecret: "${SECRETS[2]}"\n`)
    .replace(/^logging:\n  webEngine:\n    level:\n      - "\*=info"\n\n?/m, "");
}

function coreSecrets(t){
  const m = t.match(/---\napiVersion: v1\nkind: Secret\nmetadata:\n  name: web-engine-secret\n  namespace: (\S+)\ntype: Opaque\nstringData:\n  username: ('[^']*'|"[^"]*"|\S+)\n  password: ('[^']*'|"[^"]*"|\S+)\n/)
    || t.match(/apiVersion: v1\nkind: Secret\nmetadata:\n  name: web-engine-secret\n  namespace: (\S+)\ntype: Opaque\nstringData:\n  username: ('[^']*'|"[^"]*"|\S+)\n  password: ('[^']*'|"[^"]*"|\S+)\n/);
  if (!m) return t;
  const [whole, ns, user, pw] = m, lead = whole.startsWith("---") ? "---\n" : "";
  const one = (name, what) => `apiVersion: v1\nkind: Secret\nmetadata:\n  name: ${name}   # ${what}\n  namespace: ${ns}\ntype: Opaque\nstringData:\n  username: ${user}\n  password: ${pw}\n`;
  return t.replace(whole, lead + [one(SECRETS[0], "wpsadmin of the portal (security.core.customWpsSecret)"),
    one(SECRETS[1], "WebSphere administrator, same user (security.core.customWasSecret)"),
    one(SECRETS[2], "Config Wizard, same user (security.core.customConfigWizardSecret)")].join("---\n"));
}

function coreCollector(t, rel){
  return t.replace(/customization-\$\{DX_RELEASE\}-web-engine-0/g, "profile-${DX_RELEASE}-core-0")
    .replace(/WE="\$\{DX_RELEASE\}-web-engine-0"; LIB=\/opt\/openliberty\/wlp\/usr\/servers\/defaultServer/, 'WE="${DX_RELEASE}-core-0"; LIB=/opt/HCL/wp_profile')
    .replace(/-c web-engine --/g, "-c core --")
    .replace(/Web Engine Liberty logs/g, "DX Core WebSphere Portal logs").replace(/web-engine\/liberty-logs/g, "core/logs")
    .replace(/could not copy the Liberty logs/g, "could not copy the WebSphere Portal logs");
}

export const CORE_NOTE = {
  en: "> 🏛️ **DX Core (traditional server):** HCL Digital Experience 9.5 on WebSphere Application Server instead of the Web Engine of DX Compose, from the same chart. Phase 1: base portal (and DAM) on Derby; LDAP, the external database, IQ, Search and the CI/CD options are not available with Core yet. Check with HCL that your entitlement includes DX Core.",
  es: "> 🏛️ **DX Core (servidor tradicional):** HCL Digital Experience 9.5 sobre WebSphere Application Server en lugar del Web Engine de DX Compose, del mismo chart. Fase 1: portal base (y DAM) con Derby; el LDAP, la base de datos externa, IQ, Search y las opciones de CI/CD aún no están disponibles con Core. Comprueba con HCL que tu licencia incluye DX Core.",
};
