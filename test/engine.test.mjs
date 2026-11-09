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
  for (const f of ["install.sh", "uninstall.sh", "RUNBOOK.md", "lab-base/custom-values.yaml", "lab-iq/custom-iq-values.rag.yaml", "lab-orbita/secrets.yaml"]) assert.ok(names.includes("dx-install/" + f), f);
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
  const ch = keyChanges(g.files["lab-base/custom-values.yaml"].text);
  assert.ok(ch.some(c => c.line.includes("portal.acme.com")));
  assert.ok(ch.some(c => c.line.includes("fast-rwo")));
  const inst = g.demo.find(s => s.origId === "1-4");
  assert.ok(filesOfStep(inst, g.files).includes("lab-base/custom-values.yaml"));
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
  const ldif = g.files["lab-ldap/demo-users.ldif"].text;
  assert.match(ldif, /hash of "Demo-Users-1"/);
  assert.match(g.files["lab-base/secrets.yaml"].text, /Lab-Passw0rd/);
  const ask = g.steps.find(s => s.origId === "5-3").cmd;
  assert.match(ask, /"username":"macarena","password":"Demo-Users-1"/);
  assert.ok(!maskText(g.entries.map(e => e.text).join("\n"), secretValues(g.s)).includes("Demo-Users-1"));
  const same = generate(ap({...D, ...CREDS}, "all"), "en");
  assert.match(same.files["lab-ldap/demo-users.ldif"].text, /hash of "Lab-Passw0rd"/);
});

test("PostgreSQL script: in the zip for EUROPESIP/HCL users, flagged as missing for the others", () => {
  assert.equal(make("webinar", {HCL_HARBOR_USER: "a@europesip.com"}).pgMissing, false);
  assert.ok(make("webinar", {HCL_HARBOR_USER: "a@europesip.com"}).entries.some(e => e.name.endsWith("setup-postgres-dx.sql")));
  const other = make("webinar", {HCL_HARBOR_USER: "someone@example.com"});
  assert.equal(other.pgMissing, true);
  assert.match(other.runbook, /table script from HCL/);
});

test("AWS Bedrock: litellm-values with the existing model IDs and the region, the key in litellm-env, no Qwen or RAG", () => {
  for (const [region, pre] of [["us-east-1", "us"], ["eu-west-1", "eu"]]) {
    const g = make("all", {LLM_PROVIDER: "bedrock", BEDROCK_API_KEY: "bedrock-key-123", BEDROCK_REGION: region, IQ_LLM: "qwen"});
    const v = g.files["lab-iq/litellm-values.yaml"].text;
    assert.match(v, new RegExp(`model: bedrock/${pre}\\.anthropic\\.claude-sonnet-4-6\\n`));
    assert.match(v, new RegExp(`model: bedrock/${pre}\\.anthropic\\.claude-haiku-4-5-20251001-v1:0`));
    assert.match(v, new RegExp(`aws_region_name: ${region}`));
    assert.ok(!v.includes("20250514"), "not the wrong documented Sonnet ID");
    assert.ok(!/openrouter\.ai/.test(v.split("proxy_config:")[1]));
    assert.match(g.files["lab-iq/secrets.yaml"].text, /AWS_BEARER_TOKEN_BEDROCK: 'bedrock-key-123'/);
    assert.equal(g.s.IQ_LLM, "claude"); assert.equal(g.s.iqrag, false);
    assert.ok(!Object.keys(g.files).some(f => f.includes("qwen") || f.includes("rag")));
    assert.ok(!maskText(g.entries.map(e => e.text).join("\n"), secretValues(g.s)).includes("bedrock-key-123"));
  }
  assert.match(make("webinar").files["lab-iq/secrets.yaml"].text, /OPENROUTER_API_KEY/);   // OpenRouter stays the default
});

