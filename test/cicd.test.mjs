// Unit tests (node --test) of the advanced CI/CD options (src/cicd.js): OpenBao + External Secrets, Argo CD and the
// Script Application operator, and the secrets manager mode (no credential may end up in the zip).
import {test} from "node:test";
import assert from "node:assert/strict";
import {DEFAULTS, applyPreset, normalise} from "../src/state.js";
import {generate} from "../src/bundle.js";

const CREDS = {DX_HOST: "dx.example.com", INGRESS_KIND: "nginx", HCL_HARBOR_USER: "someone@europesip.com", HCL_HARBOR_TOKEN: "harbor-token-123",
  OPENROUTER_API_KEY: "sk-or-v1-secret", LAB_PASSWORD: "Lab-Passw0rd", dxcLicense: true};
const all = (extra = {}, lang = "en") => generate({...applyPreset({...DEFAULTS, ...CREDS}, "all"), preset: "custom", ...extra}, lang);
const CICD = {cicdOpenbao: true, cicdArgo: true, cicdOperator: true};
const text = g => g.entries.map(e => e.name + "\n" + e.text).join("\n");

test("off by default: nothing changes", () => {
  const g = all();
  assert.ok(!g.entries.some(e => e.name.includes("lab-cicd/")));
  assert.ok(!g.steps.some(s => /^C-|^OP-/.test(s.origId)));
});

test("the three tools: their files and steps, in the shared namespace by default", () => {
  const g = all(CICD);
  assert.deepEqual(g.check.err, []);
  for (const f of ["openbao-values.yaml", "openbao-init.sh", "openbao-unseal.sh", "argocd-values.yaml", "dxop-hello.yaml"])
    assert.ok(g.entries.some(e => e.name === "dx-install/lab-cicd/" + f), f);
  const ids = g.steps.map(s => s.origId);
  assert.ok(ids.indexOf("C-1") > ids.indexOf("D-1") && ids.indexOf("C-1") < ids.indexOf("D-2"), "OpenBao right after the namespaces");
  assert.ok(ids.indexOf("OP-1") > ids.indexOf("1-5"), "the operator once DX is running");
  assert.match(text(g), /helm upgrade --install openbao openbao\/openbao --version [\d.]+ -n dx-shared/);
  // without the secrets manager, the credentials are still in the zip as before
  assert.match(text(g), /Lab-Passw0rd/);
});

test("another namespace for the CI/CD tools", () => {
  const g = all({...CICD, cicdSameNs: false, CICD_NS: "dx-cicd"});
  assert.match(text(g), /kubectl create namespace dx-cicd/);
  assert.match(text(g), /-n dx-cicd -f lab-cicd\/openbao-values\.yaml/);
  assert.match(all({...CICD, cicdSameNs: false, CICD_NS: "Bad_NS"}).check.err.join(" "), /namespace/i);
});

test("secrets manager: no credential in the zip, ExternalSecrets instead of Secrets", () => {
  const g = all({...CICD, useVault: true});
  assert.deepEqual(g.check.err, []);
  const t = text(g);
  for (const secret of ["harbor-token-123", "sk-or-v1-secret", "Lab-Passw0rd"]) assert.ok(!t.includes(secret), secret);
  assert.ok(!/@@OB:/.test(t), "no sentinel left");
  assert.ok(!g.entries.some(e => /kind: Secret\n/.test(e.text) && /stringData:/.test(e.text) && !e.name.includes("lab-cicd")), "no plain Secret");
  const base = g.entries.find(e => e.name === "dx-install/lab-base/secrets.yaml").text;
  assert.match(base, /kind: ExternalSecret[\s\S]*name: regcred[\s\S]*kubernetes\.io\/dockerconfigjson/);
  assert.match(base, /name: dx-tls-cert[\s\S]*kubernetes\.io\/tls/);
  assert.match(t, /obv registry password \| helm registry login hclcr\.io -u 'someone@europesip\.com' --password-stdin/);
  assert.ok(g.entries.some(e => e.name === "dx-install/lab-bbdd/dbdomain-secret.yaml"));
  assert.ok(!g.entries.some(e => e.name === "dx-install/lab-bbdd/dx_dbdomain.properties"));
  assert.match(g.runbook, /OpenBao/);
  // the PostgreSQL users keep the CloudNativePG reload label
  assert.match(g.entries.find(e => e.name === "dx-install/lab-bbdd/secrets.yaml").text, /cnpg\.io\/reload: 'true'/);
});

