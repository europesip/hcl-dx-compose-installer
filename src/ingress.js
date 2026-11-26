// SPDX-License-Identifier: MIT
// Copyright (c) 2026 EUROPESIP
// Traefik, the Ingress controller installed by default (2.14.0). Output layer: the engine (src/engine/core.js) is frozen.
//
// The Ingress class of the installation is Traefik by default (INGRESS_KIND "traefik", src/state.js). Until 2.13 the
// folder expected the controller to be in the cluster already: k3s brings one (the PoC, the EC2 instance), but a
// generic cluster without it left DX unreachable. Now, on Kubernetes (not the PoC, not OpenShift, not the basic preset,
// which runs as an unattended Job without cluster-wide rights), the first step of stage 0 installs Traefik with Helm
// when the cluster has no IngressClass "traefik" yet, and does nothing when it has one (k3s, or a Traefik installed
// before). Every decision is a default:
//   - INGRESS_INSTALL (true): false = never install it, the cluster brings its own controller (as before 2.14.0);
//   - TRAEFIK_NS ("traefik"): the namespace of the Traefik release;
//   - TRAEFIK_SERVICE ("LoadBalancer"): the type of its Service (LoadBalancer, NodePort or ClusterIP).
// nginx (ingress-nginx) and "other" keep working as before: the folder never installs them. OpenShift keeps its Routes.
export const TRAEFIK_CHART = "42.4.3";          // Traefik v3.7.20 (the same chart as server/aws/eks-create.sh)
export const TRAEFIK_IMAGE = "docker.io/traefik:v3.7.20";
export const TRAEFIK_VALUES = "lab-base/traefik-values.yaml";
export const SERVICE_TYPES = ["LoadBalancer", "NodePort", "ClusterIP"];
export const traefikNs = f => String(f.TRAEFIK_NS || "").trim() || "traefik";
const nsOf = traefikNs;
const svcOf = f => SERVICE_TYPES.includes(f.TRAEFIK_SERVICE) ? f.TRAEFIK_SERVICE : "LoadBalancer";

/** True when the folder installs Traefik if it is missing. */
export const ingressOn = (f, s) => f.INGRESS_INSTALL !== false && s.INGRESS_CLASS === "traefik" && !s.poc && !s.openshift && f.preset !== "basic";

export function ingressErrors(f, lang){
  if (f.INGRESS_INSTALL === false) return [];
  const ns = nsOf(f), es = lang === "es";
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(ns)) return [es ? `Namespace de Traefik no válido: ${ns}` : `Invalid Traefik namespace: ${ns}`];
  return [];
}

export function traefikValues(f){
  return `# lab-base · Traefik, the Ingress controller that install.sh installs by default (DX Installer Wizard)
# Chart traefik/traefik ${TRAEFIK_CHART} (Traefik v3.7). install.sh only installs it when the cluster has no
# IngressClass "traefik" yet (k3s already brings one): the IngressRoute of DX (lab-base/ingressroute-dx-traefik.yaml),
# the Ingress of ÓRBITA and of Keycloak use that class.
ingressClass:
  enabled: true
  name: traefik
  isDefaultClass: false        # it does not take over the Ingresses without a class of other applications
providers:
  kubernetesCRD:
    enabled: true              # IngressRoute and ServersTransport (DX re-encrypts towards its HAProxy)
  kubernetesIngress:
    enabled: true              # plain Ingress objects (ÓRBITA, Keycloak, Argo CD...)
    publishedService:
      enabled: true            # the Ingresses show the address of the Service below
ports:
  web:
    transport:
      respondingTimeouts:
        readTimeout: 600s      # 10 minutes for large DAM uploads (as the Traefik of the EC2 instance)
  websecure:
    transport:
      respondingTimeouts:
        readTimeout: 600s
service:
  spec:
    type: ${svcOf(f)}       # TRAEFIK_SERVICE: LoadBalancer (default), NodePort or ClusterIP
`;
}

export function ingressStep(f, s, lang){
  const es = lang === "es", ns = nsOf(f);
  return {id: "D-IN", lab: "", opt: false, manual: "",
    title: es ? "Controlador de Ingress: Traefik (si falta)" : "Ingress controller: Traefik (if missing)",
    note: es ? `Traefik es el controlador de Ingress por defecto. Si el clúster ya tiene la IngressClass traefik (k3s la trae) no se instala nada; si no, se instala el chart traefik ${TRAEFIK_CHART} en el namespace ${ns}, con un Service ${svcOf(f)}. El DNS de ${s.DX_HOST} debe apuntar a la dirección de ese Service. Para no instalarlo: INGRESS_INSTALL false.`
      : `Traefik is the default Ingress controller. If the cluster already has the IngressClass traefik (k3s brings it) nothing is installed; otherwise the chart traefik ${TRAEFIK_CHART} is installed in the namespace ${ns}, with a ${svcOf(f)} Service. The DNS name ${s.DX_HOST} must point to the address of that Service. To never install it: INGRESS_INSTALL false.`,
    cmd: `if kubectl get ingressclass traefik >/dev/null 2>&1; then
  echo "IngressClass traefik found: the cluster already has Traefik, nothing to install"
else
  helm repo add traefik https://traefik.github.io/charts
  helm repo update traefik >/dev/null 2>&1 || true   # an index added long ago may not know this version yet
  helm upgrade --install traefik traefik/traefik --version ${TRAEFIK_CHART} -n ${ns} --create-namespace \\
    -f ${TRAEFIK_VALUES} --wait --timeout 10m
  kubectl -n ${ns} get svc traefik -o wide   # its EXTERNAL-IP (or node port) is where the DNS name of DX points
fi`};
}

/** Adds the Traefik values and the step: before the cluster check of stage 0, or right after the pull secrets and the
 * registry login of an own registry for every image (src/mirror.js), where its chart and image come from. */
export function applyIngress(f, s, files, steps, lang, {webinar = false, mirror = false} = {}){
  if (!ingressOn(f, s) || (webinar && mirror)) return {files, steps};   // webinar + every image from a registry: the controller must be there
  const mr = steps.findIndex(x => x.id === "D-MR");
  const at = mr >= 0 ? mr + 1 : Math.max(0, steps.findIndex(x => x.id === "D-0"));
  const out = [...steps];
  out.splice(at, 0, ingressStep(f, s, lang));
  return {files: {...files, [TRAEFIK_VALUES]: {text: traefikValues(f)}}, steps: out};
}
