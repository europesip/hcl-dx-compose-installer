// Unit tests of the headless mode (#23): the library (src/headless.js) and the CLI (bin/dx-installer.mjs).
import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {generateInstall, schema, validateAnswers, shellSubst, VERSION, SCHEMA_VERSION} from "../src/headless.js";

// loaded after headless.js, so both use the same modules (and the same installer version in BUILD-INFO)
const {generate} = await import("../src/bundle.js");
const {DEFAULTS, applyPreset, SECRET_KEYS} = await import("../src/state.js");

const ROOT = path.resolve(import.meta.dirname, "..");
const CLI = path.join(ROOT, "bin/dx-installer.mjs");
const BASE = {DX_HOST: "dx.example.com", HCL_HARBOR_USER: "someone@example.com", dxcLicense: true};
const EXAMPLES = fs.readdirSync(path.join(ROOT, "docs/headless-examples")).map(f => [f, JSON.parse(fs.readFileSync(path.join(ROOT, "docs/headless-examples", f), "utf8"))]);
const textOf = (r, p) => (r.files[p] || r.secretFiles[p] || {}).text;
const stable = t => (t || "").replace(/\d{4}-\d\d-\d\d \d\d:\d\d/g, "<date>").replace(/\{SSHA\}[A-Za-z0-9+/=]+/g, "{SSHA}<salted>");   // salts are random

test("the version is the one of package.json", () => {
  assert.equal(VERSION, JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version);
});

