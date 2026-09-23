# Bug log

Non-blocking bugs found during the work. Open entries first; fixed entries stay, one line each.
Entry: `BUG-NNN` — date — where — symptom — reproduction — unit of work — `Open`/`Fixed`.

## Open

- `BUG-001` — 2026-09-23 — `payload/bin/up-update.mjs:179` — `--publish` pushes `original`
  without force, but every release re-creates `original` as a parentless commit
  (`origin/original`: 6.2.0 `f3789fc` → 6.3.0 `db1e7ab`, both orphans), so the push is a
  non-fast-forward and is rejected — reproduction: `up-update update --publish` on any new
  upstream release — unit: phase 19 — `Open`

## Fixed
