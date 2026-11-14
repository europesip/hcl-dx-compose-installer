# The webinar zip as in the webinar of 2026-11-12: SOPS, Harbor password by prompt, IQ key in the values

Issue: #17 · Status: Implemented · Release: next (2.8.0)

## Summary
The webinar zip generates directly what the webinar of 2026-11-12 shows, without the post-processing scripts used
for its video (sops-bundle.py, lab0-harbor-prompt.py, iq-key-in-values.py): optional SOPS (age) encryption of the base
secrets with one or more public keys, the HCL Harbor sign-in with the password typed at a prompt, and the IQ
deployment key back in the IQ values.

## Current behaviour
- `lab-base/secrets.yaml` holds the pull secret `regcred` and `web-engine-secret` (wpsadmin) in plain text.
- Step 0-3 (`webinarPhases`, src/engine/stages.js) runs `helm registry login hclcr.io -u <user> -p <CLI secret>`: the
  secret is written in RUNBOOK.md and demo.sh.
- `webinarFiles` moves the IQ deployment key from `lab-iq/custom-iq-values.yaml` to the Secret `iq-deployment-key`,
  and step 4-3 reads it into a variable passed with `--set`.

## Specification
Webinar preset only. The engine (src/engine/core.js) is not changed: the golden test shows no difference.

1. **Pull secret apart (always):** `lab-base/secret-harbor.yaml` (regcred) and `lab-base/secrets.yaml` (wpsadmin).
   Step 1-1 applies both; the comment of `imagePullSecrets` in `lab-base/custom-values.yaml` names the new file.
2. **Harbor sign-in by prompt (always):** step 0-3 shows
   `helm registry login hclcr.io -u '<user>'   # Password: the CLI secret, typed, never shown`, the pulls and
   `ls -l charts/`. In demo.sh, `hlogin` signs in at the terminal; without a terminal (`[ -t 0 ]` false) it reads the
   password from `lab-base/secret-harbor.yaml` (`sops -d --extract` with SOPS, `kubectl create --dry-run=client` without)
   and passes it with `--password-stdin`. It is retried as any download.
3. **IQ deployment key in the values (always):** a three-line comment above `licensing:` (hcl-dx-iq 1.0.3 cannot read
   it from a Secret; SOPS or `--set` to keep it out of Git). No `iq-deployment-key` Secret, no `--set`.
4. **SOPS (option, off by default):** *Your details › SOPS: encrypted secrets*, a checkbox and a text area.
   - One key per line: `[name] age1…`; `#` comments and empty lines ignored; duplicates dropped.
   - Errors (generation blocked): a private key (`AGE-SECRET-KEY-1…`, also shown live under the field), an invalid key,
     no key at all.
   - `.sops.yaml`: one rule for `lab-base/(secret-harbor|secrets)\.yaml$`, `encrypted_regex: '^(data|stringData)$'`,
     every key in `age: >-` (comma separated); names and keys listed in comments, with `sops updatekeys`.
   - prepare.sh, last step "Encrypt the base secrets with SOPS": stops with the install links when `sops` is missing,
     encrypts each file that is not encrypted yet (idempotent; it encrypts again after a demo), counts the encrypted
     values and warns when there is no private key in `${SOPS_AGE_KEY_FILE:-~/.config/sops/age/keys.txt}`.
   - Step 1-1: `cat lab-base/secret-harbor.yaml`, `sops -d lab-base/secret-harbor.yaml | kubectl apply -f -`,
     `sops -d -i lab-base/secrets.yaml` (demo.sh: only when still encrypted), `kubectl apply -f lab-base/secrets.yaml`;
     the RUNBOOK adds a note: what SOPS does, who can decrypt (the names), how to add or remove a key, rotate the secrets
     when someone is removed, keep a copy of the private key.
   - BUILD-INFO.txt: `sops : age · N public keys (names) · files (encrypted by prepare.sh)`.
   - Only public keys go through the wizard: nothing secret leaves the browser; the real `sops` encrypts.

5. **Step 0-1 (always):** `kubectl top nodes` after `kubectl get nodes`, as in the video; when the cluster has no
   metrics-server it prints a note instead of failing (demo.sh runs with `set -e`).

## Acceptance criteria
- [x] Webinar: step 0-3 has no password on the command line; demo.sh asks for it, or reads it without a terminal.
- [x] Webinar: the IQ deployment key is in `lab-iq/custom-iq-values.yaml` with its comment; no Secret, no `--set`.
- [x] SOPS with two keys: `.sops.yaml` lists both, prepare.sh encrypts both files, each private key alone decrypts.
- [x] A private key in the list: error, not used. No valid key: error.
- [x] SOPS off: plain files, step 1-1 applies them with kubectl.
- [x] The zip (SOPS on, the key of the webinar) matches the files of the webinar except dates, generated values,
      ciphertext, the encrypt step of prepare.sh and the longer RUNBOOK note.
- [x] Golden test unchanged.

## Out of scope
- SOPS for All / Custom (install.sh) and for the other secrets (LDAP, database, AI provider).
- Encrypting in the browser.

## Plan
- New `src/sops.js` (output layer): key parsing and errors, the split of the base secrets and `.sops.yaml`, the
  commands of steps 0-3 and 1-1, the encrypt step, the demo.sh prompt and the RUNBOOK note.
- `src/engine/stages.js`: `webinarFiles` (IQ comment instead of the Secret, neutral LDAP comment) and `webinarPhases`
  (steps 0-3 and 1-1, the encrypt step) — webinar layer, not the frozen engine.
- `src/bundle.js`: wires it (errors, files, demo.sh, RUNBOOK, BUILD-INFO); `src/state.js` (`sops`, `SOPS_KEYS`),
  `src/views.jsx` + `src/ui.jsx` (card and `Textarea`), `src/i18n.js`, `src/script.js` (webinar script texts).

## Tasks
- [x] src/sops.js, stages.js, bundle.js, state.js
- [x] UI card (EN/ES) with live check of private keys
- [x] Unit tests (test/sops.test.mjs) and the 2.6.0 test of the IQ key updated
- [x] CHANGELOG and docs/security (EN/ES)

## Test plan
- `npm test` (43 tests), golden test (5 scenarios, no diffs), `test/ui.e2e.mjs`.
- Local, with the real sops 3.13 and two keys from `age-keygen`: the encrypt step twice (idempotent), each private key
  decrypts, the unattended Harbor password path, `sops updatekeys` removing one key (it no longer decrypts).
- Diff of the generated webinar zip against the files of the webinar (europesip/hcl-dx-compose-showroom).
- Pending, after the webinar: prepare.sh + demo.sh of a zip with SOPS on the lab cluster.
