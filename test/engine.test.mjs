// Unit tests (node --test): presets, dependencies, stages and numbering, the webinar phases, the zip,
// masking, and the Word script of the webinar.
import {test} from "node:test";
import assert from "node:assert/strict";
import {DEFAULTS, normalise, applyPreset, toEngineState, depsOf} from "../src/state.js";
import {generate, zipBytes, keyChanges, maskText, secretValues, isSecretStep, filesOfStep} from "../src/bundle.js";
import {buildWord} from "../src/word.js";
import {estimate} from "../src/aws.js";

const CREDS = {DX_HOST: "dx.example.com", HCL_HARBOR_USER: "someone@example.com", HCL_HARBOR_TOKEN: "harbor-token-123", OPENROUTER_API_KEY: "sk-or-v1-secret", LAB_PASSWORD: "Lab-Passw0rd", dxcLicense: true};
const make = (preset, extra = {}, lang = "en") => generate(applyPreset({...DEFAULTS, ...CREDS, ...extra}, preset), lang);

test("an empty host is an error, in both languages", () => {
  assert.match(generate(applyPreset({...DEFAULTS}, "webinar"), "en").check.err.join(" "), /host name/i);
  assert.match(generate(applyPreset({...DEFAULTS}, "webinar"), "es").check.err.join(" "), /host/i);
});

test("dependencies follow the stages", () => {
  assert.deepEqual(depsOf(applyPreset(DEFAULTS, "webinar")), {ldap: true, pg: true, llm: true, mcp: false});
  assert.deepEqual(depsOf(applyPreset(DEFAULTS, "all")), {ldap: true, pg: true, llm: true, mcp: true});
  const f = normalise({...DEFAULTS, preset: "custom", lab3: false, lab3b: true, iqdb: true, iqrag: true});
  assert.equal(f.lab3b, false); assert.equal(f.iqdb, false); assert.equal(f.iqrag, false);
  assert.deepEqual(depsOf({...f, db: "none", dir: "none"}), {ldap: false, pg: false, llm: false, mcp: false});
});

test("PoC gets the nip.io host by default", () => {
  assert.equal(toEngineState({...DEFAULTS, platform: "poc"}).DX_HOST, "dx-demo.127.0.0.1.nip.io");
});

