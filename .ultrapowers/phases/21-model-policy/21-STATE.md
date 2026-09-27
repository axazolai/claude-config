---
phase: "21"
status: complete
action: null
tasks_done: 4
tasks_total: 4
branch: feat/model-policy
delivery: branch
depends_on: []
updated: 2026-09-27
pre_deploy_fixes: complete
---

# Phase 21 — model-policy — state

Implemented on `feat/model-policy` via Subagent-Driven Development. Sonnet 5 is now the
bundle's default executor (was Opus 5.5): `variants.json`'s new `sessionDefaults` key
(`model: "sonnet"`, `effortLevel: "high"`) is written into `~/.claude/settings.json` by a new
block in `setup.mjs` on every profile; `12-model-selection.md`/`.lite.md` and both copies of the
`model-selection-policy` skill carry the reworded policy; the full/base skill copy alone gained
the "Ultrapowers per-role model map" table. The fork (`D:\6__Work\AI_Projects\ultrapowers`,
branch `patch`, commit `5146baf`, built as `6.4.1-up.2`) got delta 016, pointing its own
`subagent-driven-development` "Model Selection" section at whichever policy the environment
provides.

All four tasks passed their own task review clean (0 Critical, 0 Important each). The final
whole-branch review found two real, load-bearing bugs the plan's own verbatim code had
introduced — both fixed and re-reviewed clean in commit `c7dd2f7`:
- An unparsable (existing but invalid-JSON) `settings.json` was silently replaced with just the
  two managed keys on a plain flagless run, destroying every other key with no warning. Fixed by
  reusing the pre-existing `cur === null` detection already in `setup.mjs` instead of falling
  back to `{}`.
- `--merge-all` incorrectly overwrote a conflicting `model`/`effortLevel` value, against spec
  §1a's explicit list (only `--replace-all` or an interactive yes may write a conflict). Fixed by
  narrowing the bulk-apply check to `BULK === "replace"`.

Full suite (`node run-tests.mjs`, no file args) at the final commit `c7dd2f7`: 421 pass, 0 fail,
421 total (baseline before this branch was 413; Tasks 1/2 added 6, the fix round added 2).

**Do not reopen:** the Task 2 test-scoping decision (the lite CLAUDE.md's negative "ultrapowers"
check is scoped to the Model Selection Policy section, not the whole document, because two
unrelated fragments legitimately say "ultrapowers" in lite) — independently verified by both the
Task 2 implementer and its reviewer, ruled sound. The Task 3 fork's local `main`-ref move via
`build-cli.mjs commit` — confirmed plumbing-only, unpushed, and this fork's long-established
build-tracking convention predating this phase, not a hard-limit violation.

**Deployment is the user's keystroke, as always** — nothing here was pushed, merged, or
deployed. `6.4.1-up.2` exists only on the fork's local `patch` branch (spec §3 wanted it
published; the plan's own Global Constraints forbid any push inside the plan, so that is a
deliberate deferral, not a missed task). Until the fork delta is pushed and the marketplace
update installs it, an installed ultrapowers plugin has no pointer yet — the bundle side
(CLAUDE.md + skill) already gives the role map precedence on its own regardless.

Four Minor items and several out-of-spec observations were deferred rather than fixed; see
`21-SUMMARY.md` for the verbatim rulings and `21-VERIFICATION.md` for the goal-backward
verification (ACHIEVED in source; gaps are what a deploy and a real machine would settle).

**Pre-deploy fixes plan (2026-09-27, `.ultrapowers/phases/22-scratchpad-phase-cleanup/22-FIXES-PLAN.md`,
same branch `feat/scratchpad-cleanup`, commits `4ca79b9..6f87f81`):** closed the two decisions in
this plan's own territory — decision 4 generalized the unparsable-settings-json-never-overwritten
rule (already established for the session-defaults block above) to every other block in
`setup.mjs` (enabledPlugins, MCP reconciliation, update-check opt-in, PowerShell-tool opt-in), plus
BOM-stripping and a warning on a failed write anywhere; decision 5 scoped the
verification-before-completion skill's no-self-verification exemption to Opus 5.5+ only (it had
read as universal) and re-added two policy sentences dropped when this phase moved the default off
Opus 5.5. Also closed several deferred minors from this phase's own final review (a
`describeSessionChange` display bug on non-string values, a back-to-back interactive-prompt UX
issue, e2e coverage gaps, and the `model-selection-policy` skill's ambiguous GSD heading). Full
suite at the fixes-plan's close: 543/543/0 fail. See `22-SUMMARY.md`'s "Pre-deploy fixes" section
(this plan's ledger lives under phase 22's directory since it fixed both phases together) for the
full fold. Still not merged or pushed.