test("not on OpenShift, not in the webinar", () => {
  const n = normalise({...DEFAULTS, ...CICD, useVault: true, platform: "openshift"});
  assert.equal(n.cicdOpenbao || n.cicdArgo || n.cicdOperator || n.useVault, false);
  const w = generate(applyPreset({...DEFAULTS, ...CREDS, ...CICD}, "webinar"), "en");
  assert.ok(!w.entries.some(e => e.name.includes("lab-cicd/")));
});

test("the operator needs the DXClient license", () => {
  assert.match(all({cicdOperator: true, dxcLicense: false, lab1b: false, lab5: false}).check.err.join(" "), /DXClient/);
});

test("Keycloak: independent of OpenBao, needs the OpenLDAP, adds the DX layer and form logins", () => {
  const g = all({keycloak: true});
  assert.deepEqual(g.check.err, []);
  assert.ok(g.entries.some(e => e.name === "dx-install/lab-keycloak/custom-values.keycloak.yaml"));
  assert.ok(!g.entries.some(e => e.name.includes("lab-cicd/openbao")), "no OpenBao without asking for it");
  const sh = g.entries.find(e => e.name.endsWith("install.sh")).text;
  assert.match(sh, /-f lab-ldap\/custom-values\.ldap\.yaml \\\n  -f lab-keycloak\/custom-values\.keycloak\.yaml/);
  assert.ok(!/auth\/login/.test(sh), "the checks sign in with the portal form");
  assert.match(sh, /j_security_check/);
  const ids = g.steps.map(s => s.origId);
  assert.ok(ids.indexOf("K-1") > ids.indexOf("D-4"), "after PostgreSQL");
  assert.equal(all({keycloak: true, dir: "ad"}).entries.some(e => e.name.includes("lab-keycloak")), false);
  // with OpenBao, its secrets are ExternalSecrets
  const v = all({keycloak: true, cicdOpenbao: true, useVault: true});
  assert.match(v.entries.find(e => e.name.endsWith("lab-keycloak/keycloak-secrets.yaml")).text, /kind: ExternalSecret/);
  assert.ok(!/@@OB:/.test(text(v)));
});

test("own image registry instead of hclcr.io", () => {
  const g = all({altRegistry: true, REGISTRY: "harbor.acme.com/hcl", REGISTRY_USER: "robot", REGISTRY_PASSWORD: "robot-pw", HCL_EMAIL: "someone@europesip.com"});
  assert.deepEqual(g.check.err, []);
  const files = g.entries.filter(e => !e.name.endsWith("RUNBOOK.md")).map(e => e.text).join("\n");
  assert.ok(!/hclcr\.io/.test(files), "no hclcr.io left");
  assert.match(files, /repository: "harbor\.acme\.com\/hcl"/);
  assert.match(files, /helm registry login harbor\.acme\.com -u 'robot'/);
  assert.match(files, /oci:\/\/harbor\.acme\.com\/hcl\/dx-compose\/hcl-dx-deployment/);
  assert.ok(g.pgSql, "the HCL e-mail still decides the table script");
  assert.match(all({altRegistry: true, REGISTRY: ""}).check.err.join(" "), /registry|repositorio/i);
});

