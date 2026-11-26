// SPDX-License-Identifier: MIT
// Copyright (c) 2026 EUROPESIP
// Robustness of the generated scripts (output layer, the engine stays as the golden test expects):
//   - downloads are retried: GitHub releases, Helm repositories and registries sometimes answer 503/504 for a while
//     (it happened on 2026-11-08). "retry" repeats a download command; "rhelm" repeats a helm upgrade only when it
//     failed because of a download error, never when the installation itself failed;
//   - Helm 3 and 4: "rhelm" adapts the Helm 4 flags (--wait=legacy, --force-conflicts) when it finds Helm 3, so a
//     folder generated for Helm 4 also runs with Helm 3 (a user reported "--wait=legacy" failing with Helm 3);
//   - the cluster check works inside a Pod with only the in-cluster ServiceAccount (issue #34): "kubectl version" goes to
//     localhost:8080 there with kubectl 1.35, while "kubectl get --raw /version" uses the in-cluster config like any
//     other kubectl command; the summary shows "in-cluster (ServiceAccount)" when there is no kubeconfig context;
//   - the support data collector no longer warns "could not copy the Liberty logs" when they were copied: tar exits 1
//     when a live log changes while it is read.

const FUNCS = `# Downloads are retried (GitHub, Helm repositories and registries answer 503/504 at times); arguments are not printed
retry() { local i; for i in 1 2 3 4 5; do if "$@"; then return 0; fi; [ $i = 5 ] && return 1; echo "  ↻ download failed, retry $i/4 in 20 s" >&2; sleep 20; done; }
# Helm 3 or 4: the folder is generated for one of them (BUILD-INFO.txt); the flags that only exist in Helm 4
# are adapted when the other one is found (Helm 3: --wait=legacy -> --wait, no --force-conflicts)
HELM_MAJOR=$(helm version --template '{{.Version}}' 2>/dev/null | sed -E 's/^v?([0-9]+).*/\\1/')
helm_args() { local a; HARGS=(); for a in "$@"; do
  if [ "$HELM_MAJOR" = 3 ]; then case "$a" in --wait=*) a=--wait ;; --force-conflicts|--server-side|--server-side=*) continue ;; esac; fi
  HARGS+=("$a"); done; }
rhelm() {   # helm upgrade: retried only when the chart could not be downloaded
  local i f; f=$(mktemp); helm_args "$@"
  for i in 1 2 3 4 5; do
    if helm "\${HARGS[@]}" 2>&1 | tee "$f"; then rm -f "$f"; return 0; fi
    if [ $i = 5 ] || ! grep -qiE 'failed to fetch|failed to download|50[234]|gateway time-?out|tls handshake timeout|connection reset|i/o timeout|no such host|unexpected eof' "$f"; then rm -f "$f"; return 1; fi
    echo "  ↻ the chart could not be downloaded, retry $i/4 in 30 s" >&2; sleep 30
  done
}
`;

const HELM_NOTE = for4 => `case "$HELM_MAJOR" in
  3|4) [ "$HELM_MAJOR" = ${for4 ? 4 : 3} ] || echo "\${Y}Helm $HELM_MAJOR found; this folder was generated for Helm ${for4 ? 4 : 3}${for4 ? ": its Helm 4 flags are adapted (--wait=legacy -> --wait, no --force-conflicts)" : ""}.\${N}" ;;
  *) echo "\${R}Helm 3 or 4 is needed (found: $(helm version --short 2>/dev/null || echo none))\${N}"; exit 1 ;;
esac
`;

export function retryScript(text, {helm = "4"} = {}){
  if (!/^set -Eeuo pipefail$/m.test(text) || !/\nstep_0\(\) \{/.test(text)) return text;
  let t = text.replace('cd "$(dirname "$0")"\n', 'cd "$(dirname "$0")"\n' + FUNCS)
    .replace(/^(kubectl version --request-timeout=10s .*\n)/m, m => HELM_NOTE(helm !== "3") + m);
  t = inClusterCheck(t);
  t = t.replace(/^(\s*)helm (repo add|registry login|pull) /gm, "$1retry helm $2 ")
       .replace(/\|\| helm pull /g, "|| retry helm pull ")
       .replace(/^(\s*)helm upgrade --install /gm, "$1rhelm upgrade --install ")
       .replace(/^(\s*)kubectl apply (.*?)-f https:\/\//gm, "$1retry kubectl apply $2-f https://");
  return t;
}

// The cluster check and the context in the summary, with a kubeconfig or with the in-cluster ServiceAccount (#34)
export function inClusterCheck(text){
  return text
    .replace(/^kubectl version --request-timeout=10s >\/dev\/null 2>&1 \|\| /m,
      "kubectl get --raw /version --request-timeout=10s >/dev/null 2>&1 || ")
    .replace(/\$\(kubectl config current-context 2>\/dev\/null\)/g,
      "$(kubectl config current-context 2>/dev/null || echo 'in-cluster (ServiceAccount)')");
}

export function fixCollector(text){
  return text.replace(/(\$K -n "\$DX_NS" exec "\$WE" -c web-engine -- tar czf - -C "\$LIB\/logs" \. 2>\/dev\/null \| tar xzf - -C "\$OUT\/web-engine\/liberty-logs") \\\n\s*\|\| warn "could not copy the Liberty logs"/,
    `$1 2>/dev/null || true
  # tar exits 1 when a live log changes while it is read ("file changed as we read it"): check the copy instead
  [ -n "$(ls -A "$OUT/web-engine/liberty-logs" 2>/dev/null)" ] || warn "could not copy the Liberty logs"`);
}
