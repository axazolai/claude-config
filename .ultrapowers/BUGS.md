# Bug log

Non-blocking bugs found during the work. Open entries first; fixed entries stay, one line each.
Entry: `BUG-NNN` — date — where — symptom — reproduction — unit of work — `Open`/`Fixed`.

## Open

## Fixed

- `BUG-002` — 2026-09-27 — Scrapling postAdd reported success over a printed download timeout — closed, not a defect: Playwright retries a browser download up to 5 times and prints each failed attempt; only a fifth failure sets exit 1, which `scrapling install` (`check_output`) and `setup.mjs` report as `mcp-postadd-FAILED`.
- `BUG-001` — 2026-09-23 — `up-update --publish` pushed the orphan `original` without force — `Fixed` in phase 19 (`PUBLISH_REFS` forces `+original` only).
