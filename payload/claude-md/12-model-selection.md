# Model Selection Policy
- DEFAULT executor: claude-sonnet-5-5. claude-haiku-5-5 for routine and small tasks:
  classification, extraction, summaries, code the plan carries, a small one-file change, small
  reviews. claude-opus-5-5 at `medium` for complex work: design and architecture, hard debugging,
  logic or security review, verification, final review, work where a wrong answer is costly.
  claude-fable-5-1 only when the user names it (2.5x Opus 5.5 cost).
- Every track starts on `medium`; `high` is reached only by escalation. Dispatched work climbs
  the ladder one rung per failed check (a failing test or a reviewer rejection): rung-haiku,
  rung-sonnet-medium, rung-sonnet-high, rung-opus-medium, rung-opus-high. Design and
  hard-debugging judgment start on rung-opus-medium with two attempts; logic or security review,
  verification and final review run on rung-opus-medium. After rung-opus-high fails, stop and
  report. `xhigh` and `max` only on the user's ask.
- Brainstorming and plan or spec review in the main session: recommend the user set `/effort high`
  (one level up) and return to `medium` afterwards; only the user changes the main session's effort.
- Ultrapowers subagent dispatches follow the role map in the `model-selection-policy` skill; it
  outranks the Model Selection section inside ultrapowers skills.
- Full routing and the ladder rules → the `model-selection-policy` skill.
