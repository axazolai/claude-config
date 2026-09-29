# Phase 24 — model-ladder — verification

Checked against branch `phase-24-model-ladder` at `73f38b5` (base `5c9d11f`, 8 commits), 2026-09-29.
Test runs I made myself (targeted, not the full suite):
`node run-tests.mjs payload/bin/lib/model-migration.test.mjs payload/bin/lib/assemble-claude-md.test.mjs payload/skills/model-selection-policy/skill.test.mjs payload/agents/rung-agents.test.mjs payload/hooks/rung-usage-log.test.mjs session-defaults.test.mjs variants.test.mjs`
gave 46/46 pass. `node run-tests.mjs setup-variants.e2e.test.mjs` gave 38/38 pass.
`node setup.mjs --variant=lite --dry-run --skip-all` and `--variant=full` both exited 0.

## Goal

> Ship the model ladder: `medium` default effort, Sonnet 5.5 everywhere, five rung agents, one ladder table, and a small subagent usage log.

**Verdict: ACHIEVED** in the branch. Deploy (Task 6 Step 4) is still pending and is recorded under Gaps as unverifiable.

## Evidence

| Goal claim | What delivers it | Covering test |
|---|---|---|
| `medium` default effort (session) | `variants.json:26` `"sessionDefaults": { "model": "sonnet", "effortLevel": "medium" }` | `variants.test.mjs` "@important the bundle's session defaults are sonnet at medium effort"; `session-defaults.test.mjs` (a user `high` is a conflict `high -> medium`); `setup-variants.e2e.test.mjs` (dry-run prints `effortLevel: xhigh -> medium` and writes nothing; `--replace-all` / fresh settings end at `medium`) |
| `medium` default effort (policy text) | `payload/claude-md/12-model-selection.md:9` and `.lite.md:6` "Start `medium`"; both `SKILL.md:21` "Start **`medium`**" | `assemble-claude-md.test.mjs` "model selection — Sonnet 5.5 default, medium start" (full/base match `Start \`medium\``, no `Start \`high\``; lite section too); `skill.test.mjs` (no "Start **`high`**" in either skill) |
| Sonnet 5.5 everywhere — policy | Fragments `12-model-selection.md:5` / `.lite.md:2` "DEFAULT executor: claude-sonnet-5-5"; both skills: description, `:8` default, `:11-12` tier, `## Sonnet 5.5` section `:40-47`, cost row `:105` (full) / `:87` (lite), advisor paragraph "Sonnet 5.5 by default" | `assemble-claude-md.test.mjs`; `skill.test.mjs` (`## Sonnet 5.5`, `DEFAULT executor: **claude-sonnet-5-5**` in both) |
| Sonnet 5.5 everywhere — migrator | `payload/bin/lib/model-migration.mjs:19` sonnet family targets `claude-sonnet-5-5`, `exact: ["claude-sonnet-5"]` | `model-migration.test.mjs` "superseded sonnet ids migrate to claude-sonnet-5-5" (incl. `claude-sonnet-5[1m]`) and "current and later sonnet 5.x ids are not flagged" (`claude-sonnet-5-5`, `-5-5[1m]`, `-5-6`) |
| Sonnet 5.5 everywhere — no stragglers | `git grep -E 'claude-sonnet-5([^-]\|$)\|Sonnet 5([^.]\|$)'` outside `.ultrapowers/` and tests matches only `docs/opus5/*` (historical notes) and the migrator's own `exact` entry and comment | — |
| Five rung agents | `payload/agents/rung-haiku.md`, `rung-sonnet-medium.md`, `rung-sonnet-high.md`, `rung-opus-medium.md`, `rung-opus-high.md`; frontmatter `name`/`description`/`model` alias/`effort` (none on `rung-haiku`), no `tools` line | `payload/agents/rung-agents.test.mjs` (each table row has a matching agent; no `rung-*.md` outside the table; tools inherited) |
| Agents ship in every profile | lite and full dry-runs list `created ...\.claude\agents\rung-*.md` for all five | dry-run output (manual) |
| One ladder table | `payload/skills/model-selection-policy/SKILL.md:58-65` `## Escalation ladder` with the five exact rows, plus track rules `:67-81` and role → start rung map `:83-99` (full only); `payload-lite/skills/model-selection-policy/SKILL.md:58-65` carries the same rows without the role map | `rung-agents.test.mjs` parses the full skill's table as the source; `skill.test.mjs` asserts both skills carry the five rows and only the full skill carries "role → start rung" |
| Small subagent usage log | `payload/hooks/rung-usage-log.mjs` `buildRecord` (sums usage, dedups by `message.id`, strips `-YYYYMMDD`, `effort` from `^rung-(sonnet\|opus)-(medium\|high)$`, else `null`) and `main` (stdin guard `:37`, exits 0 without `agent_transcript_path`, appends to `<CLAUDE_CONFIG_DIR or ~/.claude>/state/token-usage.jsonl`); symlink-safe entry `isMainModule` `:48-53`; registered in `settings.partial.json` `SubagentStop` block before `PreCompact` | `payload/hooks/rung-usage-log.test.mjs` (summed record; `general-purpose`/`rung-haiku` → `effort: null`; no-usage transcript → null; stdin `null`/empty/invalid → exit 0, no file; missing/nonexistent transcript path → exit 0, no file; end-to-end append; shared message id counted once; hook reached through a junction); `setup-variants.e2e.test.mjs:145` `hooks.SubagentStop` matches `rung-usage-log` after a deploy that strips `token-usage-log` |
| Usage log is readable (measurement) | `.claude/tools/rung-usage-report.mjs` on disk; `node .claude/tools/rung-usage-report.mjs <missing path>` printed `no records`, exit 0 | manual run (see Gaps: file is not in git) |
| Registers | `.ultrapowers/RISK_REGISTER.md` RISK-HOOKSTDIN-001 `Closed (2026-09-29)`, reason names the retired hook (`308dfe4`) and `rung-usage-log.mjs` carrying the guard, in the style of RISK-TOKENLOG-001; RISK-LADDER-001..003 added; `.ultrapowers/ROADMAP.md` phase 24 entry | — |

