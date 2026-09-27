---
name: verification-before-completion
description: Model-conditional. No-op on Opus 5.5+ (it already verifies its own work). On any other model, before claiming work complete, check the result against the spec/plan's acceptance criteria, naming each criterion with its evidence.
---

# verification-before-completion (model-conditional)

This USER-scope skill intentionally overrides the plugin skill of the same name
(user scope wins over plugin cache).

**On Opus 5.5 or newer:** no-op. Opus 5.5 always thinks and verifies its
own work. Instructions telling it to re-verify, double-check, or run a final self-review cause
over-verification with no capability gain — such scaffolding is **deleted**, not reworded. So
this skill adds nothing.

**On any other model** (Opus 5 and older, Sonnet, Haiku, Fable): before claiming work complete,
check the result against the spec/plan's stated acceptance criteria — name each criterion with
its evidence — instead of a generic "double-check".

What this does **not** touch — these keep running unchanged:
- Structural verification owned by a *separate* agent: `/gsd-verify-work`, `gsd-verifier`,
  `gsd-plan-checker`, `gsd-nyquist-auditor`, `gsd-security-auditor`.
- CI gates and test suites.
- Honest reporting of outcomes (run the command, report the real result) — that comes from the
  harness system prompt, not from a self-verification step.

The line is **self-check vs. a separate reviewer**: a separate reviewer or CI is fine; on Opus
5.5+, asking the model to re-check its own answer before finishing is the anti-pattern this
shadow removes. On any other model, the acceptance-criteria check above is not that
anti-pattern — it is a bounded, evidence-named check against a stated spec, not an open-ended
"double-check".
