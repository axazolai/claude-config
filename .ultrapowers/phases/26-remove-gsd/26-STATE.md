---
phase: 26
slug: remove-gsd
status: running
tasks_done: 1
tasks_total: 5
branch: phase-26-remove-gsd
integration: branch
updated: 2026-10-18
---

# Phase 26 — Remove GSD and the `full` profile: state

Remove the GSD integration and the `full` profile; every `node setup.mjs` run removes GSD traces
from the machine automatically and permanently.

**Spec approved, plan written, execution not started.** `26-SPEC.md` was approved on 2026-10-18;
`26-PLAN.md` holds five test-after tasks: the purge plan module, GSD code paths out of runtime
hooks, the `full` profile and every GSD file out, the purge wired into `setup.mjs` in place of the
gsd-core detector, then texts and docs. The plan's Task 1 code and Task 3 profile resolution were
executed against samples before the plan was committed.

Next: choose the execution method (subagent-driven or native) and run the plan from Task 1. No
branch exists yet.