test("secrets include: the same folder as the web wizard, for every preset", () => {
  const creds = {HCL_HARBOR_TOKEN: "harbor-token-123", OPENROUTER_API_KEY: "sk-or-v1-secret", LAB_PASSWORD: "Lab-Passw0rd"};
  for (const preset of ["webinar", "all", "custom"]) {
    const answers = {preset, ...BASE, ...creds};
    const h = generateInstall({answers, secrets: "include"});
    const w = generate(applyPreset({...DEFAULTS, ...answers}, preset), "en");
    assert.ok(h.ok, preset + ": " + h.check.err.join("; "));
    const names = w.entries.map(e => e.name.replace(/^dx-install\//, "")).sort();
    assert.deepEqual(Object.keys({...h.files, ...h.secretFiles}).sort(), names, preset);
    for (const e of w.entries) assert.equal(stable(textOf(h, e.name.replace(/^dx-install\//, ""))), stable(e.text), `${preset}: ${e.name}`);
  }
});

test("secrets omit: no secret value in the files meant for Git", () => {
  for (const preset of ["webinar", "all", "custom"]) {
    const r = generateInstall({answers: {preset, ...BASE}});
    assert.ok(r.ok, preset + ": " + r.check.err.join("; "));
    const env = r.secretFiles["secrets.env"].text;
    const values = [...env.matchAll(/^export \w+='([^']+)'$/gm)].map(m => m[1]).filter(v => !v.startsWith("PUT-YOUR-"));
    assert.ok(values.length >= 2, "generated password and LiteLLM key");
    for (const [p, f] of Object.entries(r.files)) for (const v of values) assert.ok(!f.text?.includes(v), `${preset}: ${p} holds a secret`);
    assert.ok(!Object.values(r.files).some(f => /\{SSHA\}[A-Za-z0-9+/=]{8,}/.test(f.text || "")), "no password hash in Git files");
    for (const s of ["install.sh", "prepare.sh", "demo.sh"]) if (r.files[s]) {
      assert.match(r.files[s].text, /secrets\.env/, `${s} reads secrets.env`);
      assert.equal(spawnSync("bash", ["-n"], {input: r.files[s].text}).status, 0, `${preset}: ${s} is valid bash`);
    }
    assert.ok(r.files["RUNBOOK.md"], "the RUNBOOK goes to Git");
    assert.match(r.runbook, /secrets\.env/);
    assert.deepEqual(r.generatedPasswords, ["LAB_PASSWORD"]);
    assert.notEqual(env.match(/DX_LAB_PASSWORD='([^']+)'/)[1], DEFAULTS.LAB_PASSWORD, "never the documented default");
  }
});

test("secrets omit: the HCL Harbor CLI secret is filled in secrets.env, not in the scripts", () => {
  const r = generateInstall({answers: {preset: "all", ...BASE}});
  assert.match(r.secretFiles["secrets.env"].text, /^export HCL_HARBOR_TOKEN='PUT-YOUR-HCL-HARBOR-CLI-SECRET-HERE'$/m);
  assert.doesNotMatch(r.files["install.sh"].text, /PUT-YOUR-HCL-HARBOR/);
  assert.match(r.files["install.sh"].text, /\$\{HCL_HARBOR_TOKEN\}/);
});

test("secrets omit refuses credentials in the answers", () => {
  for (const k of SECRET_KEYS) {
    const r = generateInstall({answers: {preset: "all", ...BASE, [k]: "some-secret-value"}});
    assert.equal(r.ok, false, k);
    assert.match(r.check.err.join(" "), new RegExp(k));
  }
});

test("answers are validated: unknown keys, types, values, schema version, preset", () => {
  assert.match(validateAnswers({preset: "all", foo: 1}).join(), /unknown answer: foo/);
  assert.match(validateAnswers({preset: "all", lab3: "yes"}).join(), /lab3 must be true or false/);
  assert.match(validateAnswers({preset: "all", platform: "nomad"}).join(), /platform must be one of/);
  assert.match(validateAnswers({preset: "all", schemaVersion: 99}).join(), /schemaVersion 99/);
  assert.match(validateAnswers({DX_HOST: "x"}).join(), /preset is required/);
  assert.match(validateAnswers([]).join(), /object/);
  assert.throws(() => generateInstall({answers: {preset: "all"}, lang: "fr"}), /lang/);
});

test("the schema has every answer of the form, and the documented examples are valid", () => {
  const s = schema();
  assert.equal(s.properties.schemaVersion.const, SCHEMA_VERSION);
  for (const k of Object.keys(DEFAULTS)) if (k !== "envConfirmed") assert.ok(s.properties[k], k);
  for (const k of SECRET_KEYS) assert.equal(s.properties[k].writeOnly, true, k);
  for (const [f, answers] of EXAMPLES) {
    assert.deepEqual(validateAnswers(answers), [], f);
    const r = generateInstall({answers});
    assert.ok(r.ok, `${f}: ${r.check.err.join("; ")}`);
  }
});

test("shellSubst keeps the quoting valid", () => {
  assert.equal(shellSubst(`-w 'PW' -d '{"p":"PW"}' X="PW" Y=PW`, "PW", "V"), `-w ''"\${V}"'' -d '{"p":"'"\${V}"'"}' X="\${V}" Y="\${V}"`);
});

test("CLI: generate to a folder or a zip, schema, version and exit codes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dxh-"));
  const answers = path.join(dir, "answers.json");
  fs.writeFileSync(answers, JSON.stringify({preset: "all", ...BASE}));
  const run = (...a) => spawnSync(process.execPath, [CLI, ...a], {encoding: "utf8"});
  let r = run("generate", "--answers", answers, "--out", path.join(dir, "out"));
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(dir, "out/install.sh")));
  assert.equal(fs.statSync(path.join(dir, "out/secrets.env")).mode & 0o077, 0, "secrets.env is private");
  assert.match(r.stdout, /Files with secrets/);
  r = run("generate", "--answers", answers, "--zip", path.join(dir, "x.zip"));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(path.join(dir, "x.zip")).subarray(0, 2).toString(), "PK");
  fs.writeFileSync(answers, JSON.stringify({preset: "all", HCL_HARBOR_TOKEN: "x"}));
  r = run("generate", "--answers", answers, "--zip", path.join(dir, "y.zip"));
  assert.equal(r.status, 1); assert.match(r.stderr, /HCL_HARBOR_TOKEN is a secret/);
  assert.equal(run("generate", "--answers", answers).status, 2);
  assert.equal(JSON.parse(run("schema").stdout).title, "DX Installer Wizard answers");
  assert.equal(run("--version").stdout.trim(), VERSION);
  fs.rmSync(dir, {recursive: true, force: true});
});
