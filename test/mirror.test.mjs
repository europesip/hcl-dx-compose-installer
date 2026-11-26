// SPDX-License-Identifier: MIT
// Copyright (c) 2026 EUROPESIP
// Unit tests (node --test) of the own registry for every image and chart (src/mirror.js, issue #51): with the scope
// "all" no public registry is left in the generated folder (outside comments and the inventory of mirror/, which
// lists the sources by design), for every preset and the main options; the inventory, the mirror script and the
// pre-flight; and the scope "HCL images only" stays exactly as before.
import {test} from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync, writeFileSync, mkdirSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, dirname} from "node:path";
import {DEFAULTS, applyPreset} from "../src/state.js";
import {generate} from "../src/bundle.js";
import {parseImage, imageTarget, CHART_IMAGES} from "../src/mirror.js";

const REG = "harbor.example.com/mirror";
const BASE = {DX_HOST: "dx.example.com", HCL_HARBOR_USER: "someone@example.com", HCL_HARBOR_TOKEN: "harbor-token-123", OPENROUTER_API_KEY: "sk-or-v1-secret",
  LAB_PASSWORD: "Lab-Passw0rd", dxcLicense: true, altRegistry: true, REGISTRY: REG, REGISTRY_USER: "robot", REGISTRY_PASSWORD: "robot-pw", HCL_EMAIL: "someone@example.com"};
