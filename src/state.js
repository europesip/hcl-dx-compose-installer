// Form values of the installer and how they map to the state object of the engine (core.js).
// The external dependencies (OpenLDAP, PostgreSQL, LiteLLM, EUROPESIP MCP) are not asked for: they
// follow from the stages that are chosen.

export const DEFAULTS = {
  // Environment
  envSource: "",                     // own | wsl | linux | aws
  awsKind: "ec2",                    // ec2 | eks | rosa
  envConfirmed: false,
  platform: "kubernetes",            // kubernetes | openshift | poc
  DX_HOST: "",
  INGRESS_KIND: "traefik",           // traefik | nginx | other
  INGRESS_CLASS: "",
  TLS_CERT: "", TLS_KEY: "",
  SC_RWO: "dx-deploy-rwo", SC_RWX: "dx-deploy-rwx",
  helm: "4",
  // Deployment
  preset: "",                        // all | custom | webinar
  lab1b: false, dir: "openldap", db: "postgres",
  lab3: true, lab3b: false, iqdb: false, iqrag: false, IQ_LLM: "claude",
  lab4: true, lab5: false, dxcLicense: false,
  // Credentials
  HCL_HARBOR_USER: "", HCL_HARBOR_TOKEN: "", OPENROUTER_API_KEY: "", LAB_PASSWORD: "EuropeS1P",
  demoSame: true, DEMO_PASSWORD: "",
  LLM_PROVIDER: "openrouter", BEDROCK_API_KEY: "", BEDROCK_REGION: "us-east-1", ANTHROPIC_API_KEY: "",   // the AI: OpenRouter (recommended), AWS Bedrock or Claude directly (Anthropic API)   // password of the demo users of the LDAP (by default, the same as wpsadmin)
  AD_HOST: "", AD_PORT: "389", AD_BASE_DN: "", AD_BIND_USER: "", AD_BIND_PASSWORD: "", AD_CA_FILE: "",
  ORACLE_JDBC_URL: "", ORACLE_DX_USER: "wpsuser", ORACLE_DX_PASSWORD: "", ORACLE_CA_FILE: "",
  // Names
  DX_NS: "dx-demo", SHARED_NS: "dx-shared", DX_RELEASE: "dx-deployment", IQ_RELEASE: "dx-iq",
  SEARCH_RELEASE: "dx-search", LDAP_RELEASE: "openldap", LITELLM_RELEASE: "litellm", PG_CLUSTER: "dx-pg",
};

export const NAME_KEYS = ["DX_NS", "SHARED_NS", "DX_RELEASE", "IQ_RELEASE", "SEARCH_RELEASE", "LDAP_RELEASE", "LITELLM_RELEASE", "PG_CLUSTER"];
export const SECRET_KEYS = ["HCL_HARBOR_TOKEN", "OPENROUTER_API_KEY", "BEDROCK_API_KEY", "ANTHROPIC_API_KEY", "LAB_PASSWORD", "DEMO_PASSWORD", "AD_BIND_PASSWORD", "ORACLE_DX_PASSWORD"];
// Values that are never stored in the browser
export const NO_STORE = [...SECRET_KEYS, "envConfirmed"];
export const POC_HOST = "dx-demo.127.0.0.1.nip.io";

// The quick deployments ("custom" keeps the current choices)
export const PRESETS = {
  all: {lab1b: true, dir: "openldap", db: "postgres", lab3: true, lab3b: true, iqdb: true, iqrag: true, lab4: true, lab5: true},
  // Webinar / showroom (HCL feedback): stages 0 to 5, no extras
  webinar: {lab1b: false, dir: "openldap", db: "postgres", lab3: true, lab3b: false, iqdb: false, iqrag: false, lab4: true, lab5: false, IQ_LLM: "claude"},
};
export function applyPreset(f, preset){
  return normalise({...f, preset, ...(PRESETS[preset] || {})});
}

