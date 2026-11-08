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
