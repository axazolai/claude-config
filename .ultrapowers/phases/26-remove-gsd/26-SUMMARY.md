# Phase 26 — Remove GSD and the full profile: summary

Branch `phase-26-remove-gsd` from `master` at 58d0980. Spec: `.ultrapowers/phases/26-remove-gsd/26-SPEC.md`. Plan: `.ultrapowers/phases/26-remove-gsd/26-PLAN.md`. Execution: subagent-driven. Testing mode: test-after. Final state: branch ready to merge at 18bca2e; full suite `node run-tests.mjs` 625 pass, 0 fail, at 18bca2e.

## Tasks

- Task 1: purge plan module (`gsd-purge.mjs` and its test file) lists every GSD path and the GSD settings entries to remove — `58d0980..ed2f015`
- Task 2: runtime hooks, libraries and the status line drop their GSD code paths — `ffad000..83771eb`
- Task 3: the `full` profile is removed and the 28 GSD bundle files are deleted; `full` resolves to `base` — `83771eb..d6f33fe`
- Task 4: the GSD purge runs on every install, before the settings merge; the gsd-core detector is removed — `d6f33fe..4cd6342`
- Task 5: skills, READMEs, `.claude/CLAUDE.md` and the risk register drop GSD text; eight GSD risks move to Closed — `4cd6342..6d574f0`
- Fix wave (final-review findings): BOM-safe settings parse in the purge, exact-equality listing test, untagged config tests, dead import and comment cleanups, README `RISK_REGISTER.snippet.md` mentions removed — `54b7bc0..18bca2e`

## Rulings

Ruling 1 through Ruling 4 (pre-flight):

Ruling 1: Branch `phase-26-remove-gsd` in place, not a worktree — the repo's merge history uses plain phase branches (`phase-25-deepseek-offload`, `phase-24-model-ladder`) — cost if wrong: none, the branch can move to a worktree.

Ruling 2: T4 keeps `runTty()`, `TTY_DIR`, `TTY_DRIVER` and their comment (reworded to drop "foreign gsd-core detector") when it replaces the detector suite; T3 drives the interactive `full` row through `runTty()` — the helper also serves the session-defaults tests at ≈L610-621 — cost if wrong: one re-added helper.

Ruling 3: Between T3 and T5, failures in `docs-claims.test.mjs` / `docs-coverage.test.mjs` caused only by README/CLAUDE.md text naming deleted files are expected and are not fixed before T5; T5's full suite is the gate — cost if wrong: an intermediate red commit, no shipped defect.

Ruling 4: Rungs follow the repo's committed policy (commit f29c728, undeployed): implementer with full code → rung 1; prose/multi-file implementer → rung 2; logic task reviews and final review → rung 4; scoped re-review → rung 1 — the user ruled that policy; only its deploy is owed — cost if wrong: cheaper reviews than the deployed text prescribes.

Ruling 3 amended: `docs-claims.test.mjs` / `docs-coverage.test.mjs` do not exist under those names in this tree (Glob found none); the Task 5 full suite remains the gate for doc-text drift.

Ruling lines raised during the work:

Task 1: Ruling: Important "GSD_PATH/hook matching covers only gsd-core, get-shit-done, .gsd, hooks/gsd-; settings entries naming other purged paths (BUNDLE_RELS files, top-level gsd-*, agents/gsd-, skills/gsd-, commands/gsd, hooks/lib/gsd-) survive" — fix the code to match spec § 4.1 ("name a purged path"), and update the plan's Task 1 code to the fixed version — the spec is the binding authority, the plan's regex was narrower than its own spec — cost if wrong: a broader match removes a user permission/hook naming a gsd-* path (already RISK-GSDPURGE-001).

Task 1: Ruling: out-of-spec "an already-empty references/ is listed for deletion" — treated as a spec gap, not out of spec: § 4.1 says "a directory left empty by these removals", so `references` is listed only when at least one of its entries is itself listed; folded into fix round 1 — cost if wrong: a stale empty references/ dir stays behind.

