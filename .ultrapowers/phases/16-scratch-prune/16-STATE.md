# Phase 16 — scratch-prune — state

- **Status:** complete; `delivery: merged` (feat/scratch-prune → master, `--no-ff`).
- **Tasks:** 5/5 — scanner + contract tests, engine CLI, SKILL.md, documents, finish (suite, merge, deploy).
- **Spec:** `16-SPEC.md` (verbatim copy of the ai_rent brainstorm of 2026-09-20). Deviations are
  listed in `16-PLAN.md` § Global Constraints.
- **Deploy impact:** three new files under `~/.claude/` (`bin/scratch-prune.mjs`,
  `bin/lib/scratch-prune-lib.mjs`, `skills/scratch-prune/SKILL.md`), no settings, no hooks, all
  profiles. Verified by `node setup.mjs --dry-run` before the real run.
- **Verification:** `node --test` full suite green on the merged tree; smoke round trip
  scan → apply → restore on a fixture in this repo's `.claude/.scratchpad/tmp/` (Task 2).
- **Touches:** `RISK-CLAUDEMD-002` — the skill and the rule name `tmp/`, which nothing creates or
  verifies mechanically; `RISK-CLEANUP-001` — the cross-device move fallback becomes the routine
  path (project on `D:`, trash on `C:`), residual accepted, hardening owed (see the register).
