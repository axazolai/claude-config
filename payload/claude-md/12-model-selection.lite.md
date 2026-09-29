# Model Selection Policy
- DEFAULT executor: claude-sonnet-5-5. Step UP to claude-opus-5-5 for design and architecture,
  security-sensitive review, hard debugging, and work where a wrong answer is costly;
  claude-haiku-4-5 for no-judgment classification/extraction and routine work whose steps are
  known. claude-fable-5-1 only when the user names it (2.5x Opus 5.5 cost).
- Start `medium`. Dispatched work climbs the ladder one rung per failed check (a failing test
  or a reviewer rejection): rung-haiku, rung-sonnet-medium, rung-sonnet-high, rung-opus-medium,
  rung-opus-high. Design and hard-debugging judgment start on rung-opus-medium with two attempts;
  logic or security review, verification and final review start on rung-opus-high. After
  rung-opus-high fails, stop and report. `xhigh` and `max` only on the user's ask.
- Brainstorming and plan or spec review in the main session: recommend the user set `/effort high`
  (one level up) and return to `medium` afterwards; only the user changes the main session's effort.
- Always set `effort` explicitly where an API call takes it: an omitted `effort` is `medium` on
  Opus 5.5, `high` on Sonnet 5.5. `effort` is inert on claude-haiku-4-5. Do not carry `effort`
  values over between models.
- Opus 5.5 always thinks (thinking cannot be disabled — lower `effort` instead) and verifies its
  own work: do not add "verify"/"double-check" scaffolding, and revisit any `max_tokens` that
  was sized for a no-thinking budget. On Sonnet 5.5 `thinking: {type: "disabled"}` is a 400:
  lower `effort`, or send `{type: "between_tools"}` at effort `high` or below.
- Full routing and the ladder rules → the `model-selection-policy` skill.