Task 1: Ruling: anchor every path alternative (BUNDLE_RELS, RETIRED_HOOK_FILES, top-level gsd-*, agents/gsd-*, skills/gsd-*, commands/gsd, hooks/gsd-*, hooks/lib/gsd-*) to the config dir — a preceding `.claude` segment OR the literal claudeDir path (slash-normalized, case-insensitive) — so `stripGsdSettings(settings, claudeDir)` takes claudeDir and planGsdPurge passes it; the product names `gsd-core`, `get-shit-done`, `@opengsd` stay matched anywhere (they name GSD itself, e.g. the `Bash(npx gsd-core *)` permission on this machine), and `.gsd` stays matched as a path segment — spec § 4.1 says "a purged path", and purged paths live under claudeDir or are ~/.gsd — cost if wrong: a GSD entry written with an unusual prefix (e.g. `%USERPROFILE%` form without `.claude`) survives.

Task 2: ⚠️ resolved by controller as a real gap: reviewer's out-of-spec "the /init-mcp suggestion now appears in lite" — `variants.json:75` puts `commands/init-mcp.md` in lite.exclude, and spec § 3 says the suggestion shows "in every profile that ships /init-mcp", so lite must not show it; enters fix round 1. Ruling: gate the suggestion on `commands/init-mcp.md` existing in the config dir (not on a profile name) — follows the spec's wording "ships" literally and survives future profile edits — cost if wrong: a hint missing on a machine whose config dir is unusual.

Ruling: variants.json `$gsd` — spec § 3 says `$gsd` is removed, the plan said to add a `$gsd` line justifying the forbid; the user's rule is "write instructions, not justifications", so `$gsd` is kept as an instruction: "`gsd` stays in managedPlugins and forbiddenPlugins so plugin reconciliation uninstalls it; no profile lists it." — the spec's intent (no GSD justification text) and the plan's (a pointer explaining the forbid) both hold — cost if wrong: one comment line.

Parked findings: none — every fix loop closed before the cap. Final-review triage and the
recommendation not taken:

Final triage — fix before merge: T1 exact-equality (= Important 2); T3 untag the three config-restating tests in variants.test.mjs; T4 dead imports setup.mjs:45; T4 stale comments setup.mjs:1339-1341 and :934; T5 READMEs naming RISK_REGISTER.snippet.md. Can stay: every other deferred minor (reasons in the final review).

Final review recommendation not taken (spec silent → user): an @critical guard that no base/lite V.rels entry matches the purge patterns.

Deferred minors (`minor (deferred)`):

Task 1: minor (deferred): test fixture for the gsd-core hook uses a backslash path matching via hooks\gsd-core; the forward-slash quoted review-focus form `"C:/…/node.exe" "C:/…/hooks/gsd-check-update.js"` is never tested (gsd-purge.test.mjs:172).

Task 1: minor (deferred): hooks/my-gsd-helper.mjs tested only on disk, never as a settings hook registration (gsd-purge.test.mjs:159-176).

Task 1: minor (deferred): listing test checks inclusion/exclusion, not exact equality — over-listing would pass (gsd-purge.test.mjs:163-166).

Task 2: minor (deferred): session-init.mjs:94 step comments start at `// 2)` after step 1 was deleted — renumber.

Task 2: minor (deferred): worktree-executor-discipline-advisor.mjs leaves a dangling `(parallel worktree waves)` parenthetical where the rules-src/gsd.md citation was removed.

Task 2: minor (deferred): merged comment lines in session-init.mjs run past the ~100-column width.

Task 3: minor (deferred): tests in variants.test.mjs that restate config carry tags (`@critical the bundle ships exactly the profiles base and lite`, `@important gsd is a forbidden managed plugin…`, `@important base ships the CI-watch and worktree-discipline hooks; lite ships neither` — the last duplicates the e2e assertTreeEquals) — untag or drop so the prune removes them.

