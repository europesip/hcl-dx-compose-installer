// SPDX-License-Identifier: MIT
// Copyright (c) 2026 EUROPESIP
// Unit tests (node --test) of Traefik as the Ingress controller installed by default (src/ingress.js, 2.14.0).
import {test} from "node:test";
import assert from "node:assert/strict";
import {DEFAULTS, applyPreset} from "../src/state.js";
import {generate} from "../src/bundle.js";
import {TRAEFIK_CHART} from "../src/ingress.js";
import {CHART_IMAGES} from "../src/mirror.js";

const CREDS = {DX_HOST: "dx.example.com", HCL_HARBOR_USER: "someone@example.com", HCL_HARBOR_TOKEN: "harbor-token-123",
  OPENROUTER_API_KEY: "sk-or-v1-secret", LAB_PASSWORD: "Lab-Passw0rd", dxcLicense: true};
const gen = (extra = {}, preset = "custom", lang = "en") => generate({...applyPreset({...DEFAULTS, ...CREDS, ...extra}, preset)}, lang);
const sh = g => g.entries.find(e => /dx-install\/(install|prepare)\.sh$/.test(e.name)).text;
const step = g => g.steps.find(x => x.origId === "D-IN");

test("defaults: Traefik is the Ingress class and the folder installs it when the cluster has none", () => {
  assert.equal(DEFAULTS.INGRESS_KIND, "traefik");
  assert.equal(DEFAULTS.INGRESS_INSTALL, true);
  const g = gen();
  assert.deepEqual(g.check.err, []);
  const st = step(g);
  assert.ok(st, "the Traefik step");
  assert.equal(st.id, "0-1", "the first step of stage 0, before the cluster check");
  assert.match(st.cmd, /^if kubectl get ingressclass traefik >\/dev\/null 2>&1; then/);
  assert.match(st.cmd, new RegExp(`helm upgrade --install traefik traefik/traefik --version ${TRAEFIK_CHART.replace(/\./g, "\\.")} -n traefik --create-namespace`));
  assert.match(sh(g), /rhelm upgrade --install traefik traefik\/traefik/);   // retried downloads (src/retry.js)
  const v = g.files["lab-base/traefik-values.yaml"].text;
  assert.match(v, /ingressClass:\n  enabled: true\n  name: traefik\n  isDefaultClass: false/);
  assert.match(v, /readTimeout: 600s/);
  assert.match(v, /type: LoadBalancer/);
  assert.match(g.entries.find(e => e.name === "dx-install/BUILD-INFO.txt").text, /controller installed if missing \(traefik\/traefik 42\.4\.3, namespace traefik, Service LoadBalancer\)/);
});

test("every decision is a default: namespace, Service type, or never install it", () => {
  const g = gen({TRAEFIK_NS: "ingress", TRAEFIK_SERVICE: "NodePort"});
  assert.match(step(g).cmd, /-n ingress --create-namespace/);
  assert.match(g.files["lab-base/traefik-values.yaml"].text, /type: NodePort/);
  const off = gen({INGRESS_INSTALL: false});
  assert.ok(!step(off));
  assert.ok(!off.files["lab-base/traefik-values.yaml"]);
  assert.match(off.entries.find(e => e.name === "dx-install/BUILD-INFO.txt").text, /controller: the one of the cluster/);
  assert.match(gen({TRAEFIK_NS: "Bad_NS"}).check.err.join(" "), /Traefik namespace/);
});

test("not installed with nginx, other classes, the PoC, OpenShift or the basic preset", () => {
  for (const [k, extra, preset] of [["nginx", {INGRESS_KIND: "nginx"}], ["other", {INGRESS_KIND: "other", INGRESS_CLASS: "haproxy"}],
    ["poc", {platform: "poc"}], ["openshift", {platform: "openshift"}], ["basic", {IMAGE_PULL_SECRET: "pull"}, "basic"]]) {
    const g = gen(extra, preset || "custom");
    assert.ok(!step(g), k);
    assert.doesNotMatch(sh(g), /traefik\/traefik/, k);
  }
});

test("webinar: Traefik in the preparation, before the namespaces", () => {
  const g = gen({}, "webinar");
  const i = g.prep.findIndex(x => /traefik\/traefik/.test(x.cmd)), ns = g.prep.findIndex(x => /namespace-shared\.yaml/.test(x.cmd));
  assert.ok(i > 0 && i < ns, "after the cluster check, before the namespace");
  assert.ok(!g.demo.some(x => /traefik\/traefik/.test(x.cmd)));
});

test("own registry for every image: the chart and image of Traefik come from it, after the pull secrets", () => {
  const g = gen({altRegistry: true, REGISTRY: "harbor.example.com/mirror", REGISTRY_USER: "robot", REGISTRY_PASSWORD: "robot-pw", REGISTRY_SCOPE: "all"});
  assert.deepEqual(g.check.err, []);
  assert.ok(CHART_IMAGES[`traefik@${TRAEFIK_CHART}`]);
  const ids = g.steps.map(x => x.origId);
  assert.ok(ids.indexOf("D-MR") >= 0 && ids.indexOf("D-MR") < ids.indexOf("D-IN"), "pull secrets and login first");
  assert.match(g.steps.find(x => x.origId === "D-MR").cmd, /for ns in [^;]* traefik; do/);
  const s = sh(g);
  assert.match(s, /upgrade --install traefik oci:\/\/harbor\.example\.com\/mirror\/traefik\.github\.io\/charts\/traefik --version 42\.4\.3 [^\n]*\\\n[^\n]*-f mirror\/values\/traefik\.yaml/);
  assert.match(g.files["mirror/values/traefik.yaml"].text, /registry: "harbor\.example\.com\/mirror\/docker\.io"\n\s+repository: "library\/traefik"\n\s+tag: "v3\.7\.20"/);
  assert.match(g.entries.find(e => e.name === "dx-install/mirror/IMAGES.txt").text, /docker\.io\/library\/traefik:v3\.7\.20/);
});
