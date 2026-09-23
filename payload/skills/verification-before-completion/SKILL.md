---
name: verification-before-completion
description: No-op shadow. Opus 5.5 verifies its own work — do not add self-verification passes. Structural review owned by a separate agent or CI still runs.
---

# verification-before-completion (shadow / no-op)

This USER-scope skill intentionally overrides the plugin skill of the same name
(user scope wins over plugin cache).

Opus 5.5 always thinks and verifies its own work. Instructions telling it to re-verify,
double-check, or run a final self-review cause over-verification with no capability gain — such
scaffolding is **deleted**, not reworded. So this skill adds nothing.

What this does **not** touch — these keep running unchanged:
- Structural verification owned by a *separate* agent: `/gsd-verify-work`, `gsd-verifier`,
  `gsd-plan-checker`, `gsd-nyquist-auditor`, `gsd-security-auditor`.
- CI gates and test suites.
- Honest reporting of outcomes (run the command, report the real result) — that comes from the
  harness system prompt, not from a self-verification step.

The line is **self-check vs. a separate reviewer**: a separate reviewer or CI is fine; asking a
model to re-check its own answer before finishing is the anti-pattern this shadow removes.
