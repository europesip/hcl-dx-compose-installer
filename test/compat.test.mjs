// SPDX-License-Identifier: MIT
// Copyright (c) 2026 EUROPESIP
// Unit tests (node --test) of the compatibility of a generated folder with a cluster that runs newer extras
// (src/compat.js, issue #2): versions recorded in the folder, extras never downgraded, operator kinds checked
// before use, and a --cleanup that does not depend on the kinds of one operator version. The shell snippets run in
// bash against stub helm and kubectl commands.
import {test} from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync, writeFileSync, readFileSync, existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {DEFAULTS, applyPreset} from "../src/state.js";
import {generate} from "../src/bundle.js";
import {VERSIONS} from "../src/cicd.js";
import {BUNDLE_FORMAT, OPERATOR, helmFind, keepNewer, operatorKinds, kindsGuard, operatorCleanup, compatScript, pinnedCharts} from "../src/compat.js";

const CREDS = {DX_HOST: "dx.example.com", INGRESS_KIND: "nginx", HCL_HARBOR_USER: "someone@example.com", HCL_HARBOR_TOKEN: "harbor-token-123",
  OPENROUTER_API_KEY: "sk-or-v1-secret", LAB_PASSWORD: "Lab-Passw0rd", dxcLicense: true};
const all = (extra = {}, lang = "en") => generate({...applyPreset({...DEFAULTS, ...CREDS}, "all"), preset: "custom", ...extra}, lang);
const CICD = {cicdOpenbao: true, cicdArgo: true, cicdOperator: true};
const file = (g, name) => g.entries.find(e => e.name === "dx-install/" + name)?.text;
const step = (g, id) => g.steps.find(s => s.origId === id);

// Stub helm and kubectl: helm list prints $FAKE_HELM, kubectl api-resources prints $FAKE_API, every other call is
// logged to $LOG (kubectl delete of a resource in $FAIL_DELETE fails)
const bin = mkdtempSync(join(tmpdir(), "dx-compat-"));
writeFileSync(join(bin, "helm"), `#!/usr/bin/env bash
[ "$1" = list ] && { printf '%s' "\${FAKE_HELM:-[]}"; [ -n "\${HELM_FAIL:-}" ] && exit 1; exit 0; }
echo "helm $*" >> "$LOG"\n`, {mode: 0o755});
writeFileSync(join(bin, "kubectl"), `#!/usr/bin/env bash
[ "$1" = api-resources ] && { case " $* " in *" -o name "*) printf '%s\\n' "$FAKE_API" | awk 'NF{print $1".dx.europesip.com"}' ;; *) printf '%s\\n' "$FAKE_API" | awk 'NF{print $1, "dx.europesip.com/"$2, "true", $3}' ;; esac; exit 0; }
echo "kubectl $*" >> "$LOG"
case " $* " in *" delete \${FAIL_DELETE:-none} "*) exit 1 ;; esac\n`, {mode: 0o755});
const run = (script, env = {}) => {
  const log = join(bin, `log-${Math.random().toString(36).slice(2)}`);
  writeFileSync(log, "");
  const r = spawnSync("bash", ["-c", `set -Eeuo pipefail\n${script}`], {encoding: "utf8",
    env: {...process.env, PATH: `${bin}:${process.env.PATH}`, LOG: log, FAKE_HELM: "[]", FAKE_API: "", ...env}});
  return {...r, log: existsSync(log) ? readFileSync(log, "utf8") : ""};
};
const release = (chart, version, ns) => `{"name":"x","namespace":"${ns}","revision":"1","updated":"2026-11-26","status":"deployed","chart":"${chart}-${version}","app_version":"${version}"}`;
const helmJson = (...r) => `[${r.join(",")}]`;
// api-resources lines for the stub: <plural> <version> <Kind>
const API_NOW = ["dxconnections v1alpha1 DXConnection", "dxscriptapplications v1alpha1 DXScriptApplication", "dxpages v1alpha1 DXPage",
  "dxthemes v1alpha1 DXTheme", "dxjavaextensions v1alpha1 DXJavaExtension"].join("\n");
