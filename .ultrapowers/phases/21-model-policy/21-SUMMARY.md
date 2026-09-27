## Tasks

1. Task 1: Session defaults — planner, setup block, tests (cfa676c..f13662c)
2. Task 2: Policy text — CLAUDE.md fragments and the skill (f13662c..30d5175)
3. Task 3: Fork delta 016 and revision 2; repo D:\6__Work\AI_Projects\ultrapowers, branch patch (d654549..5146baf)
4. Task 4: Docs and full suite (30d5175..30f7968)
5. Final-review fix wave (30f7968..c7dd2f7)

## Rulings

Task 1 — Minor (deferred, test coverage):
- No e2e test for --skip-all / interactive n on session defaults (verified correct by code reading).
- No unit test for the exact mixed case model=sonnet/effortLevel=xhigh (correctness follows from per-key independence, both tested separately).
- No e2e test for a sandbox with settings.json fully absent (only unit-tested via buildSessionDefaultsPlan({}, ...)).

Task 1 — Out of spec (parked, non-load-bearing):
- A non-string managed-key value in settings.json renders oddly in describeSessionChange (e.g. "model: null -> sonnet") but never crashes.
- A failed write(SETTINGS, ...) silently omits the summary line with no surfaced error — matches the pre-existing enabledPlugins block's behavior, not introduced by this task.

Task 2 — Scoping decision (accepted):
The brief's literal "ultrapowers must not appear ANYWHERE in lite output" check is already false pre-task (07-conventions.md, 09-plugins.lite.md legitimately say "ultrapowers" in lite, unrelated to model selection). Scoped the negative assertion to the Model Selection Policy section of lite specifically. Independently verified by reviewer; narrowing judged a legitimate non-brittle-test design choice.

Task 2 — Minor (deferred):
- payload/skills/model-selection-policy/SKILL.md — the new "Ultrapowers per-role model map" table sits two sections above the unchanged "Concrete per-role assignments are not duplicated here" GSD sentence; a skimming reader could conflate the two unrelated systems. Consider a one-word disambiguation at the final whole-branch review or later, not blocking.

Task 3 — Ruling on fork local main ref move (accepted):
build-cli.mjs commit moves the fork's local main ref forward (eb6a837 -> 4b7d032) via git update-ref. This is plan-mandated, ordinary build-tracking tooling, not a hard-limit violation ("no merge into master" refers to claude-config's own master, unrelated to the fork's local main ref). It is Step 4 of the plan's own Task 3 instructions, is git-plumbing-only (no push, no checkout, no working-tree change), and is this fork's long-established build-tracking convention used identically by every prior delta. Cost if wrong: low and reversible — main is local-only, never pushed.

Task 4 — Minor (deferred, pre-existing):
- README.en.md:493 / README.md:480 describe the verification-before-completion skill as "Opus 5 verifies its own work" — now sits ~200 lines above the new Sonnet-5-default material. Not introduced by this diff; flagged for a possible follow-up pass, not a phase-21 blocker.

Final-review — Critical (fixed):
An unparsable (existing but invalid-JSON) settings.json is indistinguishable, inside the new session-defaults block, from an absent one — safe(() => JS...) returns {} for both, and the planner is blindly applied without any cur === null gate. A plan defect, not an implementer defect; the plan's own Step 1 code was unsafe. Fixed by gating the whole block behind the pre-existing cur === null detection, reusing it so an invalid file is left untouched and reported.

Final-review — Important (fixed):
The plan's own Step 1 code (else if (BULK) apply = changes;) incorrectly allows --merge-all to overwrite a session-default conflict, contrary to the spec which names only --replace-all and interactive y as write-eligible. A plan defect. Fixed with else if (BULK === "replace") apply = changes;; README.md/README.en.md also corrected to say only --replace-all (not --merge-all) writes a conflict.

Final-review — Out-of-scope concern (not fixed):
The same safe(...) || {} unparsable-JSON class of bug exists, pre-existing and unrelated to this phase, in three OTHER setup.mjs blocks: enabledPlugins (~1304/1342), MCP reconciliation's cj (~1384), and the update-check/PowerShell opt-in blocks (~1466/~1501). None were introduced by phase 21; fixing them is out of this fix's scope.

## Deviations and decisions

Task 1 — No deviations from the brief. All pre-requisite file structures (imports at setup.mjs:50-51, MCP reconciliation block ending at line 1426, helper signatures) matched the plan's assumptions exactly; Step 1 code blocks were used verbatim.

Task 2 — Scoping decision on the negative "ultrapowers" check. The brief required testing that "ultrapowers must not appear ANYWHERE in lite output," but this assertion is already false pre-task: 07-conventions.md and 09-plugins.lite.md legitimately ship "ultrapowers" in lite for reasons unrelated to model selection. The implementer narrowed the check to the Model Selection Policy section of lite specifically, a non-brittle scope following the same precedent already used in variants.test.mjs. The reviewer independently verified the pre-existing false condition and accepted the narrowing as a legitimate design choice. No source files outside this task's scope were touched.

