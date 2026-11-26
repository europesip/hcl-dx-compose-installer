// SPDX-License-Identifier: MIT
// Copyright (c) 2026 EUROPESIP
// DX settings of the Advanced section (#3): the time zone of the DX containers and the HCL prerequisites checker.
// Both are values of the HCL charts (hcl-dx-deployment 2.50.0, CF239):
//   configuration.containerTimezone      sets TZ in every DX container (empty in the chart = UTC). hcl-dx-search 2.37.0
//                                        has the same value, so DX and Search are kept in the same zone.
//   configuration.prereqsChecker.enabled the prereqs-checker sidecar in the pods with volumes (DAM, Persistence Node):
//                                        it checks the volumes on a schedule (checkSchedule "0 8 * * *", every day at
//                                        08:00) and only writes the result to its log; it never blocks a pod. true is
//                                        the chart default.
// HCL warns in the chart values: with DAM Staging or WCM syndication, every deployment must use the same time zone.
//
// Output layer, like src/registry.js and src/basic.js: the frozen engine (core.js) keeps the values of the labs
// (Europe/Madrid, checker on) for the golden test; this layer writes the chosen ones and the correct comment of the
// checker. With the defaults the values are the same as before.

export const TZ_DEFAULT = "Europe/Madrid";
export const PREREQS_DEFAULT = true;
// Shown first in the suggestions of the wizard; the rest are the IANA zones the browser knows
export const TZ_SUGGESTIONS = ["Europe/Madrid", "UTC", "Europe/London", "Europe/Lisbon", "Europe/Paris", "Europe/Berlin", "America/New_York", "America/Chicago",
  "America/Los_Angeles", "America/Mexico_City", "America/Sao_Paulo", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney"];

// A name of the IANA database as the containers read it (/usr/share/zoneinfo, case-sensitive): one to three parts,
// each starting with a capital letter ("UTC", "Europe/Madrid", "America/Argentina/Buenos_Aires", "Etc/GMT+1").
// Offsets such as "+01:00" are refused: Intl accepts them, TZ in a container does not.
const TZ_RE = /^[A-Z][A-Za-z0-9_+-]*(\/[A-Z][A-Za-z0-9_+-]*){0,2}$/;
const knownZone = tz => { try { new Intl.DateTimeFormat("en-US", {timeZone: tz}); return true; } catch { return false; } };
export const tzOf = f => String(f?.DX_TIMEZONE ?? TZ_DEFAULT).trim();
export const prereqsOf = f => f?.prereqsChecker !== false;
export const tzValid = tz => TZ_RE.test(tz) && knownZone(tz);

export function tzSuggestions(){
  let all = [];
  try { all = Intl.supportedValuesOf("timeZone"); } catch { /* old browser: only the short list */ }
  return [...new Set([...TZ_SUGGESTIONS, ...all])];
}

const MSG = {
  en: {empty: "Enter the time zone of the DX containers (for example Europe/Madrid or UTC).",
       bad: tz => `"${tz}" is not a valid time zone: use an IANA name such as Europe/Madrid, Europe/London, America/New_York or UTC (case matters).`},
  es: {empty: "Indica la zona horaria de los contenedores de DX (por ejemplo Europe/Madrid o UTC).",
       bad: tz => `"${tz}" no es una zona horaria válida: usa un nombre IANA como Europe/Madrid, Europe/London, America/New_York o UTC (cuentan las mayúsculas).`},
};
/** The error of the time zone of the form, or "" when it is valid. */
export function tzError(f, lang = "en"){
  const m = MSG[lang] || MSG.en, tz = tzOf(f);
  return !tz ? m.empty : tzValid(tz) ? "" : m.bad(tz);
}

const ysq = v => `"${String(v).replace(/["\\]/g, "")}"`;
// The lines of the engine (labs) that this layer replaces
const DX_TZ_RE = /^(\s*)containerTimezone: "[^"\n]*"[^\n]*\n\s*# Container that validates the requirements[^\n]*\n(\s*)prereqsChecker:\n(\s*)enabled: (?:true|false)[^\n]*$/m;
const SEARCH_TZ_RE = /^(\s*)containerTimezone: "[^"\n]*"[^\n]*$/m;

const dxBlock = (sp, sp2, sp3, tz, on) => [
  `${sp}# Time zone of every DX container (TZ): logs and scheduled tasks follow it. Empty (chart default) = UTC.`,
  `${sp}# With DAM Staging or WCM syndication, every DX deployment must use the same time zone (HCL, chart values).`,
  `${sp}containerTimezone: ${ysq(tz)}   # any IANA time zone, e.g. "Europe/Madrid", "Europe/London", "UTC"`,
  `${sp}# HCL prerequisites checker: a sidecar (prereqs-checker) in the pods with volumes (DAM, Persistence Node). It checks`,
  `${sp}# the volumes on a schedule (checkSchedule "0 8 * * *", every day at 08:00) and only writes the result to its log`,
  `${sp}# (kubectl logs <pod> -c prereqs-checker): it never blocks a pod. true is the chart default.`,
  `${sp2}prereqsChecker:`,
  `${sp3}enabled: ${on ? "true" : "false"}`,
].join("\n");

