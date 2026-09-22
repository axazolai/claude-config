# Test-After Coverage Implementation Plan

**Goal:** Replace test-first with tests written after the code and before review, limited to the
spec/plan's stated behaviour, and add a bug log for non-blocking bugs.

**Spec:** `18-SPEC.md`.

## Global Constraints

- Rule text is instructions only, no justification prose (`CONVENTIONS`).
- Nothing under `~/.claude/` is edited; deploy through `node setup.mjs` from `master`.
- The fork's `main` is generated: change `transform/deltas/`, `transform/config.json`,
  `transform/fork-owned/` on `patch`, then `build-cli.mjs check` / `commit`.
- Commit per task, Conventional Commits, staging only the named paths. The fork's working tree
  holds unrelated deletions (`graphify-out/`); they are not staged.

**Branch:** `feat/test-after-coverage` from `master` here; `patch` in the fork.

### Task 1: Installer rules

Files: `payload/rules-src/testing.md`, `payload/claude-md/06-collaboration{,.lite}.md`,
`payload/claude-md/07-conventions.md`, `gsd-defaults.partial.json`, `.claude/CLAUDE.md`,
`.ultrapowers/BUGS.md`.

Why this way: `07-conventions` is loaded in every profile, so the timing rule and the bug log
live there in short form; `testing.md` carries the full process for projects compiled with it;
the location sentence mirrors the risk-register one so both registers resolve the same way.

Acceptance:
- `testing.md` states the five-step order, "tests confirm the spec/plan only", the mutation check
  in place of RED, and the regression-test rule of spec § 1.
- `07-conventions.md` no longer says "as the work goes"; it has the bug-log bullet.
- `gsd-defaults.partial.json` has `"tdd_mode": false`.

Verify: `node --test` (existing suite; no new tests — the change is rule text and one default).

### Task 2: Fork delta 014

Files (fork): `transform/deltas/014-test-after-coverage.patch`, `transform/config.json`,
`transform/fork-owned/README.plugin{,.ru}.md`, `transform/fork-owned/README.repo{,.ru}.md`.

How: `node transform/build-cli.mjs emit <scratch>/a`, copy to `<scratch>/b`, edit `b`, write the
delta as `git diff --no-index` over the seven skill files with the `a/`, `b/` prefixes rewritten
to `a/plugins/ultrapowers/...`; confirm the format `patch.mjs` accepts against delta 013.

Acceptance: spec § 2.2 file by file; spec § 4 grep over the built tree.

Verify: `node --test`, `node transform/inventory.mjs check`, `node transform/build-cli.mjs check`,
then `commit` to `main`.

### Task 3: Close

`ROADMAP.md` gains phase 18; merge `--no-ff` into `master` on the user's word; deploy dry-run
first; fork push and the `~/.gsd/defaults.json` edit only on the user's word.
