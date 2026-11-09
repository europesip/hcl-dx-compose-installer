# How we work: issues, board and specs

<p><b>English</b> · <a href="workflow.es.md">Español</a></p>

Every change to the installer starts as an **issue**, is tracked on the **project board**, and is closed by a
**pull request** that proves its acceptance criteria. The goal is that each change is defined before it is built,
documented in one place, and easy to follow. It is the first step towards **spec-driven development**.

## 1 · Open an issue (the spec)

Use one of the three forms. Blank issues are disabled, so everyone writes them the same way.

| Form | Label | Use it for |
|---|---|---|
| 🚀 Enhancement (spec) | `enhancement` | A new capability, option or use case |
| 🐞 Bug | `bug` | Something does not behave as it should |
| 🧱 Tech debt | `tech-debt` | A shortcut to pay back before it becomes a bug |

The important part of every form is the **acceptance criteria**: checkable statements ("given … when … then …").
A change is done when every box is ticked, not when the code is written. Big changes are **epics**: split them
into sub-issues, so that each one fits in a pull request.

## 2 · Triage

A maintainer completes the issue on the board:

| Field | Values |
|---|---|
| **Priority** (label) | 🔴 `P1` high · 🟡 `P2` medium · 🔵 `P3` low |
| **Area** (label) | `area:wizard` · `area:engine` · `area:bundle` · `area:cicd` · `area:packaging` · `infra:aws` |
| **Effort** (number) | Relative scale 1-2-3-5-8-13 (1 ≈ one hour, 13 = an epic to split before starting) |
| **Release** | The version it is planned for, or *Later* |

`blocked` marks an issue that depends on another task or on something external (HCL, a third-party release…).

## 3 · The board

| Column | Meaning |
|---|---|
| 📋 **Backlog** | Defined and waiting to start |
| 🚧 **In progress** | Active work (2 or 3 at most at a time) |
| 🧪 **In testing / Blocked** | Being tested on the lab cluster, or stopped by a dependency |
| ✅ **Done** | Finished and checked |

The project has several views: the full table, the Kanban board, the board by release (with and without the
finished items), and one table each for tech debt, enhancements and bugs. Its insights show the current status,
the work over time and the load per release.

## 4 · Build it

1. Move the issue to **In progress** and create a branch: `<number>-<short-name>` (for example `42-oracle-ssl`).
2. Open a pull request that says `Closes #<number>`. The pull request template asks for the acceptance criteria,
   the tests (unit, golden test, lab cluster) and the release checklist (CHANGELOG and docs in English and Spanish).
3. While it is tested on the lab cluster, the issue is **In testing**. When the pull request is merged, the issue
   closes and moves to **Done**.

## 5 · Towards spec-driven development

The issue form already is a short spec (what, why, acceptance criteria, test plan). For changes with an effort of
5 or more, the spec also lives in the repository, next to the code it describes:

- `docs/specs/<number>-<short-name>.md`, from [docs/specs/TEMPLATE.md](specs/TEMPLATE.md): summary, current
  behaviour, specification, acceptance criteria, plan and tasks.
- It is reviewed and merged (status *Approved*) **before** the implementation, then updated to *Implemented* by
  the pull request that closes the issue.

A versioned spec is the input of the implementation, whether a person or an AI coding agent writes the code, and
the reference for its review and its tests. Over time, the specs describe what the installer does and why.
