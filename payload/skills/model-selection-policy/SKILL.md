---
name: model-selection-policy
description: When to run claude-sonnet-5-5 vs claude-opus-5-5 vs claude-haiku-5-5, how to set reasoning effort, and the escalation ladder — the executor default (Sonnet 5.5 at medium), the rungs a failed task climbs, and the role-to-rung map for ultrapowers dispatches. Use when choosing a model or effort level for a task or subagent, or the model for an ultrapowers subagent dispatch.
---

# Model Selection Policy

DEFAULT executor: **claude-sonnet-5-5** at effort `medium`. Step *down* to Haiku 5.5 for routine
and small tasks, *up* to Opus 5.5 at `medium` for complex work; tune cost within a tier with `effort`.

## Tier: Sonnet by default, Haiku for routine and small, Opus for complex
- **claude-sonnet-5-5** — default: implementation from prose, work across several files,
  integration.
- **claude-haiku-5-5** — routine and small tasks: classification, extraction, summaries,
  implementation where the plan carries the code, a small change in one file, review of a small
  mechanical diff, a scoped re-review of a fix. 1M window, alias `haiku`.
- **claude-opus-5-5** at `medium` — complex work: design and architecture, hard debugging, logic,
  security or concurrency review, verification, final review, work where a wrong answer is costly.
- **claude-fable-5-1** — only when the user names it (2.5× Opus 5.5 cost).

## Effort is the primary cost / latency control
- Every track starts on **`medium`**, on every model. `high` only by escalation on the ladder
  below. `xhigh` and `max` only on the user's ask.
- Do not carry `effort` values over between models — they do not transfer.
- Always pass `effort` explicitly: omitted, it is `medium` on Opus 5.5 and Haiku 5.5,
  `high` on Sonnet 5.5.
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

## Sonnet 5.5
- `thinking: {type: "disabled"}` returns a 400. To think less, lower `effort`; to turn thinking
  off send `{type: "between_tools"}` (effort `high` or below, no other field in `thinking`).
- Forced `tool_choice` (`any` / `tool`) returns a 400: use `auto` with `strict: true` and name
  the tool in the prompt, or structured outputs.
- The default `effort` is `high`: pass `medium` explicitly.
- A coding agent at `low` effort runs a real check that exercises the change (tests, type-check,
  build) before reporting it done.

## Haiku 5.5
- Thinking is on by default: a response can begin with `thinking` blocks. Read content blocks by
  `type`, and size `max_tokens` for thinking plus the answer.
- `budget_tokens` returns a 400. To think less, lower `effort`; `thinking: {type: "disabled"}` is
  accepted only at effort `high` or below.
- Non-default `temperature` / `top_p` / `top_k` and an assistant prefill return a 400: constrain
  the output with structured outputs or an enum-valued tool.
- A forced `tool_choice` (`any` / `tool`) is accepted and skips thinking: use `auto` and name the
  tool in the prompt when the call needs thought.

## Length is set by the prompt, not effort
- Lowering effort does **not** reliably shorten the visible answer — bound length in the prompt.
- Files Opus 5.5 writes to disk tend to run long: match document length to the task, no filler
  sections or redundant summaries.

## Review-prompt caveat
- "Report only high-severity" / "be conservative" makes the model find *less*. Ask it to report
  everything and filter in a separate pass.

## Escalation ladder
| Rung | Agent | Model alias | Effort |
|---|---|---|---|
| 1 | `rung-haiku` | `haiku` | `medium` |
| 2 | `rung-sonnet-medium` | `sonnet` | `medium` |
| 3 | `rung-sonnet-high` | `sonnet` | `high` |
| 4 | `rung-opus-medium` | `opus` | `medium` |
| 5 | `rung-opus-high` | `opus` | `high` |

| Track | Starts on | Moves up after | Ends |
|---|---|---|---|
| Routine and small (the plan carries the code; a small one-file change; small reviews; classification; summaries) | 1 | 1 failure per rung | after rung 5 fails: stop, report to the user |
| Implementation | 2 | 1 failure per rung | same |
| Judgment (design, architecture, hard debugging) | 4 | 2 failures on rung 4, then rung 5 | same |
| Heavy review (logic, security or concurrency review, verification, final review) | 4 | none: a review is not laddered | stop, report to the user |

