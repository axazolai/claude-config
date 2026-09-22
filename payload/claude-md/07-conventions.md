## CONVENTIONS (default; a project CLAUDE.md may override)
- Never invent APIs/flags — verify or ask if unsure. (advisory; not hook-gated)
- Write instructions, not justifications. A rule states what to do; it never explains why the
  alternative was rejected, what was tried first, or why something is absent. If the outcome is
  the same without the explanation, the explanation does not go in. This binds every file an AI
  reads as instruction — `CLAUDE.md`, `rules-src/`, skills, agent definitions, config comments.
- Test timing: code first. Tests are written when a unit of work (what one review covers — a
  plan task under per-task review, otherwise the whole change) stands as a working whole, before
  its review, and only to confirm behaviour the spec or plan states. A decision made during the
  work that changed behaviour, scope or an interface goes into the spec/plan first; the tests
  follow the updated text.
- Bug log: a bug found during the work that does not block the next step goes to the bug log
  and the work continues; a blocking bug is fixed at once. Entry: `BUG-NNN`, date, where,
  symptom, reproduction, unit of work, status `Open`/`Fixed`. Before writing a unit's tests, fix
  its open entries; at the end of the work, before the final review, fix the rest. An entry
  outside the work's scope is listed to the user instead of fixed. Fixed entries stay,
  compressed to a line.
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
- Temporary files stay inside the project, in two tiers. Disposable work — scratch scripts,
  intermediate dumps, previews, probe captures — goes to `<project>/.claude/.scratchpad/tmp/`;
  a file there older than 7 days may be deleted by any session after listing it (list, then
  delete the listed names). Durable work — run journals, inventories, caches, SDD reports —
  goes to `<project>/.claude/.scratchpad/` outside `tmp/` and is deleted only by the per-path
  rule below. Never the home directory, `~/.claude`, or a system temp dir. Create or extend
  `.claude/.gitignore` before the first write. Durable user-scope state is out of scope and
  does not move — the memory directory, `~/.claude/state/`, token logs, the bundle manifest.
- At a completion boundary, delete the files this session wrote to `.claude/.scratchpad/tmp/`
  that the finished work no longer needs — name each; never touch the durable tier.
- Never `rm -rf`. Delete by naming each path, after looking at what it holds; a glob, a mask or
  "everything in this directory" is not grounds for deletion. Same bar for git: `git clean` in
  any form, `git reset --hard`, `git checkout -- .` and `git rm -r` are out, while
  `git checkout -- <one named file>` and `git rm <one named file>` are fine. A path in
  `.gitignore` is local, not disposable — `.env`, local settings and caches live there.
- Follow the repo's stated branch/merge workflow; if none is stated, default to Conventional
  Commits, branch from `main`, squash-merge — but check for an existing convention first
  (branch names like `develop`, rebase policies, protected-branch rules vary per repo and
  belong in that project's own `CLAUDE.md`, not assumed globally).
