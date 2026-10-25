# Resume point

## Summary

Phase 28 (`lean-process`) is complete: `master` at `4216722` is pushed and deployed (suite
237/237); the fork is published as `7.0.1-up.1` (12 deltas, `main` `ce3d563`) but not yet
installed on this machine. No phase is in flight.

## Open

- **Install the fork and restart**: `/plugin update ultrapowers`, then restart Claude Code so
  the new `CLAUDE.md`, hooks and skills load. `/up-update check` should say up to date.
- **Phase 29 logic-map**: run the one-day spike from
  `.claude/.scratchpad/adhoc/2026-10-26-logic-map-research/report.md` on the reference project
  at `phases/29-logic-map/ref-project/` (git-ignored, 881 MB, holds `harbor.secret`), then
  brainstorm the design into `phases/29-logic-map/29-PLAN.md`.
- **Phases 30–33** (ROADMAP rows): bundle hardening (the real `setup.mjs` parse-failure bug),
  fork maintenance, secrets-gate hardening, ladder measurement — in the order the user picks.
- **Bug outside any phase** — `protected-guard.mjs` resolves the project root from the raw hook
  `cwd`; from a subdirectory with an ignoring `.gitignore` in its ancestry (e.g.
  `.ultrapowers/sdd/*`) every Edit/Write in the repo is denied as "`../../../.protected` is hidden
  by `.gitignore`". Fix: root by `findRoot()`/git top level, never a `..`-relative path. Until
  then, never leave the Bash cwd inside an ignored subdirectory. Candidate for phase 30.
- **Phase 27 items outside its spec, the user's call**: a curated file the lite overlay used to
  replace is kept under `--skip-all`; a fragment name with a dot is silently skipped by the
  assembler; an unclosed frontmatter block passes through verbatim; the READMEs do not mention the
  `--variant=` deprecation line.
- **Deferred minors from phase 28's review**: code comments still cite `22-SPEC.md`
  (`scratchpad-layout-guard.mjs`, `scratchpad-temp-env.mjs`, `claude-cleanup-lib.mjs`);
  `branchName` in `phase-segment.mjs` climbs up to 16 parents, so a git-less project inside
  another repo shows that repo's branch.
