// SPDX-License-Identifier: MIT
// Copyright (c) 2026 EUROPESIP
// "Use another image registry" · scope "All images and charts" (#51): a full mirror, for air-gapped installations.
//
// With the scope "HCL images only" (REGISTRY_SCOPE "hcl", the default) src/registry.js swaps hclcr.io and nothing
// else changes: the folder is the same as before this option existed. With REGISTRY_SCOPE "all" this output layer
// (the engine, src/engine/core.js, is frozen) also moves every third-party image and chart to the customer registry:
//   - an inventory for the chosen preset: mirror/IMAGES.txt (for people), mirror/images.json (for tools) and the
//     plain lists the scripts read (images.list, charts.list, files.list), source -> target;
//   - mirror/mirror-images.sh: copies them (skopeo, crane or oras for the images, helm pull + helm push for the
//     charts) and downloads the few manifests the installation applies from GitHub into mirror/manifests/, already
//     rewritten to the registry; --save / --load split it in two halves for a registry with no Internet at all;
//   - every reference of the generated files is rewritten: values and manifests (image, imageName, repository), the
//     Helm repositories of install.sh (helm repo add -> oci:// of the registry), the OCI charts, the raw GitHub
//     manifests (-> mirror/manifests/) and, through mirror/values/<chart>.yaml, the images a chart uses by default;
//   - the pull secret of the registry in every namespace the installation uses (and their default ServiceAccount),
//     the corporate CA of the registry (internals-ca/registry-ca.crt, as the other corporate CAs of src/corporate-ca.js)
//     and a pre-flight step: mirror/check-images.sh checks that every image and chart of the inventory is there.
//
// Path scheme (REGISTRY_LAYOUT): "host" (default) keeps the original registry as the first folder
// (<registry>/docker.io/library/postgres:18.1-alpine, <registry>/hclcr.io/dx-compose/webengine:...) so two registries
// can never collide; "flat" drops it (<registry>/library/postgres:..., <registry>/dx-compose/webengine:..., as the
// HCL-only scope does). Helm repositories that are not OCI go to <registry>/<repository host>/<path>/<chart> (host) or
// <registry>/<REGISTRY_CHARTS_PATH>/<chart> (flat).
//
// The images a chart uses by default are not in the generated files: CHART_IMAGES lists them per chart version (taken
// from `helm template` of that version with the values of the folder). A chart version that is not listed is an error
// of the generation (test/mirror.test.mjs), so a version bump cannot silently leave a public image behind.
import {altRegistryOn} from "./registry.js";
import {coreOn} from "./runtime.js";
import {cicdOn, cicdNs} from "./cicd.js";
import {basicOn} from "./basic.js";
import {CORPORATE_CA_DIR} from "./corporate-ca.js";

