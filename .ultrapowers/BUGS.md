# Bug log

Non-blocking bugs found during the work. Open entries first; fixed entries stay, one line each.
Entry: `BUG-NNN` — date — where — symptom — reproduction — unit of work — `Open`/`Fixed`.

## Open

- `BUG-002` — 2026-09-27 — `setup.mjs` MCP postAdd (`uvx --from scrapling[ai] scrapling install`) —
  a browser download that times out still exits 0, so the summary says `mcp-postadd scrapling`
  over an `Error: Request to …chrome-headless-shell-win64.zip timed out` line — first deploy of
  phase 20 on this machine (Playwright retried and the browsers ended up complete) — phase 20
  follow-up: after postAdd, verify the Playwright browser revision Scrapling needs is marked
  `INSTALLATION_COMPLETE`, else report `mcp-postadd-FAILED` — `Open`.

## Fixed

- `BUG-001` — 2026-09-23 — `up-update --publish` pushed the orphan `original` without force — `Fixed` in phase 19 (`PUBLISH_REFS` forces `+original` only).
