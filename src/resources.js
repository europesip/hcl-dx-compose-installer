// How much CPU and memory the chosen installation asks the cluster for (Kubernetes requests), split into the HCL
// software and the third-party prerequisites and extras. Measured on the lab cluster (DX Compose CF239, 2026-11-08):
// requests of each pod; for pods without requests (PostgreSQL, Argo CD...), their real use plus a margin.
// The HCL requirement (~8 CPU, ~14 GiB) only covers the HCL software.
import {depsOf} from "./state.js";
import {cicdOn, keycloakOn} from "./cicd.js";

const C = {   // [CPU, GiB]
  dx: [4.8, 10.5], iq: [0.4, 0.75], search: [2.5, 4.75],
  ldap: [0.05, 0.15], pg: [0.25, 1.0], litellm: [0.1, 0.5], mcp: [0.05, 0.15],
  orbita: [0.1, 0.4], scriptapp: [0.05, 0.1], openbao: [0.2, 0.35], argocd: [0.25, 0.5], operator: [0.05, 0.2], keycloak: [0.5, 1.2],
};

export function resources(f){
  const d = depsOf(f), cicd = cicdOn(f);
  const hcl = [["dx", "DX Compose"]];
  if (f.lab3) hcl.push(["iq", "HCL DX IQ"]);
  if (f.lab4) hcl.push(["search", "Search V2 (OpenSearch)"]);
  const pre = [];
  if (d.ldap) pre.push(["ldap", "OpenLDAP"]);
  if (d.pg) pre.push(["pg", "PostgreSQL (CloudNativePG)"]);
  if (d.llm) pre.push(["litellm", "LiteLLM"]);
  if (d.mcp) pre.push(["mcp", "MCP Server (EUROPESIP)"]);
  const ext = [];
  if (f.lab5) ext.push(["orbita", "ÓRBITA"]);
  if (f.lab1b) ext.push(["scriptapp", "Hello DX"]);
  if (cicd && f.cicdOpenbao) ext.push(["openbao", "OpenBao + External Secrets"]);
  if (cicd && f.cicdArgo) ext.push(["argocd", "Argo CD"]);
  if (cicd && f.cicdOperator) ext.push(["operator", "Script Application operator"]);
  if (keycloakOn(f)) ext.push(["keycloak", "Keycloak + operator"]);
  const sum = list => list.reduce((a, [k]) => [a[0] + C[k][0], a[1] + C[k][1]], [0, 0]);
  const g = {hcl: sum(hcl), pre: sum(pre), ext: sum(ext)};
  const total = [g.hcl[0] + g.pre[0] + g.ext[0], g.hcl[1] + g.pre[1] + g.ext[1]];
  // free capacity to look for: requests + ~25% (start-up peaks, rolling restarts) + the Kubernetes system pods
  const free = [Math.ceil(total[0] * 1.25 + 0.5), Math.ceil(total[1] * 1.25 + 1)];
  return {items: {hcl, pre, ext}, groups: g, total, free, of: k => C[k]};
}

// The biggest installation the installer can generate (every stage and extra): what the AWS sizes must hold
export const FULL = resources({dir: "openldap", db: "postgres", lab1b: true, lab3: true, lab3b: true, iqdb: true, lab4: true, lab5: true,
  cicdOpenbao: true, cicdArgo: true, cicdOperator: true, keycloak: true, platform: "kubernetes", preset: "custom"});

export const fmt = ([c, m], lang) => `${(Math.round(c * 10) / 10).toLocaleString(lang === "es" ? "es-ES" : "en-US")} CPU · ${(Math.round(m * 10) / 10).toLocaleString(lang === "es" ? "es-ES" : "en-US")} GiB`;

// The same estimate as a section of RUNBOOK.md
export function resourcesMd(f, lang){
  const r = resources(f), es = lang === "es";
  const row = (label, k) => `| ${label} | ${r.items[k].map(([, n]) => n).join(", ") || "—"} | ${r.groups[k][1] > 0 ? fmt(r.groups[k], lang) : "—"} |`;
  return [es ? "## Recursos que pide esta instalación" : "## Resources this installation asks for", "",
    es ? "Reservas (requests) de Kubernetes, medidas en nuestro clúster de laboratorio (DX Compose CF239)." : "Kubernetes requests, measured on our lab cluster (DX Compose CF239).", "",
    es ? "| Parte | Qué | CPU · memoria |" : "| Part | What | CPU · memory |", "|---|---|---|",
    row(es ? "Software de HCL" : "HCL software", "hcl"), row(es ? "Pre-requisitos (terceros)" : "Prerequisites (third party)", "pre"),
    row(es ? "Extras y herramientas avanzadas" : "Extras and advanced tools", "ext"), `| **Total** | | **${fmt(r.total, lang)}** |`, "",
    es ? `> El requisito de HCL (~8 CPU, ~14 GiB) cubre solo el software de HCL, **no** los pre-requisitos ni los extras. Busca unas **${fmt(r.free, lang)} libres** en el clúster (picos de arranque, reinicios y pods del sistema).`
       : `> The HCL requirement (~8 CPU, ~14 GiB) covers only the HCL software, **not** the prerequisites or the extras. Look for about **${fmt(r.free, lang)} free** in the cluster (start-up peaks, restarts and the system pods).`, ""].join("\n");
}