test("Keycloak theme: default Keycloak theme unless the EUROPESIP one is ticked; full logout", () => {
  const plain = all({keycloak: true});
  assert.ok(!plain.entries.some(e => e.name.endsWith("theme-europesip.yaml")));
  assert.match(plain.entries.find(e => e.name.endsWith("realm-dx.yaml")).text, /<span>Keycloak<\/span>/);
  const th = all({keycloak: true, kcTheme: true});
  assert.match(th.entries.find(e => e.name.endsWith("theme-europesip.yaml")).text, /parent=keycloak\.v2[\s\S]*europesip-white\.png: [A-Za-z0-9+/]{1000}/);
  assert.match(th.entries.find(e => e.name.endsWith("keycloak.yaml")).text, /mountPath: \/opt\/keycloak\/themes\/europesip\/login/);
  assert.match(th.entries.find(e => e.name.endsWith("realm-dx.yaml")).text, /loginTheme: europesip/);
  assert.match(th.entries.find(e => e.name.endsWith("custom-values.keycloak.yaml")).text, /redirect\.logout\.url: "https:\/\/keycloak\.example\.com\/realms\/dx\/protocol\/openid-connect\/logout\?client_id=dx-compose/);
});

test("downloads are retried; the collector does not warn falsely", () => {
  const sh = all(CICD).entries.find(e => e.name.endsWith("install.sh")).text;
  assert.match(sh, /^retry\(\) \{/m); assert.match(sh, /^rhelm\(\) \{/m);
  assert.match(sh, /^retry helm repo add openbao /m);
  assert.match(sh, /^rhelm upgrade --install dx-deployment /m);
  assert.ok(!/^helm upgrade --install /m.test(sh), "every helm upgrade goes through rhelm");
  const col = all().entries.find(e => e.name.endsWith("collect-support-data.sh")).text;
  assert.match(col, /ls -A "\$OUT\/web-engine\/liberty-logs"/);
});

test("resources: HCL software apart from prerequisites and extras", async () => {
  const {resources, FULL} = await import("../src/resources.js");
  const base = resources({...DEFAULTS, ...CREDS, lab3: false, lab4: false, dir: "none", db: "none"});
  assert.equal(base.items.pre.length, 0); assert.equal(base.items.ext.length, 0);
  const kc = resources({...DEFAULTS, ...CREDS, keycloak: true});
  assert.ok(kc.items.ext.some(([k]) => k === "keycloak") && kc.items.pre.some(([k]) => k === "pg"), "Keycloak needs PostgreSQL");
  assert.ok(FULL.free[0] <= 16 && FULL.free[1] <= 64, "the default AWS sizes hold the biggest installation");
  assert.match(all({keycloak: true}).runbook, /## Resources this installation asks for/);
});

test("cleanup: operator resources and ExternalSecrets go before their operators are uninstalled", () => {
  const sh = all({...CICD, useVault: true}).entries.find(e => e.name.endsWith("install.sh")).text;
  const block = sh.slice(sh.indexOf("if [ $CLEANUP = 1 ]"), sh.indexOf("exit 0", sh.indexOf("if [ $CLEANUP = 1 ]")));
  const i = s => block.indexOf(s);
  assert.ok(i("delete dxpages,dxthemes,dxscriptapplications") > 0 && i("delete dxpages,dxthemes,dxscriptapplications") < i("delete externalsecret --all --wait"));
  assert.ok(i("delete externalsecret --all --wait") < i("helm uninstall"), "before any helm uninstall");
});

test("the operator CRDs of its version are applied before helm (Helm skips CRDs on upgrades)", () => {
  const sh = all(CICD).entries.find(e => e.name.endsWith("install.sh")).text;
  const crd = sh.indexOf("dx.europesip.com_dxthemes.yaml"), helmAt = sh.indexOf("upgrade --install dxop");
  assert.ok(crd > 0 && crd < helmAt, "CRDs before the operator chart");
  assert.match(sh, /retry kubectl apply --server-side --force-conflicts -f https:\/\/raw\.githubusercontent\.com\/europesip\/hcl-dx-scriptapp-operator\/v0\.3\.1\//);
});