Task 3: minor (deferred): removal line printed twice on an interactive run with a `full` manifest when the user also types `full` (setup.mjs:745-747).

Task 3: minor (deferred): stale comment setup.mjs:964 "a lite install must not re-add gsd-only hook entries" → base-only hooks.

Task 4: minor (deferred): dead imports `applyPlan`, `purgeRetention`, `trashRoot` in setup.mjs:45 (used only by the deleted detector).

Task 4: minor (deferred): dead imports `cpSync`, `statSync` in setup-variants.e2e.test.mjs:3.

Task 4: minor (deferred): stale comments setup.mjs:1339-1341 ("the detector is handed what it already claimed"), :934 ("Either historical renderer counts as ours"); pruneStale() still builds and returns `considered` (:533, :535, :555) that nothing reads.

Task 4: minor (deferred): e2e assertion `doesNotMatch(text, /gsd|db-live-access-gate/i)` (setup-variants.e2e.test.mjs:313) depends on the temp path not containing "gsd" — tighten to the GSD file names.

Task 4: minor (deferred): e2e fixture plants no hooks/gsd-*, skills/gsd-*/, hooks/lib/gsd-*, get-shit-done/ (covered at the Task 1 pure seam).

Task 4: minor (deferred): setup.mjs:846/:849 (verbatim from the plan) — a throwing copyFileSync aborts the install after paths are gone (settings untouched); a failed project-init write is not logged.

Task 5: minor (deferred): README.en.md:601, :1139 and README.md:588, :1126 still name `RISK_REGISTER.snippet.md`, which Task 3 deleted — the sentences now point at a missing file.

Task 5: minor (deferred): closed risk sections (ULTRAPOWERS-010, VARIANT-003/004/005, GSDEXEC-001) keep a stale "Status nuance (migrated …)" line after the new Closed status.

Deferred minors closed by the fix wave:

Deferred minors closed by the fix wave 18bca2e: T1 exact-equality listing test; T3 untagged config-restating tests; T3 setup.mjs:964 comment (closed earlier in T5); T4 dead imports setup.mjs:45; T4 stale comments setup.mjs:1339-1341 and :934; T5 README RISK_REGISTER.snippet.md mentions. Every other `minor (deferred)` line stays open by the final review's triage ("can stay").

Out of spec (for the user):

Task 1: out of spec (for the user): any hook whose command contains hooks/gsd-* is removed, even outside ~/.claude (e.g. D:/proj/hooks/gsd-foo.js) — spec § 4.1 states "a hooks/gsd-* script", so the behaviour is per spec; covered by RISK-GSDPURGE-001.

Task 2: out of spec (for the user): removing the `gsd` stack fingerprint makes stack-rules.md snapshots compiled with it report `stale` (removed: gsd) once in /init-stack for GSD-era projects with .planning/ — one rebuild prompt; the rebuilt snapshot drops gsd.md.

Task 3: out of spec (for the user): a pre-variant manifest with no profile/variant field (formerly defaulted to full) now resolves to base silently, with no removal line.

Task 3: out of spec (for the user): an unknown stored profile (e.g. `foo`) prints the warning and then `Switching variant: foo -> base`.

Task 3: out of spec (for the user): `--variant=FULL` (uppercase) exits 1 as unknown; the prompt lowercases, the flag does not.

Task 4: out of spec (for the user): --dry-run on a machine with a gsd-statusline.js statusLine previews a settings merge that leaves it alone, while the real run repoints it to hooks/statusline.mjs (the purge clears it first).

Task 4: out of spec (for the user): settings.json.pre-gsd-purge is overwritten if GSD hooks reappear and a later install purges again — the original pre-purge backup is lost.

Task 4: out of spec (for the user): the `.claude`-segment branch of settings matching is exercised only at the Task 1 pure seam; the e2e config dir is a temp dir not named .claude.

