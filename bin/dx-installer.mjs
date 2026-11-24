#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 EUROPESIP
// DX Installer Wizard, headless (#23): the installation folder from a JSON file with the wizard answers, without the web UI.
//
//   dx-installer generate --answers answers.json [--lang en|es] [--secrets omit|include] (--out DIR | --zip FILE)
//   dx-installer schema                 the JSON Schema of the answers
//   dx-installer --version
//
// With --out, the files that hold secrets go to DIR too, and their names are printed: keep them out of Git.
// Exit code: 0 ok, 1 the answers or the folder have errors, 2 wrong usage.
import fs from "node:fs";
import path from "node:path";
import {generateInstall, schema, VERSION} from "../src/headless.js";

const USAGE = `Usage:
  dx-installer generate --answers <answers.json> [--lang en|es] [--secrets omit|include] (--out <dir> | --zip <file.zip>)
  dx-installer schema
  dx-installer --version`;

function args(argv){
  const o = {_: []};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) { const k = a.slice(2); if (["help", "version"].includes(k)) o[k] = true; else o[k] = argv[++i]; }
    else o._.push(a);
  }
  return o;
}
const fail = (msg, code = 2) => { console.error(msg); process.exit(code); };

const o = args(process.argv.slice(2));
if (o.version) { console.log(VERSION); process.exit(0); }
if (o.help || !o._.length) { console.log(USAGE); process.exit(o.help ? 0 : 2); }

if (o._[0] === "schema") { console.log(JSON.stringify(schema(), null, 2)); process.exit(0); }
if (o._[0] !== "generate") fail(USAGE);
if (!o.answers) fail("--answers is required\n" + USAGE);
if (!!o.out === !!o.zip) fail("give exactly one of --out or --zip\n" + USAGE);

let answers;
try { answers = JSON.parse(fs.readFileSync(o.answers, "utf8")); }
catch (e) { fail(`cannot read ${o.answers}: ${e.message}`); }

let r;
try { r = generateInstall({answers, lang: o.lang || "en", secrets: o.secrets || "omit"}); }
catch (e) { fail(e.message); }
for (const w of r.check.warn) console.error(`warning: ${w}`);
if (!r.ok) { for (const e of r.check.err) console.error(`error: ${e}`); process.exit(1); }

if (o.zip) {
  fs.writeFileSync(o.zip, r.zip);
  console.log(`${o.zip}: the dx-install/ folder (installer ${VERSION})`);
} else {
  const all = {...r.files, ...r.secretFiles};
  for (const [p, f] of Object.entries(all)) {
    const dest = path.join(o.out, p);
    fs.mkdirSync(path.dirname(dest), {recursive: true});
    fs.writeFileSync(dest, f.text ?? "");
    const mode = f.mode ? f.mode & 0o777 : (/\.sh$/.test(p) ? 0o755 : 0o644);
    fs.chmodSync(dest, r.secretFiles[p] ? mode & 0o700 : mode);
  }
  console.log(`${o.out}: ${Object.keys(all).length} files (installer ${VERSION})`);
  if (Object.keys(r.secretFiles).length) {
    console.log("Files with secrets (keep them out of Git):");
    for (const p of Object.keys(r.secretFiles)) console.log(`  ${p}`);
  }
}
