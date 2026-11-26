# install.sh: cluster check with the in-cluster ServiceAccount

Issue: #34 · Status: Implemented · Release: next

## Summary
Inside a Pod, with only the in-cluster ServiceAccount and no kubeconfig, `kubectl version --request-timeout=10s` goes
to `localhost:8080` and fails with kubectl 1.35, while `kubectl get`, `apply` and `helm` work. The prerequisites of the
generated `install.sh` use it, so the script stopped with *Cannot reach the cluster with kubectl*. Found with the
headless preset `basic` (#32) run from a Job by the HCL DX plugin of Backstage.

## Current behaviour
`src/engine/core.js` (frozen engine) writes the check `kubectl version --request-timeout=10s ... || { ... exit 1; }`
and the summary line `cluster context : $(kubectl config current-context 2>/dev/null)`, empty in a Pod.

## Specification
- `install.sh` checks the cluster with `kubectl get --raw /version --request-timeout=10s`, which uses a kubeconfig
  when there is one and the in-cluster config otherwise. The error message and exit code are the same.
- The summary shows the kubeconfig context, or `in-cluster (ServiceAccount)` when there is none.
- The engine stays identical (golden test): the change is an output layer, `inClusterCheck` in `src/retry.js`,
  applied to `install.sh`, `prepare.sh` and `demo.sh` together with the retries; the Helm note stays before the check.
- `support/environment-info.sh` (diagnostics, never stops) is not changed.

## Acceptance criteria
- [x] The generated `install.sh` runs in a Pod without a kubeconfig (`kubectl get --raw /version` is in-cluster aware).
- [x] The golden test of the lab files is unchanged.

## Test plan
- Unit tests in `test/incluster.test.mjs`: presets `all` and `basic`, Helm note order, `bash -n`, idempotent layer.
- Golden test against the frozen labs wizard (5 cases OK).
- With a kubeconfig: `kubectl get --raw /version` answers on the lab cluster (read-only).
