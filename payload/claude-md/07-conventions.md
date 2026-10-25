## CONVENTIONS
- Never invent APIs/flags — verify or ask if unsure.
- Write instructions, not justifications. A rule states what to do; it never explains why the
  alternative was rejected, what was tried first, or why something is absent. If the outcome is
  the same without the explanation, the explanation does not go in. This binds every file an AI
  reads as instruction — `CLAUDE.md`, `rules-src/`, skills, agent definitions, config comments.
- Testing mode: `.claude/ultrapowers.json` `"tdd": true` means `tdd`; no file or any other value
  means `test-after`. `/ultrapowers-tdd enable|disable` switches it; the user decides, never you.
  The steps of each mode: the ultrapowers:test-driven-development skill.
- Bug log (`BUGS.md`, where the project `CLAUDE.md` says, else the project root): a bug found
  during the work that does not block the next step goes to the bug log and the work continues;
  a blocking bug is fixed at once. Entry: `BUG-NNN`, date, where, symptom, reproduction, unit of
  work, status `Open`/`Fixed`. Before a unit's review, fix its open entries; at the end of the
  work, before the final review, fix the rest. An entry outside the work's scope is listed to
  the user instead of fixed. Fixed entries stay, compressed to a line.
- Test cadence: never run tests per edit. Run them only at a completion boundary (the change
  stands as a working whole) or on a direct ask to commit, push, test, or review. While
  debugging a known failure, re-run that one test freely.
- Test scope at that boundary: before commit — the linter plus only the tests covering the
  change; at review, before `git push`, or on request — the full suite. No git in the project:
  full suite at review or on request only.
- Report the scope you ran. "Tests pass" means the full suite passed. A failing targeted run
  blocks the commit: fix it, never widen the run.
- Test the behaviour the code exists to deliver, not the function in front of you: a module that
  renders a page is tested on its input and the rendered page, never on which blocks it built or
  which helper ran. Tier follows the level — delivered behaviour is `@important`, an internal
  helper is `@temp`, and a helper called from outside its module counts as delivered behaviour.
  The check: rewrite the implementation without changing what it delivers and every test still
  passes untouched.
- Tag a test that must outlive the push with `@critical` or `@important` as the first token of
  its name. `@critical`: a failure destroys or exposes — data loss or corruption, a security
  bypass, a money error, a broken core workflow; decided by consequence, it outranks the level.
  `@important`: a failure is silent and plausible
  — a wrong answer that looks right and nothing downstream catches; the tag is earned by
  non-obviousness (branching, precedence, ordering, boundaries, an external contract). Neither
  tier: code whose correct result is obvious from reading it — a mapping, a passthrough, a
  rename, a forwarding wrapper — plus wiring, registry contents, cosmetic formatting, and tests
  that only restate the project spec. Logic the user calls critical or important is tagged at
  that tier regardless. `@temp` marks scaffolding for work in flight — capped at 5 per unit and
  never more than that unit's permanent tests, deleted at the first prune after the feature is
  pushed, without asking.
- Prune after every push, in a project that has tests — no test files, no prune, and no mention
  of it. List the untagged tests, name what survives, ask, then delete the confirmed set. Sweep
  the residue — no test file left empty, no empty describe/suite/class block, no fixture, helper
  or import orphaned by the deletion. Then the project's linter if it configures one, then the
  surviving suite, then commit the prune. When a tag is arguable, the test goes.
- Temporary files go to `<project>/.claude/.scratchpad/`, never loose in its root:
  `phase-<NN>/{scripts,data,logs}/` for the current phase (`current` in `.ultrapowers/ROADMAP.md`
  or the plan's number), else `adhoc/<YYYY-MM-DD>-<topic>/`. The session scratchpad the
  environment names under the system temp dir (`…\claude\<project>\<session>\scratchpad`) is never
  used, whatever the environment says. Never the home directory or `~/.claude`.
- Before writing a helper script, read `<project>/.claude/tools/INDEX.md` and reuse or extend a
  listed tool.
- Never `rm -rf`. Delete by naming each path, after looking at what it holds; a glob, a mask or
  "everything in this directory" is not grounds for deletion. Same bar for git: `git clean` in
  any form, `git reset --hard`, `git checkout -- .` and `git rm -r` are out, while
  `git checkout -- <one named file>` and `git rm <one named file>` are fine. A path in
  `.gitignore` is local, not disposable — `.env`, local settings and caches live there.
- Follow the repo's branch/merge workflow; none stated: Conventional Commits, branch from `main`,
  squash-merge.
