---
profiles: [base, full]
---
# Model Selection Policy
- DEFAULT executor: claude-sonnet-5-5. Step UP to claude-opus-5-5 for design and architecture,
  security-sensitive review, hard debugging, and work where a wrong answer is costly;
  claude-haiku-4-5 for no-judgment classification/extraction and routine work whose steps are
  known. claude-fable-5-1 only when the user names it (2.5x Opus 5.5 cost).
- Start `medium`. Dispatched work climbs the ladder one rung per failed check (a failing test
  or a reviewer rejection): rung-haiku, rung-sonnet-medium, rung-sonnet-high, rung-opus-medium,
  rung-opus-high. Judgment roles start on rung-opus-medium with two attempts. After
  rung-opus-high fails, stop and report. `xhigh` and `max` only on the user's ask.
- Always set `effort` explicitly where an API call takes it: an omitted `effort` is `medium` on
  Opus 5.5, `high` on Sonnet 5.5. `effort` is inert on claude-haiku-4-5. Do not carry `effort`
  values over between models.
- Opus 5.5 always thinks (thinking cannot be disabled — lower `effort` instead) and verifies its
  own work: do not add "verify"/"double-check" scaffolding, and revisit any `max_tokens` that
  was sized for a no-thinking budget. On Sonnet 5.5 `thinking: {type: "disabled"}` is a 400:
  lower `effort`, or send `{type: "between_tools"}` at effort `high` or below.
- Ultrapowers subagent dispatches follow the role map in the `model-selection-policy` skill; it
  outranks the Model Selection section inside ultrapowers skills.
- Full routing, the ladder rules, and the per-role GSD effort map → the
  `model-selection-policy` skill.
