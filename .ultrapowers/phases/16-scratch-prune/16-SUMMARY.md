# Phase 16 — scratch-prune — Summary

## Tasks

- Task 1 — `scanScratchpad` scan contract + 2 `@important` tests, byte-identical to the brief: `ad3e922..28f66f2`
- Task 2 — engine CLI (`scan`/`apply`/`restore`/`purge-retention`) wired to the shared trash: `28f66f2..86dc74a`
- Task 3 — `/scratch-prune` SKILL.md (table, selection, confirm, apply), byte-identical to the brief: `86dc74a..f1a88ea`
- Task 4 — READMEs (EN/RU), ROADMAP, RESUME, `16-STATE.md`: `f1a88ea..cb51671`
- Final fix wave — outsideTmp guard, unknown-command exit, SKILL.md wording, RISK register update: `cb51671..48a88e4`
- Task 5 — suite, merge, deploy: owed, per the ledger; run by the controller after this summary.

## Rulings

- Task 1: minor (deferred): tests do not assert the returned `tmp`/`scratchpad` fields (brief-inherited).
- Task 1: minor (deferred): no fixture with two aged items, so size-desc order inside the aged bucket is untested (same comparator as the non-aged bucket).
- Task 2: minor (deferred): apply has no try/catch around JSON.parse of the plan file — mirrors claude-cleanup.mjs:38 (pre-existing convention).
- Task 2: minor (deferred): `i.name ?? i.absPath` fallback unreachable with scan-produced plans; kept as defence for hand-edited plans.
- Task 2: minor (deferred): `claudeDir()` computed for `scan` too, unused there (brief's exact code).
- Task 3: minor (deferred): step 4 wording "exactly as scanned — absPath, size, category, reason, mtimeMs unmodified" could be read as "keep only these fields"; dropping `name` only degrades the skipped-names line to absPath.
- Task 3: minor (deferred): step 6 heredoc does not call out JSON escaping of Windows backslash paths; a malformed plan fails at JSON.parse before any move.
- Task 3: ⚠️ resolved by controller — AskUserQuestion caps at 4 options (tool schema maxItems 4); heredoc under Bash(node *) is the established /claude-cleanup pattern; CLAUDE_PROJECT_DIR has a process.cwd() fallback and the Bash cwd is the project root.
- Task 4: note — ROADMAP/16-STATE.md state "merged, branch deleted" ahead of the merge; Task 5 (controller) makes it true.
- Final review (opus, ad3e922..cb51671): With fixes. Important: (1) cross-device apply fallback in claude-cleanup-lib moveInto is non-transactional per directory entry and /scratch-prune makes it routine (D: → C:) — pre-merge: RISK-CLEANUP-001 residual + 16-STATE Touches; follow-up: library hardening (cpSync-then-remove, exported helper, @critical test). (2) CLI apply trusts the plan — add an engine-level tmp/-only guard (exit 2). Minor adopted into the same wave: unknown subcommand → exit 1; SKILL.md step 4 empty-aged branch + "whole row" clause. Minor left: symlinks inside tmp/ (contrived), test cleanup not in try/finally, fallow not installed. 16-STATE.md frontmatter → controller writes it at Finish (skill-mandated form). Deferred-minor triage: all "leave" except T3 wording (folded into the wave).
- Final review parked (not fixed, by ruling): symlinks inside tmp/ are followed by statSync — contrived for a disposable tier, revisit only with the library hardening; test cleanup not in try/finally — cosmetic, matches the sibling cleanup-lib test; fallow structural pre-pass skipped — binary not installed in this repo.
- Owed after phase 16 (not a phase-16 task): harden moveInto EXDEV fallback in claude-cleanup-lib (cpSync-then-remove, record entry once copy completed, exported helper, @critical test) — tracked under RISK-CLEANUP-001.

## Deviations and decisions

The plan itself records three spec deviations, all decided up front rather than discovered mid-task: the test file lives at `payload/bin/lib/scratch-prune-lib.test.mjs` (repo convention — the spec's `~/.claude/bin/lib/scratch-prune.test.mjs` can't exist, since tests are never deployed); `ageDays` is truncated to one decimal rather than rounded, so a displayed age never exceeds the raw age that decided `aged`; and `apply` prints a second `skipped: <names>` line when anything was skipped, because spec §5 asks the skill to name the skipped entries while the library itself only counts them.

All four implementer reports (Tasks 1-4) state no deviation from their briefs — each brief's code/text was used byte-for-byte, confirmed by direct diff in Tasks 1 and 3. The only departure the reports themselves introduce is the `Co-Authored-By` trailer on every commit, added per this session's standing attribution instruction where the brief's literal commit text was silent on it.

The fix wave did not originate from a wrong plan step but from the final whole-branch review (`ad3e922..cb51671`): two Important findings — the cross-device (D: → C:) `moveInto` fallback becoming a routine path under `/scratch-prune`, and `apply` trusting the plan file with no tmp/-only guard — plus several minor items were bundled into one dispatch (`FIX_BASE cb51671`) producing `48a88e4`. The cross-device issue was accepted as a residual (recorded against `RISK-CLEANUP-001`, with library hardening owed as follow-up, not part of this phase); the plan-trust issue was fixed directly with an `outsideTmp` guard (exit 2) and an `@important` test.

The fix report notes one self-corrected slip during F3: the new SKILL.md step-6 sentence about refusing out-of-tmp/ plans was first appended at the very end of step 6 instead of immediately after the "skips it on drift." sentence the fix list specified; caught on review of the diff before running tests and moved to the correct anchor before commit.

On `16-STATE.md`: Task 4 wrote it as the plan's plain prose block (no YAML frontmatter). The final review's ruling assigns the frontmatter form to the controller at Finish, as the skill mandates — this is a division of labor, not a fix to Task 4's output, and ledger and report agree on it.

No disagreement was found between the ledger and any implementer report on what happened.

## Reviews

- `.ultrapowers/sdd/phases-16-scratch-prune/review-ad3e922..28f66f2.diff` — `git diff ad3e922..28f66f2`
- `.ultrapowers/sdd/phases-16-scratch-prune/review-28f66f2..86dc74a.diff` — `git diff 28f66f2..86dc74a`
- `.ultrapowers/sdd/phases-16-scratch-prune/review-86dc74a..f1a88ea.diff` — `git diff 86dc74a..f1a88ea`
- `.ultrapowers/sdd/phases-16-scratch-prune/review-f1a88ea..cb51671.diff` — `git diff f1a88ea..cb51671`
- `.ultrapowers/sdd/phases-16-scratch-prune/review-ad3e922..cb51671.diff` — `git diff ad3e922..cb51671`
- `.ultrapowers/sdd/phases-16-scratch-prune/review-cb51671..48a88e4.diff` — `git diff cb51671..48a88e4`
- `.ultrapowers/sdd/phases-16-scratch-prune/review-ad3e922..48a88e4.diff` — `git diff ad3e922..48a88e4`
