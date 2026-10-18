---
phase: 26
slug: remove-gsd
status: complete
tasks_done: 5
tasks_total: 5
branch: phase-26-remove-gsd
integration: merged
updated: 2026-10-18
---

# Phase 26 — Remove GSD and the `full` profile: state

Remove the GSD integration and the `full` profile; every `node setup.mjs` run removes GSD traces
from the machine automatically and permanently.

**Complete, merged into `master` at `80230d9` (merge commit, branch deleted), 2026-10-18; full
suite 625/625 on the merged result; not deployed.** All five tasks ran subagent-driven on `phase-26-remove-gsd`
(`58d0980..18bca2e`), each task review clean, the final whole-branch review's fix wave re-reviewed
clean, full suite 625/625 at `18bca2e`. Verification: ACHIEVED (`26-VERIFICATION.md`); its one
VIOLATED constraint is six commits whose `Co-Authored-By` trailer names Sonnet 5.5 rather than
Opus 5.5 — a squash merge replaces them. Rulings, deferred minors and out-of-spec items:
`26-SUMMARY.md`.

Next: deploy A, C and phase 26 together from `master` with `node setup.mjs` (answer `r` on `CLAUDE.md`) and restart Claude Code. The
real-machine success criterion (spec § 1) is checked on that deploy.

## Done

- Tasks 1-5 and the final-review fix wave, 2026-10-18.
- Spec approved and plan written (five test-after tasks), 2026-10-18.