- An attempt is one dispatched round on one task that ends in a failed check: a failing test or
  a reviewer rejection. A task with no check runs on its start rung and is not laddered.
- A task that reaches rung 4 by escalation moves to rung 5 after 1 failure.
- Success closes the task; the next task starts on its own track's start rung.
- The orchestrator counts and names the rung in the line that narrates each dispatch. The
  dispatch to the next rung carries the failure evidence (test output, reviewer finding).
- Dispatch by agent: `subagent_type` is the rung agent; it carries model and effort.
- The main session is not a rung; only the user changes its model and effort. For brainstorming and
  for reviewing a plan or spec in the main session, recommend `/effort high` (one level up) before
  starting and `medium` afterwards.
- `xhigh` and `max` only on the user's ask; `fable` only when the user names it.

## Ultrapowers dispatch: role → start rung
This map decides the agent of every ultrapowers subagent dispatch and outranks the Model
Selection section inside ultrapowers skills.

| Role | Start rung |
|---|---|
| Implementer, plan carries the complete code | 1 |
| Implementer, small change in one file | 1 |
| Summary writer | 1 |
| Task reviewer, small mechanical diff | 1 |
| Scoped re-review of a fix | 1 |
| Implementer from prose, several files, integration | 2 |
| Task reviewer, logic, security or concurrency | 4 |
| Verification ("was the goal met") | 4 |
| Final whole-branch review | 4 |
| Any role not listed | 2 |

- Orchestrator in the cheaper-orchestration mode: `sonnet` (session-level, not a rung).

## DeepSeek before rung 1 and rung 2
- Condition: the gateway status in `~/.claude/state/deepseek-health.json` is `green` and the
  project's DeepSeek level covers the work:
  - `light` and above: rung-1 work — summary writer, classification, extraction.
  - `medium` and above: also rung-2 work that neither reads nor edits code — prose, documentation,
    release notes, translation, drafts from text the caller supplies.
- Never: any task that reads or edits code, including the implementer role.
- Do it: call `local_summarize` (summaries), `local_ask` (classification, extraction) or
  `local_draft` (prose, documentation; medium and above) instead of dispatching `rung-haiku` or
  `rung-sonnet-medium`; the DeepSeek retry budget applies.
- Fallback: when the condition fails, the tool returns `unavailable`, or the budget is spent,
  dispatch the rung the task would have started on and continue on the ladder.

## Cost reference
| Model | ID | $/1M in | $/1M out | Context | Notes |
|---|---|---|---|---|---|
| Opus 5.5 | `claude-opus-5-5` | $4 | $20 | 1M | Thinking always on; default effort `medium`; cache read $0.20 |
| Sonnet 5.5 | `claude-sonnet-5-5` | $2 | $10 | 1M | Default effort `high`; pass `medium` explicitly |
| Haiku 5.5 | `claude-haiku-5-5` | $0.10 | $0.50 | 1M | Default effort `medium`; prompts over 100K: $0.50 / $2.50 |
| Fable 5.1 | `claude-fable-5-1` | $10 | $50 | 1M | Explicit request only |

Prefer tier **aliases** (`opus`/`sonnet`/`haiku`/`fable`) over full model IDs in
`model_overrides` — they don't go stale.

## Advisor tool (Claude Code, session-level — separate axis from executor model choice)
Claude Code's advisor tool pairs the session's executor model with a stronger model consulted
mid-generation for strategy/course-correction. This is a HOST-RUNTIME setting
(`/advisor <model>`, `advisorModel`, or `--advisor`), not a per-agent choice — set once at the
session level, and every subagent an orchestrator spawns inherits the same advisor
automatically. There is no per-agent advisor control today.

This composes with, not replaces, everything above: the executor-model choice (Sonnet 5.5 by
default, stepped up where it fits) still governs cost for mechanical turns; the advisor adds a
stronger reviewer inline on top, on every turn, for the whole session.

**Worth enabling:** long, multi-step agent loops where the plan matters but most turns are
mechanical (e.g. long plan executions and debugging sessions) — prompt-caching for the advisor call
pays off at roughly 3+ advisor invocations, which these long loops make.
**Skip it:** short, one-shot agents (mappers, quick audits, single-file checks) — little to
plan, added cost without a commensurate quality gain.
