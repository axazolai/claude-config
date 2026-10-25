# Phase 27 — drop bundle profiles

**Shipped:** one bundle. `variants.json`/`.mjs` → `bundle.json`/`.mjs`; `setup.mjs` without
profile selection, manifest `{ files, installedSha, installedAt, repoRoot }`; `--variant=<x>`
accepted for one release and ignored with `profiles were removed; installing the bundle`; one
CLAUDE.md fragment set (no `*.lite.md`, no `payload-lite/`, no `profiles:` frontmatter);
statusline, init-stack and session-init read no profile or plugin tier; READMEs, GLOSSARY and
the project CLAUDE.md updated. Deployed to this machine with `--replace-all`.

**Branch:** `phase-27-drop-profiles`, commits `ec4dcc9`, `72f51b5`, `0773b49`, `c7f36cb`,
`a4ba213` over `master` `f43ee32`. Full suite 603/603 (baseline 620: 17 profile tests retired).

**Verification:** fresh reviewer (Opus 5.5) on the whole-branch diff — ready with fixes, all
five Review Focus items verified (old `lite` manifest tolerated and cleaned; `--variant=lite`
deprecation path; frontmatter stripped; `filterPartialHooks` still drops `task-lifecycle-probe`;
`tier: "full"` plugins kept). Both Important findings fixed in `a4ba213`.

**Rulings:**
- Tasks 1 and 2 landed in one commit: the resolver API and its only consumer cannot be split
  without a broken intermediate tree.
- User-facing strings naming the removed concept (`mcp-reconcile.mjs`, `commands/init-stack.md`)
  were re-graded Important by effect and fixed in the review pass.
- Phase documents reduced to this file: status lives in `ROADMAP.md`, no STATE/VERIFICATION.

**Deferred minors:** old-concept names in four test titles/comments; `setup.mjs` locals
`variantsFile`/`variantExcluded`; unused `globToRe` import in `setup.mjs` (pre-existing); inert
`"tier"` keys in `setting-templates/frontend/_base.json`; `bundle.test` checks
`filterPartialHooks` with a hand-built set rather than `resolveBundle()`.

**Out of spec — the user's call:** a curated (`CURATED:NOEDIT`) file that the lite overlay used
to replace is kept under `--skip-all` (refreshed only by `--replace-all` or an interactive `r`);
a fragment name with a dot (`05-foo.bar.md`) is silently skipped by the assembler; an unclosed
frontmatter block passes through verbatim; the READMEs do not mention the `--variant=`
deprecation line.
