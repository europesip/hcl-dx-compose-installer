// Unit tests (node --test): the wizard engine loads, the form maps to its state, the zip has the
// expected content, and the Word guide is valid and hides the credentials.
import {test} from "node:test";
import assert from "node:assert/strict";
import {DEFAULTS, normalise, toEngineState, gates} from "../src/state.js";
import {generate, zipBytes, keyChanges, maskText, secretValues, isSecretStep} from "../src/bundle.js";
import {buildWord} from "../src/word.js";

const ALL = {DX_HOST: "dx.example.com", depPg: true, depMcp: true, lab1b: true, lab3b: true, iqdb: true, iqrag: true, lab5: true,
  dxcLicense: true, HCL_HARBOR_USER: "someone@example.com", HCL_HARBOR_TOKEN: "harbor-token-123", OPENROUTER_API_KEY: "sk-or-v1-secret", LAB_PASSWORD: "Lab-Passw0rd"};

test("defaults are valid once a host is given", () => {
  const g = generate(normalise({...DEFAULTS, DX_HOST: "dx.example.com"}), "en");
  assert.deepEqual(g.check.err, []);
  assert.ok(g.entries.some(e => e.name === "dx-install/install.sh"));
  assert.ok(g.entries.some(e => e.name === "dx-install/RUNBOOK.md"));
});

test("an empty host is an error, in both languages", () => {
  assert.match(generate(normalise({...DEFAULTS}), "en").check.err.join(" "), /host name/i);
  assert.match(generate(normalise({...DEFAULTS}), "es").check.err.join(" "), /host/i);
});

test("gates switch off what lost its dependency", () => {
  const f = normalise({...DEFAULTS, ...ALL, depPg: false});
  assert.equal(f.iqdb, false); assert.equal(f.iqrag, false); assert.equal(f.lab5, false);
  assert.equal(gates(f).lab5, "needPg");
  assert.equal(normalise({...DEFAULTS, depLdap: false}).dir, "none");
});

test("PoC gets the nip.io host by default", () => {
  assert.equal(toEngineState({...DEFAULTS, platform: "poc"}).DX_HOST, "dx-demo.127.0.0.1.nip.io");
});

test("all labs: steps and files of every lab", () => {
  const g = generate(normalise({...DEFAULTS, ...ALL}), "en");
  assert.deepEqual(g.check.err, []);
  const names = g.entries.map(e => e.name);
  for (const f of ["1-dx/custom-values.yaml", "2a-ldap/demo-users.ldif", "3-iq/custom-iq-values.rag.yaml", "4-search/custom-values.search.yaml", "5-orbita/secrets.yaml"])
    assert.ok(names.includes("dx-install/" + f), f);
  const labs = new Set(g.steps.map(s => s.lab));
  for (const l of ["Lab 1 · Base DX", "Lab 4 · Search"]) assert.ok(labs.has(l), l);
  assert.ok(g.steps.some(isSecretStep));
  const install = g.entries.find(e => e.name === "dx-install/install.sh");
  assert.equal(install.mode, 0o100755);
});

test("key changes are found against the lab template", () => {
  const g = generate(normalise({...DEFAULTS, ...ALL, DX_HOST: "portal.acme.com", SC_RWO: "fast-rwo"}), "en");
  const ch = keyChanges(g.files["1-dx/custom-values.yaml"].text);
  assert.ok(ch.some(c => c.line.includes("portal.acme.com")));
  assert.ok(ch.some(c => c.line.includes("fast-rwo")));
});

test("zip is a valid archive with every entry", () => {
  const g = generate(normalise({...DEFAULTS, ...ALL}), "en");
  const z = zipBytes([...g.entries, {name: "dx-install/x.bin", data: new Uint8Array([1, 2, 3])}]);
  const dv = new DataView(z.buffer);
  assert.equal(dv.getUint32(0, true), 0x04034b50);
  const end = z.length - 22;
  assert.equal(dv.getUint32(end, true), 0x06054b50);
  assert.equal(dv.getUint16(end + 10, true), g.entries.length + 1);
});

test("masking hides every credential", () => {
  const g = generate(normalise({...DEFAULTS, ...ALL}), "en");
  const vals = secretValues(g.s);
  const all = g.entries.map(e => e.text).join("\n");
  assert.ok(all.includes("harbor-token-123"));
  const masked = maskText(all, vals);
  for (const v of ["harbor-token-123", "sk-or-v1-secret", "Lab-Passw0rd", g.litellmKey]) assert.ok(!masked.includes(v), v);
});

test("Word guide: valid docx, masked by default, plain on request", async () => {
  const {unzipSync, strFromU8} = await import("./unzip.mjs");
  for (const lang of ["en", "es"]) {
    const g = generate(normalise({...DEFAULTS, ...ALL}), lang);
    const rows = [["Host", g.s.DX_HOST]];
    const masked = await buildWord(g, lang, rows, {as: "buffer"});
    const xm = strFromU8(unzipSync(new Uint8Array(masked))["word/document.xml"]);
    assert.ok(xm.includes(lang === "es" ? "Guía de instalación" : "installation guide"));
    for (const v of ["harbor-token-123", "sk-or-v1-secret", "Lab-Passw0rd"]) assert.ok(!xm.includes(v), v);
    const plain = await buildWord(g, lang, rows, {mask: false, as: "buffer"});
    assert.ok(strFromU8(unzipSync(new Uint8Array(plain))["word/document.xml"]).includes("harbor-token-123"));
  }
});