const API_OLD = ["scriptapplications v1alpha1 ScriptApplication", "dxpages v1alpha1 DXPage", "dxconnections v1alpha1 DXConnection"].join("\n");

const body = "helm upgrade --install dxop oci://ghcr.io/europesip/charts/dx-delivery-operator --version 0.13.0 -n dx-shared";
const keep = keepNewer({label: "DX Delivery Operator", pinned: "0.13.0", find: helmFind([OPERATOR.chart, ...OPERATOR.oldCharts]), body});

test("keep newer: a newer operator in the cluster is kept, never downgraded", () => {
  const r = run(keep, {FAKE_HELM: helmJson(release("dx-delivery-operator", "0.17.0", "dxop-system"))});
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /DX Delivery Operator 0\.17\.0 found \(namespace dxop-system\), newer than 0\.13\.0.*kept, not downgraded/);
  assert.equal(r.log, "", "no helm upgrade");
});

test("keep newer: no operator, the same, an older one or the old chart name: the pinned version is installed", () => {
  for (const h of ["[]", helmJson(release("dx-delivery-operator", "0.13.0", "dx-shared")), helmJson(release("dx-delivery-operator", "0.9.2", "dx-shared")),
    helmJson(release("hcl-dx-scriptapp-operator", "0.12.0", "dx-shared"))]) {
    const r = run(keep, {FAKE_HELM: h});
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.log, /helm upgrade --install dxop .* --version 0\.13\.0/, h);
  }
});

test("keep newer: versions compare as versions (0.13.0 is newer than 0.9.9), and helm list may fail", () => {
  const k = keepNewer({label: "X", pinned: "0.9.9", find: helmFind(["dx-delivery-operator"]), body: "helm upgrade --install x"});
  assert.match(run(k, {FAKE_HELM: helmJson(release("dx-delivery-operator", "0.13.0", "a"))}).stdout, /kept, not downgraded/);
  const r = run(keep, {HELM_FAIL: "1"});
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.log, /helm upgrade --install dxop/);
});

test("operator kinds: read from the YAML with their API version", () => {
  const y = "apiVersion: dx.europesip.com/v1alpha1\nkind: DXConnection\n---\napiVersion: v1\nkind: ConfigMap\n---\napiVersion: dx.europesip.com/v1alpha1\nkind: DXPage\n---\napiVersion: dx.europesip.com/v1alpha1\nkind: DXPage\n";
  assert.deepEqual(operatorKinds(y), [["dx.europesip.com/v1alpha1", "DXConnection"], ["dx.europesip.com/v1alpha1", "DXPage"]]);
});

test("kinds guard: a folder whose kinds the cluster does not serve stops with a clear message", () => {
  const now = [["dx.europesip.com/v1alpha1", "DXConnection"], ["dx.europesip.com/v1alpha1", "DXScriptApplication"], ["dx.europesip.com/v1alpha1", "DXPage"]];
  assert.equal(run(kindsGuard(now, "0.13.0") + "\necho applied", {FAKE_API: API_NOW}).stdout.trim(), "applied");
  // a folder of an older installer (kind ScriptApplication) against the current operator
  const r = run(kindsGuard([["dx.europesip.com/v1alpha1", "ScriptApplication"], ["dx.europesip.com/v1alpha1", "DXPage"]], "0.1.3") + "\necho applied", {FAKE_API: API_NOW});
  assert.notEqual(r.status, 0);
  assert.doesNotMatch(r.stdout, /applied/);
  assert.match(r.stderr, /does not serve: ScriptApplication \(this folder was generated for 0\.1\.3\)\. Generate the folder again/);
  // the current folder against an operator older than the rename of the kinds
  assert.match(run(kindsGuard(now, "0.13.0"), {FAKE_API: API_OLD}).stderr, /does not serve: DXScriptApplication/);
  // another API version is not the same kind
  assert.match(run(kindsGuard([["dx.europesip.com/v1beta1", "DXPage"]], "0.13.0"), {FAKE_API: API_NOW}).stderr, /does not serve: DXPage/);
});