Task 5: out of spec (for the user): edits beyond the brief — READMEs' statusline now described as five segments, a "Bundle release check" section, the Windows bootstrap+gsd-patch block removed, the add-risk/RISK_REGISTER lookup tail removed, the RU statusLine-merge sentence cleaned.

Final out of spec (for the user): env value with a `.gsd` segment drops the whole entry (e.g. env.PATH containing C:/Users/x/.gsd/bin) instead of trimming it.

Final out of spec (for the user): `.claude`-segment matching also removes user-settings permissions/hooks naming project dirs like D:/proj/.claude/skills/gsd-x (per § 4.1; RISK-GSDPURGE-001).

Final out of spec (for the user): former full machines' DeepSeek offload default drops from heavy to medium (deepseek-defaults.json rewritten), with only a summary line.

Final out of spec (for the user): the GSD purge ignores CLAUDE_SETUP_SKIP_PURGE (plan put it outside the guard deliberately); the graphify purge honours it.

Final out of spec (for the user): CLAUDE_CONFIG_DIR pointed at the home dir itself would let the top-level gsd-* pattern delete gsd-* entries in home (pre-existing exposure for graphify too).

Final out of spec (for the user): an unparsable settings.json leaves gsd-core registrations pointing at deleted files (accepted by plan and test).

## Deviations and decisions

Plan defects and mid-phase changes:
- Task 1: the plan's own Task 1 regex was narrower than spec § 4.1 (it matched only gsd-core, get-shit-done, .gsd and hooks/gsd-). The Task 1 review (rung 4) returned Needs fixes, and the fix took three rounds. Round 1 (commit d644935) replaced the separate matchers with one `PURGED_RE` over every purged name, which over-matched bare `gsd-` and unanchored BUNDLE_RELS names anywhere on disk (for example `Read(~/code/gsd-tool/**)`). Round 2 (commit fe8b073) anchored path alternatives to the config dir; this changed the interface to `stripGsdSettings(settings, claudeDir)` and added a sentence to spec § 4.1. Round 3 (commit ed2f015) let suffixed product names such as `get-shit-done-cc` match. The plan's Task 1 code block was replaced with the fixed module each round.
- Task 1: the `EMPTIED_DIRS` rule was tightened in round 1 so an already-empty `references/` is not listed.
- Task 1: the round-1 fix attempt was BLOCKED by BUG-005. The protected-guard denied every write because the controller had left the session cwd inside `.ultrapowers/sdd/`. The cwd was restored to the repo root and the same round was re-sent to the same implementer. The blocked attempt was not counted as a failed round. BUG-005 is outside phase 26 and was listed to the user, not fixed.
- Task 1: mutation checks ran for the initial build and round 2. Rounds 1 and 3 were not mutation-checked.
- Task 2: the reviewer found that the `/init-mcp` hint appeared in `lite`, although `lite` excludes `commands/init-mcp.md`. The hint is now gated on that file existing in the config dir (ruling above). The plan's Task 2 Step 1 bullet was updated to match.
- Task 2: the implementer also made comment-only GSD cleanups outside the brief's file list (deny-curated-claude-md, atomic-json, impeccable-promax-graft, mark-initstack-done, verbosity-rules.test, and a stale comment in variants.test.mjs). `setTddMode` now returns `{mode, file}` instead of `gsdSynced`.
- Task 2: the `.planning` acceptance test initially ran only on base and lite manifests, where the removed branches were already off. The fix round made it loop over no manifest, full, base and lite.
- Task 3: the implementer dropped "per-role GSD effort map" from `12-model-selection.md` early, because the assembled CLAUDE.md must contain no `\bgsd\b`. That text was a Task 5 item. The implementer also deleted two e2e tests whose premise was a full install owning gsd-* files, added `deepseek-defaults.json` to `assertTreeEquals`' generated-file exclusions, and removed the `SKILL` constant, the `RISK_REGISTER.snippet.md` entry in META, and `UPDATE_GSD_CORE_FLAG` (no doc line existed for it).
- Task 3: the interactive `full` prompt test runs with `--dry-run`. The run ends when the keyed answer is spent and stdin closes, so no manifest is written.
- Task 3: the controller resolved a gap at review. Machines that installed `full` keep the `gsd-config-patch.mjs` and `db-live-access-gate.mjs` registrations and files until Task 4 lands. Task 4's purge removes both, and its @critical e2e fixture is a former `full` install carrying those two registrations.
- Task 3: the `docs-claims` and `docs-coverage` test files that Ruling 3 names do not exist in this tree. The Task 5 full suite was the gate.
- Task 4: the implementer extended `RETIRED_HOOK_FILES` to include the two retired hooks, so stale registrations are stripped by the merge too. The statusLine takeover now recognises only `hooks/statusline.mjs`; the `gsd-statusline.js` and `gsd-context-meter` takeovers were dropped. The e2e temp directories were renamed `cc-sd-*` so the "no gsd in settings" assertion does not match the temp path. The backup copy and the planner's handling of unparsable or malformed settings were probed. A mutation that removed the backup copy failed row 1, and the row was restored.
- Task 5: beyond the brief, the implementer also removed the `.claude/CLAUDE.md` clause about `add-risk.mjs` (no hook denied that edit), `git rm`'d `docs/gsd-config-defaults.md` and `docs/review.md`, moved RISK-GSDPURGE-001's Contents line from Closed to Active to match its status, and reworded a setup.mjs comment "gsd-only" to "base-only". That last edit also closed Task 3's deferred minor on setup.mjs:964. The README doc claims about the purge were written from reading `gsd-purge.mjs`, not from a dry run.
- Fix wave: the BOM defect was reproduced first. Bare `JSON.parse` on BOM-prefixed settings returned `null`, which left GSD hook and statusLine registrations behind. The fix reads settings and project-init through a BOM-stripping helper; an absent or unparsable file still yields null. A new e2e row covers the BOM case, and a mutation restoring bare `JSON.parse` fails it.

