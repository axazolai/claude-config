## Tasks

1. /publish skill | 9c4e41c..f61c170
2. Bundled postgres library copy | f61c170..379d1ae
3. /init-stack installs bundled skills; DB template switches | 379d1ae..2c9c631
4. Docs and full suite | 2c9c631..9242555
Final-review fixes | 9242555..aaf1b9e

## Rulings

Ruling: fixing Important 1, Important 2, and the 3 Minor items (uncommitted-work ordering deferred to soft rule, collision-trigger ambiguity deferred, lite ships unused payload/skill-library/** by design compliant, non-interactive /init-stack cannot install bundled skill by existing design, pre-existing npx postgres install migration out of scope) in ONE fix dispatch — NOT fixing the two "declined to judge" items as both need a design/spec decision, not a guess.

Ruling: step mode's tag-rejection fix leaves <snapshot> branch NAME carrying pre-bump version string while its tip carries bumped version — cosmetic, not a functional bug; every place needing "the version" uses actual confirmed/bumped version variable or re-reads from file.

Ruling: none needed yet — findings are plan-silent skill-internal contradictions, not plan-vs-implementation conflicts. Entering fix round 1.

## Deviations and decisions

Task 1: glab flags checked against Context7 docs, not live (glab not installed on this machine). Dry-run marking verified: each writing step carries "Dry run: printed, skipped"; test detects 21 writing chunks, all marked.

Task 1: Four Important findings in initial review required fix round 1: (1) tag-deletion recovery contradicted hard rule 5 — removed in favor of patch-bump remedy; (2) dev's empty-range STOP check moved before release commit as it was unreachable after; (3) step-mode collision path ordering unspecified and broke one-tree rule in every order — fixed by committing both bumps on BASE_SHA before freeze/dispatch, with RELEASE_SHA set to snapshot bump; (4) no CI/CD path had git switch race with subagent rule — scoped to prod/fast only, step mode uses ref-to-ref push without working-tree switch.

Task 2: Reference source read via absolute path in main checkout (.reference/ is git-ignored, not present in worktree). SKILL.md metadata cleaned (author, hosting recommendation removed; PlanetScale-Specific table removed with PgBouncer Config relocated). 16 references copied byte-identical, 6 ps-* files dropped. LICENSE-NOTICE.md copyright line fetched live from GitHub (WebFetch).

Task 3: gatherSkills needed zero functional change — already passes install through opaquely. Only comment-only update, independently re-verified by reviewer against function body. DB template swapped to bundled:postgres. Interactive label now per-entry ("copy from the bundle" vs "npx skills add").

Task 3: Out of spec (cosmetic, not blocking): printSkills (non-interactive report path) still says "npx skills add" for bundled skills — brief only covered interactive label. postgres-library.test.mjs copied by cpSync in test scenarios but this is NOT a production issue — **.test.mjs is in variants.json alwaysExclude, so setup.mjs never ships it to ~/.claude/skill-library/postgres/.

Task 4: All documentation updates independently cross-checked against real shipped code (SKILL.md, init-stack.mjs, variants.json, skill-library/postgres/, DB template) with zero discrepancies. Full suite verified consistent across all task reports (565/565).

## Reviews

Task 1: opus reviewer. Spec compliance: ✅. 4 Important findings (all internal contradictions in skill text, fixed in Task 1 fix round). Re-review (sonnet) after fixes found 2 Minor wording issues (deferred, non-blocking). git diff 9c4e41c..f61c170

Task 2: sonnet reviewer. Spec compliance: ✅. 5 reference files diffed byte-identical, LICENSE copyright re-fetched and matched, forbidden-identifier grep re-run, variants.json logic re-derived. 1 cosmetic Minor (not worth fixing). git diff f61c170..379d1ae

Task 3: sonnet reviewer. Spec compliance: ✅. Every mandated interface/acceptance criterion independently re-verified against code. Flagged cosmetic out-of-spec items (printSkills label, test-file copy in scenarios) as non-blocking; test-file noted as production-safe due to alwaysExclude. git diff 379d1ae..2c9c631

Task 4: sonnet reviewer. Spec compliance: ✅. Every factual claim independently cross-checked against shipped code, diff scoped to README files only, sync verified, test-count arithmetic checked across all reports. No Critical, no Important, no Minor. git diff 2c9c631..9242555

Final-review fix: sonnet reviewer. 5 fixes applied: printSkills/commands/init-stack.md now show per-entry mechanism; step mode Prerequisites deferred tag/snapshot check to end of step 1 against FINAL version; tag-rejection split prod/fast (restart step 1) vs step (lands on <snapshot>, resumes step 5); README name/install.bundled wording fixed; installSkills gained isPlainFolderName guard (rejects ., .., path separators). New @critical test added. All tests pass. git diff 9242555..aaf1b9e
