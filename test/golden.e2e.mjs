// Golden test against the configuration wizard of hcl-dx-compose-labs (docs/index.html, frozen since
// installer 2.0.0): for the same state, the engine of the installer must still produce the same lab
// files and the same command for every step (the installer renumbers the steps and writes its own
// scripts and RUNBOOK, which are not compared). Needs Playwright (Chromium).
//   WIZARD=/path/to/hcl-dx-compose-labs/docs/index.html node test/golden.e2e.mjs
import { chromium } from 'playwright';
import {engine} from "../src/bundle.js";
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
const BASE = {platform: "kubernetes", mode: "steps", depLdap: true, depPg: false, depLlm: true, depMcp: false, DX_HOST: "dx.example.com", INGRESS_KIND: "traefik", INGRESS_CLASS: "",
  TLS_CERT: "", TLS_KEY: "", SC_RWO: "dx-deploy-rwo", SC_RWX: "dx-deploy-rwx", dir: "openldap", db: "none", IQ_LLM: "claude", HCL_HARBOR_USER: "", HCL_HARBOR_TOKEN: "",
  OPENROUTER_API_KEY: "", LAB_PASSWORD: "EuropeS1P", AD_HOST: "", AD_PORT: "389", AD_BASE_DN: "", AD_BIND_USER: "", AD_BIND_PASSWORD: "", AD_CA_FILE: "", ORACLE_JDBC_URL: "",
  ORACLE_DX_USER: "wpsuser", ORACLE_DX_PASSWORD: "", ORACLE_CA_FILE: "", DX_NS: "dx-demo", SHARED_NS: "dx-shared", DX_RELEASE: "dx-deployment", IQ_RELEASE: "dx-iq",
  SEARCH_RELEASE: "dx-search", LDAP_RELEASE: "openldap", LITELLM_RELEASE: "litellm", PG_CLUSTER: "dx-pg", helm: "4", lab1b: false, lab3: true, lab3b: false, lab4: true, lab5: false,
  dxcLicense: false, iqdb: false, iqrag: false};
for (const c of CASES) {
  const lang = c.f.lang || "en"; const f = {...BASE, ...c.f}; delete f.lang;
  if (f.mode === "fast") f.mode = "steps";       // the installer has no fast demo
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
    if (!litellmKey) litellmKey = "fixed-key";
    const s = state(); return {s, files: bundleFiles(s), steps: directSteps(s), key: litellmKey};
  }, f);
  engine.setLang(lang); engine.ensureLitellmKey();
  const files = engine.bundleFiles(wiz.s), steps = engine.directSteps(wiz.s);
  const norm = (t, key) => t.split(key).join("<KEY>").replace(/\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?/g, "<DATE>").replace(/\{SSHA\}[A-Za-z0-9+\/=]+/g, "{SSHA}<HASH>");
  const A = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, norm(v.text, engine.litellmKey)]));
  const W = Object.fromEntries(Object.entries(wiz.files).map(([k, v]) => [k, norm(v.text, wiz.key)]));
  const diffs = [...new Set([...Object.keys(A), ...Object.keys(W)])].filter(k => A[k] !== W[k]);
  const sa = steps.map(x => x.id + "\n" + norm(x.cmd, engine.litellmKey)), sw = wiz.steps.map(x => x.id + "\n" + norm(x.cmd, wiz.key));
  const stepDiffs = sw.map((x, i) => x === sa[i] ? null : wiz.steps[i].id).filter(Boolean).concat(sa.length !== sw.length ? ["count"] : []);
  const ok = !diffs.length && !stepDiffs.length;
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${c.name}: ${Object.keys(A).length} files, ${steps.length} steps, file diffs ${JSON.stringify(diffs)}, step diffs ${JSON.stringify(stepDiffs)}`);
}
await b.close(); process.exit(fails ? 1 : 0);
