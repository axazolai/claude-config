# Phase 24 summary — model ladder

## Tasks
- Task 1: model migration lib (`payload/bin/lib/model-migration`) — `207f055..08659a3`
- Task 2: `variants.json` sessionDefaults change (Sonnet 5.5 default, medium start) with session-defaults tests — `08659a3..d63e603`
- Task 3: ladder table (five rows) in the model-selection policy, assembled into CLAUDE.md — `d63e603..4ef92b7`
- Task 4: five ladder rung agents (`payload/agents/`) with rung-agents test — `4ef92b7..70fcc63`
- Task 5: SubagentStop usage-log hook `hooks/rung-usage-log.mjs`, registered — `70fcc63..998a892`
- Task 6: deploy dry-run and rung usage report script — `998a892..ef953ed`
- Final-review fix pass: symlink-safe hook entry, usage counted once per API response, xhigh only on ask, lite-ladder test — `ef953ed..73f38b5`

## Rulings
- Setup: Ruling: work on branch phase-24-model-ladder in place, not a worktree — spec and plan were uncommitted and a worktree cuts from HEAD; branch is not master — cost if wrong: none, branch can be moved to a worktree later.
- Task 6: Ruling: .claude/tools is git-ignored (.gitignore .claude/*), so rung-usage-report.mjs and its INDEX.md stay local and uncommitted — the code lives in 24-PLAN.md Task 6 — cost if wrong: report script must be recreated from the plan on another machine.
- Final: Ruling: Important 2 (usage summed per assistant entry, not per API response) fixed although the spec's Tokens line said "sums usage over the assistant entries" — measured on 38 real subagent transcripts: input x2.00, cache read x1.89, output x1.02; spec 24-SPEC.md section 4 amended; last entry per message.id wins, entries without an id count alone — cost if wrong: small, one Map in buildRecord and one spec line
- Final: minor (deferred): Review Focus 1 is unit-tested for effortLevel conflicts but the e2e keep-path is only exercised with the model key (logic is key-agnostic)
- Final: minor (deferred): payload/rules-src/gsd.md:34 still says "orchestrator thread itself on sonnet-5" (full profile only, outside the four policy files)
- Final: out of spec (for the user): existing installs keep effortLevel "high" without --replace-all or an interactive yes; a resumed agent re-logs its whole transcript; the log file also holds the retired hook's baseline records (different schema: kind, task, cost_usd) so per-agent totals mix eras; no log pruning; rung order and attempt counting are not enforced (RISK-LADDER-002); plan-carrying implementer now starts on haiku; the hook reads the whole transcript on every SubagentStop

## Deviations and decisions
- Executed inline in test-after mode, on the branch in place instead of a worktree (uncommitted spec and plan; docs committed first as 207f055).
- Spec versus measurement: the spec said usage sums over assistant entries; 38 real transcripts showed that double-counts input and cache reads, so the hook was changed to count once per message.id and the spec section 4 amended. Ledger and spec disagree on the original wording; the ledger's ruling stands.
- Final review (opus, 0 Critical, 2 Important, 4 Minor, verdict With fixes): Important 1 fixed (hook entry naive under a symlinked `~/.claude`, `main()` unguarded; junction test added, suite 581/581). Minor 3 and Minor 5 were promoted to Important and fixed: "or a measured gain" dropped from the xhigh/max wording in both skills to match spec section 1; assemble test now asserts `rung-opus-high` in the lite section.
- `.claude/tools` is git-ignored, so the report script and its INDEX.md stay local.
- Open: spec open item 4 (SubagentStop `agent_type` equals the rung agent name) is unverified until a real event; check it after deploy by dispatching one `rung-sonnet-medium` agent and reading the last `~/.claude/state/token-usage.jsonl` record.
- Ledger inconsistency: its "Do not reopen" line says "four Rulings", but only three lines are tagged `Ruling:`; the fourth (xhigh/max only on the user's ask) is the Minor 3 fix entry.
- Branch is not merge-ready: the user still decides on deploy (`node setup.mjs --replace-all` after a dry-run) and on the branch outcome.

## Reviews
- Whole-branch review (opus): `git diff 5c9d11f..ef953ed`
- Verification pass after the fixes: `git diff 5c9d11f..73f38b5`
