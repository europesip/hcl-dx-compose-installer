// What the installer downloads, built on the wizard engine (src/engine/wizard-engine.js):
//   - the dx-install/ zip of option C (install.sh, uninstall.sh, RUNBOOK.md and every file filled
//     in), plus the Word guide inside it;
//   - RUNBOOK.md on its own;
//   - the Word guide on its own (src/word.js).
import {createEngine} from "./engine/wizard-engine.js";
import {toEngineState, SECRET_KEYS} from "./state.js";

export const engine = createEngine();
export const ZIP_NAME = "dx-compose-labs-install.zip";
export const WORD_NAME_EN = "DX-Compose-installation-guide.docx";
export const WORD_NAME_ES = "Guia-de-instalacion-DX-Compose.docx";

export function generate(form, lang){
  engine.setLang(lang);
  const s = toEngineState(form);
  const check = engine.validate(s);
  engine.ensureLitellmKey();                 // the same key in every file of this page load
  const files = engine.bundleFiles(s);
  const steps = engine.directSteps(s);
  const entries = engine.buildDirectZip(s);  // [{name: "dx-install/...", text, mode}]
  const runbook = entries.find(e => e.name === "dx-install/RUNBOOK.md").text;
  return {s, check, files, steps, entries, runbook, litellmKey: engine.litellmKey};
}

// Values that must not appear in a document meant to be shared
export function secretValues(s){
  const v = SECRET_KEYS.map(k => s[k]).filter(x => x && String(x).length >= 4);
  if (engine.litellmKey) v.push(engine.litellmKey);
  return [...new Set(v)].sort((a, b) => b.length - a.length);
}
export function maskText(text, values){
  let t = text;
  for (const v of values) t = t.split(v).join("********");
  return t;
}

// Which template a generated file comes from ("# Based on <path> (hcl-dx-compose-labs)")
export const sourceOf = text => (text.match(/^# Based on (\S+) \(hcl-dx-compose-labs\)/m) || [])[1] || "";

// The values a file sets compared with the lab template: the lines that are new or changed
// (comments and blank lines left out), with the template line they replace when there is one.
export function keyChanges(text){
  const src = sourceOf(text), tpl = src && engine.TPL[src];
  if (!tpl) return [];
  const norm = l => l.trim();
  const isCode = l => norm(l) && !norm(l).startsWith("#");
  const before = new Set(tpl.split("\n").filter(isCode).map(norm));
  const keyOf = l => { const m = norm(l).match(/^(-\s*)?([^:=\s]+)\s*[:=]/); return m ? m[2] : ""; };
  const byKey = new Map();
  for (const l of tpl.split("\n").filter(isCode)) { const k = keyOf(l); if (k && !byKey.has(k)) byKey.set(k, norm(l)); }
  const out = [];
  for (const l of text.split("\n").filter(isCode)) {
    if (before.has(norm(l))) continue;
    const k = keyOf(l);
    out.push({line: norm(l), was: (k && byKey.get(k)) || ""});
  }
  return out;
}

// Steps that create credentials or keys: secrets, certificates, registry logins, keys
export const isSecretStep = st => !st.opt && /kubectl (apply -f \S*secret|create secret)|kind: Secret|htpasswd|openssl|registry login|ssha|master.?key/i.test(st.cmd);

// ZIP (stored, no compression) that also takes binary files (the Word guide)
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b){ let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
export function zipBytes(files){
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  const d = new Date(), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF,
        dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  for (const f of files) {
    const name = enc.encode(f.name), data = f.data instanceof Uint8Array ? f.data : enc.encode(f.text ?? ""), crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dt, true); lh.setUint16(12, dd, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 0x0314, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true); ch.setUint16(12, dt, true); ch.setUint16(14, dd, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
    ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true);
    ch.setUint32(38, (f.mode || 0o100644) << 16 >>> 0, true); ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), name);
    off += 30 + name.length + data.length;
  }
  const csize = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, csize, true); end.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0)); let p = 0;
  for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

export function download(name, data, type){
  const blob = data instanceof Blob ? data : new Blob([data], {type});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
