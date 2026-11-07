// Form values of the installer and how they map to the state object of the wizard engine.
// toEngineState() must produce exactly what state() of the wizard (docs/index.html) produces for
// the same choices: test/engine.test.mjs checks it.

export const DEFAULTS = {
  platform: "kubernetes",            // kubernetes | openshift | poc
  DX_HOST: "",
  INGRESS_KIND: "traefik",           // traefik | nginx | other
  INGRESS_CLASS: "",
  TLS_CERT: "", TLS_KEY: "",         // paths on the machine that runs install.sh (empty: self-signed)
  SC_RWO: "dx-deploy-rwo", SC_RWX: "dx-deploy-rwx",
  helm: "4",
  // External dependencies (namespace SHARED_NS)
  depLdap: true, depPg: false, depLlm: true, depMcp: false,
  // Labs
  lab1b: false, dir: "openldap", db: "none",
  lab3: true, lab3b: false, iqdb: false, iqrag: false, IQ_LLM: "claude",
  lab4: true, lab5: false, dxcLicense: false,
  mode: "steps",                     // steps | fast
  // Credentials
  HCL_HARBOR_USER: "", HCL_HARBOR_TOKEN: "", OPENROUTER_API_KEY: "", LAB_PASSWORD: "EuropeS1P",
  AD_HOST: "", AD_PORT: "389", AD_BASE_DN: "", AD_BIND_USER: "", AD_BIND_PASSWORD: "", AD_CA_FILE: "",
  ORACLE_JDBC_URL: "", ORACLE_DX_USER: "wpsuser", ORACLE_DX_PASSWORD: "", ORACLE_CA_FILE: "",
  // Names
  DX_NS: "dx-demo", SHARED_NS: "dx-shared", DX_RELEASE: "dx-deployment", IQ_RELEASE: "dx-iq",
  SEARCH_RELEASE: "dx-search", LDAP_RELEASE: "openldap", LITELLM_RELEASE: "litellm", PG_CLUSTER: "dx-pg",
};

export const NAME_KEYS = ["DX_NS", "SHARED_NS", "DX_RELEASE", "IQ_RELEASE", "SEARCH_RELEASE", "LDAP_RELEASE", "LITELLM_RELEASE", "PG_CLUSTER"];
export const SECRET_KEYS = ["HCL_HARBOR_TOKEN", "OPENROUTER_API_KEY", "LAB_PASSWORD", "AD_BIND_PASSWORD", "ORACLE_DX_PASSWORD"];
export const POC_HOST = "dx-demo.127.0.0.1.nip.io";

// Choices that depend on others: the same rules as the gates of the wizard (an option without its
// dependency is switched off). Returns the reason when an option is not available.
export function gates(f){
  return {
    lab3: f.depLlm ? null : "needLlm",
    lab3b: f.depMcp && f.lab3 ? null : "needMcp",
    iqdb: f.depPg && f.lab3 ? null : "needIqdb",
    iqrag: f.iqdb && f.depPg && f.lab3 ? null : "needIqrag",
    lab5: f.depPg ? null : "needPg",
    dirOpenldap: f.depLdap ? null : "needLdap",
    dbPostgres: f.depPg ? null : "needPg",
  };
}

// Apply the gates after a change, like the wizard does (unchecks what lost its dependency)
export function normalise(f){
  const g = gates(f), n = {...f};
  for (const k of ["lab3", "lab3b", "iqdb", "iqrag", "lab5"]) if (g[k]) n[k] = false;
  const g2 = gates(n);                       // a second pass: iqrag depends on iqdb
  for (const k of ["lab3b", "iqdb", "iqrag"]) if (g2[k]) n[k] = false;
  if (n.dir === "openldap" && !n.depLdap) n.dir = "none";
  if (n.db === "postgres" && !n.depPg) n.db = "none";
  if (n.platform === "openshift") n.INGRESS_KIND = n.INGRESS_KIND || "traefik";
  if (n.platform === "poc" && n.INGRESS_KIND === "nginx") n.INGRESS_KIND = "traefik";
  return n;
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
    deps: {ldap: !!f.depLdap, pg: !!f.depPg, llm: !!f.depLlm, mcp: !!f.depMcp},
    lab1b: !!f.lab1b, lab5: !!f.lab5, dxcLicense: !!f.dxcLicense,
    fast: f.mode === "fast",
    HCL_HARBOR_USER: trim(f.HCL_HARBOR_USER), HCL_HARBOR_TOKEN: trim(f.HCL_HARBOR_TOKEN),
    OPENROUTER_API_KEY: trim(f.OPENROUTER_API_KEY), LAB_PASSWORD: f.LAB_PASSWORD ?? "",
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
