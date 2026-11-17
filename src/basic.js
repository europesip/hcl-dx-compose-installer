// Preset "basic" (#32), headless only: a simple test portal in the same cluster, as Lab 1 (DX Compose with Derby, no
// directory, no external database, no IQ, no Search), meant to be installed unattended by a Job (the HCL DX plugin of
// Backstage). Output layer, like src/registry.js: the engine (core.js, frozen) is not touched, so the other presets
// produce exactly the same folder.
//
// What it changes in the folder:
// - only the DX namespace: no namespace of third-party tools is created, and --cleanup / uninstall.sh never touch one;
// - IMAGE_PULL_SECRET: a dockerconfigjson Secret that ALREADY exists in the DX namespace (for example made by an
//   ExternalSecret). No regcred with a personal HCL token: the images use that Secret, and "helm pull" reads its
//   credentials (--registry-config) to pull the charts from the same registry (usually REGISTRY = a Harbor proxy
//   cache of hclcr.io, altRegistry);
// - TLS_ISSUER: the Ingress gets a certificate from that cert-manager ClusterIssuer (Secret dx-tls-public); HAProxy
//   keeps its own self-signed certificate behind it.

export const basicOn = f => f.preset === "basic";

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const docs = text => text.split(/^---\s*$/m);

// Applied to every text of the zip (files, install.sh, uninstall.sh, RUNBOOK.md), after the own-registry layer
export function applyBasic(f, s, entries){
  if (!basicOn(f)) return entries;
  const ns = s.DX_NS, sh = s.SHARED_NS, ps = (f.IMAGE_PULL_SECRET || "").trim(), issuer = (f.TLS_ISSUER || "").trim();
  return entries.map(e => {
    if (typeof e.text !== "string") return e;
    let t = e.text;
    if (e.name.endsWith("lab-base/namespaces.yaml"))   // only the DX namespace
      t = docs(t).filter(d => !new RegExp(`^\\s*name:\\s*${esc(sh)}\\s*$`, "m").test(d)).join("---")
        .replace(/^# Namespaces: .*$/m, `# Namespace: ${ns} for HCL DX (basic preset: no namespace of third-party tools).`).replace(/\n---\s*$/, "\n");
    if (/\/(install|uninstall)\.sh$/.test(e.name)) {   // the cleanup and the summary never name the shared namespace
      t = t.split("\n").filter(l => !new RegExp(`-n ${esc(sh)}\\b|clusters\\.postgresql`).test(l)).join("\n")
        .replace(new RegExp(`namespaces ${esc(ns)} and ${esc(sh)}`, "g"), `namespace ${ns}`)
        .replace(new RegExp(`delete namespace ${esc(ns)} ${esc(sh)}`, "g"), `delete namespace ${ns}`)
        .replace(new RegExp(` · ${esc(sh)} \\(third party\\)`, "g"), "");
    }
    if (ps) {
      if (e.name.endsWith("lab-base/secrets.yaml"))   // no regcred: the pull secret already exists
        t = docs(t).filter(d => !/^\s*name:\s*regcred\s*$/m.test(d)).join("---")
          .replace(/pull secret for [^ ]+ and wpsadmin credentials/, `wpsadmin credentials (pull secret: ${ps}, already in the namespace)`);
      if (e.name.endsWith("custom-values.yaml"))
        t = t.replace(/- name: regcred\s*# in lab-base\/secrets\.yaml/, `- name: ${ps}   # already in the namespace (IMAGE_PULL_SECRET)`);
      if (/\/install\.sh$/.test(e.name) || e.name.endsWith("RUNBOOK.md")) {
        t = t.replace(/^true {3}# \S+: anonymous access, no registry login$/m,
          `RC=$(mktemp); trap 'rm -f "$RC"' RETURN   # the credentials of the pull secret ${ps}, for helm pull\n` +
          `kubectl -n ${ns} get secret ${ps} -o jsonpath='{.data.\\.dockerconfigjson}' | base64 -d > "$RC"`)
          .replace(/^(.*\bhelm pull oci:\/\/(?:(?!--registry-config).)*?)\s*$/gm, `$1 --registry-config "$RC"`);
      }
    }
    if (issuer && e.name.endsWith("lab-base/ingress-dx.yaml"))
      t = t.replace(/^(\s*)annotations:\n/m, `$1annotations:\n$1  cert-manager.io/cluster-issuer: "${issuer}"   # public certificate (Secret dx-tls-public)\n`)
        .replace(/(\n\s*tls:\n(?:.*\n)*?\s*secretName:\s*)dx-tls-cert/, "$1dx-tls-public")
        .replace(/^# lab-base · Ingress: TLS terminated with dx-tls-cert/m, "# lab-base · Ingress: TLS terminated with dx-tls-public (cert-manager)");
    return t === e.text ? e : {...e, text: t};
  });
}

export const BASIC_NOTE = {
  en: "> 🧪 **Basic preset:** a simple test portal (DX Compose with Derby, as Lab 1), for tests only. Only the namespace NS is created and deleted. For production-like installations use the full wizard.",
  es: "> 🧪 **Preset básico:** un portal de pruebas sencillo (DX Compose con Derby, como el Lab 1), solo para pruebas. Solo se crea y se borra el namespace NS. Para instalaciones como las de producción usa el asistente completo.",
};
