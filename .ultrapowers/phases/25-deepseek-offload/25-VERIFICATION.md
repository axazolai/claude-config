# Phase 25 — DeepSeek offload: verification

**Verdict: PASS (with three deferred minors; branch unmerged).**

Method: inline execution (test-after). Each task's Acceptance list was verified by its own test file
and run before its commit; the whole branch was reviewed by a fresh Opus reviewer; its Critical and
both Important findings were fixed in one pass and re-verified. Review package:
`.ultrapowers/sdd/phases-25-deepseek-offload/review-c8f3bd4..0870ecd.diff`.

## Spec coverage

| Spec section | Implemented by | Evidence |
|---|---|---|
| §3 levels + retry matrix | `deepseek-mode.mjs`, `16-deepseek.md` | `deepseek-mode.test.mjs` full matrix (reviewer: exact match) |
| §4.1 mode-A tools | `server.mjs`, `lib/tools.mjs`, `lib/gateway.mjs`, `lib/validate.mjs` | `tools.test.mjs`, `gateway.test.mjs`, `validate.test.mjs`, `server.test.mjs` |
| §4.2 mode-B translator + launcher | `translator.mjs`, `claude-deepseek.ps1` | `translator.test.mjs` (incl. streaming splitter), pwsh `-CheckOnly` dry run |
| §4.3 command | `deep-model-effort.mjs` + `.md` | `deep-model-effort.test.mjs` |
| §4.4 rules | `claude-md/16-deepseek.md` | assembled into CLAUDE.md (e2e install check) |
| §4.5 statusline | `deepseek-segment.mjs` + `statusline.mjs` | `deepseek-segment.test.mjs`, statusline ordering test |
| §4.6 health monitor | `deepseek-health.mjs` | `deepseek-health.test.mjs` |
| §5 retry/fallback contract | tool mechanical validation + `retryBudget` | `validate.test.mjs`, budget test |
| §6 degradation (concurrency, timeouts) | `lib/limit.mjs` + per-tool timeouts | `limit.test.mjs` (added in fix pass) |
| §7 install (all profiles, per-profile default) | `variants.json`, `setup.mjs` | `variants.test.mjs`, e2e install into scratch dir |
| §10 risks | `RISK_REGISTER.md` RISK-DSOFFLOAD-001..003 | registered Task 1 |

## Tests

Full suite: **658/658 pass** (`node run-tests.mjs`), run after the fix pass. No skips, no todos.
The `@critical`/`@important` tags mark the retry matrix, the gateway `{ok:false}` contract, the
translator conversions and streaming splitter, the health `classify`, and the statusline staleness.

## Live behaviour (not in the unit suite)

Verified during recon/spike, not by the suite (no test calls the shared backend): 1M context ceiling,
tool calling on real Claude Code trajectories, prefix cache, 8-way concurrency. The mode-B launcher
was dry-run only (`-CheckOnly`, gateway readiness 200).

## Residual (deferred minors — polish, not defects)

- `gateway.mjs` `text.trim() || raw` can surface raw `<think>` content when the post-tag answer is empty.
- `deepseek-health.mjs` `checkOnce` inlines two `classify` branches rather than calling it.
- `translator.mjs` STOP map omits `content_filter`/`function_call` finish reasons (default `end_turn`).

## Not verified end-to-end

A real mode-B session (Claude Code running fully on DeepSeek through the translator) and live mode-A
tool calls were not exercised against the backend in this phase — covered by design/spike evidence,
to confirm on first real use.
