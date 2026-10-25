---
# `phases:` is the machine-readable source (statusline, phase-end nudge); the table below mirrors it.
# status: planned | running | blocked | complete | superseded (carries superseded_by) | abandoned
# delivery: none | branch | merged — deployment is the deployed_through waterline, not a row field
updated: 2026-10-26
current: null
deployed_through: "28"
phases:
  - { phase: "28", slug: lean-process, status: complete, delivery: merged }
  - { phase: "29", slug: logic-map, status: planned, delivery: none }
  - { phase: "30", slug: bundle-hardening, status: planned, delivery: none }
  - { phase: "31", slug: fork-maintenance, status: planned, delivery: none }
  - { phase: "32", slug: secrets-gate-hardening, status: planned, delivery: none }
  - { phase: "33", slug: ladder-measurement, status: planned, delivery: none }
---

# Roadmap

Phases 01–27 closed (03 superseded by 04; 14 `gsd-surface-dial` abandoned unstarted when phase 26
removed GSD). Their plans stay under `phases/`; git holds the rest.

| Phase | Goal | Status | Delivery |
|---|---|---|---|
| 28 lean-process | one plan per phase, ROADMAP + RESUME for the tree; fork deltas rewritten on upstream 7.0.1 and published | complete | merged `4216722`, deployed; fork `7.0.1-up.1` pushed |
| 29 logic-map | a hand-written project logic map (modules, edges, flows, invariants) with a drift checker in the test suite; spike per `.claude/.scratchpad/adhoc/2026-10-26-logic-map-research/report.md` on the reference project copied to `phases/29-logic-map/ref-project/` (git-ignored) | planned | none |
| 30 bundle-hardening | `setup.mjs` parse-failure note unreachable (`safe()` returns `undefined`, compared to `null`): fix and test; manual changelog bump commits never enqueued by `install-trigger.mjs`; a test that every command, skill and path named in `payload/claude-md` and `rules-src` ships | planned | none |
| 31 fork-maintenance | `/up-update` gets a base-first, keep-clone mode so a release that needs delta re-authoring lands through the tool, moving `describesTree`/`describesTag` with it | planned | none |
| 32 secrets-gate-hardening | per-value entropy check behind the placeholder allowlist in `secrets-gate.mjs`; Context7 key out of argv and plaintext via a `${CONTEXT7_API_KEY}` header reference once env expansion in user-scope `.claude.json` is confirmed | planned | none |
| 33 ladder-measurement | one week of the rung log against `/usage`: keep or revise the Sonnet-first tracks, fall back to Opus `medium` first if no gain; keep or retire `rung-usage-log` and add rotation | planned | none |
