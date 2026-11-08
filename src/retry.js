// Robustness of the generated scripts (output layer, the engine stays as the golden test expects):
//   - downloads are retried: GitHub releases, Helm repositories and registries sometimes answer 503/504 for a while
//     (it happened on 2026-11-08). "retry" repeats a download command; "rhelm" repeats a helm upgrade only when it
//     failed because of a download error, never when the installation itself failed;
//   - the support data collector no longer warns "could not copy the Liberty logs" when they were copied: tar exits 1
//     when a live log changes while it is read.

const FUNCS = `# Downloads are retried (GitHub, Helm repositories and registries answer 503/504 at times); arguments are not printed
retry() { local i; for i in 1 2 3 4 5; do if "$@"; then return 0; fi; [ $i = 5 ] && return 1; echo "  ↻ download failed, retry $i/4 in 20 s" >&2; sleep 20; done; }
rhelm() {   # helm upgrade: retried only when the chart could not be downloaded
  local i f; f=$(mktemp)
  for i in 1 2 3 4 5; do
    if helm "$@" 2>&1 | tee "$f"; then rm -f "$f"; return 0; fi
    if [ $i = 5 ] || ! grep -qiE 'failed to fetch|failed to download|50[234]|gateway time-?out|tls handshake timeout|connection reset|i/o timeout|no such host|unexpected eof' "$f"; then rm -f "$f"; return 1; fi
    echo "  ↻ the chart could not be downloaded, retry $i/4 in 30 s" >&2; sleep 30
  done
}
`;

export function retryScript(text){
  if (!/^set -Eeuo pipefail$/m.test(text) || !/\nstep_0\(\) \{/.test(text)) return text;
  let t = text.replace('cd "$(dirname "$0")"\n', 'cd "$(dirname "$0")"\n' + FUNCS);
  t = t.replace(/^(\s*)helm (repo add|registry login|pull) /gm, "$1retry helm $2 ")
       .replace(/\|\| helm pull /g, "|| retry helm pull ")
       .replace(/^(\s*)helm upgrade --install /gm, "$1rhelm upgrade --install ")
       .replace(/^(\s*)kubectl apply (.*?)-f https:\/\//gm, "$1retry kubectl apply $2-f https://");
  return t;
}

export function fixCollector(text){
  return text.replace(/(\$K -n "\$DX_NS" exec "\$WE" -c web-engine -- tar czf - -C "\$LIB\/logs" \. 2>\/dev\/null \| tar xzf - -C "\$OUT\/web-engine\/liberty-logs") \\\n\s*\|\| warn "could not copy the Liberty logs"/,
    `$1 2>/dev/null || true
  # tar exits 1 when a live log changes while it is read ("file changed as we read it"): check the copy instead
  [ -n "$(ls -A "$OUT/web-engine/liberty-logs" 2>/dev/null)" ] || warn "could not copy the Liberty logs"`);
}
