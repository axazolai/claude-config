---
name: model-selection-policy
description: When to run claude-sonnet-5 vs claude-opus-5-5 vs claude-haiku-4-5 and how to set reasoning effort — the executor default (Sonnet 5), when to step up to Opus 5.5, the effort ladder, and the ultrapowers per-role model map. Use when choosing a model or effort level for a task or subagent, or the model for an ultrapowers subagent dispatch.
---

# Model Selection Policy

DEFAULT executor: **claude-sonnet-5**. Step *up* to Opus 5.5 where judgment pays for itself;
tune cost within a tier with `effort`.

## Tier: start on Sonnet 5, step up for judgment
- **claude-sonnet-5** — default: implementation from a clear plan, mechanical and high-volume
  work, most reviews of small diffs.
- **claude-opus-5-5** — design and architecture, security-sensitive review, hard debugging,
  multi-file judgment, work where a wrong answer is costly.
- **claude-haiku-4-5** — no-judgment classification/extraction only; **no `effort` parameter**,
  200K window.
- **claude-fable-5-1** — only when the user names it (2.5× Opus 5.5 cost).

## Effort is the primary cost / latency control
- `low`/`medium` are strong on both Sonnet 5 and Opus 5.5 — use them widely wherever quality holds.
- Start **`high`** for coding and agentic work; **`xhigh`** for long agentic runs and debugging;
  sweep *down* on your own evals. Do not carry `effort` values over between models — they do
  not transfer.
- Always pass `effort` explicitly: omitted, it is **`medium`** on Opus 5.5 (one step below the
  `high` default of every other model), so an unset role silently thinks less.
- Re-tune per role and actually use `medium`; the useful middle of the ladder is easy to leave
  unused.
- `max` is a reserve for tasks that justify unbounded spend, not a default.
- `effort` is inert on claude-haiku-4-5.
- At `xhigh`/`max`, keep any `max_tokens` ≥ 64K — thinking and the answer share that budget.

## Opus 5.5 thinks and verifies itself
- Thinking is **always on**. Do **not** add "verify" / "double-check" / "re-verify"
  scaffolding to a prompt or role — it stacks with the model's own behavior and costs tokens
  with no quality gain. Structural review owned by a *separate* agent or by CI is fine; self-check
  scaffolding is not.
- Thinking **cannot be disabled** on Opus 5.5: `thinking: {type: "disabled"}` and
  `budget_tokens` return a 400 at every effort. To spend less, lower `effort`.
- Forced `tool_choice` (`any` / `tool`) returns a 400 on Opus 5.5: use `auto` with `strict: true`
  on the tool and name the tool in the prompt, or structured outputs.
- Text between tool calls arrives as `thinking` blocks, empty unless `display: "updates"`.
- Revisit any `max_tokens` sized for a no-thinking budget.

## Length is set by the prompt, not effort
- Lowering effort does **not** reliably shorten the visible answer — bound length in the prompt.
- Files Opus 5.5 writes to disk tend to run long: match document length to the task, no filler
  sections or redundant summaries.

## Review-prompt caveat
- "Report only high-severity" / "be conservative" makes the model find *less*. Ask it to report
  everything and filter in a separate pass.

## Ultrapowers per-role model map
This map decides the `model` of every ultrapowers subagent dispatch and outranks the Model
Selection section inside ultrapowers skills.

| Role | Model |
|---|---|
| Implementer, plan carries the complete code (transcription + tests) | `sonnet` |
| Implementer from prose, several files, integration | `opus` |
| Task reviewer, small mechanical diff | `sonnet` |
| Task reviewer, logic, security or concurrency | `opus` |
| Scoped re-review of a fix | `sonnet` |
| Fix rounds 4–5 | `opus` |
| Verification ("was the goal met") | `opus` |
| Final whole-branch review | `opus` |
| Summary writer | `haiku` |
| Orchestrator in the cheaper-orchestration mode | `sonnet` |

- Always pass `model` explicitly; an omitted one inherits the session's model.
- Effort is not set per dispatch: subagents inherit the session's effort.
- `fable` only when the user names it, including for the final review.
- A role not in the table: `sonnet`.

## Cost reference
| Model | ID | $/1M in | $/1M out | Context | Notes |
|---|---|---|---|---|---|
| Opus 5.5 | `claude-opus-5-5` | $4 | $20 | 1M | Thinking always on; default effort `medium`; cache read $0.20 |
| Sonnet 5 | `claude-sonnet-5` | $2 | $10 | 1M | Full effort ladder |
| Haiku 4.5 | `claude-haiku-4-5` | $1 | $5 | 200K | No `effort` parameter |
| Fable 5.1 | `claude-fable-5-1` | $10 | $50 | 1M | Explicit request only |

Prefer tier **aliases** (`opus`/`sonnet`/`haiku`/`fable`) over full model IDs in
`model_overrides` — they don't go stale.

## GSD's own per-role map lives elsewhere, not in this skill
Concrete per-role assignments are not duplicated here. Model overrides live in
`gsd-defaults.partial.json` (re-applied per project by `gsd-config-patch.mjs`); the per-role
`effort:` re-tune for GSD-owned agents/skills is carried by the review-gated patch mechanism
(`gsd-agent-patches.mjs` and its skill-patch sibling), because `/gsd-update` overwrites those
files and they have no other durable home.

## Advisor tool (Claude Code, session-level — separate axis from executor model choice)
Claude Code's advisor tool pairs the session's executor model with a stronger model consulted
mid-generation for strategy/course-correction. This is a HOST-RUNTIME setting
(`/advisor <model>`, `advisorModel`, or `--advisor`), not a per-agent choice — set once at the
session level, and every subagent an orchestrator spawns inherits the same advisor
automatically. There is no per-agent advisor control today.

This composes with, not replaces, everything above: the executor-model choice (Sonnet 5 by
default, stepped up where it fits) still governs cost for mechanical turns; the advisor adds a
stronger reviewer inline on top, on every turn, for the whole session.

**Worth enabling:** long, multi-step agent loops where the plan matters but most turns are
mechanical (e.g. `/gsd-execute-phase`, `/gsd-debug`) — prompt-caching for the advisor call
pays off at roughly 3+ advisor invocations, which these long loops make.
**Skip it:** short, one-shot agents (mappers, quick audits, single-file checks) — little to
plan, added cost without a commensurate quality gain.