test("zip folders named after their content (lab-base, lab-ldap, lab-bbdd...), no numbered lab names", () => {
  for (const [p, extra] of [["all", {}], ["webinar", {}], ["custom", {dir: "ad", db: "oracle", platform: "poc"}]]) {
    const g = make(p, extra);
    const dirs = new Set(g.entries.map(e => e.name.split("/")[1]).filter(x => !/\./.test(x)));
    for (const d of dirs) assert.ok(/^(lab-[a-z-]+|support)$/.test(d), d);
    const text = g.entries.filter(e => !e.name.endsWith(".sql")).map(e => e.text).join("\n") + g.steps.map(s => s.cmd).join("\n");
    assert.ok(!/(^|[^\w.-])(0-poc|1-dx|1b-scriptapp|2a-ldap|2a-ad|2b-postgres|2b-oracle|3-iq|3b-mcp|4-search|5-orbita)\//m.test(text));
    assert.ok(!/\bLab [0-5][AB]?\b/.test(text));
  }
  assert.ok(make("custom", {dir: "ad", db: "oracle"}).files["lab-bbdd-oracle/custom-values.oracle.yaml"]);
  assert.match(make("all").runbook, /Documentation|HCL documentation/);
  assert.match(make("all").runbook, /help\.hcl-software\.com\/digital-experience\/dx-compose\/CF239\/deploy_dx\/manage\/cfg_webengine\/ldap_configuration/);
});

test("webinar Word: the installer that made it, the PostgreSQL script, the credentials and the HCL docs", async () => {
  const {unzipSync, strFromU8} = await import("./unzip.mjs");
  const xml = async (g, lang, o = {}) => strFromU8(unzipSync(new Uint8Array(await buildWord(g, lang, [["Host", g.s.DX_HOST]], {as: "buffer", ...o})))["word/document.xml"]);
  const inside = make("webinar", {HCL_HARBOR_USER: "a@europesip.com"}, "es"), outside = make("webinar", {}, "es");
  const a = await xml(inside, "es"), b = await xml(outside, "es"), plain = await xml(inside, "es", {mask: false});
  for (const x of ["Cómo se ha hecho este documento", "github.com/europesip/hcl-dx-compose-installer", "Contraseñas y credenciales", "dado que has escogido en el instalador que se oculten",
                   "se entiende que eres un usuario autorizado", "Incluido en el ZIP", "Documentación oficial de HCL", "DX Compose · LDAP configuration"]) assert.ok(a.includes(x), x);
  assert.ok(b.includes("No incluido: recuerda que debes solicitarlo") && b.includes("En tu caso no viene incluido"));
  assert.ok(!a.includes("Lab-Passw0rd") && plain.includes("Lab-Passw0rd") && plain.includes("Has escogido en el instalador que se muestren"));
  const en = await xml(make("webinar"), "en");
  for (const x of ["How this document was made", "Passwords and credentials", "HCL documentation"]) assert.ok(en.includes(x), x);
});

test("Claude directly (Anthropic API): LiteLLM values, secret, no Qwen/RAG, and the stage 0 text of the script", async () => {
  const g = make("all", {LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "sk-ant-key-123", IQ_LLM: "qwen", iqrag: true});
  const v = g.files["lab-iq/litellm-values.yaml"].text;
  assert.match(v, /model: anthropic\/claude-sonnet-4-6/); assert.match(v, /model: anthropic\/claude-haiku-4-5-20251001/);
  assert.match(v, /api_key: os.environ\/ANTHROPIC_API_KEY/); assert.ok(!/openrouter/i.test(v.replace(/^#.*$/gm, "")));
  assert.match(g.files["lab-iq/secrets.yaml"].text, /ANTHROPIC_API_KEY: 'sk-ant-key-123'/);
  assert.ok(!g.files["lab-iq/litellm-values.qwen.yaml"] && !g.files["lab-iq/custom-iq-values.rag.yaml"]);
  assert.ok(!maskText(g.entries.map(e => e.text).join("\n"), secretValues(g.s)).includes("sk-ant-key-123"));
  const {unzipSync, strFromU8} = await import("./unzip.mjs");
  const xml = async (gen, lang) => strFromU8(unzipSync(new Uint8Array(await buildWord(gen, lang, [], {as: "buffer"})))["word/document.xml"]);
  const es = await xml(make("webinar", {LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "sk-ant-key-123"}, "es"), "es");
  assert.ok(es.includes("los enruta al LLM escogido (Claude Sonnet 4.6 / Claude Haiku 4.5) a través de la API de Anthropic (Claude directo)"));
  assert.ok(es.includes("OpenRouter, AWS Bedrock o directamente Claude") && es.includes("mínimo de crédito"));
  const or = await xml(make("webinar", {}, "es"), "es");
  assert.ok(or.includes("a través de OpenRouter"));
  const br = await xml(make("webinar", {LLM_PROVIDER: "bedrock", BEDROCK_API_KEY: "bk-123456"}, "en"), "en");
  assert.ok(br.includes("routes them to the chosen LLM (Claude Sonnet 4.6 / Claude Haiku 4.5) through AWS Bedrock"));
});

test("MCP Server over HTTPS as documented by HCL; custom MCP servers stay on HTTP", () => {
  const g = make("all");
  const v = g.files["lab-iq/custom-iq-values.yaml"].text;
  assert.match(v, /\n  mcpServer:\n(?:    #.*\n)*    httpsEnabled: true\n    tlsCertSecret: "dx-tls-cert"\n/);
  const reg = g.steps.map(s => s.cmd).join("\n");
  assert.match(reg, /https:\/\/dx-iq-mcp-server:3000,http:\/\/europesip-mcp\./);
  assert.ok(!/http:\/\/dx-iq-mcp-server/.test(g.entries.map(e => e.text).join("\n")));
  const s = g.files["lab-search/custom-search-values.yaml"].text;
  assert.match(s, /fileProcessor: true/); assert.match(s, /haproxyProtocol: "?https"?/);
});

test("Word guide: important notes on LITELLM_BASE_URL, the documentation contradiction and Search", async () => {
  const {unzipSync, strFromU8} = await import("./unzip.mjs");
  for (const [lang, xs] of [["es", ["LITELLM_BASE_URL es OBLIGATORIA", "Contradicción en la documentación de HCL", "Usamos la segunda", "Activa el File Processor", "Protocolo del HAProxy", "Notas importantes"]],
                            ["en", ["LITELLM_BASE_URL is MANDATORY", "Contradiction in the HCL documentation", "We use the second option", "Enable the File Processor", "HAProxy protocol"]]]) {
    const xml = strFromU8(unzipSync(new Uint8Array(await buildWord(make("webinar", {}, lang), lang, [], {as: "buffer"})))["word/document.xml"]);
    for (const x of xs) assert.ok(xml.includes(x), x);
  }
});

test("scope disclaimer (#5) at the top of RUNBOOK.md and of the webinar script, in both languages", async () => {
  const {buildScript} = await import("../src/script.js");
  for (const [lang, title, asIs] of [["en", "what this installer is, and what it is not", "As is"], ["es", "qué es este instalador, y qué no es", "Tal cual"]]) {
    for (const preset of ["all", "webinar"]) {
      const g = make(preset, {}, lang);
      const head = g.runbook.split("\n").slice(0, 4).join("\n");
      assert.match(head, new RegExp(title), `${lang} ${preset} runbook`);
      assert.match(g.runbook, new RegExp(`\\*\\*${asIs}`));
      assert.equal(g.entries.find(e => e.name.endsWith("RUNBOOK.md")).text, g.runbook);
    }
    const blocks = buildScript(make("webinar", {}, lang), lang, []).blocks;
    const i = blocks.findIndex(b => b.t === "h1" && b.text.includes(title));
    assert.ok(i > 0 && i < blocks.findIndex(b => b.t === "h1" && b !== blocks[i]) + 1, `${lang} script`);
  }
});
