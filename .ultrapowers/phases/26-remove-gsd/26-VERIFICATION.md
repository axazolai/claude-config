# Phase 26 — Verification

Verified at `18bca2e` (branch `phase-26-remove-gsd`, range `58d0980..18bca2e`), against the code and
the diff. Focused run during verification: `node run-tests.mjs gsd-purge.test.mjs
setup-variants.e2e.test.mjs payload/bin/lib/assemble-claude-md.test.mjs` → 57/57 pass. The full
suite was not re-run here (last recorded 625/625 at `18bca2e`).

## Goal

> The bundle ships `base` and `lite` only, nothing in it refers to GSD, and every `node setup.mjs`
> run removes GSD traces from the machine.

Verdict: **ACHIEVED**.

## Evidence

| Claim (plan goal / spec § 1) | Delivered by |
|---|---|
| Two profiles, `base` and `lite` | `variants.json` `profiles` holds only `base` and `lite`; `deepseekDefaults` is `{ base, lite }`; e2e `--variant=nope` asserts `Known: base, lite`; the TTY prompt test asserts `bundle profile [base/lite]`. |
| Nothing in `payload/`, `setup.mjs` or the assembled `CLAUDE.md` refers to GSD | `git grep -niE "\bgsd\b\|gsd-\|full profile\|--variant=full"` over payload, payload-lite, setup.mjs, variants.*, settings.partial.json, READMEs returns only the allowed set: the purge block and import in `setup.mjs` (L44, L699-700, L825-850), `variants.json` `managedPlugins.gsd` / `$gsd` / `forbiddenPlugins`, the README purge paragraph and `full`→`base` note, `skills/update-changelog/SKILL.md`. Remaining `gsd` hits in payload are tests asserting absence. `.planning` remains only as a root marker (spec § 7). Assembled `CLAUDE.md`: `assemble-claude-md.test.mjs` "@important real fragments: no GSD in base or lite" and e2e "@important the assembled CLAUDE.md of base and lite names no GSD". All files named in plan Task 3/4/5 Delete lists are absent at HEAD; no `*.full.md` fragment remains; override regex is `(base\|lite)` (`assemble-claude-md.mjs:36`). |
| Every run removes GSD traces automatically and permanently: gsd-core, former bundle GSD files, `~/.gsd/`, GSD settings entries, bundle state | `gsd-purge.mjs` (`PATTERNS`, `BUNDLE_RELS`, `stripGsdSettings`, `stripProjectInitGsd`, `planGsdPurge`); executed unconditionally in `setup.mjs` L825-851, outside the `CLAUDE_SETUP_SKIP_PURGE` guard, before the settings merge and `pruneStale()` (L1340). Pure tests: `gsd-purge.test.mjs` two `@critical` (paths incl. every `BUNDLE_RELS` entry and `homeDir/.gsd`, foreign files excluded; settings hooks/statusLine/permissions/env, mixed entry keeps foreign hook, input unmutated) and three `@important` (references dir, project-init keys, empty plan). E2E: `setup-variants.e2e.test.mjs` L304, L322, L340, L350, L363. |
| A manifest recording `full` installs as `base` without failing | `setup.mjs` `resolveProfile` L620-636; `installedResolved` L640 suppresses a false "Switching variant". E2E L81 (manifest `full`), L95 (no manifest), L104 (`--variant=full`, `--variant=nope` exits 1), L120 (interactive prompt answered `full`, driven through a forced-TTY harness). |
| Success: after an install on a machine that ran `full` with gsd-core, `~/.claude` holds no GSD file and `settings.json` registers no GSD hook or statusLine | Modelled, not deployed: e2e L304 plants gsd-core, `agents/gsd-x.md`, `commands/gsd/`, two former bundle hooks, `gsd-defaults.partial.json`, sandbox `~/.gsd`, and a `settings.json` with command+args bundle hooks, a quoted Windows gsd-core hook and a GSD statusLine; after install it asserts every path gone, settings text has no `gsd`/`db-live-access-gate`, bundle statusLine installed, foreign hook and files intact, backup equals old settings. |
| Full suite passes | Implementer's recorded run 625/625 at `18bca2e`; focused 57/57 confirmed here. |

## Global constraints

- Edit sources only, never `~/.claude/` — **HELD**: every path in `git diff --name-only 58d0980..18bca2e` is in the repo (payload, root modules, tests, docs, `.ultrapowers/`).
- Testing mode test-after; tests for Acceptance lines only — **HELD**: acceptance rows map one-to-one onto the tests listed above (`gsd-purge.test.mjs` L29-116, `setup-variants.e2e.test.mjs` L81-142, L304-362); one extra `@critical` BOM test (L363) backs the `18bca2e` fix.
- Test names start with `@critical`/`@important` per spec § 6 — **HELD**: rows 1-4 `@critical`, rows 5-7 `@important` (`gsd-purge.test.mjs`, `setup-variants.e2e.test.mjs`, `assemble-claude-md.test.mjs:29`).
- Targeted tests per task; full suite at end of Task 5 — **HELD** as far as the branch shows (commit sequence per task; recorded 625/625). Process, not re-observable from code.
- Profiles `base`, `lite`; default `base`; `full` → `base` with the exact line — **HELD**: `setup.mjs:622` logs `profile "full" was removed; using "base"`; L632/L636 default `base`.
- Purge automatic and permanent; only backup `settings.json.pre-gsd-purge` — **HELD**: `setup.mjs:840-846` (`rmSync`, no trash; single `copyFileSync` to `.pre-gsd-purge`).
- Never touch user projects — **HELD**: the purge plan only lists `claudeDir` entries and `homeDir/.gsd` (`gsd-purge.mjs` `planGsdPurge`); the session-init risk-register/`claudeMdExcludes` writers were removed and `session-init.test.mjs:48` asserts a `.planning` project is left alone.
- Commits: Conventional Commits ending with `Co-Authored-By: Claude Opus 5.5 (1M context)` — **VIOLATED** (trailer only): `1683161`, `83771eb`, `d6f33fe`, `4cd6342`, `6d574f0`, `18bca2e` end with `Co-Authored-By: Claude Sonnet 5.5`. Subjects are Conventional Commits. No effect on the goal.

## Gaps

- None against the goal.
- Minor text deviation: plan Task 3 asked `$gsd` in `variants.json` to state that `gsd` is forbidden "because GSD left the bundle in phase 26"; the line at `variants.json:17` states only what it does (stays managed and forbidden so reconciliation uninstalls it). Behaviour is as planned.
- unverifiable: the success criterion on a real machine that ran `full` with gsd-core — no deploy has happened; it is covered by the end-to-end model `setup-variants.e2e.test.mjs` L304 (real `setup.mjs`, sandboxed config dir and home). The e2e fixture plants a subset of former bundle files; the full `BUNDLE_RELS` set and the `project-init.json` key removal are covered only at the pure layer (`gsd-purge.test.mjs`). Settled by running `node setup.mjs` on a machine with a real `full` + gsd-core install and checking `~/.claude` and `settings.json`.
- Out of scope, listed only: `BUG-005` (`.ultrapowers/BUGS.md`, `protected-guard` cwd root) is Open and outside phase 26.