test("cleanup: every kind the cluster serves, one by one, DXConnection last; one failure does not stop the rest", () => {
  const c = operatorCleanup("dx-shared", ["dxpages", "dxconnections"]);
  const r = run("set +e\n" + c, {FAKE_API: API_NOW, FAIL_DELETE: "dxpages.dx.europesip.com"});
  const dels = r.log.trim().split("\n").map(l => l.match(/delete (\S+)/)[1]);
  assert.deepEqual(dels, ["dxscriptapplications.dx.europesip.com", "dxpages.dx.europesip.com", "dxthemes.dx.europesip.com",
    "dxjavaextensions.dx.europesip.com", "dxconnections.dx.europesip.com"]);
  assert.match(r.stdout, /could not delete every dxpages/);
  // a kind of an older operator is deleted too (it is what the cluster serves, not what the folder knows)
  assert.match(run("set +e\n" + c, {FAKE_API: API_OLD}).log, /delete scriptapplications\.dx\.europesip\.com --all/);
  // no operator CRDs at all: the known list, still one by one
  assert.equal(run("set +e\n" + c, {FAKE_API: ""}).log.trim().split("\n").length, 2);
});

// A minimal script with the shape of the engine's install.sh
const SCRIPT = `#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")"
R=''; Y=''; N=''; B=''
step_0() {
helm upgrade --install a repo/a --version 1.2.3 -n x
}
echo "\${B}HCL DX Compose · installation\${N}"
echo "  namespaces      : dx-demo (HCL) · dx-shared (third party)"
echo READY
`;
const OPK = {pinned: "0.13.0", kinds: [["dx.europesip.com/v1alpha1", "DXConnection"], ["dx.europesip.com/v1alpha1", "DXScriptApplication"]]};

test("install.sh header: bundle format, installer version and pinned charts, at the top and printed", () => {
  const t = compatScript(SCRIPT);
  assert.match(t, new RegExp(`^BUNDLE_FORMAT=${BUNDLE_FORMAT}; INSTALLER_VERSION='[^']+'$`, "m"));
  assert.match(t, /^PINNED_CHARTS='repo\/a 1\.2\.3'$/m);
  const r = run(t.split("\n").slice(1).join("\n").replace('cd "$(dirname "$0")"\n', ""));
  assert.match(r.stdout, /generated with  : installer v\S+ · bundle format 2/);
  assert.match(r.stdout, /pinned charts   : repo\/a 1\.2\.3/);
  assert.equal(compatScript("not a script"), "not a script");
  assert.deepEqual(pinnedCharts("rhelm upgrade --install dxop oci://ghcr.io/e/c --version 0.13.0 -n a\nhelm upgrade --install b r/b -n x --version 2"), ["ghcr.io/e/c 0.13.0", "r/b 2"]);
});

