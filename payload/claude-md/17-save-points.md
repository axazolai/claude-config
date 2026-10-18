---
profiles: [base, full]
---
# SAVE POINTS
- Save points: a plan written to its file; the end of a phase; a finished part of a decomposed
  task.
- At a save point, before the reply that reports it, update:
  - `.ultrapowers/ROADMAP.md`: `current`, each phase's `status`, `updated`.
  - `<phase dir>/NN-STATE.md` while a phase is in flight.
  - `.ultrapowers/RESUME.md` (a location the project `CLAUDE.md` states wins). Create it when
    missing with three sections: `## Summary` (where the project stands, what runs, what is
    uncommitted or undeployed), `## Open` (next steps in order, the first one concrete enough to
    start from a cleared context), `## Done` (each closed item with its decisions and the spec,
    plan or commit that holds them). Nothing is removed from it: a closed item moves from Open to
    Done.
- A save point does not commit.
- A written plan stops at its save point: choosing the execution method and running the plan are
  the first Open item, done in the next session.
- End the reply with the saved paths, an offer to run `/clear`, and a resume prompt in the reply
  language, in a code block:
  ```
  Continue from .ultrapowers/RESUME.md: <the first Open item>
  ```