Ledger and report disagreements:
- Task 2 base: the ledger's Task 2 dispatch line records `BASE ed2f015`, while its completion line records `ffad000..83771eb`. Tasks section uses the completion line as the ledger directs. The reviews section uses `ed2f015` as the review base, because the ledger's dispatch line records it.
- Fix wave dead import: the ledger lists `setup.mjs:45` dead imports as `applyPlan`, `purgeRetention` and `trashRoot`. The final-fix report instead says it removed the `claude-cleanup-lib` import. The ledger names the imports and the report names a different import. Both are recorded here; the text alone does not settle which was removed.

## Reviews

- Task 1 review (rung 4), initial: Needs fixes (Important) — `58d0980..b2252f9`
- Task 1 re-review after fix round 1 (rung 2) — `b2252f9..d644935`
- Task 1 re-review after fix round 2 (rung 2) — `d644935..fe8b073`
- Task 1 re-review after fix round 3 (rung 2), clean — `fe8b073..ed2f015`
- Task 2 review (rung 4): Needs fixes (Important, `.planning` test) — `ed2f015..1683161`
- Task 2 re-review after fix round 1 (rung 1), clean — `1683161..83771eb`
- Task 3 review (rung 4): Approved, spec ✅ — `83771eb..d6f33fe`
- Task 4 review (rung 4): Approved, spec ✅ — `d6f33fe..4cd6342`
- Task 5 review (rung 2): Approved, spec ✅ — `4cd6342..6d574f0`
- Final review (rung 4): With fixes (2 Important: BOM parse in the purge; listing test not exact-equal) — `58d0980..54b7bc0`
- Fix-wave scoped re-review (rung 2): all eight items addressed, no new breakage — `54b7bc0..18bca2e`