export const mirrorOn = f => altRegistryOn(f) && f.REGISTRY_SCOPE === "all";
export const REGISTRY_CA_FILE = `${CORPORATE_CA_DIR}/registry-ca.crt`;
const regOf = f => (f.REGISTRY || "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
const hostOf = r => r.split("/")[0];
const flat = f => f.REGISTRY_LAYOUT === "flat";
const chartsPath = f => ((f.REGISTRY_CHARTS_PATH ?? "charts") + "").trim().replace(/^\/+|\/+$/g, "") || "charts";
const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const pullSecretOf = f => basicOn(f) ? (f.IMAGE_PULL_SECRET || "").trim() : ((f.REGISTRY_USER || "").trim() ? "regcred" : "");

// Where the HCL images and charts go (src/registry.js): the registry, or <registry>/hclcr.io with the host layout
export const hclRegistryOf = f => mirrorOn(f) && !flat(f) ? `${regOf(f)}/hclcr.io` : regOf(f);

// ---- Image references ---------------------------------------------------------------------------------------------
// docker.io is implicit (busybox:1.36 = docker.io/library/busybox:1.36)
export function parseImage(ref){
  let r = String(ref).trim(), digest = "", tag = "";
  const at = r.indexOf("@"); if (at >= 0) { digest = r.slice(at); r = r.slice(0, at); }
  const slash = r.lastIndexOf("/"), colon = r.lastIndexOf(":");
  if (colon > slash) { tag = r.slice(colon + 1); r = r.slice(0, colon); }
  const parts = r.split("/");
  let host = "docker.io";
  if (parts.length > 1 && (/[.:]/.test(parts[0]) || parts[0] === "localhost")) host = parts.shift();
  if (host === "index.docker.io" || host === "registry-1.docker.io") host = "docker.io";
  if (host === "docker.io" && parts.length === 1) parts.unshift("library");
  return {host, path: parts.join("/"), tag: tag || (digest ? "" : "latest"), digest};
}
const imageStr = (repo, i) => `${repo}${i.tag ? ":" + i.tag : ""}${i.digest}`;
const targetRepoOf = (f, host, path) => flat(f) ? `${regOf(f)}/${path}` : `${regOf(f)}/${host}/${path}`;
export function imageTarget(f, ref){ const i = parseImage(ref); return imageStr(targetRepoOf(f, i.host, i.path), i); }
export const imageSource = ref => { const i = parseImage(ref); return imageStr(`${i.host}/${i.path}`, i); };

// ---- What the charts pull by default (not written in the folder) ----------------------------------------------------
// key: the values key of the image · style: "repo" (repository + tag), "registry" (registry + repository + tag) or
// "full" (one string) · pull: where the chart takes its pull secrets ("obj" = [{name}], "str" = [name])
const DXCLIENT = "hclcr.io/dx-public/dxclient:v95_CF239_20261103-1404";
const orbita = v => ({images: [["image", "repo", `ghcr.io/europesip/orbita/orbita-api:${v}`], ["database.create.image", "full", "docker.io/library/postgres:18.1-alpine"],
  ["scriptapps.bundle.image", "full", `ghcr.io/europesip/orbita/orbita-scriptapps:${v}`], ["scriptapps.dxclient.image", "full", DXCLIENT]],
  pull: [["imagePullSecrets", "obj"], ["scriptapps.job.imagePullSecrets", "obj"]]});
export const CHART_IMAGES = {
  "openbao@0.30.7": {images: [["server.image", "registry", "quay.io/openbao/openbao:2.7.2"]], pull: [["global.imagePullSecrets", "obj"]]},
  "external-secrets@2.14.0": {images: [["image", "repo", "ghcr.io/external-secrets/external-secrets:v2.14.0"], ["webhook.image", "repo", "ghcr.io/external-secrets/external-secrets:v2.14.0"],
    ["certController.image", "repo", "ghcr.io/external-secrets/external-secrets:v2.14.0"]], pull: [["global.imagePullSecrets", "obj"]]},
  "argo-cd@10.15.0": {images: [["global.image", "repo", "quay.io/argoproj/argocd:v3.6.1"], ["redis.image", "repo", "ecr-public.aws.com/docker/library/redis:8.6.4-alpine"]],
    pull: [["global.imagePullSecrets", "obj"]]},
  "openldap-stack-ha@4.3.3": {images: [["image", "repo", "docker.io/jpgouin/openldap:2.6.9-fix"], ["initSchema.image", "repo", "docker.io/library/debian:latest"],
    ["initTLSSecret.image", "registry", "docker.io/alpine/openssl:latest"]], pull: [["global.imagePullSecrets", "str"]]},
  "cloudnative-pg@0.29.1": {images: [["image", "repo", "ghcr.io/cloudnative-pg/cloudnative-pg:1.30.1"]], pull: [["imagePullSecrets", "obj"]]},
  "dx-delivery-operator@0.13.0": {images: [["image", "repo", "ghcr.io/europesip/dx-delivery-operator:0.13.0"]], pull: [["imagePullSecrets", "obj"]]},
  "dx-delivery-operator@0.17.0": {images: [["image", "repo", "ghcr.io/europesip/dx-delivery-operator:0.17.0"]], pull: [["imagePullSecrets", "obj"]]},
  "hcl-dx-scriptapp@0.1.4": {images: [["bundle.image", "full", "ghcr.io/europesip/hcl-dx-scriptapp-helm/europesip-hello-dx:1.0.4"], ["dxclient.image", "full", DXCLIENT]],
    pull: [["job.imagePullSecrets", "obj"]]},
  "litellm-helm@1.106.5": {images: [["image", "repo", "ghcr.io/berriai/litellm:1.106.5"]], pull: [["imagePullSecrets", "obj"]]},
  "hcl-dx-orbita@3.1.1": orbita("3.1.1"),   // the labs and the wizard
  "hcl-dx-orbita@3.1.2": orbita("3.1.2"),   // with Keycloak (OIDC cookie fix, src/cicd.js)
};
// The images of the HCL charts (images.repository + names + tags of the chart): the ones the folder runs, measured with
// `helm template` of these versions (DX Compose; DX Core uses dx/core instead of the Web Engine)
const DX_COMMON = ["dx-compose/content-composer:v1.52.0_20261103-1345", "dx-compose/digital-asset-manager:v1.51.0_20261103-1357", "dx-compose/haproxy:v1.35.0_20261103-1405",
  "dx-compose/image-processor:v1.52.0_20261103-1355", "dx-compose/logging-sidecar:v1.0.0_20261103-1351", "dx-compose/persistence-connection-pool:v1.49.0_20261103-1356",
  "dx-compose/persistence-metrics-exporter:v1.47.0_20261103-1356", "dx-compose/persistence-node:v1.39_20261103-1357", "dx-compose/prereqs-checker:v1.0.0_20261103-1403",
  "dx-compose/ringapi:v1.52.0_20261103-1358", "dx-compose/runtime-controller:v95_CF239_20261103-1404"];
export const HCL_IMAGES = {
  "hcl-dx-deployment@2.50.0": {compose: [...DX_COMMON, "dx-compose/webengine:CF239_20261103-1608"], core: [...DX_COMMON, "dx/core:v95_CF239_20261103-1617"]},
  "hcl-dx-iq@1.0.3": {any: ["dx/dx-iq-integrator:v1.0.3_20261103-1350", "dx/dx-mcp-server:v1.0.3_20261103-1351"]},
  "hcl-dx-search@2.37.0": {any: ["dx-compose/dx-opensearch:v2.0.0_20261103-1352", "dx-compose/dx-search-middleware:v2.0.0_20261103-1404", "dx-compose/dx-file-processor:v2.0.0_20261103-1405"]},
};
// Images inside the manifests downloaded from GitHub (they are rewritten when they are downloaded)
const FILE_IMAGES = [[/keycloak\/keycloak-k8s-resources\/([\w.-]+)\/kubernetes\/kubernetes\.yml$/, v => [`quay.io/keycloak/keycloak-operator:${v}`, `quay.io/keycloak/keycloak:${v}`]]];

// ---- The inventory of a folder ---------------------------------------------------------------------------------------
const isScript = n => /\.(sh|md|txt)$/.test(n);
const isYaml = n => /\.ya?ml$/.test(n);
const IMG_LINE = /^(\s*(?:-\s+)?(?:image|imageName):\s*)(["']?)([^\s"'#{}$]+)\2(.*)$/;
const REPO_LINE = /^(\s*repository:\s*)(["']?)([^\s"'#{}$]+\/[^\s"'#{}$]+)\2(.*)$/;
const RAW = /https:\/\/raw\.githubusercontent\.com\/([^\s'"]+)/g;
const OCI = /oci:\/\/((?!hclcr\.io\/)[a-z0-9.-]+\.[a-z0-9.-]+(?::\d+)?(?:\/[\w.-]+)*)\/([\w.-]+)(?=[\s'"`]|$)/g;
const localOf = p => `mirror/manifests/${p}`;

export function inventory(f, entries){
  const reg = regOf(f), images = new Map(), charts = new Map(), files = new Map(), repos = new Map(), err = [];
  const addImage = (ref, origin) => { const src = imageSource(ref); if (!images.has(src)) images.set(src, {source: src, target: imageTarget(f, src), origin}); };
  const addChart = c => { const k = `${c.name}@${c.version}`; if (!charts.has(k)) charts.set(k, c); };
  for (const e of entries) {
    if (typeof e.text !== "string" || /\.sql$/.test(e.name)) continue;
    const name = e.name.replace(/^dx-install\//, ""), lines = e.text.split("\n");
    if (isScript(name)) {
      for (const m of e.text.matchAll(/^\s*(?:retry\s+)?helm repo add (\S+) (https?:\/\/\S+?)\/?\s*$/gm))
        if (!(basicOn(f) && f.BASIC_PG && m[1] === "cnpg")) repos.set(m[1], m[2]);   // basic + BASIC_PG: the operator is already in the cluster (src/basic.js)
      for (const m of e.text.matchAll(OCI)) {
        const v = (e.text.slice(m.index).match(/^\S+\s+--version\s+(\S+)/) || [])[1];
        if (v) addChart({kind: "oci", name: m[2], source: m[1], version: v});
      }
      for (const m of e.text.matchAll(/oci:\/\/hclcr\.io\/([\w./-]+)\/(hcl-dx-[\w-]+) --version (\S+)/g)) addChart({kind: "oci", name: m[2], source: `hclcr.io/${m[1]}`, version: m[3], hcl: true});
      for (const m of e.text.matchAll(RAW)) {
        const p = m[1];
        if (p.includes("$c")) {   // for c in a b c; do ... $c ...; done
          const before = e.text.slice(0, m.index), loop = [...before.matchAll(/for c in ([^;\n]+); do/g)].pop();
          for (const c of (loop ? loop[1].trim().split(/\s+/) : [])) files.set(p.replace(/\$c/g, c), {url: `https://raw.githubusercontent.com/${p.replace(/\$c/g, c)}`, path: localOf(p.replace(/\$c/g, c))});
        } else files.set(p, {url: `https://raw.githubusercontent.com/${p}`, path: localOf(p)});
      }
    }
    if (isYaml(name) || name.endsWith(".md")) lines.forEach((l, i) => {
      if (/^\s*#/.test(l)) return;
      let m = l.match(IMG_LINE);
      if (m && !m[3].startsWith(reg) && !/^hclcr\.io\//.test(m[3])) addImage(m[3], name);
      m = l.match(REPO_LINE);
      if (m && !m[3].startsWith(reg) && !/^hclcr\.io(\/|$)/.test(m[3])) {
        const ind = l.match(/^\s*/)[0], tag = lines.slice(i + 1, i + 4).map(x => x.match(new RegExp(`^${ind}tag:\\s*["']?([^\\s"'#]+)`))).find(Boolean);
        if (tag) addImage(`${m[3]}:${tag[1]}`, name); else err.push(`${name}: repository ${m[3]} without a tag`);
      }
    });
  }
  for (const [n, url] of repos) for (const e of entries) {
    if (typeof e.text !== "string" || !isScript(e.name)) continue;
    for (const m of e.text.matchAll(new RegExp(`(?<![\\w./-])${esc(n)}/([\\w.-]+) --version (\\S+)`, "g"))) addChart({kind: "repo", name: m[1], source: url, version: m[2], repo: n});
  }
  for (const c of charts.values()) {
    const k = `${c.name}@${c.version}`;
    c.target = c.hcl ? (flat(f) ? `${reg}/${c.source.replace(/^hclcr\.io\//, "")}` : `${reg}/${c.source}`)
      : c.kind === "oci" ? (flat(f) ? `${reg}/${c.source.split("/").slice(1).join("/")}` : `${reg}/${c.source}`)
      : (flat(f) ? `${reg}/${chartsPath(f)}` : `${reg}/${c.source.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`);
    if (c.hcl) {
      const h = HCL_IMAGES[k];
      if (!h) { err.push(`no image list for the HCL chart ${k} (src/mirror.js HCL_IMAGES)`); continue; }
      for (const i of (h.any || (coreOn(f) ? h.core : h.compose))) addImage(`hclcr.io/${i}`, `chart ${c.name} ${c.version}`);
    } else {
      const d = CHART_IMAGES[k];
      if (!d) { err.push(`no image list for the chart ${k} (src/mirror.js CHART_IMAGES)`); continue; }
      for (const [, , ref] of d.images) addImage(ref, `chart ${c.name} ${c.version}`);
    }
  }
  for (const x of files.values()) for (const [re, fn] of FILE_IMAGES) { const m = x.path.match(re); if (m) for (const r of fn(m[1])) addImage(r, x.url.split("/").pop()); }
  // two different sources must never land on the same target
  const seen = new Map();
  for (const i of images.values()) { const o = seen.get(i.target); if (o && o !== i.source) err.push(`${i.source} and ${o} have the same target ${i.target}: use REGISTRY_LAYOUT "host"`); seen.set(i.target, i.source); }
  for (const c of charts.values()) { const t = `${c.target}/${c.name}:${c.version}`, o = seen.get(t); if (o) err.push(`the chart ${c.name} ${c.version} and ${o} have the same target ${t}`); seen.set(t, `chart ${c.name}`); }
  const sort = (a, b) => (a.source < b.source ? -1 : a.source > b.source ? 1 : 0);
  return {registry: reg, layout: flat(f) ? "flat" : "host", images: [...images.values()].sort(sort), charts: [...charts.values()].sort((a, b) => a.name < b.name ? -1 : 1),
    files: [...files.values()].sort((a, b) => a.path < b.path ? -1 : 1), repos, err};
}

// ---- Values of the charts: their default images moved to the registry ---------------------------------------------
function setPath(o, key, v){ const ks = key.split("."); let x = o; for (const k of ks.slice(0, -1)) x = x[k] = x[k] || {}; x[ks.at(-1)] = v; }
function toYaml(o, ind = ""){
  return Object.entries(o).map(([k, v]) => Array.isArray(v) ? `${ind}${k}:\n${v.map(x => typeof x === "object" ? `${ind}  - name: ${x.name}` : `${ind}  - ${x}`).join("\n")}`
    : typeof v === "object" ? `${ind}${k}:\n${toYaml(v, ind + "  ")}` : `${ind}${k}: ${JSON.stringify(v)}`).join("\n");
}
export function chartValues(f, c){
  const d = CHART_IMAGES[`${c.name}@${c.version}`]; if (!d) return "";
  const o = {}, ps = pullSecretOf(f);
  for (const [key, style, ref] of d.images) {
    const t = parseImage(imageTarget(f, ref)), repo = imageTarget(f, ref).replace(/[:@][^/]*$/, "");
    if (style === "full") setPath(o, key, imageTarget(f, ref));
    else if (style === "registry") { const p = parseImage(ref).path;
      setPath(o, key + ".registry", repo.slice(0, repo.length - p.length - 1)); setPath(o, key + ".repository", p); setPath(o, key + ".tag", t.tag); }
    else { setPath(o, key + ".repository", repo); setPath(o, key + ".tag", t.tag); }
  }
  if (ps) for (const [key, kind] of d.pull) setPath(o, key, [kind === "obj" ? {name: ps} : ps]);
  return `# mirror/values/${c.name}.yaml · generated by the DX Installer Wizard (own registry, all images and charts)
# The images chart ${c.name} ${c.version} uses by default, from your registry (mirror/IMAGES.txt). install.sh adds this
# file as the last -f of the helm upgrade of the chart.
${toYaml(o)}
`;
}

// ---- Rewriting the folder -------------------------------------------------------------------------------------------
function appendValues(text, inv){
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/\bupgrade --install \S+ oci:\/\/\S+\/([\w.-]+) --version (\S+)/);
    if (!m || !CHART_IMAGES[`${m[1]}@${m[2]}`] || !inv.charts.some(c => c.name === m[1] && c.version === m[2] && !c.hcl)) continue;
    let j = i; while (/\\\s*$/.test(lines[j]) && j + 1 < lines.length) j++;
    const k = lines[j].search(/\s+#/), add = ` -f mirror/values/${m[1]}.yaml`;
    lines[j] = k > 0 ? lines[j].slice(0, k) + add + lines[j].slice(k) : lines[j] + add;
    i = j;
  }
  return lines.join("\n");
}

export function rewriteText(f, name, text, inv){
  const reg = regOf(f), ps = pullSecretOf(f);
  let t = text;
  if (isScript(name)) {
    for (const n of inv.repos.keys()) {
      t = t.replace(new RegExp(`^(\\s*)(?:retry\\s+)?helm repo add ${esc(n)} \\S+\\s*$`, "gm"), `$1true   # ${n}: no Helm repository, the chart comes from your registry (mirror/charts.list)`);
      t = t.replace(new RegExp(`(?<![\\w./-])${esc(n)}/([\\w.-]+)( --version (\\S+))`, "g"), (all, ch, ver, v) => {
        const c = inv.charts.find(x => x.kind === "repo" && x.repo === n && x.name === ch && x.version === v); return c ? `oci://${c.target}/${ch}${ver}` : all; });
    }
    t = t.replace(OCI, (all, base, ch) => { const c = inv.charts.find(x => x.kind === "oci" && !x.hcl && x.source === base && x.name === ch); return c ? `oci://${c.target}/${ch}` : all; });
    t = t.replace(/curl -fsSL(?: --retry \d+)?(?: --retry-all-errors)? https:\/\/raw\.githubusercontent\.com\/([^\s'"]+)/g, (all, p) => `cat ${localOf(p)}`)
         .replace(RAW, (all, p) => localOf(p));
    t = appendValues(t, inv);
    if (name === "BUILD-INFO.txt") t = t.replace(/^(third-party charts: .*)$/m, l => l.replace(/(?<![\w./-])([\w-]+)\/([\w.-]+) ([\d][\w.-]*)/g, (all, n, ch, v) => {
      const c = inv.charts.find(x => x.kind === "repo" && x.repo === n && x.name === ch && x.version === v); return c ? `oci://${c.target}/${ch} ${v}` : all; }));
  }
  if (isYaml(name) || name.endsWith(".md")) {
    const lines = t.split("\n");
    t = lines.map(l => {
      if (/^\s*#/.test(l)) return l;
      let m = l.match(IMG_LINE);
      if (m && !m[3].startsWith(reg) && !/^hclcr\.io\//.test(m[3])) return `${m[1]}${m[2]}${imageTarget(f, m[3])}${m[2]}${m[4]}`;
      m = l.match(REPO_LINE);
      if (m && !m[3].startsWith(reg) && !/^hclcr\.io(\/|$)/.test(m[3])) return `${m[1]}${m[2]}${imageTarget(f, m[3] + ":x").replace(/:x$/, "")}${m[2]}${m[4]}`;
      return l;
    }).join("\n");
    if (ps && isYaml(name)) {   // pull secret of the resources that do not use the default ServiceAccount
      if (/^apiVersion: postgresql\.cnpg\.io\//m.test(t) && /^kind: Cluster$/m.test(t) && !/imagePullSecrets:/.test(t))
        t = t.replace(/^(\s*)imageName: (.*)$/m, `$1imageName: $2\n$1imagePullSecrets:          # your registry (own registry, all images)\n$1  - name: ${ps}`);
      if (/^apiVersion: k8s\.keycloak\.org\//m.test(t) && /^kind: Keycloak$/m.test(t) && !/imagePullSecrets:/.test(t))
        t = t.replace(/^spec:\n/m, `spec:\n  imagePullSecrets:            # your registry (own registry, all images)\n    - name: ${ps}\n`);
    }
  }
  return t;
}

// ---- The files of mirror/ ---------------------------------------------------------------------------------------------
const pad = (s, n) => s + " ".repeat(Math.max(1, n - s.length));
function imagesTxt(f, inv, lang){
  const es = lang === "es", w = Math.max(...inv.images.map(i => i.source.length), 20) + 2;
  return [
    `# mirror/IMAGES.txt · ${es ? "inventario de imágenes y charts de esta instalación" : "inventory of the images and charts of this installation"} (DX Installer Wizard)`,
    `# registry: ${inv.registry} · layout: ${inv.layout} · preset: ${f.preset || "-"}`,
    `# ${es ? "Cópialos con ./mirror/mirror-images.sh; ./mirror/check-images.sh comprueba que están (install.sh lo ejecuta antes de instalar)." : "Copy them with ./mirror/mirror-images.sh; ./mirror/check-images.sh checks they are there (install.sh runs it before installing)."}`,
    "", `## ${es ? "Imágenes" : "Images"} (${inv.images.length})`, "",
    ...inv.images.map(i => `${pad(i.source, w)}-> ${i.target}   # ${i.origin}`),
    "", `## Charts (${inv.charts.length})`, "",
    ...inv.charts.map(c => `${pad(`${c.kind === "oci" ? "oci://" + c.source + "/" + c.name : c.source + " " + c.name} ${c.version}`, w)}-> oci://${c.target}/${c.name} ${c.version}`),
    ...(inv.files.length ? ["", `## ${es ? "Manifiestos (se descargan en mirror/manifests/)" : "Manifests (downloaded into mirror/manifests/)"} (${inv.files.length})`, "",
      ...inv.files.map(x => `${pad(x.url, w)}-> ${x.path}`)] : []), ""].join("\n");
}

const CA_SNIPPET = `# The CA of your registry (internals-ca/registry-ca.crt), if it is not in the trust store of this machine: added to
# the system CAs for helm, skopeo, crane and oras (SSL_CERT_FILE)
if [ -f ${REGISTRY_CA_FILE} ]; then
  for b in /etc/ssl/certs/ca-certificates.crt /etc/pki/tls/certs/ca-bundle.crt /etc/ssl/cert.pem; do [ -f "$b" ] && break; done
  REG_CA_BUNDLE=$(mktemp); cat "$b" ${REGISTRY_CA_FILE} > "$REG_CA_BUNDLE" 2>/dev/null || cat ${REGISTRY_CA_FILE} > "$REG_CA_BUNDLE"; export SSL_CERT_FILE="$REG_CA_BUNDLE"
fi`;

function mirrorSh(f, inv){
  const host = hostOf(inv.registry), tool = ["skopeo", "crane", "oras"].includes(f.MIRROR_TOOL) ? f.MIRROR_TOOL : "auto", ps = pullSecretOf(f);
  return `#!/usr/bin/env bash
# dx-install/mirror/mirror-images.sh · generated by the DX Installer Wizard for ${inv.registry} (layout ${inv.layout})
# Copies every image and chart this installation uses (mirror/IMAGES.txt) from its public registry to yours, and
# downloads the manifests the installation applies from GitHub into mirror/manifests/, rewritten to your registry.
# Run it from a machine that reaches the Internet and your registry, then copy this whole folder (with mirror/manifests/)
# to the machine that runs install.sh. Without a machine that reaches both: --save on one side, --load on the other.
#
# Usage:  ./mirror/mirror-images.sh                 copy everything (images, charts, manifests)
#         ./mirror/mirror-images.sh --dry-run       only print what it would do
#         ./mirror/mirror-images.sh --only images   or charts, or files
#         ./mirror/mirror-images.sh --tool skopeo   or crane, oras (default: ${tool}, the first one found)
#         ./mirror/mirror-images.sh --save DIR      Internet side: images (skopeo, OCI archives), charts and manifests into DIR
#         ./mirror/mirror-images.sh --load DIR      registry side: push what --save left in DIR (copy DIR/manifests to mirror/)
#
# Logins: nothing is stored in this folder. Either sign in yourself first (skopeo/crane/oras login and helm registry
# login), or export these variables before running it (placeholders: put your own values):
#   export SRC_HCL_USER='<e-mail of your HCL account>' SRC_HCL_TOKEN='<CLI secret of hclcr.io>'   # the HCL images are not public
#   export DEST_USER='<user of ${host}>' DEST_PASSWORD='<password or token of ${host}>'
#   export DOCKERHUB_USER='<user>' DOCKERHUB_TOKEN='<token>'     # optional: avoids the pull rate limit of Docker Hub
# The CA of your registry, if this machine does not trust it yet: copy it to ${REGISTRY_CA_FILE}.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
DEST_HOST='${host}'; PULL_SECRET='${ps}'
TOOL='${tool}'; DRY=0; ONLY=''; SAVE=''; LOAD=''
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;; --only) ONLY="\${2:-}"; shift ;; --tool) TOOL="\${2:-}"; shift ;;
    --save) SAVE="\${2:?--save DIR}"; shift ;; --load) LOAD="\${2:?--load DIR}"; shift ;;
    -h|--help) sed -n '2,23p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1 (see --help)" >&2; exit 1 ;;
  esac; shift
done
want() { [ -z "$ONLY" ] || [ "$ONLY" = "$1" ]; }
run() { if [ $DRY = 1 ]; then printf '+ %s\\n' "$*"; else "$@"; fi; }
retry() { local i; for i in 1 2 3; do if run "$@"; then return 0; fi; [ $i = 3 ] && return 1; echo "  ↻ retry $i/2 in 15 s" >&2; sleep 15; done; }
${CA_SNIPPET}
if [ "$TOOL" = auto ]; then TOOL=''; for t in skopeo crane oras; do command -v $t >/dev/null 2>&1 && { TOOL=$t; break; }; done; fi
if want images && [ -z "$TOOL" ]; then echo "Install skopeo, crane or oras to copy the images (or --only charts / --only files)" >&2; exit 1; fi
if [ -n "$SAVE$LOAD" ] && want images && [ "$TOOL" != skopeo ]; then echo "--save / --load copy the images with skopeo (OCI archives, every platform): install it" >&2; exit 1; fi
login() {   # host user password
  [ -n "$2" ] && [ -n "$3" ] || return 0
  [ $DRY = 1 ] && { echo "+ login $1 as $2"; return 0; }
  case "$TOOL" in
    skopeo) printf '%s' "$3" | skopeo login --username "$2" --password-stdin "$1" >/dev/null ;;
    crane)  printf '%s' "$3" | crane auth login "$1" -u "$2" --password-stdin >/dev/null ;;
    oras)   printf '%s' "$3" | oras login "$1" -u "$2" --password-stdin >/dev/null ;;
  esac
  printf '%s' "$3" | helm registry login "$1" -u "$2" --password-stdin >/dev/null
}
[ -n "$LOAD" ] || login hclcr.io "\${SRC_HCL_USER:-}" "\${SRC_HCL_TOKEN:-}"
[ -n "$LOAD" ] || login docker.io "\${DOCKERHUB_USER:-}" "\${DOCKERHUB_TOKEN:-}"
[ -n "$SAVE" ] || login "$DEST_HOST" "\${DEST_USER:-}" "\${DEST_PASSWORD:-}"
copy() {   # source target
  case "$TOOL" in
    skopeo) retry skopeo copy --all --retry-times 3 "docker://$1" "docker://$2" ;;
    crane)  retry crane copy "$1" "$2" ;;
    oras)   retry oras cp "$1" "$2" ;;
  esac
}
arc() { printf '%s' "$1" | tr '/:@' '___'; }
n=0; fail=0
if want images; then
  [ -z "$SAVE$LOAD" ] || mkdir -p "\${SAVE:-$LOAD}/images"
  while read -r src dst _; do
    case "$src" in ''|'#'*) continue ;; esac
    n=$((n+1)); echo "image $src -> $dst"
    if [ -n "$SAVE" ]; then retry skopeo copy --all --retry-times 3 "docker://$src" "oci-archive:$SAVE/images/$(arc "$dst").tar" || fail=$((fail+1))
    elif [ -n "$LOAD" ]; then retry skopeo copy --all "oci-archive:$LOAD/images/$(arc "$dst").tar" "docker://$dst" || fail=$((fail+1))
    else copy "$src" "$dst" || fail=$((fail+1)); fi
  done < mirror/images.list
fi
if want charts; then
  T="\${SAVE:-\${LOAD:-$(mktemp -d)}}/charts"; mkdir -p "$T"
  while read -r kind name src version dst _; do
    case "$kind" in ''|'#'*) continue ;; esac
    n=$((n+1)); echo "chart $name $version -> oci://$dst/$name"
    if [ -z "$LOAD" ] && [ ! -f "$T/$name-$version.tgz" ]; then
      if [ "$kind" = oci ]; then retry helm pull "oci://$src/$name" --version "$version" -d "$T" || { fail=$((fail+1)); continue; }
      else retry helm pull "$name" --repo "$src" --version "$version" -d "$T" || { fail=$((fail+1)); continue; }; fi
    fi
    [ -n "$SAVE" ] || retry helm push "$T/$name-$version.tgz" "oci://$dst" || fail=$((fail+1))
  done < mirror/charts.list
fi
if want files && [ -z "$LOAD" ]; then
  while read -r url path _; do
    case "$url" in ''|'#'*) continue ;; esac
    n=$((n+1)); echo "file $url -> $path"
    [ $DRY = 1 ] && continue
    mkdir -p "$(dirname "$path")"
    curl -fsSL --retry 5 --retry-all-errors "$url" -o "$path" || { fail=$((fail+1)); continue; }
    while read -r src dst _; do case "$src" in ''|'#'*) continue ;; esac; s=\${src//./\\\\.}; sed -i -E "s#(^|[^/[:alnum:]._-])\${s}#\\1\${dst}#g" "$path"; done < mirror/images.list
    if [ -n "$PULL_SECRET" ] && ! grep -q 'imagePullSecrets:' "$path"; then
      sed -i -E "s/^( +)serviceAccountName: (.*)$/&\\n\\1imagePullSecrets: [{name: $PULL_SECRET}]/" "$path"
    fi
    [ -z "$SAVE" ] || { mkdir -p "$SAVE/$(dirname "$path")"; cp "$path" "$SAVE/$path"; }
  done < mirror/files.list
fi
echo "Done: $n copied, $fail failed."
[ $fail = 0 ] || exit 1
`;
}

function checkSh(f, inv){
  const host = hostOf(inv.registry), mode = ["strict", "warn", "off"].includes(f.MIRROR_PREFLIGHT) ? f.MIRROR_PREFLIGHT : "strict";
  return `#!/usr/bin/env bash
# dx-install/mirror/check-images.sh · generated by the DX Installer Wizard for ${inv.registry}
# Pre-flight of the own registry: every image, chart and manifest of mirror/IMAGES.txt must be there before installing.
# install.sh runs it as its first step (after the pull secrets). It only reads: nothing is pulled into the cluster.
#   MIRROR_PREFLIGHT=strict (default of this folder: ${mode}) stops when something is missing · warn only reports · off skips it
#   DEST_USER / DEST_PASSWORD: the login of ${host} for skopeo, crane or oras (or sign in with them beforehand)
set -Euo pipefail
cd "$(dirname "$0")/.."
MODE="\${MIRROR_PREFLIGHT:-${mode}}"; [ "$MODE" = off ] && { echo "Pre-flight of the registry skipped (MIRROR_PREFLIGHT=off)"; exit 0; }
${CA_SNIPPET}
TOOL=''; for t in skopeo crane oras; do command -v $t >/dev/null 2>&1 && { TOOL=$t; break; }; done
if [ -n "$TOOL" ] && [ -n "\${DEST_USER:-}" ] && [ -n "\${DEST_PASSWORD:-}" ]; then
  case "$TOOL" in
    skopeo) printf '%s' "$DEST_PASSWORD" | skopeo login --username "$DEST_USER" --password-stdin '${host}' >/dev/null ;;
    crane)  printf '%s' "$DEST_PASSWORD" | crane auth login '${host}' -u "$DEST_USER" --password-stdin >/dev/null ;;
    oras)   printf '%s' "$DEST_PASSWORD" | oras login '${host}' -u "$DEST_USER" --password-stdin >/dev/null ;;
  esac || echo "  could not sign in to ${host} with $TOOL" >&2
fi
missing=(); ok=0
while read -r url path _; do case "$url" in ''|'#'*) continue ;; esac
  if [ -s "$path" ]; then ok=$((ok+1)); else missing+=("manifest $path (run ./mirror/mirror-images.sh --only files)"); fi
done < mirror/files.list
while read -r kind name src version dst _; do case "$kind" in ''|'#'*) continue ;; esac
  if helm show chart "oci://$dst/$name" --version "$version" >/dev/null 2>&1; then ok=$((ok+1)); else missing+=("chart oci://$dst/$name $version"); fi
done < mirror/charts.list
if [ -z "$TOOL" ]; then
  echo "  ⚠ skopeo, crane or oras not found: the images are not checked (only the charts and manifests)" >&2
else
  while read -r src dst _; do case "$src" in ''|'#'*) continue ;; esac
    case "$TOOL" in
      skopeo) skopeo inspect --raw "docker://$dst" >/dev/null 2>&1 ;;
      crane)  crane manifest "$dst" >/dev/null 2>&1 ;;
      oras)   oras manifest fetch "$dst" >/dev/null 2>&1 ;;
    esac && ok=$((ok+1)) || missing+=("image $dst")
  done < mirror/images.list
fi
if [ \${#missing[@]} = 0 ]; then echo "✔ Your registry has everything this installation needs ($ok images, charts and manifests checked)"; exit 0; fi
printf '  ✘ missing: %s\\n' "\${missing[@]}" >&2
echo "\${#missing[@]} missing in ${inv.registry}: copy them with ./mirror/mirror-images.sh (see mirror/README.md)." >&2
[ "$MODE" = warn ] && exit 0
exit 1
`;
}

function readme(f, inv, lang){
  const es = lang === "es", host = hostOf(inv.registry);
  return es ? `# mirror/ · tu propio repositorio para todas las imágenes y charts

Esta carpeta se generó con **Usar otro repositorio de imágenes · Todas las imágenes y charts**: la instalación no
descarga nada de registros públicos (docker.io, quay.io, ghcr.io, hclcr.io...). Todo sale de \`${inv.registry}\`
(esquema de rutas \`${inv.layout}\`). Guía completa: https://github.com/europesip/hcl-dx-compose-installer/blob/main/docs/air-gapped.es.md

| Fichero | Qué es |
|---|---|
| \`IMAGES.txt\` | El inventario: ${inv.images.length} imágenes, ${inv.charts.length} charts y ${inv.files.length} manifiestos, origen → destino |
| \`images.json\` | El mismo inventario, para herramientas (escaneo de vulnerabilidades, aprobaciones) |
| \`images.list\`, \`charts.list\`, \`files.list\` | Las listas que leen los scripts |
| \`mirror-images.sh\` | Copia todo a tu registro (skopeo, crane u oras; helm pull + helm push) y descarga los manifiestos en \`manifests/\` |
| \`check-images.sh\` | Comprobación previa: \`install.sh\` la ejecuta antes de instalar y se detiene si falta algo |
| \`values/\` | Las imágenes que cada chart usa por defecto, ya en tu registro (\`install.sh\` las añade con \`-f\`) |

## Pasos

1. En una máquina con acceso a Internet y a \`${host}\`: exporta los logins (ver la cabecera de \`mirror-images.sh\`) y
   ejecuta \`./mirror/mirror-images.sh\` (o \`--save DIR\` aquí y \`--load DIR\` al otro lado).
2. Copia la carpeta entera (con \`mirror/manifests/\`) a la máquina que ejecuta \`install.sh\`.
3. Los nodos del clúster deben confiar en la CA de \`${host}\` (containerd, CRI-O, OpenShift) si no es pública; para
   las herramientas de esta máquina, copia la CA en \`${REGISTRY_CA_FILE}\`.
4. \`./install.sh\`: su primer paso crea el pull secret \`${pullSecretOf(f) || "(acceso anónimo)"}\` en cada namespace y ejecuta \`check-images.sh\`.
` : `# mirror/ · your own registry for every image and chart

This folder was generated with **Use another image registry · All images and charts**: the installation pulls nothing
from public registries (docker.io, quay.io, ghcr.io, hclcr.io...). Everything comes from \`${inv.registry}\` (path
layout \`${inv.layout}\`). Full guide: https://github.com/europesip/hcl-dx-compose-installer/blob/main/docs/air-gapped.md

| File | What it is |
|---|---|
| \`IMAGES.txt\` | The inventory: ${inv.images.length} images, ${inv.charts.length} charts and ${inv.files.length} manifests, source → target |
| \`images.json\` | The same inventory, for tools (vulnerability scanning, approvals) |
| \`images.list\`, \`charts.list\`, \`files.list\` | The lists the scripts read |
| \`mirror-images.sh\` | Copies everything to your registry (skopeo, crane or oras; helm pull + helm push) and downloads the manifests into \`manifests/\` |
| \`check-images.sh\` | Pre-flight: \`install.sh\` runs it before installing and stops if something is missing |
| \`values/\` | The images each chart uses by default, already in your registry (\`install.sh\` adds them with \`-f\`) |

## Steps

1. On a machine that reaches the Internet and \`${host}\`: export the logins (see the header of \`mirror-images.sh\`) and
   run \`./mirror/mirror-images.sh\` (or \`--save DIR\` here and \`--load DIR\` on the other side).
2. Copy the whole folder (with \`mirror/manifests/\`) to the machine that runs \`install.sh\`.
3. The cluster nodes must trust the CA of \`${host}\` (containerd, CRI-O, OpenShift) if it is not a public one; for the
   tools of this machine, copy the CA to \`${REGISTRY_CA_FILE}\`.
4. \`./install.sh\`: its first step creates the pull secret \`${pullSecretOf(f) || "(anonymous access)"}\` in every namespace and runs \`check-images.sh\`.
`;
}

export function mirrorFiles(f, inv, lang){
  const P = "dx-install/mirror/";
  const out = [
    {name: P + "README.md", text: readme(f, inv, lang)},
    {name: P + "IMAGES.txt", text: imagesTxt(f, inv, lang)},
    {name: P + "images.json", text: JSON.stringify({generator: "DX Installer Wizard, by EUROPESIP", registry: inv.registry, layout: inv.layout, preset: f.preset || "",
      pullSecret: pullSecretOf(f), images: inv.images, charts: inv.charts.map(({repo, hcl, ...c}) => ({...c, chart: `oci://${c.target}/${c.name}`, hcl: !!hcl})), files: inv.files}, null, 2) + "\n"},
    {name: P + "images.list", text: "# source target (mirror-images.sh, check-images.sh)\n" + inv.images.map(i => `${i.source} ${i.target}`).join("\n") + "\n"},
    {name: P + "charts.list", text: "# kind name source version target (target/name is the chart in your registry)\n" + inv.charts.map(c => `${c.kind} ${c.name} ${c.source} ${c.version} ${c.target}`).join("\n") + "\n"},
    {name: P + "files.list", text: "# url path (downloaded and rewritten by mirror-images.sh --only files)\n" + inv.files.map(x => `${x.url} ${x.path}`).join("\n") + "\n"},
    {name: P + "mirror-images.sh", mode: 0o100755, text: mirrorSh(f, inv)},
    {name: P + "check-images.sh", mode: 0o100755, text: checkSh(f, inv)},
  ];
  for (const c of inv.charts) { const v = !c.hcl && chartValues(f, c); if (v) out.push({name: `${P}values/${c.name}.yaml`, text: v}); }
  return out;
}

// The output layer: rewrites every text of the zip and adds mirror/. Runs before src/registry.js (the HCL references
// are left to it).
export function applyMirror(f, s, entries, lang){
  if (!mirrorOn(f)) return {entries, inv: null};
  const inv = inventory(f, entries);
  const out = entries.map(e => {
    if (typeof e.text !== "string" || /\.sql$/.test(e.name)) return e;
    const name = e.name.replace(/^dx-install\//, "");
    let t = rewriteText(f, name, e.text, inv);
    if (/^(install|prepare|demo)\.sh$/.test(name)) t = t.replace(/^cd "\$\(dirname "\$0"\)"$/m, m => `${m}\n${CA_SNIPPET}`);
    t = t.replace(/HCL Harbor \(hclcr\.io\): sign in and pull the charts/g, `Your registry (${hostOf(inv.registry)}): sign in and pull the HCL charts`)   // webinar
         .replace(/Harbor de HCL \(hclcr\.io\): login y descarga de los charts/g, `Tu registro (${hostOf(inv.registry)}): login y descarga de los charts de HCL`);
    if (name === "BUILD-INFO.txt") t = t.replace(/^(extras {12}: .*)$/m, `$1\nmirror            : all images and charts from ${inv.registry} · layout ${inv.layout} · ${inv.images.length} images, ${inv.charts.length} charts, ${inv.files.length} manifests (mirror/IMAGES.txt)`);
    if (name === "internals-ca/README.md") t += `\n${REGISTRY_CA_NOTE[lang] || REGISTRY_CA_NOTE.en}`;
    return t === e.text ? e : {...e, text: t};
  });
  const add = mirrorFiles(f, inv, lang);
  if (!out.some(e => e.name === "dx-install/internals-ca/README.md")) add.push({name: "dx-install/internals-ca/README.md", text: `# internals-ca · the CAs of corporate IT\n${REGISTRY_CA_NOTE[lang] || REGISTRY_CA_NOTE.en}`});
  return {entries: [...out, ...add], inv};
}
const REGISTRY_CA_NOTE = {
  en: `\n## Your image registry\n\nIf the certificate of your registry is signed by a corporate CA, copy that CA here as \`registry-ca.crt\`: install.sh,\nmirror/mirror-images.sh and mirror/check-images.sh add it to the CAs of helm, skopeo, crane and oras. The cluster\nnodes must trust it too (containerd, CRI-O or the OpenShift image configuration): see docs/air-gapped.md.\n`,
  es: `\n## Tu repositorio de imágenes\n\nSi el certificado de tu registro lo firma una CA corporativa, copia esa CA aquí como \`registry-ca.crt\`: install.sh,\nmirror/mirror-images.sh y mirror/check-images.sh la añaden a las CAs de helm, skopeo, crane y oras. Los nodos del\nclúster también deben confiar en ella (containerd, CRI-O o la configuración de imágenes de OpenShift): ver docs/air-gapped.es.md.\n`,
};

// ---- The step that opens the installation ---------------------------------------------------------------------------
// The pull secret of the registry in every namespace (and their default ServiceAccount), the Helm login for the
// third-party charts and the pre-flight. The login is written for hclcr.io, as the engine does: src/registry.js swaps
// it for the registry host (or for "true" with anonymous access).
export function mirrorStep(f, s, raw, lang, {webinar = false, namespaces} = {}){
  const es = lang === "es", t = (en, sp) => es ? sp : en, host = hostOf(regOf(f)), ps = pullSecretOf(f), user = (f.REGISTRY_USER || "").trim();
  const login = raw.map(x => (x.cmd || "").match(/helm registry login hclcr\.io -u (\S+) -p (\S+)/)).find(Boolean);
  const prompt = webinar || !login;
  const u = `'${user.replace(/'/g, "'\\''")}'`, pw = prompt ? '"$RP"' : login[2];   // the registry user, not the HCL e-mail the engine got
  const nss = basicOn(f) ? [] : (namespaces || [s.DX_NS, s.SHARED_NS, ...(cicdOn(f) ? [cicdNs(f)] : []), ...(s.poc ? ["default"] : [])]).filter((x, i, a) => x && a.indexOf(x) === i);
  const cmd = [];
  if (user && !basicOn(f)) {
    if (prompt) cmd.push(`RP="\${REGISTRY_PASSWORD:-}"; [ -n "$RP" ] || { read -rsp "Password or token of ${host} (or export REGISTRY_PASSWORD): " RP; echo; }`);
    cmd.push(prompt ? `printf '%s' "$RP" | helm registry login hclcr.io -u ${u} --password-stdin` : `helm registry login hclcr.io -u ${u} -p ${pw}`);
    if (ps && nss.length) cmd.push(`for ns in ${nss.join(" ")}; do`,
      `  kubectl get namespace $ns >/dev/null 2>&1 || kubectl create namespace $ns`,
      `  kubectl -n $ns create secret docker-registry ${ps} --docker-server=${host} --docker-username=${u} --docker-password=${pw} --dry-run=client -o yaml | kubectl apply -f -`,
      `  for i in $(seq 1 30); do kubectl -n $ns get serviceaccount default >/dev/null 2>&1 && break; sleep 2; done`,
      `  kubectl -n $ns patch serviceaccount default -p '{"imagePullSecrets":[{"name":"${ps}"}]}' >/dev/null   # helper pods and Jobs`,
      `done`);
  }
  cmd.push(`${user && !basicOn(f) ? `DEST_USER=${u} DEST_PASSWORD=${pw} ` : ""}./mirror/check-images.sh     # pre-flight: everything of mirror/IMAGES.txt is in ${host}`);
  return {lab: "", id: "D-MR", opt: false, manual: "",
    title: ps && nss.length && user ? t(`Your registry: pull secrets and pre-flight of the images`, `Tu registro: pull secrets y comprobación previa de las imágenes`)
      : t(`Your registry: pre-flight of the images`, `Tu registro: comprobación previa de las imágenes`),
    note: t(`Every image and chart of this installation comes from ${regOf(f)} (mirror/IMAGES.txt; copy them first with ./mirror/mirror-images.sh). ${ps && nss.length ? `This step creates the pull secret ${ps} in ${nss.join(", ")} (also for their default ServiceAccount), signs Helm in and` : "This step"} checks that nothing is missing before anything is installed.`,
            `Todas las imágenes y charts de esta instalación vienen de ${regOf(f)} (mirror/IMAGES.txt; cópialos antes con ./mirror/mirror-images.sh). ${ps && nss.length ? `Este paso crea el pull secret ${ps} en ${nss.join(", ")} (también para su ServiceAccount default), inicia sesión con Helm y` : "Este paso"} comprueba que no falta nada antes de instalar.`),
    cmd: cmd.join("\n")};
}

export function mirrorSteps(f, s, raw, lang){
  if (!mirrorOn(f)) return raw;
  const st = mirrorStep(f, s, raw, lang), at = s.poc ? 0 : raw.findIndex(x => x.id === "D-1") + 1;
  return [...raw.slice(0, at), st, ...raw.slice(at)];
}
// Webinar: in the preparation, after the namespace of the third-party tools (the DX one is created live in the demo)
export function mirrorPrep(f, s, raw, prep, lang){
  if (!mirrorOn(f)) return prep;
  const st = mirrorStep(f, s, raw, lang, {webinar: true, namespaces: [s.SHARED_NS]});
  const at = prep.findIndex(x => /namespace-shared\.yaml/.test(x.cmd || "")) + 1;
  const out = [...prep.slice(0, at), {...st, lab: prep[0]?.lab || ""}, ...prep.slice(at)];
  return out.map((x, i) => ({...x, id: `P-${i + 1}`}));
}

export const MIRROR_NOTE = {
  en: "> 🗄️ **Your own image registry, for every image and chart:** nothing is pulled from public registries. Everything comes from `REG` (layout `LAYOUT`): the HCL images and charts and every third-party one (OpenLDAP, PostgreSQL, Keycloak, OpenBao, Argo CD, LiteLLM, ÓRBITA...). Before installing, copy them with `./mirror/mirror-images.sh` (inventory in `mirror/IMAGES.txt`); the first step checks that none is missing.",
  es: "> 🗄️ **Tu propio repositorio de imágenes, para todas las imágenes y charts:** no se descarga nada de registros públicos. Todo viene de `REG` (esquema `LAYOUT`): las imágenes y charts de HCL y todos los de terceros (OpenLDAP, PostgreSQL, Keycloak, OpenBao, Argo CD, LiteLLM, ÓRBITA...). Antes de instalar, cópialos con `./mirror/mirror-images.sh` (inventario en `mirror/IMAGES.txt`); el primer paso comprueba que no falta ninguno.",
};
export const MIRROR_DIR = {en: "own registry: inventory of every image and chart (IMAGES.txt), mirror-images.sh and the pre-flight check-images.sh",
  es: "registro propio: inventario de todas las imágenes y charts (IMAGES.txt), mirror-images.sh y la comprobación previa check-images.sh"};
