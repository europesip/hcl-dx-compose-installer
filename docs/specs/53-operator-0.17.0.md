# DX Delivery Operator 0.17.0 in the CI/CD extra

Issue: #53 · Status: Implemented · Release: Unreleased

## Summary
The CI/CD extra pinned the DX Delivery Operator chart at 0.13.0. The current release is 0.17.0: OpenShift-ready chart
(0.15.0: no fixed UID, `podSecurityContext`/`containerSecurityContext`, webhook certificate provider), stable portlet
unique names (0.16.0), DXJavaExtension `spec.delivery: startupHook` (0.17.0) and a new CRD, `dxjavaextensions`.

## Current behaviour
`src/cicd.js`: `VERSIONS.operator` 0.13.0; step OP-1 applies eleven CRDs from the tag of that version and runs
`helm upgrade --install dxop ... --set dxclient.acceptLicense=true`; the Argo CD values list eleven kinds for their
health check; `--cleanup` falls back to the same list when the cluster cannot be asked (#2, `src/compat.js`).

## Specification
- `VERSIONS.operator` is 0.17.0 (chart, CRD URLs, BUILD-INFO.txt, pinned charts, the operator preflight of #2).
- Step OP-1 applies the twelve CRDs of the 0.17.0 chart, `dx.europesip.com_dxjavaextensions` included, before helm.
- The Argo CD health check covers `DXJavaExtension` (it has a `Ready` condition like the others).
- The `--cleanup` fallback list includes `dxjavaextensions`.
- Chart values: only `dxclient.acceptLicense=true` is set (the licence is accepted in the wizard). The 0.15.0
  security context defaults are kept (no fixed UID, `runAsNonRoot`, `RuntimeDefault` seccomp, no privilege escalation,
  all capabilities dropped) and `javaExtensions.enabled` stays `false`: no webhook, so cert-manager is not needed.
  The script says so in a comment.
- The hello sample (`lab-cicd/dxop-hello.yaml`) is unchanged: its CRDs did not change between 0.13.0 and 0.17.0.
- The frozen engine (`src/engine/`) is untouched.

## Acceptance criteria
- [x] Given the operator option, when the folder is generated, then OP-1 applies the twelve 0.17.0 CRDs and installs
  chart 0.17.0 with only the licence value.
- [x] Given Argo CD and the operator, then `argocd-values.yaml` has a health check for `DXJavaExtension`.
- [x] Golden test unchanged.

## Out of scope
Enabling Java extensions from the wizard; the operator on OpenShift (the CI/CD extra stays off there).

## Test plan
Unit (`test/cicd.test.mjs`), golden, `helm template` of the generated OP-1 command against the published chart, every
CRD URL answers 200; installation on AWS (#31) before the release.