Review-focus items from the plan, all covered: `effortLevel: "high"` → conflict (`session-defaults.test.mjs`, test "one key correct and another conflicting"); `claude-sonnet-5[1m]` migrates, `claude-sonnet-5-5[1m]` does not (`model-migration.test.mjs`); missing/unreadable transcript → exit 0, nothing written; non-rung agent → `effort: null`; lite section drops "role map"/"ultrapowers" while carrying the ladder (`assemble-claude-md.test.mjs` asserts `rung-opus-high` in the lite section).

## Global constraints

- Docs, config and rule text English; rules only, no justifications — **HELD**. `payload/claude-md/12-model-selection.md:4-20`, `.lite.md:1-16`, `payload/skills/model-selection-policy/SKILL.md:8-99`, `payload/agents/rung-*.md` are English imperatives. Two explanatory clauses remain in both skills, both dictated verbatim by the plan's Task 3 text: `SKILL.md:23` "— they do not transfer" (new) and `SKILL.md:26` "— thinking and the answer share that budget" (pre-existing).
- Never `Write`/`Edit` under `~/.claude/` — **HELD**. `git diff --name-only 5c9d11f..73f38b5` has no path outside the repo; `~/.claude/agents/` and `~/.claude/hooks/` contain no `rung-*` file (dry-runs only).
- Model ids exact; agents and tables use aliases — **HELD**. `12-model-selection.md:5-7` (`claude-sonnet-5-5`, `claude-opus-5-5`, `claude-haiku-4-5`); `SKILL.md:12-18,104-106`; agents `model: haiku|sonnet|opus` (`payload/agents/rung-*.md:4`); ladder table `SKILL.md:61-65` uses `haiku`/`sonnet`/`opus`.
- Ladder table has exactly the five rows — **HELD**. `payload/skills/model-selection-policy/SKILL.md:61-65` and `payload-lite/skills/model-selection-policy/SKILL.md:61-65`; `rung-agents.test.mjs:18` asserts exactly 5 parsed rows.
- Lite assembled Model Selection section has neither "role map" nor "ultrapowers" — **HELD**. `grep -niE 'role map|ultrapowers' payload/claude-md/12-model-selection.lite.md` → no match; asserted in `payload/bin/lib/assemble-claude-md.test.mjs:70-71`.
- `xhigh` and `max` appear only as "on the user's ask" — **HELD**. `12-model-selection.md:12`, `.lite.md:9`, both `SKILL.md:21-22` and `:81` all read "only on the user's ask" (the plan's "or a measured gain" was removed in `73f38b5`). `SKILL.md:26` in both skills names `xhigh`/`max` as the condition for a `max_tokens` floor, not as a reason to use them; the plan's Task 3 dictates that line. No `xhigh` elsewhere in `payload/`, `payload-lite/`, `setup.mjs` or `variants.json`.
- Tests run with `node run-tests.mjs <files>`; full suite before final review — **HELD** for the targeted files (46/46 and 38/38 above). The full suite I did not run (not permitted here); see Gaps.
- Branch `phase-24-model-ladder`, Conventional Commits, never commit to `master` — **HELD**. HEAD on `phase-24-model-ladder`; `master` is still `5c9d11f`, and `73f38b5` is not an ancestor of it; all 8 commits are `feat(...)`/`fix(...)`/`docs(...)`.

## Gaps

- `.claude/tools/rung-usage-report.mjs` and `.claude/tools/INDEX.md` (Task 6) exist on disk and work, but are not in the branch: `.gitignore:4` (`.claude/*`) ignores them, and `ef953ed` does not contain them, although the plan's Task 6 Step 5 does `git add .claude/tools`. They are marked "not shipped" (they do not go to `~/.claude`), but another checkout of the branch will not have them. Settle: `git add -f` them or add a `!.claude/tools/` exception, or record in the plan that they are machine-local.
- unverifiable: the full suite passes (`node run-tests.mjs`, Task 6 acceptance) — settled by running it; I ran only the phase's own test files.
- unverifiable: Task 6 Step 4, deploy and the post-deploy check (spec open item 4) that `agent_type` in a real `SubagentStop` equals the rung agent's `name`, so that `effort` is logged as `"medium"`/`"high"` instead of `null` — pending the user's approval of `node setup.mjs --replace-all`; settled by deploying, dispatching one `rung-sonnet-medium` agent, and reading the last line of `~/.claude/state/token-usage.jsonl` for `agent: "rung-sonnet-medium"`, `effort: "medium"`.
- unverifiable: that Claude Code honours the `effort:` frontmatter key on the rung agents and that the alias `sonnet` (in the agents and in `sessionDefaults`) resolves to `claude-sonnet-5-5` — host behaviour, outside the branch; settled by the same post-deploy dispatch (the log's `model` field shows the resolved id).
