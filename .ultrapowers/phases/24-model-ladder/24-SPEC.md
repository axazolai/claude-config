# Phase 24 — Model ladder: medium by default, escalate on failure, Sonnet 5.5

## Intent

Stated by the user (2026-09-29):

- Default `effort` is `medium` for Opus 5.5 and Sonnet 5.5.
- Opus fails a task twice → `high`. The task solved → back to `medium`.
- Sonnet and Haiku escalate after **each** failure. Sonnet `high` failing → Opus `medium`;
  that failing → Opus `high`.
- Routine work whose steps are known in advance may start on Haiku (a new version is due; the
  bundle must not pin the version), escalating to Sonnet.
- Update the project for the new models (Sonnet 5 → 5.5), taking into account the output of
  `/claude-api prompt-audit` and `/claude-api cost-optimize`.
- Measurement of the ladder comes from a returned, trimmed token-usage log (user decision).

Success: a session starts on Sonnet at `medium`; every dispatched task starts on the rung its
role names and moves up only by the failure rules below; the bundle carries one ladder table
that the agents, the policy text and the tests all agree with; a week of use can be read back
from the log per rung.

## Facts this design rests on (checked 2026-09-29)

- Sonnet 5.5 (`claude-sonnet-5-5`): $2/$10 per MTok, cache read $0.20, 1M context. Default
  `effort` is `high`; levels are recalibrated, start at `medium` for agentic coding.
  `thinking: {type: "disabled"}` → 400 (`between_tools` at effort ≤ `high` is the off switch);
  forced `tool_choice` `any`/`tool` → 400. Source: `claude-api` skill, `shared/model-migration.md`
  → Migrating to Claude Sonnet 5.5.
- Opus 5.5: $4/$20, cache read $0.20, default `effort` `medium`, thinking always on. Cache reads
  cost the same on Opus 5.5 and Sonnet 5.5, so Sonnet's price advantage sits in cache writes and
  output only.
- Subagent frontmatter `effort` "overrides the session effort level; default inherits". Options
  `low`…`max`; availability depends on the model. Source: code.claude.com/docs/en/sub-agents.
  The `Agent` tool itself takes `model` and no `effort`.
- Subscription limits: session and weekly windows are shared across models; separate per-family
  "Opus limit" / "Sonnet limit" errors exist. How tokens and cache reads are weighted inside a
  limit is not documented. Source: code.claude.com/docs/en/costs. The user is on a subscription.
- Baseline, `~/.claude/state/token-usage.jsonl`, 2026-07-30 … 2026-09-26, 151 sessions,
  API-list-price equivalent ≈ $17.8k (a proxy, not the bill): Opus 85% of the weight, cache
  reads 60–65% of the cost of every model, output 7–14%, main session 75%, the top 10% of
  sessions 46%. The log carries no `effort` field.
- The token-usage hook, its lib files and `/token-usage` were retired in phase 19
  (`RETIRED_RELS`, `setup.mjs:80-89`); the log stopped on 2026-09-26.

## 1. The ladder

One table, in the skill `model-selection-policy`, is the single source. Fragment 12 carries a
short copy; agents and tests are checked against the table.

| Rung | Agent | Model alias | Effort |
|---|---|---|---|
| 1 | `rung-haiku` | `haiku` | none (parameter is inert on Haiku) |
| 2 | `rung-sonnet-medium` | `sonnet` | `medium` |
| 3 | `rung-sonnet-high` | `sonnet` | `high` |
| 4 | `rung-opus-medium` | `opus` | `medium` |
| 5 | `rung-opus-high` | `opus` | `high` |

Tracks and transitions:

| Track | Starts on | Moves up after | Ends |
|---|---|---|---|
| Routine (plan carries the code; classification; summaries) | 1 | 1 failure per rung: 1 → 2 → 3 → 4 → 5 | after rung 5 fails: stop, report to the user |
| Implementation | 2 | 1 failure per rung: 2 → 3 → 4 → 5 | same |
| Judgment (design, architecture, security review, hard debugging, verification, final review) | 4 | 2 failures on 4, then 5 | same |

Rules:

- An attempt is one dispatched round on one task that ends in a failed check: a failing test,
  or a reviewer rejection. A task with no check is not laddered: it runs on its start rung.
- A task that reaches rung 4 by escalation moves to rung 5 after 1 failure, not 2.
- Success closes the task; the next task starts on its own track's start rung.
- The orchestrator counts, and names the rung in the line that narrates each dispatch. The
  dispatch to the next rung carries the failure evidence (test output, reviewer finding) so the
  next rung does not repeat the attempt.
