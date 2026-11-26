# Advanced options: DX container time zone and HCL prerequisites checker

Issue: #3 · Status: Implemented · Release: Unreleased

## Summary
The user chooses, in the **Advanced** section of the wizard, two DX settings that were fixed in the generated base
values: the time zone of the DX containers (default `Europe/Madrid`) and the HCL prerequisites checker (default on).
RUNBOOK.md and the webinar Word/PDF script explain both, with the HCL warning for WCM syndication and DAM Staging.

## Current behaviour
`lab-base/custom-values.yaml` (from `lab1-dx-base/custom-values.yaml` of the frozen engine, `src/engine/core.js`)
always had `configuration.containerTimezone: "Europe/Madrid"` and `configuration.prereqsChecker.enabled: true`, with a
wrong comment for the checker ("validates the requirements before each pod starts"). The Search values
(`lab-search/custom-search-values.yaml`) also had `containerTimezone: "Europe/Madrid"`.

Chart facts (hcl-dx-deployment 2.50.0, CF239, checked in the chart and with `helm template`):
- `configuration.containerTimezone` (chart default `""` = UTC) sets the env `TZ` in every DX container. HCL warns: with
  DAM Staging or WCM syndication, every deployment must use the same time zone. hcl-dx-search 2.37.0 has the same value.
- `configuration.prereqsChecker.enabled` (chart default `true`) adds the `prereqs-checker` sidecar to the pods with
  volumes (DAM, Persistence Node); `checkSchedule: "0 8 * * *"`; results only in its log; it never blocks a pod.

## Specification
- Wizard, details page, *Advanced › DX settings*:
  - *Time zone of the DX containers*: free text with suggestions (datalist: a short list first, then the IANA zones the
    browser knows), default `Europe/Madrid`. Valid = one to three parts, each starting with a capital letter, and known
    to `Intl` (so `UTC`, `Europe/Madrid`, `America/Argentina/Buenos_Aires`, `Etc/GMT+1`). Offsets (`+01:00`) and the
    wrong case (`europe/madrid`, TZ is case-sensitive in a container) are refused. An invalid value shows a clear
    message, keeps the Advanced section open and disables *Next*; `generate()` also adds it to `check.err`.
  - *HCL prerequisites checker*: checkbox, default on.
  - Each option has an (i) dialog; the time zone one carries the syndication / DAM Staging warning.
- Generated files (output layer `src/dxconfig.js`, applied right after the engine files are renamed):
  - `lab-base/custom-values.yaml`: `containerTimezone: "<tz>"` and `prereqsChecker.enabled: <bool>`, with correct
    comments (TZ, UTC when empty, the HCL warning; the checker as a scheduled sidecar, 08:00 daily, results in its log,
    never blocks a pod, chart default).
  - `lab-search/custom-search-values.yaml`: the same `containerTimezone` (comment "the same as DX").
  - RUNBOOK.md: section *DX settings: time zone and prerequisites checker* after *Resources*, with the warning.
  - Webinar Word/PDF: stage 1 gets two bullets (the chosen values) and a warning callout.
  - BUILD-INFO.txt: `dx.settings : containerTimezone <tz> · prereqsChecker on|off`.
- Defaults (`src/state.js` `DEFAULTS`): `DX_TIMEZONE: "Europe/Madrid"`, `prereqsChecker: true`. Headless answers with
  the same names; `validateAnswers` refuses an invalid `DX_TIMEZONE`.
- With the defaults, the values are the same as before (only comments change).

## Acceptance criteria
- [x] Untouched options: `containerTimezone: "Europe/Madrid"` and `prereqsChecker.enabled: true`.
- [x] `UTC` and the checker off: in the values; `helm template` of the chart gives `TZ=UTC` in every DX container and
  no `prereqs-checker` sidecar (installation on the lab cluster: still to do).
- [x] Invalid time zone refused in the wizard with a clear message.
- [x] Correct comment of the checker.
- [x] RUNBOOK and webinar Word/PDF explain both settings, with the syndication / DAM Staging warning.
- [x] Texts in English and Spanish.
- [x] Golden test unaffected: the engine is not touched (the change lives in the output layer).

## Out of scope
- The labs repository (its own issue for the comment).
- `checkSchedule` of the checker (kept at the chart default, 08:00).
- The `timezone` parameter of the CloudNativePG cluster (`lab-bbdd/cluster-dx-pg.yaml`, still `Europe/Madrid`): the
  JDBC driver sets the session time zone from the JVM, so DX does not depend on it.
- The resource estimator: the sidecar asks for 100m / 64 MiB per pod and is not counted separately.

## Plan
New `src/dxconfig.js` (validation, values layer, RUNBOOK/script/BUILD-INFO texts), wired in `src/bundle.js`,
`src/support.js`, `src/script.js`, `src/headless.js`, `src/views.jsx` and `src/i18n.js`. The engine stays identical.

## Test plan
- Unit: `test/dxconfig.test.mjs` (defaults, UTC + off, every preset and DX Core, validation EN/ES, engine untouched).
- `helm template` of hcl-dx-deployment 2.50.0 with the generated values (TZ in the containers, sidecar present/absent).
- UI: `test/ui.e2e.mjs`, plus a manual check of the Advanced section (invalid zone, Next disabled, (i) dialogs).
- Lab cluster: one installation with a non-default time zone (pending, not done by the agent).
