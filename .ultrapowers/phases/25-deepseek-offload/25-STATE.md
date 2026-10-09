---
phase: 25
slug: deepseek-offload
status: complete
tasks_done: 10
tasks_total: 10
branch: phase-25-deepseek-offload
integration: merged
updated: 2026-10-10
---

# Phase 25 — DeepSeek offload: state

Offload mechanical work to the corporate DeepSeek V4.1 Flash model behind a per-project
`/deep-model-effort` dial, with a mode-B full takeover via an Anthropic→OpenAI translator.

**Complete and reviewed, not yet merged.** All 10 tasks implemented inline (test-after) on branch
`phase-25-deepseek-offload`; fresh Opus whole-branch review done; its Critical + two Important
findings fixed in one pass (commit a0127be). Full suite 658/658.

- Spec `25-SPEC.md`, plan `25-PLAN.md`, summary `25-SUMMARY.md`, verification `25-VERIFICATION.md`.
- Risks `RISK-DSOFFLOAD-001..003` registered (001 Accepted: offloading sends project code to the corp server; default level is non-off per profile).
- Three deferred minors (polish) recorded in the summary/verification; not logged as bugs.
- Next: user decides on merge (`finishing-a-development-branch`). Separate, out-of-phase: the
  `/anthropic`-passthrough Cisco-bypass spike, and the earlier uncommitted Cisco-proxy work
  (`settings.partial.json`, `claude-tunnel.ps1`, `cisco-proxy.example.json`, `.gitignore`, `docs/deepseek.md`).
