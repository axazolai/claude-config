# Phase 23 — `/publish` (one depersonalised release skill) and a clean bundled `postgres` skill

## Intent

Stated by the user (2026-09-27): review `.reference/skills`, take what the project lacks,
depersonalise it and add it to the bundle.

| Reference skill | Decision |
|---|---|
| `impeccable` | Already delivered: `install-design-stack` installs it per frontend project. Nothing to do. |
| `publish-dev`, `publish-prod`, `publish-fast`, `publish-step` | Collapse into **one `/publish` skill with launch keys**. Everything project-specific is asked on first run and saved at project level. GitLab and GitHub. A project without CI/CD publishes through git alone. |
| `postgres` | The DB setting template already offers it via `npx skills add planetscale/database-skills --skill postgres`, which brings PlanetScale's hosting advertisement and its CLI references. Replace with a cleaned copy shipped in the bundle and copied into the project by `/init-stack`. |

The reference copies live in `.reference/skills/` (git-ignored, this machine only); the
implementation reads them for the process detail and ships none of their project identifiers.

## 1. `/publish` — `payload/skills/publish/SKILL.md` (base/full)

### 1.1 Launch keys

| Invocation | Does (origin) |
|---|---|
| `/publish dev` | merge the work branch into the dev branch, version bump + changelog, tests, push the work branch, delete it locally, push dev, watch the pipeline (`publish-dev`) |
| `/publish prod [X.Y.Z]` | confirm the version, verify dev, MR/PR dev → prod, wait for a green MR pipeline, merge (by the user unless `--agent-merge`), verify, tag, watch the tag pipeline (`publish-prod`) |
| `/publish fast` | dev merge + push with no tests and no pipeline wait, MR/PR, the agent merges, tag, tag pipeline reported but not gating (`publish-fast`) |
| `/publish step [X.Y.Z]` | freeze the release point as `<releasePrefix>X.Y.Z`, MR/PR it to prod, and push new work into dev in parallel through a subagent (`publish-step`) |

Common keys: `--dry-run` (every step printed, nothing pushed, merged or tagged),
`--reconfigure` (re-run the interview), `--agent-merge` (prod/step: the agent merges instead of
the user), `--no-watch` (skip pipeline watching).

The hard rules of the originals carry over in general form: the version is the user's choice or
confirmation, never computed silently; nothing unreleased is pushed to dev as part of a prod
release; a failed gate stops the run and reports; `main`/prod is never force-pushed.

### 1.2 Project settings — `.claude/publish.json`

Written by the first-run interview, read on every run, rewritten by `--reconfigure`:

```json
{
  "host": "gitlab | github | none",
  "remote": "origin",
  "branches": { "dev": "dev", "prod": "main", "releasePrefix": "release/v", "deleteWorkBranch": true },
  "cli": "glab | gh | null",
  "ci": { "present": true, "watch": true },
  "version": { "files": [{ "path": "package.json", "key": "version" }], "tagPrefix": "v" },
  "changelog": { "path": "CHANGELOG.md", "format": "markdown | json" },
  "tests": { "command": "npm test" },
  "merge": { "prod": "user", "fast": "agent" }
}
```

Interview — detect first, ask only what detection cannot settle, one question at a time:

- `host`/`remote` from `git remote -v`; `none` when no remote host is recognised.
- `cli` + access: `glab auth status` / `gh auth status`. Access is needed to watch pipelines,
  merge and tag; without it, the skill states which steps become manual and asks whether to
  continue with them as printed commands.
- `ci.present` from `.gitlab-ci.yml` / `.github/workflows/*`. No CI/CD → pipeline steps are
  skipped and publishing is branch merge, push and tag in git.
- Branch names: offered from the remote's branches, confirmed by the user.
- Version files and changelog: detected from `package.json`, `pyproject.toml`, `Cargo.toml`,
  `*.csproj`, `changelog.json`, `CHANGELOG.md`; confirmed.
- Tests: the project's detected test command (`.claude/stack-rules.md` "Detected commands"), else
  asked.

`.claude/publish.json` sits under the project's `.claude/`; it is local unless the project chooses
to track it.

### 1.3 Depersonalisation

The shipped skill contains no identifier from the originals: no project name, host, branch
namespace (`mono/*`), repository path, database name, app path (`apps/web/…`), version number
from their history, or document link. A test greps the skill for the identifier list recorded
in the plan (kept in the test, not in the skill).

## 2. `postgres` — bundled library skill, installed per project

- Source copy: `payload/skill-library/postgres/` — `SKILL.md` and the 16 generic references
  (backup-recovery, index-optimization, indexing, memory-management-ops, monitoring,
  mvcc-transactions, mvcc-vacuum, optimization-checklist, partitioning, pgbouncer-configuration,
  process-architecture, query-patterns, replication, schema-design, storage-layout,
  wal-operations). Dropped: the six `ps-*` files (PlanetScale CLI, insights, connections,
  extensions) and the hosting recommendation. SKILL.md links only to kept files.
- `LICENSE-NOTICE.md` beside it: derived from PlanetScale's `database-skills` (MIT), with the
  copyright line of the original.
- `payload/skill-library/` is not a skills directory: nothing under it loads in a session.
- `setting-templates/DB/_base.json` `skills[]`: the entry becomes
  `{ "id": "bundled:postgres", "name": "postgres", "description": "…", "install": { "bundled": "postgres" } }`.
- `/init-stack` (`payload/bin/init-stack.mjs`): an entry with `install.bundled` is installed by
  copying `~/.claude/skill-library/<name>/` to `<project>/.claude/skills/<name>/`; present when
  that directory exists; offered like any other stack skill (opt-in, not pre-checked).

## 3. Testing decisions

Seams: the skill text (grep), the template → `gatherSkills` → install contract, the copied tree.

- `@critical` depersonalisation: no identifier from the recorded list appears anywhere under
  `payload/skills/publish/` or `payload/skill-library/postgres/`.
- `@important` `/publish` SKILL.md names all four modes and the four common keys, the settings
  file path, and the no-CI path.
- `@important` `gatherSkills` returns `postgres` for a SQL project as a bundled skill; installing
  it copies the library tree into `<project>/.claude/skills/postgres/`; a second run sees it
  present; no `npx` is invoked for it.
- `@important` the library copy has 16 references, no `ps-*` file, no "planetscale.com" link
  except in `LICENSE-NOTICE.md`.

## Out of scope

- `impeccable`.
- Executing `/publish` against a real remote (verified by `--dry-run` reading only).
- Other stack templates' npx skills.
