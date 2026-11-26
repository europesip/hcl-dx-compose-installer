// SPDX-License-Identifier: MIT
// Copyright (c) 2026 EUROPESIP
// DX settings of the Advanced section (#3): time zone of the DX containers and the HCL prerequisites checker
import {test} from "node:test";
import assert from "node:assert/strict";
import {generateInstall, validateAnswers, schema} from "../src/headless.js";
import {tzValid, tzError, applyDxConfig, dxConfigMd} from "../src/dxconfig.js";
import {DEFAULTS} from "../src/state.js";
import {engine} from "../src/bundle.js";

const ANS = {preset: "custom", DX_HOST: "dx.example.com"};
const values = r => r.files["lab-base/custom-values.yaml"].text;
const search = r => r.files["lab-search/custom-search-values.yaml"].text;

test("defaults: Europe/Madrid and the checker on, as before, with the correct comment", () => {
  assert.equal(DEFAULTS.DX_TIMEZONE, "Europe/Madrid");
  assert.equal(DEFAULTS.prereqsChecker, true);
  const r = generateInstall({answers: ANS});
  assert.ok(r.ok, r.check.err.join("\n"));
  const v = values(r);
  assert.match(v, /^ {2}containerTimezone: "Europe\/Madrid"/m);
  assert.match(v, /^ {2}prereqsChecker:\n {4}enabled: true$/m);
  assert.doesNotMatch(v, /before each pod starts/);   // the wrong comment of the labs is gone
  assert.match(v, /# HCL prerequisites checker: a sidecar \(prereqs-checker\)[\s\S]*every day at 08:00[\s\S]*kubectl logs <pod> -c prereqs-checker\): it never blocks a pod\. true is the chart default\./);
  assert.match(v, /DAM Staging or WCM syndication, every DX deployment must use the same time zone/);
  assert.match(search(r), /^ {2}containerTimezone: "Europe\/Madrid"/m);
  assert.equal((v.match(/containerTimezone:/g) || []).length, 1);
  assert.equal((v.match(/prereqsChecker:/g) || []).length, 1);
});

test("another time zone and the checker off: DX and Search values, RUNBOOK and BUILD-INFO", () => {
  const r = generateInstall({answers: {...ANS, DX_TIMEZONE: "UTC", prereqsChecker: false}});
  assert.ok(r.ok, r.check.err.join("\n"));
  assert.match(values(r), /^ {2}containerTimezone: "UTC"/m);
  assert.match(values(r), /^ {2}prereqsChecker:\n {4}enabled: false$/m);
  assert.match(search(r), /^ {2}containerTimezone: "UTC"   # the same as DX/m);
  assert.match(r.runbook, /## DX settings: time zone and prerequisites checker[\s\S]*`UTC`[\s\S]*checker:\*\* off[\s\S]*WCM syndication\*\* or \*\*DAM Staging/);
  assert.match(r.files["BUILD-INFO.txt"].text, /dx\.settings {7}: containerTimezone UTC · prereqsChecker off/);
  // the Search values keep the adminDN the engine inserts before containerTimezone
  assert.match(search(r), /adminDN: [\s\S]*containerTimezone: "UTC"/);
});

test("every preset and runtime gets the settings (webinar, basic, DX Core, PoC)", () => {
  for (const a of [{preset: "webinar", DX_HOST: "dx.example.com"}, {preset: "basic", DX_HOST: "dx.example.com", DX_NS: "dx-basic-1"},
    {preset: "custom", DX_RUNTIME: "core", DX_HOST: "dx.example.com"}, {preset: "custom", platform: "poc"}]) {
    const r = generateInstall({answers: {...a, DX_TIMEZONE: "America/New_York", prereqsChecker: false}});
    assert.ok(r.ok, JSON.stringify(a) + r.check.err.join("\n"));
    assert.match(values(r), /containerTimezone: "America\/New_York"[\s\S]*prereqsChecker:\n {4}enabled: false/, JSON.stringify(a));
  }
  const es = generateInstall({answers: {...ANS, prereqsChecker: false}, lang: "es"});
  assert.match(es.runbook, /## Ajustes de DX: zona horaria y comprobador de requisitos[\s\S]*desactivado[\s\S]*sindicación de WCM/);
});

test("time zone validation: IANA names only, a clear message in both languages", () => {
  for (const z of ["UTC", "Europe/Madrid", "Europe/London", "America/New_York", "America/Argentina/Buenos_Aires", "Etc/GMT+1", "Asia/Kolkata"]) assert.ok(tzValid(z), z);
  for (const z of ["", "europe/madrid", "+01:00", "Mars/Base", "Europe/Madrid; rm -rf /", "Europe/Madrid\"", "UTC "]) assert.ok(!tzValid(z), z);
  assert.equal(tzError({DX_TIMEZONE: " UTC "}), "");   // trimmed
  assert.match(tzError({DX_TIMEZONE: "Mars/Base"}), /"Mars\/Base" is not a valid time zone/);
  assert.match(tzError({DX_TIMEZONE: "Mars/Base"}, "es"), /no es una zona horaria válida/);
  assert.match(tzError({DX_TIMEZONE: ""}), /Enter the time zone/);
  assert.ok(validateAnswers({...ANS, DX_TIMEZONE: "Mars/Base"}).some(e => /^DX_TIMEZONE: .*not a valid time zone/.test(e)));
  const r = generateInstall({answers: {...ANS, DX_TIMEZONE: "europe/madrid"}});
  assert.equal(r.ok, false);
  assert.ok(validateAnswers({...ANS, prereqsChecker: "no"}).some(e => /prereqsChecker must be true or false/.test(e)));
  const p = schema().properties;
  assert.equal(p.DX_TIMEZONE.default, "Europe/Madrid");
  assert.equal(p.prereqsChecker.default, true);
});

test("the layer only touches the output: the frozen engine keeps the labs values", () => {
  const t = engine.TPL["lab1-dx-base/custom-values.yaml"];
  assert.match(t, /containerTimezone: "Europe\/Madrid"[\s\S]*before each pod starts\n {2}prereqsChecker:\n {4}enabled: true/);
  const out = applyDxConfig({DX_TIMEZONE: "UTC", prereqsChecker: false}, {"lab-base/custom-values.yaml": {text: t}, "other.yaml": {text: "containerTimezone: \"Europe/Madrid\""}});
  assert.match(out["lab-base/custom-values.yaml"].text, /containerTimezone: "UTC"[\s\S]*enabled: false/);
  assert.equal(out["other.yaml"].text, "containerTimezone: \"Europe/Madrid\"");
  assert.match(dxConfigMd({}, "en"), /`Europe\/Madrid`[\s\S]*checker:\*\* on/);
});
