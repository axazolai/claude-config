# Phase 22: Structured scratchpad and phase cleanup — Summary

## Tasks

1. Engine — layout scans, promote, harness scan, purge-now: `3c97019..72cc3bc`
2. `scratchpad-layout-guard.mjs` (all profiles): `72cc3bc..59c88ad`
3. `scratchpad-temp-env.mjs` — SessionStart (all profiles): `59c88ad..f2f9dfe`
4. `phase-end-cleanup-nudge.mjs` — PostToolUse (base/full): `f2f9dfe..0164179`
4b. `background-sleep-guard.mjs` (all profiles): `0164179..a096920`
5. Extend the `scratch-prune` skill: `a096920..484a821`
6. Rule text — CLAUDE.md and payload fragments: `21758a5..a2ddb61`
7. Docs and full suite: `a2ddb61..60bf224`
BUG-003 drain (scanLayout sub-ms clock-skew): `60bf224..e566ea9`
Final-review fix wave (moveInto symlink follow, guard/engine phase regex): `e566ea9..d073378`

## Rulings

**Ruling (pre-Task-3, project slug computation):** Real slugs from this machine's harness temp root (`C:\_Temp\claude\`) against their project paths show the literal 3-character rule in the plan undercounts: `_` and `.` are also replaced (`6__Work`→`6--Work`, `.claude`→`-claude` in a worktree path). The real convention is "replace every character outside `[A-Za-z0-9-]` with `-`, one-for-one, no collapsing" — carried into Task 3's dispatch verbatim. Cost if wrong: the SessionStart hint's "this project's harness dirs" byte sum would scan the wrong slug (or none), so the 100MB hint could silently never fire for a real project — caught by Task 3's own review/tests.

**Ruling (pre-Task-3, session_id exclusion):** Current session's UUID for exclusion comes from the SessionStart hook's standard `session_id` field in the stdin JSON (documented Claude Code hook schema, present on every hook event including SessionStart) — not by parsing `transcript_path`.

**Ruling (Task 3, CLAUDE_CODE_TMPDIR gap found by Task 5):** Once Task 3's hook redirects TEMP/TMP/TMPDIR into `<project>/.claude/.scratchpad/proc` via `CLAUDE_ENV_FILE`, any LATER Bash/PowerShell call that resolves `harnessTempRoot()` falls back to `os.tmpdir()` — which is now the redirected `proc/` dir — instead of the real harness temp root. Fix at the source — Task 3's `scratchpad-temp-env.mjs`, in the same `CLAUDE_ENV_FILE` append that writes the TEMP/TMP/TMPDIR redirect, ALSO export `CLAUDE_CODE_TMPDIR` set to the real harness root computed via `harnessTempRoot()` BEFORE the redirect. This fixes every later Bash-invoked `harnessTempRoot()` call in the session (Task 1's engine, Task 5's skill) without touching either of those files. Cost if wrong: if the harness doesn't actually source `CLAUDE_ENV_FILE`, this export is a no-op (harmless); engine/skill calls would still see the wrong root as today, no worse than before the fix.

**Breaker/adjudication (final fix wave — no second wave available):** Concern (a) from the fix wave's self-review — "a Windows file/dir-symlink recreation can hit EPERM without privilege, claimed benign" — is NOT benign as claimed. A partial `copyMoveNoFollow` failure (EPERM/ENOSPC/EBUSY partway through a directory) leaves already-copied children removed from source but recorded in NO manifest entry; `restoreBatch` deletes that unrecorded slot immediately, losing the data permanently. Real, and load-bearing in the sense that it's a genuine data-loss path, but: (1) it predates this phase's work, not a regression introduced by it; (2) likelihood is low (pnpm's junctions need no privilege; the EPERM trigger specifically needs a symlink, not a junction, recreated without Developer Mode/elevation); (3) a proper fix (manifest-entry-per-partial-child, or copy-everything-before-deleting-anything) is a bigger, more error-prone change to shared `applyPlan`/`moveInto`/`restoreBatch` code than this one-shot final fix wave should absorb without its own review pass — rushing it now, with no further review round available, risks introducing a new bug while fixing an old one. Logged as `RISK-CLEANUP-002` (Active) in `.ultrapowers/RISK_REGISTER.md`.

