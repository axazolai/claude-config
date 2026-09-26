# Phase 20 — User-scope MCP servers per profile: summary

Status: complete. Branch `feat/mcp-servers`, squash-merged into `master` 2026-09-27. Spec
`20-SPEC.md`, plan `20-PLAN.md`. Executed inline (executing-plans), testing mode test-after.

## Delivered

- `variants.json` `managedMcpServers` (`scrapling`, `context7`) and per-profile `mcpServers`:
  base and full get both, lite gets none; an absent list is inherited through `extends`.
- `mcp-reconcile.mjs` — pure planner: add missing, remove managed-but-unwanted, never rewrite a
  configured server; key values masked in every printed line.
- `setup.mjs` MCP block after plugin reconciliation: `--replace-all` adds (and runs Scrapling's
  `scrapling install` right after), removals only printed; interactive y/n/s; dry-run, skip-all
  and `CLAUDE_SETUP_SKIP_MCP=1` print only. `claude.cmd` fallback on Windows, shared with plugin
  calls. A relocated config dir reads only its own `.claude.json`.
- `payload/claude-md/15-web-access.md` (base/full): routing between Context7,
  `ctx_fetch_and_index` and Scrapling. `09-plugins.lite.md` split so lite never claims the servers.
- Hooks (base/full): `scrapling-raw-gate` (PreToolUse, denies `main_content_only` other than
  `true`/absent; override `CLAUDE_SCRAPLING_ALLOW_RAW=1`), `web-block-nudge`
  (PostToolUse + PostToolUseFailure, points at Scrapling on a WebFetch refusal, a Cloudflare
  challenge or an empty JS shell).
- `run-tests.mjs` — the suite runs with temp dirs under `.claude/.scratchpad/test-tmp/<run>/`,
  deleted after the run.

## Decisions (rulings and user calls)

- Skip mode reports `hasCommand` true, so a printed plan shows what a real run would do.
- Deploy moved after the final review and the user's OK.
- Gate tightened from "boolean false" to "anything but true/absent" (user, after review).
- Key in argv accepted as `RISK-MCPKEY-001`; escalation path is a `${CONTEXT7_API_KEY}` header
  once user-scope expansion is confirmed.

## Verification

- Final whole-branch review (Opus): 0 Critical, 3 Important (all fixed), 7 Minor (all fixed at the
  user's request).
- Full suite 413/413 via `node run-tests.mjs` and via plain `node --test`.
- `node setup.mjs --dry-run` on this machine plans `scrapling` add + browser install and leaves the
  configured `context7` alone.

## Left open (outside the spec, not requested)

- A server configured at project scope only gets a second, user-scope entry.
- A keyless `context7` entry is not upgraded when `CONTEXT7_API_KEY` is set later.
- The gate checks only `main_content_only`.
