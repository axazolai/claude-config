---
profiles: [base]
---
# SAVE POINTS
- Save points: a plan written to its file; the end of a phase; a finished part of a decomposed
  task. A save point does not commit.
- At a save point, before the reply that reports it, update `.ultrapowers/RESUME.md` (a location
  the project `CLAUDE.md` states wins). Sections: `## Summary` (where the project stands, what is
  uncommitted or undeployed), `## Open` (next steps in order, the first one concrete enough to
  start from a cleared context), `## Done` (closed items with their decisions and the spec, plan
  or commit that holds them). A closed item moves from Open to Done, nothing is removed.
- A written plan stops at its save point: running it is the first Open item.
- End the reply with the saved paths and a resume prompt in a code block:
  ```
  Continue from .ultrapowers/RESUME.md: <the first Open item>
  ```
