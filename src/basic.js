// SPDX-License-Identifier: MIT
// Copyright (c) 2026 EUROPESIP
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
// - BASIC_DAM true (default): Lab 1 complete with DAM, Content Composer, the image processor and the persistence of
//   DAM (about 4.8 CPU and 10.5 GiB requested, measured on the EUROPESIP cluster); false: the lightest portal, Web
//   Engine with Derby, HAProxy and the Ring API (about 2.6 CPU and 5 GiB);
// - TLS_ISSUER: the Ingress gets a certificate from that cert-manager ClusterIssuer (Secret dx-tls-public); HAProxy
//   keeps its own self-signed certificate behind it;
// - BASIC_LDAP_HOST (#35), or dir ldap / ad with the DIR_* settings (#52): DX authenticates against a directory that
//   already exists (no OpenLDAP is installed): the native LDAP block of the chart (type other) in lab-base, with the
//   bind credentials of BASIC_LDAP_SECRET / DIR_BIND_SECRET, a Secret that already exists in the DX namespace
//   (bindUser, bindPassword), and the preferredLanguage property; src/directory.js writes it, with the connection
//   test before DX. wpsadmin (basic registry) still works;
// - BASIC_PG (#35): its own PostgreSQL, as Lab 2B, in the DX namespace (SHARED_NS = DX_NS, see state.js): the CNPG
//   operator already in the cluster makes the Cluster (its install and removal are taken out), and the setup SQL is
//   copied into lab-bbdd/ before install.sh, as in Lab 2B.

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
    if (sh !== ns && e.name.endsWith("lab-base/namespaces.yaml"))   // only the DX namespace (with BASIC_PG they are the same)
      t = docs(t).filter(d => !new RegExp(`^\\s*name:\\s*${esc(sh)}\\s*$`, "m").test(d)).join("---")
        .replace(/^# Namespaces: .*$/m, `# Namespace: ${ns} for HCL DX (basic preset: no namespace of third-party tools).`).replace(/\n---\s*$/, "\n");
    if (sh !== ns && /\/(install|uninstall)\.sh$/.test(e.name)) {   // the cleanup and the summary never name the shared namespace
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
    if (f.BASIC_DAM === false && e.name.endsWith("lab-base/custom-values.yaml"))   // the lightest portal: no DAM and what serves it
      t = t.replace(/^(\s*)persistence: true(\s*#.*)?$/m, (m, sp) =>
        `${sp}# basic preset, light (BASIC_DAM false): Web Engine with Derby, HAProxy and the Ring API only\n` +
        `${sp}persistence: false\n${sp}digitalAssetManagement: false\n${sp}imageProcessor: false\n${sp}contentComposer: false`);
    if (f.BASIC_PG && /(^|\/)(install|uninstall)\.sh$|RUNBOOK\.md$/.test(e.name))   // the CNPG operator is already there: never install or remove it
      t = t.replace(/^.*helm repo add cnpg .*$\n?/gm, "")
        .replace(/^.*helm upgrade --install cnpg .*$/gm, "kubectl get crd clusters.postgresql.cnpg.io >/dev/null || { echo \"The CloudNativePG operator must already be in the cluster (basic preset, BASIC_PG)\"; exit 1; }")
        .replace(/^.*helm uninstall cnpg .*$\n?/gm, "");
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
