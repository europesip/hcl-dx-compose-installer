# How it works

**English** · [Español](how-it-works.es.md) · [README](../README.md)

## Your data

- **Installation details:** the installation (scripts, RUNBOOK, Word script) is generated **in your
  browser**. What you type in the steps of the installation, credentials included, is not sent to any
  server. Your choices are remembered in your browser (never the credentials).
- **AWS keys:** they are sent only when you ask the installer to create or delete an AWS environment.
  They go to the installer's own server (the pod or container you run), which passes them to the AWS
  CLI for that operation only. They are never written to disk or to the logs.
- **Auditing:** the source code is here for you to audit.

## How it works

| Path | What it is |
|---|---|
| `src/App.jsx`, `src/views.jsx`, `src/aws-view.jsx`, `src/ui.jsx`, `src/i18n.js` | Interface (React + Tailwind CSS, English and Spanish) |
| `src/state.js` | Form values, quick deployments, dependencies between stages |
| `src/engine/core.js` | Generation engine: lab files, steps, `install.sh` |
| `src/engine/stages.js` | Stages 0-5 and extras, the two phases of the webinar, `RUNBOOK.md` |
| `src/bundle.js`, `src/zip.js` | The zip, credential masking, the key values of each YAML file |
| `src/word.js` | Word script of the webinar |
| `src/aws.js`, `server/aws/*.sh` | AWS sizes and price estimates; the scripts that create and delete the environments |
| `server/index.mjs` | Server: the page, and the API that runs the AWS scripts and streams their output |
| `Dockerfile`, `chart/hcl-dx-compose-installer` | Container image and Helm chart |

The engine started as option C of the configuration wizard of the
[labs](https://github.com/europesip/hcl-dx-compose-labs), which is frozen now. `test/golden.e2e.mjs`
checks that, for the same state, the engine still produces the same lab files and commands as that wizard.

## Development

```bash
npm ci
PORT=8080 npm start &               # the server (API), with the AWS tools in the PATH
npm run dev                         # http://localhost:5173 (sends /api to :8080)
npm test                            # unit tests
WIZARD=/path/to/hcl-dx-compose-labs/docs/index.html node test/golden.e2e.mjs
npm run build && npm start          # production build on http://localhost:8080
```

GitHub Actions runs the tests, the golden test and the build. It builds the image (amd64 and arm64) and
tests the container: tools, headers, API, read-only, and the whole interface with the downloads. It then
publishes `ghcr.io/europesip/hcl-dx-compose-installer` (`:main` on every push; `:X.Y.Z` and the Helm chart
on a `vX.Y.Z` tag).