const ALL = {REGISTRY_SCOPE: "all"};
const CICD = {cicdOpenbao: true, cicdArgo: true, cicdOperator: true, keycloak: true, kcTheme: true};
const VARIANTS = {
  all: [{}, "all"], "all-cicd-keycloak": [CICD, "all"], "all-cicd-other-ns": [{...CICD, cicdSameNs: false, CICD_NS: "dx-cicd"}, "all"],
  "all-vault": [{cicdOpenbao: true, useVault: true, cicdOperator: true}, "all"], "all-openbao-existing": [{cicdOpenbao: true, openbaoMode: "existing"}, "all"],
  "all-poc": [{platform: "poc"}, "all"], "all-openshift": [{platform: "openshift"}, "all"], "all-bedrock": [{LLM_PROVIDER: "bedrock", BEDROCK_API_KEY: "b"}, "all"],
  webinar: [{}, "webinar"], "webinar-sops": [{sops: true, SOPS_KEYS: "age1qyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqs3290gq"}, "webinar"],
  custom: [{}, "custom"], "custom-ad-oracle": [{dir: "ad", db: "oracle", AD_HOST: "ad.example.com", AD_BASE_DN: "dc=example,dc=com", AD_BIND_USER: "cn=x", AD_BIND_PASSWORD: "p",
    ORACLE_JDBC_URL: "jdbc:oracle:thin:@//db.example.com:1521/X", ORACLE_DX_PASSWORD: "p"}, "custom"],
  "custom-core": [{DX_RUNTIME: "core", dir: "none", db: "none", lab3: false, lab4: false}, "custom"],
  basic: [{IMAGE_PULL_SECRET: "pull"}, "basic"], "basic-pg-ldap": [{IMAGE_PULL_SECRET: "pull", BASIC_PG: true, BASIC_LDAP_HOST: "ldap.example.com", BASIC_LDAP_SUFFIX: "dc=example,dc=com"}, "basic"],
  "ext-ldap": [{dir: "ldap", DIR_HOST: "ldap.example.com", DIR_BASE_DN: "dc=example,dc=com", DIR_BIND_DN: "cn=reader,dc=example,dc=com"}, "all"],
  "ext-ldap-keycloak": [{...CICD, dir: "ldap", DIR_HOST: "ldap.example.com", DIR_BASE_DN: "dc=example,dc=com", DIR_BIND_DN: "cn=reader,dc=example,dc=com"}, "all"],
  "ext-ad": [{dir: "ad", DIR_HOST: "ad.example.com", DIR_BASE_DN: "dc=example,dc=com", DIR_BIND_DN: "cn=reader,dc=example,dc=com"}, "custom"],
  "ext-ad-keycloak": [{...CICD, dir: "ad", DIR_HOST: "ad.example.com", DIR_BASE_DN: "dc=example,dc=com", DIR_BIND_DN: "cn=reader,dc=example,dc=com"}, "custom"],
  "ext-ldap-test-image": [{dir: "ldap", DIR_HOST: "ldap.example.com", DIR_BASE_DN: "dc=example,dc=com", DIR_BIND_DN: "cn=r", DIR_TEST_IMAGE: "bitnami/openldap:2.6"}, "custom"],
  "basic-ext-ldap": [{IMAGE_PULL_SECRET: "pull", dir: "ldap", DIR_HOST: "ldap.example.com", DIR_BASE_DN: "dc=example,dc=com", DIR_BIND_DN: "cn=r"}, "basic"],
  "all-anonymous": [{REGISTRY_USER: "", REGISTRY_PASSWORD: ""}, "all"], "all-flat": [{REGISTRY_LAYOUT: "flat"}, "all"],
};
const REG_REF = new RegExp(REG.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[^\\s'\"]*", "g");
const gen = (extra, preset, lang = "en") => generate({...applyPreset({...DEFAULTS, ...BASE, ...extra}, preset)}, lang);
const PUBLIC = /(?<![\w.-])(?:docker\.io|index\.docker\.io|quay\.io|ghcr\.io|registry\.k8s\.io|k8s\.gcr\.io|(?:[a-z0-9-]+\.)?gcr\.io|[a-z0-9-]+\.pkg\.dev|hclcr\.io|mcr\.microsoft\.com|public\.ecr\.aws|ecr-public\.aws\.com|registry\.gitlab\.com|docker\.elastic\.co|registry\.redhat\.io|registry\.access\.redhat\.com|container-registry\.oracle\.com|raw\.githubusercontent\.com|[a-z0-9-]+\.github\.io|charts\.[a-z0-9-]+\.(?:io|com|org))(?![\w-])/;

// The lines that run or configure something: outside comments, and in Markdown only inside code blocks
function codeLines(name, text){
  const out = [];
  let fence = false;
  text.split("\n").forEach((l, i) => {
    if (name.endsWith(".md")) { if (/^\s*```/.test(l)) { fence = !fence; return; } if (!fence) return; }
    if (/^\s*(#|\/\/|<!--)/.test(l)) return;
    out.push([i + 1, l.replace(/\s+#(?![^'"]*['"][^'"]*$).*$/, "")]);   // trailing comment
  });
  return out;
}
const publicLeft = g => {
  const left = [];
  for (const e of g.entries) {
    if (typeof e.text !== "string" || /\.sql$/.test(e.name) || /^dx-install\/mirror\//.test(e.name)) continue;
    for (const [n, l] of codeLines(e.name, e.text)) { const x = l.replace(REG_REF, "<reg>"); if (PUBLIC.test(x) || /\bhelm repo add\b/.test(x)) left.push(`${e.name}:${n}: ${l.trim().slice(0, 160)}`); }
  }
  return left;
};

test("scope all: no public registry left in the folder, for every preset and the main options", () => {
  for (const [k, [extra, preset]] of Object.entries(VARIANTS)) for (const lang of ["en", "es"]) {
    const g = gen({...ALL, ...extra}, preset, lang);
    assert.deepEqual(g.check.err, [], `${k} ${lang}: ${g.check.err.join("; ")}`);
    assert.deepEqual(publicLeft(g), [], `${k} ${lang}`);
  }
});

test("scope all: every image of the manifests and values, and every OCI chart, is in the registry and in the inventory", () => {
  for (const [k, [extra, preset]] of Object.entries(VARIANTS)) {
    const g = gen({...ALL, ...extra}, preset), inv = JSON.parse(g.entries.find(e => e.name === "dx-install/mirror/images.json").text);
    const targets = new Set(inv.images.map(i => i.target)), charts = new Set(inv.charts.map(c => `${c.chart} ${c.version}`));
    for (const e of g.entries) {
      if (typeof e.text !== "string" || /^dx-install\/mirror\//.test(e.name)) continue;
      for (const [n, l] of codeLines(e.name, e.text)) {
        const m = l.match(/^\s*(?:-\s+)?(?:image|imageName):\s*["']?([^\s"'{}$]+)/);
        if (m && /\.ya?ml$/.test(e.name)) {
          assert.ok(m[1].startsWith(REG + "/"), `${k}: ${e.name}:${n} ${m[1]}`);
          assert.ok(targets.has(m[1]), `${k}: ${e.name}:${n} ${m[1]} is not in the inventory`);
        }
        for (const c of l.matchAll(/oci:\/\/(\S+?)\s+--version\s+(\S+)/g)) {
          assert.ok(c[1].startsWith(REG + "/"), `${k}: ${e.name}:${n} oci://${c[1]}`);
          if (/^dx-install\/(install|prepare|demo)\.sh$/.test(e.name)) assert.ok(charts.has(`oci://${c[1]} ${c[2]}`), `${k}: chart oci://${c[1]} ${c[2]} is not in the inventory`);
        }
      }
    }
    for (const c of inv.charts) if (!c.hcl) assert.ok(CHART_IMAGES[`${c.name}@${c.version}`], `${k}: default images of ${c.name} ${c.version}`);
    for (const p of inv.files.map(x => x.path)) assert.match(p, /^mirror\/manifests\//);
  }
});

test("scope all: the scripts are valid bash, the pre-flight is the first step, the values are added to helm upgrade", () => {
  for (const [k, [extra, preset]] of Object.entries(VARIANTS)) {
    const g = gen({...ALL, ...extra}, preset);
    for (const e of g.entries) if (/\.sh$/.test(e.name)) assert.equal(spawnSync("bash", ["-n"], {input: e.text}).status, 0, `${k}: ${e.name}`);
    const main = g.entries.find(e => /dx-install\/(install|prepare)\.sh$/.test(e.name)).text;
    assert.match(main, /\.\/mirror\/check-images\.sh/, `${k}: pre-flight`);
    const st = g.steps.find(x => x.origId === "D-MR" || /check-images/.test(x.cmd));
    assert.ok(st, k);
    const first = g.steps.findIndex(x => /helm (upgrade|pull)|kubectl apply -f lab-(ldap|bbdd|mcp|poc)|kubectl apply -f lab-poc/.test(x.cmd));
    assert.ok(g.steps.indexOf(st) < first || first < 0, `${k}: the pre-flight runs before anything pulls an image`);
    for (const m of main.matchAll(/upgrade --install \S+ oci:\/\/\S+\/([\w.-]+) --version (\S+)/g))
      if (CHART_IMAGES[`${m[1]}@${m[2]}`]) assert.ok(main.includes(`-f mirror/values/${m[1]}.yaml`), `${k}: values of ${m[1]}`);
  }
});

test("scope all: pull secrets in every namespace, CNPG and Keycloak, and nothing secret in mirror/", () => {
  const g = gen({...ALL, ...CICD, cicdSameNs: false, CICD_NS: "dx-cicd"}, "all");
  const st = g.steps.find(x => x.origId === "D-MR");
  assert.match(st.cmd, /for ns in dx-demo dx-shared dx-cicd; do/);
  assert.match(st.cmd, /create secret docker-registry regcred --docker-server=harbor\.example\.com --docker-username='robot'/);
  assert.match(st.cmd, /patch serviceaccount default/);
  assert.match(g.files["lab-bbdd/cluster-dx-pg.yaml"].text, /imagePullSecrets:[^\n]*\n\s*- name: regcred/);
  assert.match(g.files["lab-keycloak/keycloak.yaml"].text, /^spec:\n  imagePullSecrets:[^\n]*\n    - name: regcred/m);
  for (const e of g.entries.filter(e => /^dx-install\/mirror\//.test(e.name))) for (const v of ["harbor-token-123", "robot-pw", "sk-or-v1-secret", "Lab-Passw0rd"])
    assert.ok(!e.text.includes(v), `${e.name} holds a secret`);
  const v = g.files["mirror/values/openbao.yaml"].text;
  assert.match(v, /registry: "harbor\.example\.com\/mirror\/quay\.io"\n\s+repository: "openbao\/openbao"/);
  assert.match(v, /imagePullSecrets:\n\s+- name: regcred/);
  assert.match(g.files["mirror/values/openldap-stack-ha.yaml"].text, /imagePullSecrets:\n\s+- regcred/);   // Bitnami common: names
  const anon = gen({...ALL, REGISTRY_USER: "", REGISTRY_PASSWORD: ""}, "all");
  assert.doesNotMatch(anon.steps.find(x => x.origId === "D-MR").cmd, /docker-registry|helm registry login/);
  assert.doesNotMatch(anon.files["mirror/values/cloudnative-pg.yaml"].text, /imagePullSecrets/);
  const web = gen(ALL, "webinar");
  assert.match(web.entries.find(e => e.name === "dx-install/prepare.sh").text, /read -rsp "Password or token of harbor\.example\.com/);   // never in prepare.sh
  assert.ok(!web.entries.find(e => e.name === "dx-install/prepare.sh").text.includes("harbor-token-123"));
});

test("path layouts: host keeps the original registry, flat drops it; HCL follows the same scheme", () => {
  const f = {REGISTRY: REG, REGISTRY_LAYOUT: "host"};
  assert.equal(imageTarget(f, "busybox:1.36"), `${REG}/docker.io/library/busybox:1.36`);
  assert.equal(imageTarget(f, "quay.io/openbao/openbao:2.7.2"), `${REG}/quay.io/openbao/openbao:2.7.2`);
  assert.equal(imageTarget({...f, REGISTRY_LAYOUT: "flat"}, "ghcr.io/cloudnative-pg/postgresql:18"), `${REG}/cloudnative-pg/postgresql:18`);
  assert.deepEqual(parseImage("registry.example.com:5000/a/b@sha256:abc"), {host: "registry.example.com:5000", path: "a/b", tag: "", digest: "@sha256:abc"});
  const host = gen(ALL, "custom"), fl = gen({...ALL, REGISTRY_LAYOUT: "flat"}, "custom");
  assert.match(host.files["lab-base/custom-values.yaml"].text, /repository: "harbor\.example\.com\/mirror\/hclcr\.io"/);
  assert.match(fl.files["lab-base/custom-values.yaml"].text, /repository: "harbor\.example\.com\/mirror"/);
  assert.match(host.entries.find(e => e.name === "dx-install/install.sh").text, /oci:\/\/harbor\.example\.com\/mirror\/hclcr\.io\/dx-compose\/hcl-dx-deployment/);
  assert.match(fl.entries.find(e => e.name === "dx-install/install.sh").text, /oci:\/\/harbor\.example\.com\/mirror\/charts\/openldap-stack-ha --version/);
  assert.match(gen({...ALL, REGISTRY_LAYOUT: "flat", REGISTRY_CHARTS_PATH: "helm"}, "custom").entries.find(e => e.name === "dx-install/install.sh").text, /mirror\/helm\/cloudnative-pg --version/);
});

test("the inventory lists every component, and mirror-images.sh --dry-run walks it", () => {
  const g = gen({...ALL, ...CICD}, "all");
  const txt = g.files["mirror/IMAGES.txt"].text;
  for (const x of ["quay.io/keycloak/keycloak-operator:", "quay.io/openbao/openbao:", "ghcr.io/external-secrets/external-secrets:", "quay.io/argoproj/argocd:",
    "docker.io/jpgouin/openldap:", "ghcr.io/cloudnative-pg/cloudnative-pg:", "ghcr.io/cloudnative-pg/postgresql:", "ghcr.io/europesip/dx-delivery-operator:",
    "ghcr.io/europesip/orbita/orbita-api:", "hclcr.io/dx-compose/webengine:", "hclcr.io/dx/dx-iq-integrator:", "hclcr.io/dx-public/dxclient:", "ghcr.io/berriai/litellm:"])
    assert.ok(txt.includes(x), x);
  const dir = mkdtempSync(join(tmpdir(), "dx-mirror-"));
  for (const e of g.entries) if (/^dx-install\/mirror\//.test(e.name)) { const p = join(dir, e.name.replace(/^dx-install\//, "")); mkdirSync(dirname(p), {recursive: true}); writeFileSync(p, e.text, {mode: e.mode || 0o644}); }
  const bin = join(dir, "bin"); mkdirSync(bin);
  writeFileSync(join(bin, "skopeo"), "#!/usr/bin/env bash\nexit 0\n", {mode: 0o755});
  const r = spawnSync("bash", [join(dir, "mirror/mirror-images.sh"), "--dry-run"], {encoding: "utf8", env: {...process.env, PATH: `${bin}:${process.env.PATH}`}});
  assert.equal(r.status, 0, r.stderr);
  const inv = JSON.parse(g.files["mirror/images.json"].text);
  assert.match(r.stdout, new RegExp(`Done: ${inv.images.length + inv.charts.length + inv.files.length} copied, 0 failed`));
  assert.match(r.stdout, /\+ skopeo copy --all --retry-times 3 docker:\/\/quay\.io\/openbao\/openbao:2\.7\.2 docker:\/\/harbor\.example\.com\/mirror\/quay\.io\/openbao\/openbao:2\.7\.2/);
  assert.match(r.stdout, /\+ helm pull openbao --repo https:\/\/openbao\.github\.io\/openbao-helm --version 0\.30\.7/);
  assert.match(r.stdout, /\+ helm push \S+\/openbao-0\.30\.7\.tgz oci:\/\/harbor\.example\.com\/mirror\/openbao\.github\.io\/openbao-helm/);
  // the pre-flight with a registry that has nothing: strict stops, warn goes on
  writeFileSync(join(bin, "skopeo"), "#!/usr/bin/env bash\nexit 1\n", {mode: 0o755});
  writeFileSync(join(bin, "helm"), "#!/usr/bin/env bash\nexit 1\n", {mode: 0o755});
  const env = {...process.env, PATH: `${bin}:${process.env.PATH}`};
  const strict = spawnSync("bash", [join(dir, "mirror/check-images.sh")], {encoding: "utf8", env});
  assert.equal(strict.status, 1); assert.match(strict.stderr, /missing: image harbor\.example\.com\/mirror\/quay\.io\/openbao\/openbao:2\.7\.2/);
  assert.equal(spawnSync("bash", [join(dir, "mirror/check-images.sh")], {encoding: "utf8", env: {...env, MIRROR_PREFLIGHT: "warn"}}).status, 0);
});

test("scope hcl (default): the folder is the one of the HCL-only option, with no mirror/", () => {
  for (const preset of ["all", "webinar", "custom", "basic"]) {
    const extra = preset === "basic" ? {IMAGE_PULL_SECRET: "pull"} : {};
    const a = gen(extra, preset), b = gen({...extra, REGISTRY_SCOPE: "hcl", REGISTRY_LAYOUT: "flat", MIRROR_TOOL: "crane", MIRROR_PREFLIGHT: "warn"}, preset);
    assert.ok(!a.entries.some(e => /\/mirror\//.test(e.name)), preset);
    assert.deepEqual(a.entries.map(e => e.name), b.entries.map(e => e.name), preset);
    const strip = t => (t || "").replace(/\d{4}-\d\d-\d\d \d\d:\d\d/g, "<date>").replace(/\{SSHA\}[A-Za-z0-9+/=]+/g, "");
    for (const [i, e] of a.entries.entries()) if (!/keycloak-secrets|BUILD-INFO/.test(e.name)) assert.equal(strip(b.entries[i].text), strip(e.text), `${preset}: ${e.name}`);
    assert.ok(!a.steps.some(x => /check-images/.test(x.cmd)), preset);
  }
});
