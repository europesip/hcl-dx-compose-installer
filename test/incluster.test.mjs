// SPDX-License-Identifier: MIT
// Copyright (c) 2026 EUROPESIP
// Unit tests (node --test) of the cluster check of the generated install.sh (src/retry.js, issue #34): it must work
// with a kubeconfig and inside a Pod with only the in-cluster ServiceAccount, where "kubectl version" fails.
import {test} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {DEFAULTS, applyPreset} from "../src/state.js";
import {generate} from "../src/bundle.js";
import {inClusterCheck} from "../src/retry.js";

const install = preset => generate({...applyPreset({...DEFAULTS, DX_HOST: "dx.example.com"}, preset)}, "en")
  .entries.find(e => e.name === "dx-install/install.sh").text;

for (const preset of ["all", "basic"]) test(`install.sh (${preset}): cluster check with kubectl get --raw /version`, () => {
  const sh = install(preset);
  assert.doesNotMatch(sh, /^kubectl version /m);
  assert.match(sh, /^kubectl get --raw \/version --request-timeout=10s >\/dev\/null 2>&1 \|\| \{ echo "\$\{R\}Cannot reach the cluster with kubectl/m);
  assert.match(sh, /cluster context : \$\(kubectl config current-context 2>\/dev\/null \|\| echo 'in-cluster \(ServiceAccount\)'\)/);
  // the Helm note still comes right before the check
  assert.match(sh, /\nesac\nkubectl get --raw \/version /);
  execFileSync("bash", ["-n"], {input: sh});
});

test("inClusterCheck: only the generated check and summary lines change", () => {
  const src = 'kubectl version --request-timeout=10s >/dev/null 2>&1 || { echo "x"; exit 1; }\n' +
    'echo "  cluster context : $(kubectl config current-context 2>/dev/null)"\nrun "kubectl version --client"\n';
  const out = inClusterCheck(src);
  assert.equal(out, 'kubectl get --raw /version --request-timeout=10s >/dev/null 2>&1 || { echo "x"; exit 1; }\n' +
    'echo "  cluster context : $(kubectl config current-context 2>/dev/null || echo \'in-cluster (ServiceAccount)\')"\nrun "kubectl version --client"\n');
  assert.equal(inClusterCheck(out), out, "idempotent");
});

