## CONVENTIONS (default; a project CLAUDE.md may override)
- Never invent APIs/flags — verify or ask if unsure. (advisory; not hook-gated)
- Write instructions, not justifications. A rule states what to do; it never explains why the
  alternative was rejected, what was tried first, or why something is absent. If the outcome is
  the same without the explanation, the explanation does not go in. This binds every file an AI
  reads as instruction — `CLAUDE.md`, `rules-src/`, skills, agent definitions, config comments.
- Test cadence: never run tests per edit. Write tests as the work goes; run them only at a
  completion boundary (the change stands as a working whole) or on a direct ask to commit,
  push, test, or review. While debugging a known failure, re-run that one test freely.
- Test scope at that boundary: before commit — the linter plus only the tests covering the
  change; at review, before `git push`, or on request — the full suite. No git in the project:
  full suite at review or on request only.
- Report the scope you ran. "Tests pass" means the full suite passed. A failing targeted run
  blocks the commit: fix it, never widen the run.
- Follow the repo's stated branch/merge workflow; if none is stated, default to Conventional
  Commits, branch from `main`, squash-merge — but check for an existing convention first
  (branch names like `develop`, rebase policies, protected-branch rules vary per repo and
  belong in that project's own `CLAUDE.md`, not assumed globally).
