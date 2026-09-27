---
phase: "22"
status: complete
action: null
tasks_done: 8
tasks_total: 8
branch: feat/scratchpad-cleanup
delivery: branch
depends_on: ["21"]
updated: 2026-09-27
pre_deploy_fixes: complete
---

# Phase 22 — scratchpad-phase-cleanup — state

Implemented on `feat/scratchpad-cleanup` via Subagent-Driven Development (branched from a tree
that already carries phase 21's — `model-policy` — unmerged commits; hence `depends_on: ["21"]`).
Tasks 1–7 and 4b (8 units) all complete, each through its own task review-and-fix loop; the bug
log was drained (BUG-003, a sub-ms clock-skew drop in `scanLayout`'s age filter); the final
whole-branch review found one real, load-bearing bug in pre-existing code
(`claude-cleanup-lib.mjs`'s cross-device trash-move fallback followed symlinks/junctions) plus a
guard/engine phase-folder naming mismatch, both fixed in one fix wave and re-reviewed clean. One
residual finding from that re-review — a rare, pre-existing partial-move data-loss edge case,
not introduced by this phase but made more reachable by it — was ruled parked rather than fixed
in a second (unavailable) wave, and is logged as `RISK-CLEANUP-002` (Active) in
`.ultrapowers/RISK_REGISTER.md`.

**Pre-deploy fixes plan (2026-09-27, `22-FIXES-PLAN.md`, same branch, commits `4ca79b9..6f87f81`):**
closed all 5 of the user's pre-deploy decisions plus every deferred-minor/out-of-spec item from
this phase's final review above and phase 21's. `RISK-CLEANUP-002` is now **Closed** (fixed in
`9468858`, warning added in `43c0717`) — the partial-copy-failure edge case above is resolved, not
merely documented. Also closed: active-session protection for harness cleanup with a 24h inactive
threshold (was 2h); `promote --src` restricted to the project scratchpad both directions (a link's
target AND its own location); `setup.mjs` never overwrites an unparsable settings.json/.claude.json
in any block; the verification-before-completion skill's self-verification exemption is now
Opus-5.5+-only. One new regression (BUG-004, an ambient `CLAUDE_PROJECT_DIR` leak in a Task-7-added
test file) was found and fixed along the way. Full suite at the fixes-plan's close: 543/543/0 fail.
See `22-SUMMARY.md`'s "Pre-deploy fixes" section for the full fold. Still not merged or pushed.

Every project temp file now lands under `<project>/.claude/.scratchpad/{phase-<NN>,adhoc,proc,
test-tmp}/`; four new hooks (`scratchpad-layout-guard.mjs` PreToolUse, `scratchpad-temp-env.mjs`
SessionStart, `phase-end-cleanup-nudge.mjs` PostToolUse base/full, `background-sleep-guard.mjs`
PreToolUse) enforce the layout, redirect the session's TEMP/TMP/TMPDIR into it, nudge a phase-end
prune, and deny a background-only wait; the extended `/scratch-prune` skill (three modes: bare,
`phase <NN>`, `--all-harness`) clears both the project scratchpad and the harness temp dirs
(trash for project content, outright delete for harness session dirs). Full suite: 486/486.
See `22-SUMMARY.md` for the task/ruling/review ledger fold and `22-VERIFICATION.md` for the
goal-backward check (verdict: ACHIEVED, one minor spec divergence noted, three items
unverifiable until Task 8 runs post-deploy).

**Task 8 (after deploy), completed 2026-09-27** by the main session with the user, post-merge/
push/`--replace-all`/restart: Bash `$TEMP`/`$TMP`/`$TMPDIR` resolve to
`<project>/.claude/.scratchpad/proc`; the PowerShell tool does not source `CLAUDE_ENV_FILE`
(recorded in `22-SPEC.md` § 3.2 — cosmetic gap, the layout guard still covers the harness path
regardless of which tool issues a write); a live Write into the harness scratchpad was denied
by `scratchpad-layout-guard.mjs`. `/scratch-prune --all-harness` trashed 38 legacy items
(4.68 MB) from this project and, after one user confirmation, purged 184 harness session dirs
(3.23 GB) across 21 other projects plus this project's own 10; retention purged one stale trash
batch. Phase 22 is now fully closed.