## Deviations and decisions

**Task 1 deviations:**
- `harnessSessionDirs` lives in `claude-cleanup-lib.mjs`, re-exported from `harness-temp.mjs` (avoids import cycle with `buildPlan` and `newestMtime`/`dirSize`).
- `buildPlan` calls the walker with `olderThanMs: KEEP_DAYS * DAY_MS`, not `0`, to avoid scanning fresh session dirs unnecessarily.
- `scanScratchpad` removed; `scanLayout({ mode: "legacy" })` covers `tmp/` entries instead.
- Trash `apply` requires the scratchpad (from `--scratchpad` or the plan's `scratchpad` field).
- `--purge-now` requires depth verification: each item must resolve to exactly `<slug>/<uuid>` under the real harness root.
- `promote` refuses a `name` with separators, `.`/`..`, or `INDEX.md`; escapes `|` and newlines in index cells; phase mode lists children of `scripts/`, `data/`, `logs/` plus any other direct child of `phase-<NN>/`.

**Task 3 fix round 2:** Task 5's implementer empirically confirmed the CLAUDE_CODE_TMPDIR gap by running `scan --harness` after the redirect and getting 0 entries against `...\proc\claude`. Fixed by exporting `CLAUDE_CODE_TMPDIR` in the same `CLAUDE_ENV_FILE` append, computed before the redirect is active.

**Task 5 improvised where spec was silent:**
- `proc/` items go to the trash plan regardless of kind.
- Other projects' harness rows collapse to one row per project in the `--all-harness` confirmation table.
- One `plan.json` path is reused sequentially (written, applied, overwritten, applied again) for the project-trash plan then the harness-purge plan, not two files.

**Final-review fix wave:** Task 5's implementer independently discovered `copyMoveNoFollow` needed to use `lstatSync` throughout, never following symlinks/junctions. Implemented by reading the raw target, resolving it to an absolute path, recreating it as a junction (preferred on Windows for no-privilege recreation), and unlinking only the source link. The recursion was changed to recurse into `copyMoveNoFollow` itself rather than back into `moveInto`, enabling testing the full tree walk without forcing EXDEV.

## Reviews

Task 1 implementation review (opus): `3c97019..72cc3bc`. Spec compliant; both pre-task rulings verified correct (slug regex independently checked against real harness names; session_id wiring traced through to harnessSessionDirs). Review raised one Important finding (BUG-003 logged; drained in dedicated drain phase).

Task 1 fix round 1 review (opus): `fa3c312..72cc3bc`. ADDRESSED.

Task 2 implementation review (sonnet): `72cc3bc..59c88ad`. Fully compliant, no Critical/Important findings.

Task 2 fix round 1 review (sonnet): `b4d6878..59c88ad`. ADDRESSED.

Task 3 implementation review (opus): `59c88ad..f2f9dfe`. Spec compliant, both controller rulings verified correct. Raised one Important finding (session_id exclusion test proves nothing).

Task 3 fix round 1 review (sonnet): `7d7291d..f2f9dfe`. ADDRESSED — fixture rewritten to verify exclusion actually suppresses the hint.

Task 3 hotfix review (opus): `484a821..21758a5`. Controller-ruled fix for the CLAUDE_CODE_TMPDIR gap found empirically by Task 5's implementer. ADDRESSED — export added alongside TEMP/TMP/TMPDIR redirect, harmless if gap doesn't exist.

Task 4 implementation review (sonnet): `f2f9dfe..0164179`. Fully compliant, no Critical/Important findings. Approved.

Task 4b implementation review (sonnet): `0164179..a096920`. Spec compliant, `decide`/`WAIT_ONLY` byte-identical to brief. Raised one Important finding (11 untagged tests, including only 3 proving no over-match).

Task 4b fix round 1 review (sonnet): `6da9a71..a096920`. ADDRESSED — 3+ tests tagged `@important`, remaining 8 reviewed per project convention.

Task 5 implementation review (opus): `a096920..484a821`. Spec mostly compliant (frontmatter, modes, session-id derivation, plan location, reuse wording verbatim, trash/purge-now split, one-question rule, report shape, grep check, scope boundary). Raised two Important findings (step 6's missing mkdir; no-scratchpad path skips inconsistently).

Task 5 fix round 1 review (sonnet): `daa3d95..484a821`. ADDRESSED for both findings — step 6 now mkdir-then-writes like step 4; no-scratchpad path skips steps 3-6 and 8 together.

Task 6 implementation review (sonnet): `21758a5..a2ddb61`. Fully compliant, no Critical/Important/Minor findings. Verbatim-text claim hash-verified byte-for-byte against spec §2.

Task 7 implementation review (sonnet): `a2ddb61..60bf224`. All four hooks documented, RU/EN structural parity verified line-by-line and programmatically. Raised one Important finding (new CLAUDE.md line misattributes four-folder layout enumeration).

Task 7 fix round 1 review (sonnet): `8b94d13..60bf224`. ADDRESSED — misattribution dropped, four-folder list verified against spec §1 exactly.

BUG-003 drain review (opus): `60bf224..e566ea9`. Approved — arithmetic checked in both modes, no off-by-one, 5ms margin sound, tests deterministic, BUGS.md entry correct.

Final-review fix wave review (opus): `e566ea9..d073378`. Both mandated findings ADDRESSED — link-following hazard verified gone at every recursion depth, guard/engine naming byte-identical. Concern (b) confirmed benign (read-only). Concern (a) escalated to residual Important finding, parked as RISK-CLEANUP-002 (Active).

## Pre-deploy fixes (2026-09-27)

Separate plan (`.ultrapowers/phases/22-scratchpad-phase-cleanup/22-FIXES-PLAN.md`), Tasks
1-8, closing the user's five pre-deploy decisions plus every deferred minor/out-of-spec item
from the phase 21 and 22 final reviews before merge. Commit range `4ca79b9..eefa73e` plus the
commit updating this summary: Tasks 1-7 at `4ca79b9..1e61f65`, Task 8 docs at `8239067`, the
BUG-004 fix at `e44c5fa`/`67c8d3c`, and the final whole-branch review's fix wave at
`15f3574..eefa73e`. The final whole-branch review ran; its one fix wave closes the plan.

Five user decisions, all closed:
1. Cross-device trash move now copies everything, verifies (count + bytes), then deletes
   the source; a part-way copy failure leaves the source intact (`9468858`); a double
   failure (source delete and copy-back both fail) prints a `WARNING:` line (`43c0717`).
2. Another session's harness dir is never touched while active; an inactive one is eligible
   past 24 h (was 2 h) — `proc/` still keeps its 2 h (`f082d23`).
3. `promote --src` accepts only paths under `<project>/.claude/.scratchpad/`, refusing a
   junction/symlink that resolves outside it (`0eb3120`, `d923990`), and a link outside it
   whose target resolves inside it (`15f3574`).
4. Unparsable `settings.json`/`.claude.json` is left untouched everywhere in `setup.mjs`,
   never overwritten (`8b1eed7`).
5. `verification-before-completion` skips self-verification only on Opus 5.5+; every other
   model checks its result against the spec/plan's acceptance criteria before claiming done
   (`fa9d69c`, `2822db9`).

`RISK-CLEANUP-002` (parked Active by the final-review fix wave above) is now **Closed** —
fixed by decision 1's commit, `.ultrapowers/RISK_REGISTER.md` updated in `a57f442`.

Task 7 also drained this phase's own deferred minors (guard/temp-env/nudge/sleep-guard/skill
fixes, BUG-003 test naming, `harnessTempRoot` trailing-leaf assertion, junction-realpath
comparison in `apply`) across five commits (`98e260e..1e61f65`).

Task 8: confirmed the README wording Task 5 landed directly in its own commit
(`README.en.md:506`, `README.md:492`) still reads correctly, and grepped both READMEs for
stale 2 h harness-threshold language and for the old unparsable-settings.json-overwrite
behavior. None was found: the READMEs never stated the harness threshold in hours, and their
only unparsable-settings.json line (added in phase 21's `c7dd2f7`) already describes the
skip; neither `f082d23` (Task 2) nor `8b1eed7` (Task 4) needed a README change.

Task 8's full-suite run failed 2 tests in `payload/hooks/phase-end-cleanup-nudge.test.mjs`:
its `runHook()` passed the session's ambient `CLAUDE_PROJECT_DIR` to the spawned hook, which
then resolved the real repo as the project root. Logged as BUG-004 in `.ultrapowers/BUGS.md`
and fixed in `e44c5fa` (`runHook()` clears `CLAUDE_PROJECT_DIR`, plus a regression test), log
updated in `67c8d3c`; the suite then stood at 540/540.

Final whole-branch review fix wave (`15f3574..eefa73e`):
- `promote --src` also checks where `src` itself sits (`realpath(dirname(src))` + basename),
  so a link outside the scratchpad pointing into it is refused (`15f3574`, `@critical` test).
- `/claude-cleanup scan` reports an unavailable session registry: `buildPlan` returns
  `registry: "ok"|"unavailable"`, the CLI prints a stderr line, the command reports it
  (`be1ddd5`).
- The SessionStart `/scratch-prune` hint sums only harness dirs older than 24 h, the age the
  engine removes (`efac466`).
- 21-SPEC/22-SPEC normative cleanup (`a75e945`); RISK-CLEANUP-002 cites `43c0717` and the
  double-failure warning (`eefa73e`).

Full suite (`node run-tests.mjs`) after the fix wave: **543 tests, 543 pass, 0 fail,
0 cancelled, 0 skipped** (540 plus the fix wave's 3 new tests).

Addendum (user decision 2026-09-27, plan Tasks 9-12 — the final review's four out-of-spec
items), `0350a40..21df17b`:
- Task 9 (`0350a40`): trash `apply` checks the scratchpad's own last path component and
  compares item realpaths against the scratchpad realpath, so a `.scratchpad` that is itself a
  junction/symlink to another directory is supported (cross-drive follows the same realpath
  rule, not exercised by tests); a link inside it pointing outside is still refused
  (22-SPEC § 4).
- Task 10 (`ee2a2ec`): every `setup.mjs` spawn in `setup-variants.e2e.test.mjs` runs with a
  fresh sandbox `HOME`/`USERPROFILE` holding its own `.claude.json`; a final `@critical` guard
  asserts every recorded spawn had a sandbox home and the real `~/.claude.json` `autoUpdates`
  value is unchanged. Mtime+size are not asserted — a live Claude Code session rewrites that
  file mid-run (21-SPEC § 4).
- Task 11 (`1179e61`): the `autoUpdates` block and `--doctor` read JSON through
  `readJsonOrNull`, so BOM-prefixed valid files parse (21-SPEC § 1b).
- Task 12 (`21df17b`): `scan --harness ""` exits 1 (22-SPEC § 4).

Full suite after the addendum: **549 tests, 549 pass, 0 fail, 0 cancelled, 0 skipped**
(543 plus 6 net new tests).

Addendum review findings (`e4151db`): a missing item in a relocated `.scratchpad` is skipped
instead of failing the whole `apply`; a bare `--harness` or `--harness=` is rejected like
`--harness ""`; a `.scratchpad2` sibling-prefix refusal test; the e2e home guard also refuses a
sandbox home under or above the real home. Full suite after it: **550 tests, 550 pass, 0 fail,
0 cancelled, 0 skipped** (549 plus 1 new test).

Left for the user's call, not fixed: `/claude-cleanup apply` re-checks mtime drift but not
session activity at apply time; two comments in `claude-cleanup-lib.mjs`/`scratch-prune.mjs`
explain rejected alternatives; the Task 7 realpath check now refuses a cross-drive-junction
`.scratchpad` the old basename check accepted (**resolved** by the addendum, `0350a40`); e2e
tests write the real `~/.claude.json` via the plain `run()` helper (pre-existing; **resolved**,
`ee2a2ec`); `autoUpdates`/`--doctor` still use plain `JSON.parse` (**resolved**, `1179e61`); an
empty `--harness ""` slips past the scan-mode-conflict check (**resolved**, `21df17b`). The
addendum range `0350a40..21df17b` resolves these four; the first two items stay open.
