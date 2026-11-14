// Unit tests (node --test) of #17: the webinar zip as in the webinar of 2026-11-12. SOPS (age) with one or more
// public keys, the HCL Harbor password typed at the prompt, the IQ deployment key in the IQ values.
import {test} from "node:test";
import assert from "node:assert/strict";
import {DEFAULTS, applyPreset} from "../src/state.js";
import {generate} from "../src/bundle.js";
import {parseSopsKeys} from "../src/sops.js";

const K1 = "age132f3u3v2kggz6aurm6wmhlrtpxllcwr6yxxk4m9nk90zx5j7aflqcxgf3x";
const K2 = "age1zvkyg2lqzraa2lnjvqej32nkuu0ues2s82hzrye869xeexvn73equnujwj";
const CREDS = {DX_HOST: "dx.example.com", HCL_HARBOR_USER: "someone@example.com", HCL_HARBOR_TOKEN: "harbor-token-123", OPENROUTER_API_KEY: "sk-or-v1-secret", LAB_PASSWORD: "Lab-Passw0rd", dxcLicense: true};
const make = (extra = {}, preset = "webinar", lang = "en") => generate(applyPreset({...DEFAULTS, ...CREDS, ...extra}, preset), lang);
const file = (g, name) => (g.entries.find(e => e.name === "dx-install/" + name) || {}).text;

test("age keys: names, duplicates, comments, invalid and private keys", () => {
  const k = parseSopsKeys(`# team\nandres ${K1}\n\n${K2}\nandres again ${K1}\nnot-a-key\n`);
  assert.deepEqual(k.keys, [{name: "andres", key: K1}, {name: "", key: K2}]);
  assert.deepEqual(k.bad, ["not-a-key"]);
  assert.equal(k.privateKey, false);
  assert.equal(parseSopsKeys("AGE-SECRET-KEY-1QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ").privateKey, true);
});

test("webinar: Harbor password at the prompt, never on the command line", () => {
  const g = make();
  assert.deepEqual(g.check.err, []);
  assert.doesNotMatch(file(g, "RUNBOOK.md"), /harbor-token-123/);
  assert.doesNotMatch(file(g, "demo.sh"), /registry login[^\n]*harbor-token-123/);   // --collect exports it only to mask it
  assert.match(file(g, "RUNBOOK.md"), /helm registry login hclcr\.io -u 'someone@example\.com'   # Password: the CLI secret, typed, never shown\n(.*\n){4}ls -l charts\//);
  const demo = file(g, "demo.sh");
  assert.match(demo, /hlogin\(\) \{[^\n]*\n  if \[ -t 0 \]; then helm registry login hclcr\.io -u 'someone@example\.com'\n  else kubectl create --dry-run=client -f lab-base\/secret-harbor\.yaml/);
  assert.match(demo, /\nretry hlogin\n/);
});

test("webinar: the pull secret in its own file, plain YAML without SOPS", () => {
  const g = make();
  assert.match(file(g, "lab-base/secret-harbor.yaml"), /name: regcred/);
  assert.doesNotMatch(file(g, "lab-base/secrets.yaml"), /regcred/);
  assert.match(file(g, "lab-base/secrets.yaml"), /name: web-engine-secret/);
  assert.match(file(g, "RUNBOOK.md"), /\nkubectl apply -f lab-base\/secret-harbor\.yaml\nkubectl apply -f lab-base\/secrets\.yaml\n/);
  assert.equal(file(g, ".sops.yaml"), undefined);
  assert.doesNotMatch(file(g, "RUNBOOK.md") + file(g, "prepare.sh"), /sops /);
});

test("webinar: the IQ deployment key in the IQ values, with its comment; no Secret, no --set", () => {
  const g = make();
  assert.match(file(g, "lab-iq/custom-iq-values.yaml"), /hcl-dx-iq 1\.0\.3 cannot read it from a Secret yet[^\n]*\n(.*\n){2}\s*licensing:\n\s*deploymentKey:/);
  for (const f of ["lab-iq/secrets.yaml", "RUNBOOK.md", "demo.sh"]) assert.doesNotMatch(file(g, f) || "", /iq-deployment-key|IQ_DEPLOYMENT_KEY/, f);
});

test("SOPS with two keys: .sops.yaml, the encrypt step of prepare.sh, step 1-1, the note and BUILD-INFO", () => {
  const g = make({sops: true, SOPS_KEYS: `andres ${K1}\ngerman ${K2}`});
  assert.deepEqual(g.check.err, []);
  const rules = file(g, ".sops.yaml");
  assert.match(rules, new RegExp(`age: >-\\n      ${K1},\\n      ${K2}\\n`));
  assert.match(rules, /#   andres  age1/);
  assert.match(file(g, "prepare.sh"), /grep -q '\^sops:' "\$f" \|\| sops -e -i "\$f"/);
  assert.match(file(g, "RUNBOOK.md"), /sops -d lab-base\/secret-harbor\.yaml \| kubectl apply -f -\n(.*\n)sops -d -i lab-base\/secrets\.yaml\nkubectl apply -f lab-base\/secrets\.yaml/);
  assert.match(file(g, "RUNBOOK.md"), /\*\*Who can decrypt:\*\* andres, german/);
  assert.match(file(g, "demo.sh"), /grep -q '\^sops:' lab-base\/secrets\.yaml && sops -d -i lab-base\/secrets\.yaml/);
  assert.match(file(g, "demo.sh"), /else sops -d --extract '\["stringData"\]\["\.dockerconfigjson"\]' lab-base\/secret-harbor\.yaml/);
  assert.match(file(g, "BUILD-INFO.txt"), /^sops +: age · 2 public keys \(andres, german\)/m);
  assert.ok(g.prep.some(st => /sops -e -i/.test(st.cmd)), "encrypt step in the preparation");
});

test("SOPS errors: no key, a private key, an invalid key", () => {
  assert.match(make({sops: true, SOPS_KEYS: ""}).check.err.join(" "), /at least one age public key/);
  assert.match(make({sops: true, SOPS_KEYS: "AGE-SECRET-KEY-1ABC"}).check.err.join(" "), /PRIVATE age key/);
  assert.match(make({sops: true, SOPS_KEYS: "age1short"}, "webinar", "es").check.err.join(" "), /no es una clave pública de age válida/);
});

test("SOPS only applies to the webinar", () => {
  const g = make({sops: true, SOPS_KEYS: K1}, "all");
  assert.equal(file(g, ".sops.yaml"), undefined);
  assert.doesNotMatch(file(g, "install.sh"), /sops /);
});

test("webinar: step 0-1 shows the CPU and memory of the nodes, without failing when there is no metrics-server", () => {
  const st = make().demo.find(x => x.id === "0-1");
  assert.match(st.cmd, /^kubectl get nodes\nkubectl top nodes 2>\/dev\/null \|\| echo /);
});
