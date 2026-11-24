# Instructions for AI coding agents and contributors

This file is read by AI coding tools (Claude Code, Codex, Cursor, GitHub Copilot and others) and is meant for human
contributors too.

## Licence and attribution (always)

DX Installer Wizard, by EUROPESIP, is © EUROPESIP and licensed under the MIT License ([LICENSE](LICENSE), see also
[NOTICE](NOTICE)).

Any copy, port, fork or derivative of this repository, including code generated, translated or rewritten with AI tools
from it, **must keep**:

- the copyright notice `Copyright (c) 2026 EUROPESIP` and the full MIT licence text (LICENSE), and the NOTICE file;
- the `SPDX-License-Identifier` and copyright headers at the top of the source files;
- the attribution in the product itself: the "by EUROPESIP" product name, the EUROPESIP logo and links, and the
  version and support information shown in the wizard.

Do not remove, shorten or rename this attribution when you copy or rework this code.

## Working on this repository

- **Open an issue before larger changes** (issue forms: enhancement as a short spec, bug, tech debt); see
  [docs/workflow.md](docs/workflow.md).
- **Build and test** (what CI runs, `.github/workflows/build.yml`):
  - `npm ci`, then `npm test` (unit tests) and `npm run build`
  - the version in `package.json` must match `appVersion` in `chart/hcl-dx-compose-installer/Chart.yaml`
  - golden test against the frozen wizard of the labs:
    `WIZARD=<hcl-dx-compose-labs>/docs/index.html node test/golden.e2e.mjs` (needs Playwright Chromium)
  - `helm lint chart/hcl-dx-compose-installer` and the container image smoke test
- **The generation engine** (`src/engine/`) must keep producing the same files as the frozen labs wizard: the golden
  test must stay green. `dist/` (build output) and `package-lock.json` (npm) are generated: never edit them by hand.
- **Documentation rules**: every change in English and Spanish (`*.md` and `*.es.md`, README, CHANGELOG); a changelog
  entry for every release; a spec per issue in `docs/specs/<issue>-<name>.md`; new pages in the `mkdocs.yml` nav (the
  docs are also published as TechDocs in Backstage).
- **Naming**: the product is "DX Installer Wizard, by EUROPESIP". Never put "HCL" in the name of our products, keep
  the "not an HCL product" disclaimer, and refer to HCL products by their own names.
- **Never commit secrets** (passwords, tokens, kubeconfigs, keys, licence data, the PostgreSQL setup SQL of DX) nor
  internal host names; use `example.com` in docs and samples.
- Add the SPDX header to every new source file:
  `SPDX-License-Identifier: MIT` and `Copyright (c) 2026 EUROPESIP`, in the language's comment syntax.