test("install.sh preflight: stops at the start when a newer operator does not serve the kinds of the folder", () => {
  const t = compatScript(SCRIPT, {operator: OPK}).replace('cd "$(dirname "$0")"\n', "");
  const newer = helmJson(release("dx-delivery-operator", "0.20.0", "dxop-system"));
  let r = run(t, {FAKE_HELM: newer, FAKE_API: "dxconnections v1alpha1 DXConnection\ndxapps v1beta1 DXApp"});
  assert.equal(r.status, 1);
  assert.doesNotMatch(r.stdout, /READY/);
  assert.match(r.stdout, /generated by installer v\S+ for the DX Delivery Operator 0\.13\.0; the cluster runs 0\.20\.0 \(namespace dxop-system\), which does not serve: DXScriptApplication/);
  // newer and compatible: kept, with a warning
  r = run(t, {FAKE_HELM: newer, FAKE_API: API_NOW});
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /0\.20\.0 found .*newer than 0\.13\.0: it is kept, not downgraded[\s\S]*READY/);
  // older: it says it upgrades it; none: nothing
  assert.match(run(t, {FAKE_HELM: helmJson(release("dx-delivery-operator", "0.11.0", "dx-shared"))}).stdout, /found \(namespace dx-shared\): this folder upgrades it to 0\.13\.0[\s\S]*READY/);
  assert.equal(run(t).stdout.trim().split("\n").filter(l => /Operator/.test(l)).length, 0);
});

test("generated folder with the operator: pinned version, guard before the sample, cleanup by discovery, BUILD-INFO", () => {
  const g = all(CICD);
  assert.deepEqual(g.check.err, []);
  const op1 = step(g, "OP-1").cmd, op2 = step(g, "OP-2").cmd, sh = file(g, "install.sh");
  assert.match(op1, new RegExp(`--version ${VERSIONS.operator.replace(/\./g, "\\.")} -n dx-shared`));
  assert.match(op1, /newer than [\d.]+ \(the version of this folder\): kept, not downgraded/);
  assert.ok(op2.indexOf("does not serve") < op2.indexOf("kubectl apply -f lab-cicd/dxop-hello.yaml"), "guard before the sample");
  assert.match(op2, /dx\.europesip\.com\/v1alpha1\/DXConnection dx\.europesip\.com\/v1alpha1\/DXScriptApplication dx\.europesip\.com\/v1alpha1\/DXPage/);
  assert.doesNotMatch(sh, /delete dxpages,dxthemes/, "no single delete of every kind");
  assert.match(sh, /kubectl api-resources --api-group=dx\.europesip\.com --namespaced -o name/);
  assert.match(sh, /^dxop_found=\$\(helm list -A/m);
  assert.ok(sh.indexOf("dxop_found=") > sh.indexOf("Cannot reach the cluster"), "preflight once the cluster is reachable");
  assert.match(sh, /^PINNED_CHARTS='.*ghcr\.io\/europesip\/charts\/dx-delivery-operator [\d.]+/m);
  for (const id of ["C-1", "C-3"]) assert.match(step(g, id).cmd, /kept, not downgraded/, id);
  const info = file(g, "BUILD-INFO.txt");
  assert.match(info, /^bundle\.format {5}: 2 /m);
  assert.match(info, /^operator {10}: dx-delivery-operator [\d.]+ · kinds DXConnection \(dx\.europesip\.com\/v1alpha1\), DXScriptApplication/m);
  assert.match(info, /dx-delivery-operator [\d.]+/);   // third-party charts still list it
  assert.equal(spawnSync("bash", ["-n"], {input: sh}).status, 0, "bash -n install.sh");
});

test("generated folder without CI/CD: versions recorded, no operator check", () => {
  for (const g of [all(), all({}, "es")]) {
    const sh = file(g, "install.sh");
    assert.match(sh, /^BUNDLE_FORMAT=2; /m);
    assert.match(sh, /generated with  : installer v/);
    assert.doesNotMatch(sh, /dxop_found|dx\.europesip\.com/);
    assert.doesNotMatch(file(g, "BUILD-INFO.txt"), /^operator /m);
    assert.equal(spawnSync("bash", ["-n"], {input: sh}).status, 0);
  }
});

test("webinar: prepare.sh and demo.sh record the versions too", () => {
  const g = generate({...applyPreset({...DEFAULTS, ...CREDS}, "webinar")}, "en");
  for (const n of ["prepare.sh", "demo.sh"]) assert.match(file(g, n), /^BUNDLE_FORMAT=2; INSTALLER_VERSION=/m, n);
});