Task 3 — Concern raised about the fork's local main ref move. The implementer flagged that build-cli.mjs commit advances main (eb6a837 -> 4b7d032) via git update-ref — the hard limits said "don't touch main." The reviewer investigated directly: checkout stayed on patch; both main and patch are only 1 commit ahead of their origin/* counterparts (nothing pushed); build-cli.mjs's commit is plumbing-only; git log main shows this pattern predates this task across every prior delta. The reviewer ruled this compliant — it is plan-mandated Step 4, established fork convention, local-only, and the hard limit refers to claude-config's own master branch, unrelated.

Final-review fix wave — Two bugs fixed:
1. Finding 1 (Critical): Invalid JSON in settings.json was treated as absent and silently overwrote with {}. Fixed by checking cur === null (reusing the pre-existing structured-merge block's own detection) and skipping the block, logging "INVALID JSON - left untouched."
2. Finding 2 (Important): The code allowed --merge-all to apply a session-default conflict, violating the spec which permits only --replace-all or interactive yes. Fixed by narrowing the condition to else if (BULK === "replace"); README corrected in both languages.

Out-of-scope concern: The fix wave noted that three other setup.mjs blocks share the same safe(...) || {} unparsable-JSON bug class (enabledPlugins, MCP reconciliation, update-check/PowerShell opt-in), all pre-existing and outside phase 21's scope. Accepted as out-of-scope, not fixed in this round.

## Reviews

Task 1 review: git diff cfa676c..f13662c — Spec compliant, all 5 acceptance criteria met; 0 Critical, 0 Important. Approved.

Task 2 review: git diff f13662c..30d5175 — Spec compliant; independently verified the scoping decision by reading both named fragments; confirmed no stale "Opus 5.5 by default" claim remains; 0 Critical, 0 Important. Approved.

Task 3 review: git diff d654549..5146baf (in repo D:\6__Work\AI_Projects\ultrapowers, branch patch) — Spec compliant; independently reproduced every acceptance check byte-for-byte (blob-hash comparison of the patch's pre/post image, config revision, README text/placement, staged file list); investigated the main-ref concern directly; 0 Critical, 0 Important. Approved.

Task 4 review: git diff 30d5175..30f7968 — Spec compliant; independently verified new README prose line-by-line against source; Russian mirror judged a faithful idiomatic re-expression; 0 Critical, 0 Important. Approved.

Final whole-branch review: git diff cfa676c..30f7968 — Two real findings identified (Critical: invalid JSON treated as absent; Important: --merge-all allowed on conflict), both load-bearing, both carried to a fix subagent.

Final-review fix wave review: git diff 30f7968..c7dd2f7 — Both findings ADDRESSED, independently verified; no new Critical/Important breakage; clean, no further rounds needed. Approved.

## Pre-deploy fixes (2026-09-27)

Separate plan (`.ultrapowers/phases/22-scratchpad-phase-cleanup/22-FIXES-PLAN.md`), Tasks
1-8, scoped here to what it changed in phase 21's own territory. Commit range
`4ca79b9..eefa73e` plus the commit updating this summary: Tasks 1-7 at `4ca79b9..1e61f65`,
Task 8 docs at `8239067`, the BUG-004 fix at `e44c5fa`/`67c8d3c`, and the final whole-branch
review's fix wave at `15f3574..eefa73e`. The final whole-branch review ran; its one fix wave
closes the plan. In phase 21's territory that wave rewrote `21-SPEC.md` §§1a/1b/1c/2 as
normative rules and documented both invalid-`settings.json` messages a broken file produces
(`a75e945`).

Two of the plan's five user decisions land here, both closed:
- Decision 4: the `cur === null` unparsable-JSON guard this phase's own final-review fix
  wave added only to the session-defaults block (see Final-review fix wave above, and its
  "Out-of-scope concern" entry) is now generalized to every other `setup.mjs` block that
  reads `settings.json`/`.claude.json` — `enabledPlugins`, MCP reconciliation, and the
  update-check/PowerShell opt-in blocks all skip and report an unparsable file instead of
  overwriting it (`8b1eed7`). The out-of-scope concern from this phase's final review is
  now resolved, not just noted.
- Decision 5: `verification-before-completion` no longer no-ops on every model; only Opus
  5.5+ skips self-verification — every older/other model now checks its result against the
  spec/plan's acceptance criteria before claiming done, and the two policy sentences dropped
  in this phase ("do not carry effort values over between models"; "revisit any `max_tokens`
  sized for a no-thinking budget") are re-added (`fa9d69c`, `2822db9`).

Task 6 of the fixes plan drained this phase's own deferred minors from Task 1/2/4 above:
`describeSessionChange` now renders a non-string current value as JSON
(`model: null -> sonnet`); the interactive model-migration prompt and the session-defaults
prompt about the same key no longer fire back-to-back; e2e coverage was added for
`--skip-all`, interactive `n`, and a fully-absent `settings.json`; and
`model-selection-policy/SKILL.md`'s GSD sentence heading no longer risks being read as the
ultrapowers per-role map (`fd755ab`, `564d293`).

Task 8's full-suite run failed 2 tests in phase 22's
`payload/hooks/phase-end-cleanup-nudge.test.mjs` (ambient `CLAUDE_PROJECT_DIR` leaking into
the spawned hook, unrelated to phase 21). Logged as BUG-004 and fixed in `e44c5fa`/`67c8d3c`
(see `22-SUMMARY.md`). Full suite (`node run-tests.mjs`) after the final review's fix wave:
**543 tests, 543 pass, 0 fail, 0 cancelled, 0 skipped**.
