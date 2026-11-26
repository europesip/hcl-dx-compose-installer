# Traefik as the Ingress controller installed by default

Issue: #60 · Status: Implemented · Release: 2.14.0

## Summary
The Ingress class of the installation was already Traefik by default (`INGRESS_KIND` `traefik`), but the generated folder
expected the controller to be in the cluster. k3s brings one (the PoC, the EC2 environment); a generic cluster without
a controller left DX unreachable, and `server/aws/eks-create.sh` installed ingress-nginx, whose project is retired
upstream. Traefik becomes the controller the installation installs by default.

## Current behaviour
`src/state.js` `INGRESS_KIND: "traefik"`; the engine (`src/engine/core.js`, frozen) only installs a controller for the
PoC (k3s Traefik configuration or ingress-nginx on WSL). For Kubernetes, step D-0 (optional) only checks
`kubectl get ingressclass <class>`. EKS: `eks-create.sh` installs ingress-nginx 4.15.1 behind an NLB.

## Specification
- Output layer `src/ingress.js` (the engine stays byte-identical, the golden test stays green).
- When `INGRESS_INSTALL` (default `true`) and the class is `traefik`, on Kubernetes (not the PoC, not OpenShift, not the
  basic preset): step `D-IN`, the first of stage 0 (before the cluster check), runs
  `helm upgrade --install traefik traefik/traefik --version 42.4.3 -n <TRAEFIK_NS> -f lab-base/traefik-values.yaml`
  only when `kubectl get ingressclass traefik` fails; otherwise it prints that the cluster already has Traefik.
- `lab-base/traefik-values.yaml`: IngressClass `traefik`, not the default class; providers kubernetesCRD (IngressRoute,
  ServersTransport) and kubernetesIngress (published Service); `readTimeout` 600 s on web and websecure; Service type
  `TRAEFIK_SERVICE` (`LoadBalancer` default, `NodePort`, `ClusterIP`).
- Defaults in `src/state.js`: `INGRESS_INSTALL: true`, `TRAEFIK_NS: "traefik"`, `TRAEFIK_SERVICE: "LoadBalancer"`;
  headless schema with descriptions and the enum of `TRAEFIK_SERVICE`; an invalid namespace is an error. Wizard: the
  checkbox *Install Traefik if the cluster has none* under the Ingress selector (Traefik first in the list).
- Webinar: the step goes to the preparation (`prepare.sh`), after the cluster check. Webinar + own registry for every
  image: not added (the controller must be there).
- Own registry for every image (#51): `CHART_IMAGES` `traefik@42.4.3` (image `docker.io/traefik:v3.7.20`,
  `deployment.imagePullSecrets`); the Traefik namespace gets the pull secret; the step runs after `D-MR`.
- BUILD-INFO.txt `ingress` line says whether the controller is installed if missing or is the one of the cluster.
- `eks-create.sh`: `INGRESS` (`traefik` default | `nginx`), `TRAEFIK_VERSION` 42.4.3, NLB annotations and tags on the
  Traefik Service; the result JSON carries the class. `eks-destroy.sh` deletes the Traefik or ingress-nginx release.
- Unchanged: nginx and *other* classes (never installed), OpenShift Routes, the PoC, `uninstall.sh` (it leaves the
  controller, shared by the cluster).

## Acceptance criteria
- [x] Given the defaults on Kubernetes, then step 0-1 installs Traefik when the IngressClass is missing (unit test).
- [x] Given k3s (EC2), when install.sh runs, then step 0-1 finds the IngressClass and installs nothing (AWS test).
- [x] Given `INGRESS_INSTALL` false, nginx, other, the PoC, OpenShift or basic, then there is no Traefik step.
- [x] Given the own registry for every image, then chart and image come from it, after the pull secrets.
- [x] The golden test is green and `src/engine/core.js` is unchanged.

## Out of scope
Installing ingress-nginx or other controllers; cert-manager / Let's Encrypt for the Traefik of the folder.

## Test plan
`test/ingress.test.mjs` (5 tests), `npm test`, the golden test, and the AWS test of 2.14.0 (EC2 + k3s, our Harbor).