// Dependencies between the options: an option without what it needs is switched off
export function gates(f){
  return {lab3b: f.lab3 ? null : "needAi", iqdb: f.lab3 ? null : "needAi", iqrag: (f.LLM_PROVIDER || "openrouter") !== "openrouter" ? "noBedrock" : f.lab3 && f.iqdb ? null : "needIqdb"};
}
export function normalise(f){
  const n = {...f};
  if (n.preset === "webinar") Object.assign(n, PRESETS.webinar);
  if (!n.lab3) { n.lab3b = false; n.iqdb = false; }
  if ((n.LLM_PROVIDER || "openrouter") !== "openrouter") { n.IQ_LLM = "claude"; n.iqrag = false; }   // Bedrock / Anthropic: only Claude, and no BGE-M3 for the RAG
  if (!n.iqdb) n.iqrag = false;
  if (n.platform === "poc" && n.INGRESS_KIND === "nginx") n.INGRESS_KIND = "traefik";
  return n;
}

// The external dependencies that the chosen stages need
export function depsOf(f){
  return {ldap: f.dir === "openldap", pg: f.db === "postgres" || !!f.iqdb || !!f.lab5, llm: !!f.lab3, mcp: !!f.lab3b};
}

const trim = v => String(v ?? "").trim();

export function toEngineState(f){
  const platform = f.platform;
  const s = {
    platform, poc: platform === "poc", openshift: platform === "openshift",
    DX_HOST: trim(f.DX_HOST) || (platform === "poc" ? POC_HOST : ""),
    INGRESS_CLASS: f.INGRESS_KIND === "other" ? trim(f.INGRESS_CLASS) : f.INGRESS_KIND,
    TLS_CERT: trim(f.TLS_CERT), TLS_KEY: trim(f.TLS_KEY),
    SC_RWO: trim(f.SC_RWO), SC_RWX: trim(f.SC_RWX),
    dir: f.dir, db: f.db,
    lab3: !!f.lab3, lab3b: !!f.lab3b, iqdb: !!f.iqdb, iqrag: !!f.iqrag, lab4: !!f.lab4,
    IQ_LLM: f.IQ_LLM,
    deps: depsOf(f),
    lab1b: !!f.lab1b, lab5: !!f.lab5, dxcLicense: !!f.dxcLicense,
    fast: false,
    HCL_HARBOR_USER: trim(f.HCL_HARBOR_USER), HCL_HARBOR_TOKEN: trim(f.HCL_HARBOR_TOKEN),
    OPENROUTER_API_KEY: trim(f.OPENROUTER_API_KEY), LAB_PASSWORD: f.LAB_PASSWORD ?? "",
    LLM_PROVIDER: f.LLM_PROVIDER || "openrouter", BEDROCK_API_KEY: trim(f.BEDROCK_API_KEY), BEDROCK_REGION: f.BEDROCK_REGION || "us-east-1", ANTHROPIC_API_KEY: trim(f.ANTHROPIC_API_KEY),
    DEMO_PASSWORD: f.demoSame === false && f.DEMO_PASSWORD ? f.DEMO_PASSWORD : (f.LAB_PASSWORD ?? ""),
    AD_HOST: trim(f.AD_HOST), AD_PORT: f.AD_PORT, AD_BASE_DN: trim(f.AD_BASE_DN),
    AD_BIND_USER: trim(f.AD_BIND_USER), AD_BIND_PASSWORD: f.AD_BIND_PASSWORD ?? "", AD_CA_FILE: trim(f.AD_CA_FILE),
    ORACLE_JDBC_URL: trim(f.ORACLE_JDBC_URL), ORACLE_DX_USER: trim(f.ORACLE_DX_USER) || "wpsuser",
    ORACLE_DX_PASSWORD: f.ORACLE_DX_PASSWORD ?? "", ORACLE_CA_FILE: trim(f.ORACLE_CA_FILE),
    helm: f.helm,
  };
  for (const k of NAME_KEYS) s[k] = trim(f[k]);
  s.PG_HOST = `${s.PG_CLUSTER}-rw.${s.SHARED_NS}.svc.cluster.local`;
  s.LDAP_HOST = `${s.LDAP_RELEASE}.${s.SHARED_NS}.svc.cluster.local`;
  s.LITELLM_URL = `http://${s.LITELLM_RELEASE}.${s.SHARED_NS}.svc.cluster.local:4000`;
  return s;
}