- `xhigh` and `max` are used only on the user's explicit ask.
- The main session is not a rung: its model and effort are the session defaults. The
  orchestrator may recommend raising them; only the user changes them.

Role map (replaces the ultrapowers table in the skill; "Fix rounds 4–5 → opus" and "subagents
inherit the session's effort" are removed):

| Role | Start rung |
|---|---|
| Implementer, plan carries the complete code | 1 |
| Summary writer | 1 |
| Implementer from prose, several files, integration | 2 |
| Task reviewer, small mechanical diff | 2 |
| Scoped re-review of a fix | 2 |
| Task reviewer, logic, security or concurrency | 4 |
| Verification (was the goal met) | 4 |
| Final whole-branch review | 4 |
| Any role not listed | 2 |

`fable` only when the user names it.

## 2. Rung agents

Five files in `payload/agents/`, named `rung-*.md` (not `gsd-*`, so the base profile's
`agents/gsd-*.md` exclusion does not touch them). `tools` is omitted so they inherit the
session's tools. Descriptions are one line each: every agent description is resident context
in every session (RISK-ULTRAPOWERS-006).

```md
---
name: rung-sonnet-high
description: Ladder rung 3. Sonnet at high effort; dispatched only by the model-selection ladder.
model: sonnet
effort: high
---
Do the task in the dispatch prompt. If the prompt carries failure evidence from an earlier
rung, address that evidence first. Report what changed and what check now passes or fails.
```

`rung-haiku` has no `effort` line. Whether the lite profile ships them follows its `exclude`
list; decided at plan time from `--dry-run` output.

## 3. Defaults and the Sonnet 5.5 update

Audit findings 1–5 (`/claude-api prompt-audit`, 2026-09-29) become edits; 6–8 stay out.

| # | Edit | Files |
|---|---|---|
| 1 | `claude-sonnet-5` → `claude-sonnet-5-5`: default executor, cost row, description | `payload/claude-md/12-model-selection.md`, `.lite.md`; `payload/skills/model-selection-policy/SKILL.md`; `payload-lite/skills/model-selection-policy/SKILL.md` |
| 2 | Drop "Start `high`; `xhigh` for long agentic runs"; state `medium` start and the ladder | same four files; `variants.json` `sessionDefaults.effortLevel` → `"medium"`; `README.md`, `README.en.md` (session-defaults paragraph) |
| 3 | Add a Sonnet 5.5 section: `thinking: disabled` 400 and `between_tools`; forced `tool_choice` 400; default `effort` `high`, so pass `medium` explicitly | skill (both profiles) |
| 4 | Add one line: a coding agent on Sonnet 5.5 at `low` effort runs a real check before reporting done | skill (both profiles) |
| 5 | Replace the role map and the "inherit the session's effort" line with §1 | skill |

Migrator (`payload/bin/lib/model-migration.mjs`): the Sonnet family becomes
`{ target: "claude-sonnet-5-5", prefixes: ["claude-sonnet-4", "claude-3-5-sonnet", "claude-3-7-sonnet"], exact: ["claude-sonnet-5"] }`.
`claude-sonnet-5` is a prefix of `claude-sonnet-5-5`, so it can only be an `exact` entry, the
same way `claude-opus-5` is; the header comment names Sonnet 5.5.

Wording of fragment 12 and the skill states rules only, no justifications.

## 4. Usage log, trimmed and returned

Reverses the phase-19 removal (RISK-USAGELOG-001). The retired hook (commit `308dfe4`, 257
lines: per-session byte cursors, a state file, price scraping, two logs) is not restored; a new
~60-line hook replaces it. The pieces phase 19 kept are reused: `hooks/lib/jsonl-io.mjs`.

- New script `payload/hooks/rung-usage-log.mjs`, registered on `SubagentStop` only, in
  `settings.partial.json`. The retired name and the `RETIRED_*` lists in `setup.mjs` stay as they
  are, so a deploy still strips the old registrations (an e2e test asserts it).
- Subagents only: the rungs are subagents. The main session (75% of the baseline) is read from
  `/usage`, so no `Stop` event, no per-turn cursor.
- Tokens: the hook sums `usage` over the assistant entries of `agent_transcript_path`. A resumed
  agent (`SendMessage`) logs its whole transcript again; accepted.
- Global file only, `~/.claude/state/token-usage.jsonl`. No per-project file, no task text, no
  project path.
- Record: `date`, `session_id`, `agent`, `model`, `effort`, `input_tokens`, `output_tokens`,
  `cache_read_tokens`, `cache_creation_tokens`. The rung is the `agent` name.
- `effort` is parsed from the agent name (`rung-<model>-<effort>`); `null` for any other agent
  and for `rung-haiku`.
- Stdin guard, from RISK-HOOKSTDIN-001: after `JSON.parse`, `d = (d && typeof d === "object") ? d : {};`.
  Any failure exits 0 and never blocks a turn.
- The skill `/token-usage` stays retired. A one-off script under `.claude/tools/` reads the log
  per rung; it is not shipped.
- No pruning in this phase: a record is about 400 bytes; the file grew 1.6 MB in two months.

```json
{"date":"2026-10-06T09:12:03.000Z","session_id":"…","agent":"rung-sonnet-high","model":"claude-sonnet-5-5","effort":"high","input_tokens":12,"output_tokens":3400,"cache_read_tokens":81000,"cache_creation_tokens":2100}
```

## 5. Measurement

Dollars are not the measure (subscription). After one week on the ladder:

1. `/usage` plan bars before and after the week, per family where shown.
2. From the log, per rung: attempts, tokens by type, and the share of tasks that ended on each rung.
3. Read against RISK-LADDER-001 and -003: if most tasks end on rung 4 or 5, the ladder costs more
   than starting on Opus `medium`; then the Sonnet-first tracks are revised.

## Testing Decisions

Acceptance criteria (tests confirm these and nothing else; mode is test-after):

- `migrateSettingsModel`: `claude-sonnet-5` → `claude-sonnet-5-5`, `changed: true`;
  `claude-sonnet-5[1m]` → same; `claude-sonnet-4-6` → same; `claude-sonnet-5-5` and
  `claude-sonnet-5-5[1m]` unchanged, `changed: false`.
- `sessionDefaults`: `variants.json` yields `effortLevel: "medium"`; a settings file holding
  `"high"` is reported as a conflict and kept without `--replace-all`.
- Ladder consistency: for each row of the skill's ladder table there is an agent file whose
  `model` and `effort` frontmatter equal the row (`rung-haiku` has no `effort`).
- Assembled `CLAUDE.md`, full and lite profiles: contains `claude-sonnet-5-5`; contains no
  "Start `high`".
- Usage hook: stdin `null`, empty and invalid JSON → exit 0, nothing written; a `SubagentStop`
  from `rung-sonnet-high` with two usage-bearing assistant entries → one record with the summed
  tokens, the normalized model and `effort: "high"`; the same event from `general-purpose` →
  `effort: null`; an event with no transcript path → nothing written.
- Retired hook: a settings file still registering `token-usage-log.mjs` is stripped on deploy
  and the new registration survives (existing e2e test extended).

Seams: the migrator's exported function; the assembled `CLAUDE.md` (existing assemble test);
the parsed skill table against the agent files; the hook process fed through stdin.
Tags: migrator and hook tests `@important` (silent wrong answer); the table-vs-agents test
`@important` (the one place the single source is enforced). Wiring and text are untested.

## Out of Scope

- GSD agents' `effort` (`gsd-executor-decomposing`, `gsd-task-verifier`): carried by the patch
  mechanism in the skill's GSD paragraph.
- Enforcing the failure count in code: the orchestrator counts (RISK-LADDER-002).
- Per-message effort switching inside one session (beta) and the advisor tool as an alternative
  to escalation.
- A `/token-usage` skill and log pruning.
- Audit flags: `docs/opus5/new-setup.md:72`, `.claude/_analize/optimizations.md`.
- Price scraping (`token-usage-pricing-refresh`).

## Risks (logged in `RISK_REGISTER.md`)

- RISK-LADDER-001 — every rung switch starts a fresh prefix and pays a cache write.
- RISK-LADDER-002 — attempt counting is a rule for the orchestrator, not enforced.
- RISK-LADDER-003 — savings against subscription limits are unmeasured; weighting is undocumented.
- RISK-USAGELOG-001 — reintroducing the log reverses a phase-19 decision.
- RISK-HOOKSTDIN-001 — its status is stale after the hook was retired; re-evaluate on return.

## Open items to verify before the plan

1. Whether lite ships `rung-*` agents (`node setup.mjs --dry-run`, lite overlay).
2. Why phase 19 removed the log: the commit message `308dfe4` names only what was removed;
   confirm at spec review.
3. Live prices for Opus 5.5 and Sonnet 5.5 (the table used here is the skill's, 2026-09-25).
4. That `agent_type` in the `SubagentStop` input equals the agent's `name` for a `rung-*` agent
   (checked in the plan's hook task against a real event).

Changed while planning (2026-09-29): the hook is new (`rung-usage-log.mjs`), subagent-only, and
the `RETIRED_*` lists are untouched; `kind`, `rung` and the `Stop` event left the record.
