# Resume point

## Summary

Phase 28 (`lean-process`) runs on `phase-28-lean-process` (stage 1 done but `RISK_REGISTER.md`
and the deploy; stage 2 done: fork `patch` `badd113`, `main` `ce3d563` = `7.0.1-up.1`, not
pushed). `master` is at `844e42d`, pushed and deployed through phase 27 (suite 237/237).

## Open

- **Phase 28 stage 1, last steps**: delete `RISK_REGISTER.md` once the user has seen the
  close/delegate list; `node setup.mjs --replace-all` from the branch is NOT allowed (deploy from
  `master` only) — deploy after the merge.
- **Phase 28 stage 3**: on the user's yes push the fork (`patch`, `main`, `+original`, tag
  `upstream/7.0.1`) from `D:\5__AIWorks\ultrapowers`; `/up-update check` must say up to date;
  user runs `/plugin update`; finish the branch (squash-merge, push, prune), deploy from
  `master`, ROADMAP row 28 complete.
- **Bug outside phase 28's scope** — `protected-guard.mjs` resolves the project root from the raw
  hook `cwd`; from a subdirectory with an ignoring `.gitignore` in its ancestry (e.g.
  `.ultrapowers/sdd/*`) every Edit/Write in the repo is denied as "`../../../.protected` is hidden
  by `.gitignore`". Fix: root by `findRoot()`/git top level, never a `..`-relative path. Until
  then, never leave the Bash cwd inside an ignored subdirectory.
- **Phase 27 items outside its spec, the user's call**: a curated file the lite overlay used to
  replace is kept under `--skip-all`; a fragment name with a dot is silently skipped by the
  assembler; an unclosed frontmatter block passes through verbatim; the READMEs do not mention the
  `--variant=` deprecation line.
- **Restart Claude Code** after the stage-1 deploy so the new `CLAUDE.md` and hooks load.
- **Phase 29 logic-map**: run the one-day spike from the research report before designing.
