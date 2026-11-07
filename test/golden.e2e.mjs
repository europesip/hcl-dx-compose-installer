// Golden test: for the same answers, the installer must produce exactly the files of option C of
// the configuration wizard (hcl-dx-compose-labs docs/index.html). Needs Playwright (Chromium).
//   WIZARD=/path/to/hcl-dx-compose-labs/docs/index.html node test/golden.e2e.mjs
import { chromium } from 'playwright';
import {generate} from "../src/bundle.js";
import {DEFAULTS, normalise} from "../src/state.js";
import {resolve} from "node:path";
const wizard = 'file://' + resolve(process.env.WIZARD || '../dx-compose-webinar/docs/index.html');
const CASES = [
  {name: "defaults", f: {}},
  {name: "all-labs", f: {depPg: true, depMcp: true, lab1b: true, lab3b: true, iqdb: true, iqrag: true, lab5: true, dxcLicense: true, HCL_HARBOR_USER: "x@europesip.com", HCL_HARBOR_TOKEN: "tok123456", OPENROUTER_API_KEY: "sk-or-v1-zzz"}},
  {name: "openshift-ad-oracle", f: {platform: "openshift", dir: "ad", db: "oracle", AD_HOST: "dc.local", AD_BASE_DN: "DC=a,DC=b", AD_BIND_USER: "svc@a", AD_BIND_PASSWORD: "pw1234", ORACLE_JDBC_URL: "jdbc:oracle:thin:@h:1521/S", ORACLE_DX_PASSWORD: "opw1234", DX_NS: "dxp", SHARED_NS: "shr"}},
  {name: "poc-fast-qwen", f: {platform: "poc", mode: "fast", IQ_LLM: "qwen", INGRESS_KIND: "traefik", lab4: false, helm: "3"}},
  {name: "postgres-webengine", f: {depPg: true, db: "postgres", HCL_HARBOR_USER: "y@hcl.com", lang: "es"}},
];
const b = await chromium.launch(); const p = await b.newPage();
let fails = 0;
for (const c of CASES) {
  const lang = c.f.lang || "en"; const f = normalise({...DEFAULTS, DX_HOST: "dx.example.com", ...c.f}); delete f.lang;
  await p.goto(wizard + '?lang=' + lang);
  const wiz = await p.evaluate(f => {
    const set = (id, v) => { const e = document.getElementById(id); if (!e) return; if (e.type === "checkbox") e.checked = v; else e.value = v; };
    document.querySelector(`input[name=platform][value=${f.platform}]`).checked = true; update();
    document.querySelector(`input[name=mode][value=${f.mode}]`).checked = true;
    for (const k of ["depLdap","depPg","depLlm","depMcp"]) set(k, f[k]); update();
    for (const k of ["DX_HOST","INGRESS_KIND","INGRESS_CLASS","TLS_CERT","TLS_KEY","SC_RWO","SC_RWX","dir","db","IQ_LLM","HCL_HARBOR_USER","HCL_HARBOR_TOKEN","OPENROUTER_API_KEY","LAB_PASSWORD",
      "AD_HOST","AD_PORT","AD_BASE_DN","AD_BIND_USER","AD_BIND_PASSWORD","AD_CA_FILE","ORACLE_JDBC_URL","ORACLE_DX_USER","ORACLE_DX_PASSWORD","ORACLE_CA_FILE",
      "DX_NS","SHARED_NS","DX_RELEASE","IQ_RELEASE","SEARCH_RELEASE","LDAP_RELEASE","LITELLM_RELEASE","PG_CLUSTER"]) set(k, f[k]);
    set("HELM", f.helm); update();
    for (const k of ["lab1b","lab3","lab3b","lab4","lab5","dxcLicense"]) set(k, f[k]); update();
    set("iqdb", f.iqdb); update(); set("iqrag", f.iqrag); update();
    const s = state(); return {s, v: validate(s), files: buildDirectZip(s), key: litellmKey};
  }, f);
  const app = generate(f, lang);
  const norm = (t, key) => t.split(key).join("<KEY>").replace(/\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?/g, "<DATE>").replace(/\{SSHA\}[A-Za-z0-9+\/=]+/g, "{SSHA}<HASH>");
  const A = Object.fromEntries(app.entries.map(e => [e.name, norm(e.text, app.litellmKey)]));
  const W = Object.fromEntries(wiz.files.map(e => [e.name, norm(e.text, wiz.key)]));
  const diffs = [...new Set([...Object.keys(A), ...Object.keys(W)])].filter(k => A[k] !== W[k]);
  const sDiff = Object.keys({...wiz.s, ...app.s}).filter(k => JSON.stringify(wiz.s[k]) !== JSON.stringify(app.s[k]));
  const ok = !diffs.length && !sDiff.length && JSON.stringify(wiz.v) === JSON.stringify(app.check);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${c.name}: ${Object.keys(A).length} files, state diffs ${JSON.stringify(sDiff)}, file diffs ${JSON.stringify(diffs)}, errors ${app.check.err.length}`);
}
await b.close(); process.exit(fails ? 1 : 0);