test("everything: stages 0 to 6, extras named, new ids", () => {
  const g = make("all");
  assert.deepEqual(g.check.err, []);
  assert.deepEqual([...new Set(g.steps.map(s => s.stage))], [0, 1, 2, 3, 4, 5, 6]);
  assert.ok(g.steps.every(s => /^[0-6]-\d+$/.test(s.id)));
  assert.ok(g.steps.some(s => s.extra && s.title.startsWith("Extra · ")));
  assert.equal(g.steps.find(s => s.origId === "4-2").stage, 5);
  const names = g.entries.map(e => e.name);
  for (const f of ["install.sh", "uninstall.sh", "RUNBOOK.md", "1-dx/custom-values.yaml", "3-iq/custom-iq-values.rag.yaml", "5-orbita/secrets.yaml"]) assert.ok(names.includes("dx-install/" + f), f);
  const install = g.entries.find(e => e.name === "dx-install/install.sh");
  assert.equal(install.mode, 0o100755);
  assert.match(install.text, /IDS=\('0-1' /);
  assert.match(g.runbook, /### 4 · AI Assistant/);
});

test("webinar: two phases, no LiteLLM in the preparation, stages 0 to 5, no extras", () => {
  const g = make("webinar", {}, "es");
  assert.deepEqual(g.check.err, []);
  assert.ok(g.webinar);
  assert.ok(g.prep.every(s => /^P-\d+$/.test(s.id)));
  assert.ok(!g.prep.some(s => /litellm/i.test(s.title + s.cmd.replace(/secrets\.yaml/g, ""))), "no LiteLLM in the preparation");
  assert.ok(g.prep.some(s => /openldap/i.test(s.cmd)) && g.prep.some(s => /cnpg/.test(s.cmd)) && g.prep.some(s => /helm pull/.test(s.cmd)));
  assert.deepEqual([...new Set(g.demo.map(s => s.stage))], [0, 1, 2, 3, 4, 5]);
  assert.ok(g.demo.filter(s => s.stage === 0).some(s => s.origId === "D-5"), "LiteLLM in stage 0");
  assert.ok(!g.demo.some(s => s.extra));
  const names = g.entries.map(e => e.name);
  for (const f of ["prepare.sh", "demo.sh", "uninstall.sh", "RUNBOOK.md"]) assert.ok(names.includes("dx-install/" + f), f);
  assert.ok(!names.includes("dx-install/install.sh"));
  const demo = g.entries.find(e => e.name === "dx-install/demo.sh").text, prep = g.entries.find(e => e.name === "dx-install/prepare.sh").text;
  assert.match(demo, /PAUSE=1/); assert.match(demo, /VERIFY=1/); assert.match(prep, /PAUSE=0/);
  assert.match(prep, /Entorno preparado para la sesión/);
  assert.match(g.entries.find(e => e.name === "dx-install/uninstall.sh").text, /prepare\.sh" --cleanup/);
  assert.match(g.runbook, /Fase 1 · Preparación/); assert.match(g.runbook, /Fase 2 · La demo/);
});

test("key changes and the files of a step", () => {
  const g = make("webinar", {DX_HOST: "portal.acme.com", SC_RWO: "fast-rwo"});
  const ch = keyChanges(g.files["1-dx/custom-values.yaml"].text);
  assert.ok(ch.some(c => c.line.includes("portal.acme.com")));
  assert.ok(ch.some(c => c.line.includes("fast-rwo")));
  const inst = g.demo.find(s => s.origId === "1-4");
  assert.ok(filesOfStep(inst, g.files).includes("1-dx/custom-values.yaml"));
  assert.ok(g.steps.some(isSecretStep));
});

test("zip is a valid archive with every entry", () => {
  const g = make("all");
  const z = zipBytes([...g.entries, {name: "dx-install/x.bin", data: new Uint8Array([1, 2, 3])}]);
  const dv = new DataView(z.buffer);
  assert.equal(dv.getUint32(0, true), 0x04034b50);
  const end = z.length - 22;
  assert.equal(dv.getUint32(end, true), 0x06054b50);
  assert.equal(dv.getUint16(end + 10, true), g.entries.length + 1);
});

test("masking hides every credential", () => {
  const g = make("all");
  const all = g.entries.map(e => e.text).join("\n");
  assert.ok(all.includes("harbor-token-123"));
  const masked = maskText(all, secretValues(g.s));
  for (const v of ["harbor-token-123", "sk-or-v1-secret", "Lab-Passw0rd", g.litellmKey]) assert.ok(!masked.includes(v), v);
});

test("webinar Word script: purpose, EUROPESIP, date, stages, files, logos, masked by default", async () => {
  const {unzipSync, strFromU8} = await import("./unzip.mjs");
  const {readFileSync} = await import("node:fs");
  const logos = {europesip: new Uint8Array(readFileSync("public/brand/europesip.png")), hcl: new Uint8Array(readFileSync("public/brand/hcl-software.png"))};
  for (const lang of ["en", "es"]) {
    const g = make("webinar", {}, lang);
    const rows = [["Host", g.s.DX_HOST]];
    const z = unzipSync(new Uint8Array(await buildWord(g, lang, rows, {as: "buffer", logos})));
    const xm = strFromU8(z["word/document.xml"]);
    for (const x of lang === "es"
      ? ["Guion del webinar", "El propósito del webinar", "Sobre EUROPESIP", "12 de noviembre de 2026", "preparar tarde, rotar justo después", "Asistente de IA", "Valores que enseñar", "Diapositiva 12"]
      : ["Webinar script", "The purpose of the webinar", "About EUROPESIP", "12 November 2026", "prepare late, rotate right after", "AI Assistant", "Values to show", "Slide 12"])
      assert.ok(xm.includes(x), x);
    assert.ok(xm.includes("prepare.sh") && xm.includes("demo.sh"));
    assert.equal(Object.keys(z).filter(k => k.startsWith("word/media/")).length >= 2, true, "logos embedded");
    for (const v of ["harbor-token-123", "sk-or-v1-secret", "Lab-Passw0rd"]) assert.ok(!xm.includes(v), v);
    const plain = await buildWord(g, lang, rows, {mask: false, as: "buffer"});
    assert.ok(strFromU8(unzipSync(new Uint8Array(plain))["word/document.xml"]).includes("harbor-token-123"));
  }
});

test("AWS estimates are positive and ordered", () => {
  const e = estimate("ec2"), k = estimate("eks"), r = estimate("rosa");
  assert.ok(e.hour > 0.5 && e.hour < k.hour && k.hour < r.hour);
  assert.equal(Math.round(e.month), Math.round(e.hour * 730));
});

test("demo users can have their own password (LDIF and the chat as macarena), wpsadmin keeps its own", async () => {
  const {DEFAULTS: D, applyPreset: ap} = await import("../src/state.js");
  const g = generate(ap({...D, ...CREDS, demoSame: false, DEMO_PASSWORD: "Demo-Users-1"}, "all"), "en");
  const ldif = g.files["2a-ldap/demo-users.ldif"].text;
  assert.match(ldif, /hash of "Demo-Users-1"/);
  assert.match(g.files["1-dx/secrets.yaml"].text, /Lab-Passw0rd/);
  const ask = g.steps.find(s => s.origId === "5-3").cmd;
  assert.match(ask, /"username":"macarena","password":"Demo-Users-1"/);
  assert.ok(!maskText(g.entries.map(e => e.text).join("\n"), secretValues(g.s)).includes("Demo-Users-1"));
  const same = generate(ap({...D, ...CREDS}, "all"), "en");
  assert.match(same.files["2a-ldap/demo-users.ldif"].text, /hash of "Lab-Passw0rd"/);
});

test("PostgreSQL script: in the zip for EUROPESIP/HCL users, flagged as missing for the others", () => {
  assert.equal(make("webinar", {HCL_HARBOR_USER: "a@europesip.com"}).pgMissing, false);
  assert.ok(make("webinar", {HCL_HARBOR_USER: "a@europesip.com"}).entries.some(e => e.name.endsWith("setup-postgres-dx.sql")));
  const other = make("webinar", {HCL_HARBOR_USER: "someone@example.com"});
  assert.equal(other.pgMissing, true);
  assert.match(other.runbook, /table script from HCL/);
});
