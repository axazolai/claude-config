# SAVE POINTS
- Save points: a plan written to its file; a stage of a plan done; the end of a phase. A save
  point does not commit.
- At a save point, before the reply that reports it, rewrite `.ultrapowers/RESUME.md` (a location
  the project `CLAUDE.md` states wins). Sections: `## Summary` (at most five lines: where the
  project stands, what is uncommitted or undeployed), `## Open` (next steps in order, the first
  one concrete enough to start from a cleared context). A closed item is deleted; git and the
  plan's ticked boxes hold the history.
- A phase has one document, `.ultrapowers/phases/NN-<slug>/NN-PLAN.md`, rewritten in place: its
  `- [ ]` boxes are its state, a deviation is a one-line `Ruling:` under the task, a dropped task is
  `- [-]` with a `Ruling:`, each stage ends with a `Result:` line. A phase end also updates its
  row in `.ultrapowers/ROADMAP.md`.
- A written plan stops at its save point: running it is the first Open item.
- End the reply with the saved paths and a resume prompt in a code block:
  ```
  Continue from .ultrapowers/RESUME.md: <the first Open item>
  ```
