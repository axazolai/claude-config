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
- Tag a test that must outlive the push with `@critical` or `@important` as the first token of
  its name. `@critical`: a failure means a crash, data loss or corruption, a security bypass, a
  money error, or a broken core workflow. `@important`: the test asserts the behaviour of a
  function, procedure, computation or transformation — input to output. Business logic and data
  schemas are specified in the project spec; a test that only restates one is neither tier.
- Prune after every push, in a project that has tests — no test files, no prune, and no mention
  of it. List the untagged tests, name what survives, ask, then delete the confirmed set. Sweep
  the residue — no test file left empty, no empty describe/suite/class block, no fixture, helper
  or import orphaned by the deletion. Then the project's linter if it configures one, then the
  surviving suite, then commit the prune. When a tag is arguable, the test goes.
- Temporary files stay inside the project: scratch scripts, inventories, intermediate dumps and
  run logs go to `<project>/.claude/.scratchpad`, never to the home directory, `~/.claude`, or a
  system temp dir. Create or extend `.claude/.gitignore` before the first write. Durable
  user-scope state is out of scope and does not move — the memory directory, `~/.claude/state/`,
  token logs, the bundle manifest.
- Never `rm -rf`. Delete by naming each path, after looking at what it holds; a glob, a mask or
  "everything in this directory" is not grounds for deletion. Same bar for git: `git clean` in
  any form, `git reset --hard`, `git checkout -- .` and `git rm -r` are out, while
  `git checkout -- <one named file>` and `git rm <one named file>` are fine. A path in
  `.gitignore` is local, not disposable — `.env`, local settings and caches live there.
- Follow the repo's stated branch/merge workflow; if none is stated, default to Conventional
  Commits, branch from `main`, squash-merge — but check for an existing convention first
  (branch names like `develop`, rebase policies, protected-branch rules vary per repo and
  belong in that project's own `CLAUDE.md`, not assumed globally).
