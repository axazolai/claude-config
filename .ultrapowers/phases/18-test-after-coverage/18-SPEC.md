# Phase 18 — test-after coverage and a bug log — design

Written 2026-09-23. User decisions: replace test-first with test-after-code-before-review, tests
only confirm the spec/plan; a decision made during the work updates the spec/plan before the
final tests; a bug that does not block the work goes to a bug log and is fixed before the tests
and/or at the end of the work. Scope chosen: installer rules + a fork delta (014) in
`../ultrapowers`; bug log located like the risk register; a fixed bug gets a test only when it
broke spec'd behaviour; GSD `tdd_mode` defaults to `false`.

## 1. The process

A **unit of work** is what goes to one review: a plan task under per-task review
(subagent-driven development), otherwise the whole change. At its end, in this order:

1. **Reconcile.** A decision made during the work that changed behaviour, scope or an interface
   is written into the spec and/or plan first.
2. **Drain the bug log** for this unit: fix its open entries.
3. **Write the tests** — one per behaviour / acceptance criterion the spec or plan states,
   nothing else. Mutation check instead of a RED step.
4. **Run** them (the test-cadence rules are unchanged).
5. **Review.**

At the end of the whole work, before the final review: drain what is left in the log. An entry
outside the work's scope is listed to the user instead of fixed.

**Bug log.** A bug found during the work that does not block the next step is logged and the
work continues; a blocking bug is fixed at once. File: `BUGS.md`, location the project's to
state (project `CLAUDE.md`), else project root; this repository: `.ultrapowers/BUGS.md`.
Entry: `BUG-NNN`, date, where, symptom, reproduction, unit of work, status `Open`/`Fixed`.
Fixed entries stay, compressed (status files keep history).

**Regression tests.** A fixed bug gets a test only when it broke behaviour the spec states —
that behaviour's acceptance test is the regression test. A standalone bug fix with no spec
takes the report's expected behaviour as its spec: one test, after the fix.

## 2. Units of change

### 2.1 Installer (this repository)

- `payload/rules-src/testing.md`: `## Test-first vs test-after` → `## When tests are written —
  after the code, before review` (the process of § 1); `## Choosing what to test — plan before
  code` → `## Choosing what to test — the spec's list` (the scenario list is the spec's
  acceptance list; partitioning, boundaries and budget bullets stay); the "bug fix needs a
  regression test that fails before the fix" bullet follows § 1 "Regression tests".
- `payload/claude-md/07-conventions.md`: "Write tests as the work goes" → the test-timing rule;
  a new bug-log bullet.
- `payload/claude-md/06-collaboration.md` and `.lite.md`: bug-log location beside the risk
  register line.
- `gsd-defaults.partial.json`: `workflow.tdd_mode` → `false`.
- `.claude/CLAUDE.md` (project): bug log location `.ultrapowers/BUGS.md`.
- `.ultrapowers/BUGS.md`: created with its header, empty.

### 2.2 Fork — delta `014-test-after-coverage.patch`

- `skills/test-driven-development/SKILL.md`: rewritten to the § 1 process; slug kept (renaming
  a skill directory touches the inventory manifest and every cross-reference for no behavioural
  gain); description `Use when a unit of work's code is complete, before its review — writes the
  tests that confirm the spec/plan`.
- `skills/test-driven-development/writing-good-tests.md`: the two TDD passages ("Strict TDD
  produces both naturally", "Tests Ship With the Implementation") restated for test-after; the
  mutation check stays as the substitute for RED.
- `skills/writing-plans/SKILL.md`: bite-sized steps and the task template — implement →
  reconcile → acceptance tests → run → commit; each task carries an `**Acceptance:**` list (one
  line per behaviour) instead of test code.
- `skills/subagent-driven-development/implementer-prompt.md`: job order per § 1, bug-log step,
  `TDD Evidence` → `Acceptance coverage` (criterion → test).
- `skills/subagent-driven-development/task-reviewer-prompt.md`: "with TDD evidence" → "with
  acceptance coverage"; a missing test for a stated criterion or a test for an unstated one is a
  finding.
- `skills/systematic-debugging/SKILL.md`: logged-not-blocking entry point; Phase 4 step 1
  reproduces by a one-off command/script, the permanent test follows § 1.
- `skills/brainstorming/SKILL.md`: "(TDD applies)" → "(tests after the code, before review)".
- `skills/subagent-driven-development/SKILL.md`: a bug-log drain step before the final review;
  the pre-flight scan compares a task's Acceptance list, not its test code, against its code.
- `skills/verification-before-completion/SKILL.md` (the plugin's; still reachable as
  `ultrapowers:verification-before-completion` beside the user-scope shadow): "Regression tests
  (TDD Red-Green)" → a regression test only for stated behaviour, checked by mutation.
- `transform/config.json`: `version.revision` 5 → 6. Plugin README (`fork-owned`) lists delta
  014; repo README count "thirteen" → "fourteen".

Out of scope: `writing-skills` (its RED/GREEN is pressure-testing skill text, a separate
discipline), GSD agent definitions (governed by `tdd_mode`).

## 3. Machine-side

`~/.gsd/defaults.json` is merged additively — an existing `tdd_mode: true` is kept. On this
machine it is set by hand once: `gsd-tools config-set workflow.tdd_mode false` or an edit of
that file. A project's `.planning/config.json` takes the new value on its next
`gsd-defaults-sync`. The fork reaches a machine through its own push and a plugin update.

## 4. Verification

- `node --test` in this repository and `node --test` + `node transform/build-cli.mjs check` in
  the fork pass.
- `grep -rniE "TDD|test-first|failing test first|as the work goes" payload/claude-md
  payload/rules-src/testing.md` prints nothing.
- The built fork tree: `grep -rliE "TDD|failing test" plugins/ultrapowers/skills` finds only
  `writing-skills/*`, `systematic-debugging/CREATION-LOG.md`, and the example task text in
  `dispatching-parallel-agents`.
- `node setup.mjs --dry-run` lists the changed payload files.
