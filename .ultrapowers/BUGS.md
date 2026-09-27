# Bug log

Non-blocking bugs found during the work. Open entries first; fixed entries stay, one line each.
Entry: `BUG-NNN` — date — where — symptom — reproduction — unit of work — `Open`/`Fixed`.

## Open

## Fixed

- `BUG-004` — 2026-09-27 — `payload/hooks/phase-end-cleanup-nudge.test.mjs`'s `runHook()` spreads the real `process.env` into the spawned hook without clearing `CLAUDE_PROJECT_DIR` (unlike the sibling `scratchpad-layout-guard.test.mjs`/`scratchpad-temp-env.test.mjs`, which already guard against this) — a session whose own environment has `CLAUDE_PROJECT_DIR` set to this repo (true for any Claude Code session, including the one that ran this plan) makes the hook resolve the wrong project root, so `toRel()` never matches `SUMMARY_RE` and `main()` exits with empty stdout — 2 test failures (`JSON.parse("")` on the two spawned-run tests). Found by Task 8 of the phase 21/22 pre-deploy fixes plan (22-FIXES-PLAN.md) while running the full suite; belonged to Task 7's `phase-end-cleanup-nudge.test.mjs`. `Fixed` in phase 22, commit `e44c5fa` (`runHook()` now clears `CLAUDE_PROJECT_DIR: undefined` before spreading the caller's own `env`, matching the sibling test files; added a regression test proving a spawned run ignores the ambient value).
- `BUG-003` — 2026-09-27 — `scanLayout` dropped a file whose NTFS mtime landed up to ~1.3ms ahead of `nowMs` — `Fixed` in phase 22 (the age filter tolerates `CLOCK_SKEW_MS` = 5ms).
- `BUG-002` — 2026-09-27 — Scrapling postAdd reported success over a printed download timeout — closed, not a defect: Playwright retries a browser download up to 5 times and prints each failed attempt; only a fifth failure sets exit 1, which `scrapling install` (`check_output`) and `setup.mjs` report as `mcp-postadd-FAILED`.
- `BUG-001` — 2026-09-23 — `up-update --publish` pushed the orphan `original` without force — `Fixed` in phase 19 (`PUBLISH_REFS` forces `+original` only).