/** Writes the time zone and the checker into the DX and Search values of the folder (files: {path: {text}}). */
export function applyDxConfig(f, files){
  const tz = tzOf(f) || TZ_DEFAULT, on = prereqsOf(f);
  const out = {...files};
  for (const [p, e] of Object.entries(files)) {
    if (typeof e?.text !== "string") continue;
    let t = e.text;
    if (p.endsWith("lab-base/custom-values.yaml")) t = t.replace(DX_TZ_RE, (m, sp, sp2, sp3) => dxBlock(sp, sp2, sp3, tz, on));
    else if (p.endsWith("lab-search/custom-search-values.yaml"))
      t = t.replace(SEARCH_TZ_RE, (m, sp) => `${sp}containerTimezone: ${ysq(tz)}   # the same as DX (lab-base/custom-values.yaml)`);
    if (t !== e.text) out[p] = {...e, text: t};
  }
  return out;
}

const TEXT = {
  en: {
    h: "## DX settings: time zone and prerequisites checker",
    tz: tz => `- **Time zone of the DX containers:** \`${tz}\` (\`configuration.containerTimezone\` in \`lab-base/custom-values.yaml\`, and the same in the Search values). It sets \`TZ\` in every DX container: logs and scheduled tasks follow it. Without it the containers run in UTC. Check it with \`kubectl -n <DX namespace> exec <pod> -- date\`.`,
    on: "- **HCL prerequisites checker:** on (`configuration.prereqsChecker.enabled: true`, the chart default). A sidecar (`prereqs-checker`) in the pods with volumes (DAM, Persistence Node) checks the volumes every day at 08:00 and only writes the result to its log: `kubectl logs <pod> -c prereqs-checker`. It never blocks a pod.",
    off: "- **HCL prerequisites checker:** off (`configuration.prereqsChecker.enabled: false`): the pods have no `prereqs-checker` sidecar, so nothing checks the volumes on a schedule. The chart default is on.",
    warn: "> ⚠️ With **WCM syndication** or **DAM Staging**, every DX environment (syndicator and subscribers, DAM source and target) must use the same time zone.",
  },
  es: {
    h: "## Ajustes de DX: zona horaria y comprobador de requisitos",
    tz: tz => `- **Zona horaria de los contenedores de DX:** \`${tz}\` (\`configuration.containerTimezone\` en \`lab-base/custom-values.yaml\`, y la misma en los values de Search). Fija \`TZ\` en todos los contenedores de DX: los logs y las tareas programadas la siguen. Sin ella los contenedores van en UTC. Compruébalo con \`kubectl -n <namespace de DX> exec <pod> -- date\`.`,
    on: "- **Comprobador de requisitos de HCL:** activado (`configuration.prereqsChecker.enabled: true`, el valor por defecto del chart). Un sidecar (`prereqs-checker`) en los pods con volúmenes (DAM, Persistence Node) comprueba los volúmenes cada día a las 08:00 y solo escribe el resultado en su log: `kubectl logs <pod> -c prereqs-checker`. Nunca bloquea un pod.",
    off: "- **Comprobador de requisitos de HCL:** desactivado (`configuration.prereqsChecker.enabled: false`): los pods no llevan el sidecar `prereqs-checker`, así que nada comprueba los volúmenes de forma periódica. El chart lo trae activado.",
    warn: "> ⚠️ Con **sindicación de WCM** o **DAM Staging**, todos los entornos de DX (sindicador y suscriptores, origen y destino del DAM) deben usar la misma zona horaria.",
  },
};

/** The RUNBOOK section of both settings, with the syndication / DAM Staging warning. */
export function dxConfigMd(f, lang){
  const t = TEXT[lang] || TEXT.en;
  return [t.h, "", t.tz(tzOf(f) || TZ_DEFAULT), prereqsOf(f) ? t.on : t.off, "", t.warn, ""].join("\n");
}

/** The same, as plain text for the webinar script (Word / PDF): {points, warn}. */
export function dxConfigScript(f, lang){
  const t = TEXT[lang] || TEXT.en, plain = x => x.replace(/^[->]\s*(⚠️\s*)?/, "").replace(/\*\*|`/g, "");
  return {points: [plain(t.tz(tzOf(f) || TZ_DEFAULT)), plain(prereqsOf(f) ? t.on : t.off)], warn: plain(t.warn)};
}

/** The line of BUILD-INFO.txt. */
export const dxConfigInfo = f => `dx.settings       : containerTimezone ${tzOf(f) || TZ_DEFAULT} · prereqsChecker ${prereqsOf(f) ? "on" : "off"}`;
