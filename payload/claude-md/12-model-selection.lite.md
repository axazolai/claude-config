# Model Selection Policy
- DEFAULT executor: claude-sonnet-5. Step UP to claude-opus-5-5 for design and architecture,
  security-sensitive review, hard debugging, and work where a wrong answer is costly;
  claude-haiku-4-5 for no-judgment classification/extraction. claude-fable-5-1 only when the
  user names it (2.5x Opus 5.5 cost).
- Tune cost with `effort` within a tier. Start `high`; `xhigh` for long agentic runs and
  debugging; `max` is a reserve, not a default. `effort` is inert on claude-haiku-4-5. Do not
  carry `effort` values over between models.
- Always set `effort` explicitly where an API call takes it: an omitted `effort` is `medium` on
  Opus 5.5, `high` elsewhere.
- Opus 5.5 always thinks (thinking cannot be disabled — lower `effort` instead) and verifies its
  own work: do not add "verify"/"double-check" scaffolding, and revisit any `max_tokens` that
  was sized for a no-thinking budget.
- Full routing and the effort ladder → the `model-selection-policy` skill.
