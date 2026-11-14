# Headless mode: the installer without its web page

**English** · [Español](headless.es.md) · [README](../README.md)

The engine of the DX Installer Wizard can run **without its web page**, in Node: a library and a small command line
tool take the answers of the wizard in a JSON file and return the same `dx-install/` folder that the page downloads.
It is meant for automation, for example a **Backstage template "New HCL DX environment"** in an Internal Developer
Portal (IDP), a CI job, or a script.

> **The folder is still run by a person, with real `helm`, following the RUNBOOK.** HCL DX is not installed by Argo CD
> or any GitOps controller: its Helm charts keep state in the Helm release (hooks, upgrades, database transfer). In an
> automated flow, Git stores and reviews the generated folder (a merge request); a person (or a manual CI job that
> runs the same `install.sh`) installs it.

## Library

Node 20.19 or later. Until it is published as a package, install it from a release tag:

```bash
npm install github:europesip/hcl-dx-compose-installer#v2.9.0
```

```js
import {generateInstall, schema, validateAnswers} from "hcl-dx-compose-installer/headless";

const r = generateInstall({
  answers: {schemaVersion: 1, preset: "all", DX_HOST: "dx.example.com", HCL_HARBOR_USER: "you@example.com", dxcLicense: true},
  lang: "en",            // or "es": language of the RUNBOOK and the messages
  secrets: "omit",       // the default: see "Secrets" below
});
if (!r.ok) throw new Error(r.check.err.join("\n"));
r.files;        // {"install.sh": {text, mode}, "RUNBOOK.md": {...}, ...}  no secret inside: safe to commit
r.secretFiles;  // {"secrets.env": {...}, "lab-base/secrets.yaml": {...}, ...}  keep them OUT of Git
r.zip;          // Uint8Array: the whole dx-install/ folder, as the web page downloads it
r.check.warn;   // warnings, as on the page
```

| Function | What it does |
|---|---|
| `generateInstall({answers, lang, secrets})` | The folder. `ok` is false when `check.err` is not empty (missing host, invalid option...) |
| `schema()` | JSON Schema of the answers: every key, its type, its allowed values and its default. Useful to build a form, e.g. the parameters of a Backstage template |
| `validateAnswers(answers, {secrets})` | Only the checks of the answers (unknown keys, types, values, secrets) |
| `VERSION`, `SCHEMA_VERSION` | Installer version, and version of the answers format |

## Answers

The answers are the options of the web page, with the same names (`src/state.js`, `DEFAULTS`). Only `preset` is
required; every key that is left out takes its default. Unknown keys are an error, so a typo does not go unnoticed.
Examples: [`docs/headless-examples/`](headless-examples) (`poc.json`, `webinar.json`, `all.json`).

| Key | Values |
|---|---|
| `preset` | `all` (every stage and extra), `webinar` (stages 0-5 as in the webinar: `prepare.sh` + `demo.sh`), `custom` (what you set) |
| `platform` | `kubernetes`, `openshift`, `poc` (k3s on one machine) |
| `DX_HOST` | Host name of the portal (PoC: `dx-demo.127.0.0.1.nip.io` by default) |
| `DX_NS`, `SHARED_NS` | Namespaces of HCL DX and of the third-party tools |
| `INGRESS_KIND`, `SC_RWO`, `SC_RWX`, `helm` | Ingress, storage classes, Helm 3 or 4 |
| `lab1b`, `dir`, `db`, `lab3`, `lab3b`, `iqdb`, `iqrag`, `lab4`, `lab5`, `keycloak`, `cicd*`... | The stages and extras of the page |

The full list, with types and defaults: `dx-installer schema`.

## Secrets

**`secrets: "omit"` (default).** The answers must not carry any credential (`HCL_HARBOR_TOKEN`, API keys, passwords):
they are refused. The folder is split so that the part meant for Git has no secret:

- The passwords the installation needs anyway (wpsadmin, LDAP, databases, demo users) are **generated at random**
  for this call, never the documented default, and written to **`secrets.env`**, together with the LiteLLM key.
- `install.sh` (or `prepare.sh` and `demo.sh`) reads `secrets.env` from its own folder; the RUNBOOK says to run
  `source secrets.env` before copying a command.
- The credentials that were left out (the HCL Harbor CLI secret, the API key of the AI) are filled in on the machine
  that runs the folder: `secrets.env` and the secret files have `PUT-YOUR-...-HERE`, and the script stops and lists them
  while one is left.
- `secretFiles` lists every file with a secret (`secrets.env`, the `secrets.yaml` files, the LDIF with password
  hashes, the database properties): keep them in a password manager or OpenBao, never in Git.

**`secrets: "include"`.** The answers may carry the credentials, as on the web page, and the folder is byte for byte
the one the page downloads (except the generation date and the random salts of the LDIF). `secretFiles` still tells
which files hold them.

## Command line

```bash
npx dx-installer generate --answers answers.json --out dx-install      # the folder (files with secrets are listed)
npx dx-installer generate --answers answers.json --zip dx-install.zip  # the zip, as the page downloads it
npx dx-installer generate --answers answers.json --lang es --secrets include --out dx-install
npx dx-installer schema                                                # the JSON Schema of the answers
npx dx-installer --version
```

Exit code: `0` done, `1` the answers or the folder have errors (printed on stderr), `2` wrong usage. With `--out`,
the files with secrets are written with permissions `600`.

## Use case: Backstage "New HCL DX environment"

1. The template asks for the answers (its form can be built from `schema()`).
2. A scaffolder action calls `generateInstall()` and opens a merge request with `files` in an environments repository
   (not a repository that Argo CD applies).
3. `secretFiles` go to OpenBao or are handed to the person who installs; they never go to Git.
4. After review, a person runs `install.sh` with real `helm` (or a manual CI job runs it), following the RUNBOOK.
