# Phase 23 — Verification

Verified against `23-PLAN.md`, `23-SPEC.md` and the branch diff `9c4e41c..aaf1b9e` (6 commits),
plus the files as they stand in the worktree. No tests were run in this pass (read-only).

## Goal

> One depersonalised `/publish` skill with launch keys and first-run project settings, and a clean
> `postgres` skill shipped in the bundle and copied into SQL projects by `/init-stack`.

**Verdict: ACHIEVED** — every goal claim has code and a test behind it; the gaps below are
housekeeping (ROADMAP row, line budget) and claims this pass cannot settle without running the suite.

## Evidence

**1. One `/publish` skill.** The four reference skills are now one skill:
`payload/skills/publish/SKILL.md` (536 lines) plus `payload/skills/publish/step-subagent-brief.md`.
The body has these sections, in order: Settings, Hard rules, Mode: dev / prod / fast / step, Host
specifics, No CI/CD path, Dry run, Report format. Covered by `publish-skill.test.mjs:57`
(`@important body sections come in the required order`).

**2. Launch keys.**
- The frontmatter `argument-hint` (SKILL.md:4) matches the plan string exactly. `publish-skill.test.mjs:46` checks it, and checks that the description names all four modes.
- The mode table (SKILL.md:12-17) and the common keys `--dry-run`, `--reconfigure`, `--agent-merge`, `--no-watch` (SKILL.md:19-21) follow spec § 1.1.
- `--agent-merge` takes effect in prod step 5 (SKILL.md:241-245) and step step 7. `--no-watch` takes effect in dev step 9 (SKILL.md:198-202) and prod step 4.
- Every writing step is marked `*Dry run: printed, skipped.*`: dev steps 2, 3, 4, 6, 7, 8; prod steps 3, 5, 7; fast steps 1, 2, 4, 5, 7; step steps 2, 3, 4, 5, 7, 9; and the No CI/CD path. The step 4 subagent dispatch is printed instead of run. This is enforced by `publish-skill.test.mjs:81`.
- The subagent brief applies the same rule to its push (step-subagent-brief.md step 3).

**3. First-run project settings.**
- Settings § (SKILL.md:29-60) carries the `.claude/publish.json` schema exactly as in spec § 1.2 after reconciliation. The spec diff shows `tests.command` became `tests.commands[]` and `changelog.notesDir` was added (plan Step 2).
- The file is read on every run; if it is missing, or `--reconfigure` is given, the interview runs (SKILL.md:31-32).
- The interview (SKILL.md:62-86) goes detect-first, one question at a time, and covers host/remote, cli+auth, ci, branches, version files, changelog, tests and merge.
- `publish-skill.test.mjs:63` parses the JSON schema and asserts the interview heading.

**4. GitLab/GitHub/no-CI.**
- Host specifics tables (SKILL.md:436-463) cover `glab mr create`, `glab ci status`/`view`, `glab mr merge`, `gh pr create`, `gh run watch` and `gh pr merge`. Tested at `publish-skill.test.mjs:72`.
- No CI/CD path (SKILL.md:488-510) covers `ci.present: false` and `host: "none"`; the latter publishes with plain git merge, push and tag.

**5. Depersonalised `/publish`.**
- `publish-skill.test.mjs:26` (`@critical`) greps every file under `payload/skills/publish/`; its list matches the plan's Global Constraints exactly.
- Independent re-grep in this pass (non-test files under `payload/skills/publish/` and `payload/skill-library/postgres/`, case-insensitive): 0 hits.

**6. Hard rules carried over.** Spec § 1.1's last paragraph maps to SKILL.md:88-108:
- version never computed silently → rule 1;
- nothing unreleased pushed to dev in a prod release → rule 2;
- a failed gate stops the run → rule 3;
- prod never force-pushed → rule 4.

The Review Focus case (`prod 1.2.3` when dev is at `1.2.4`) is handled at SKILL.md:214-215: STOP and report the version actually on dev.

**7. Clean `postgres` skill in the bundle.**
- `payload/skill-library/postgres/` holds SKILL.md, the 16 references named in spec § 2 and no `ps-*` file. The reference copy at `.reference/skills/postgres/references/` has the same 16 plus the six `ps-*` files that were dropped.
- The frontmatter no longer has the `metadata.author` line, and the "Hosting" recommendation the reference had is gone.
- Tests in `postgres-library.test.mjs`:
  - `:44` — 16 files, no `ps-*`;
  - `:60` — frontmatter;
  - `:68` — no hosting recommendation;
  - `:73` / `:83` — links resolve, and cover exactly the kept files;
  - `:88` (`@critical`) — no forbidden identifier and no vendor name outside LICENSE-NOTICE.md;
  - `:101` — notice content.
- `LICENSE-NOTICE.md` carries the derivation line, a copyright line and the six removed files.

**8. Shipped by the installer.** `variants.json` has no exclude matching `skill-library/**` in any profile: full has none, base has `skills/using-git-worktrees/**`, lite has `skills/publish/**`. `variants.mjs` `walkRels` walks the whole payload. So `skill-library/postgres/**` ships in every profile, and `alwaysExclude` `**.test.mjs` drops the test file.

**9. Copied into SQL projects by `/init-stack`.**
- `payload/setting-templates/DB/_base.json:8-11` is now `{ "id": "bundled:postgres", "name": "postgres", …, "install": { "bundled": "postgres" } }`.
- `payload/bin/init-stack.mjs:652` `installSkills(entries, { libraryDir, projectRoot })` copies `libraryDir/<bundled>` to `<projectRoot>/.claude/skills/<name>` with `cpSync`. It refuses an existing target (:664), rejects names that are not plain folder names (:649), and `continue`s before reaching `runCmd`, so no npx runs.
- `offerSkills` (:834-842) and `printSkills` (:468-473) label each entry "copy from the bundle" or "npx skills add". `mainInner` threads `libraryDir` through.
- Tests in `init-stack.test.mjs`:
  - `:328` — `gatherSkills` lists `bundled:postgres` as `available`;
  - `:337` — the copy is byte-equal to the library, no npx line is printed, and the state then reads `installed`;
  - `:364` — refuses to overwrite;
  - `:384` (`@critical`) — rejects path escape.
- Docs: `payload/setting-templates/README.md` (schema `install.bundled`) and `payload/commands/init-stack.md`.

**10. Docs (Task 4).** README.md:381-403 and README.en.md:~392-414 describe:
- `/publish`: modes, keys, `.claude/publish.json`, the no-CI path, base/full only;
- `skill-library/` and `install.bundled`.

## Global constraints

| Constraint | Status | Where checked |
|---|---|---|
| Testing mode test-after; tags `@critical`/`@important`; tests run with `node run-tests.mjs` | HELD (tags); run unverified | Every new test carries a tag: `publish-skill.test.mjs:26-98`, `postgres-library.test.mjs:44-101`, `init-stack.test.mjs:328-384`, `variants.test.mjs:118`. Whether the tests were run is under Gaps. |
| Reference sources read; nothing copied verbatim where it names the project | HELD | Re-grep of `payload/skills/publish/**` and `payload/skill-library/postgres/**` (non-test): 0 forbidden hits; `planetscale` appears only in `LICENSE-NOTICE.md`. The postgres SKILL.md header "PlanetScale Postgres" and its Hosting block from `.reference/skills/postgres/SKILL.md` are gone. |
| Forbidden identifier list (16 strings, case-insensitive) | HELD | `publish-skill.test.mjs:12-16` and `postgres-library.test.mjs:27-31` hold the exact plan list and compare lower-cased; independent re-grep: 0 hits. |
| Never Write/Edit under `~/.claude/`; no push, merge, plugin update, deploy | HELD (branch) | Every path in the diff is repo-relative (`payload/`, `variants*`, `README*`, `.ultrapowers/`). Machine-side actions are under Gaps. |
| Temp files only under `.claude/.scratchpad/phase-23/…`; no sleep/poll | HELD (branch) | The diff adds no stray temp files to the tree. Runtime behaviour is under Gaps. |
| `/publish` ships in base and full; `lite.exclude` gets `"skills/publish/**"` | HELD | `variants.json:74`; `variants.test.mjs:118` asserts that base and full ship `SKILL.md` and `step-subagent-brief.md`, lite ships neither, and the test file is never shipped. |

## Gaps

- **ROADMAP phase 23 row not updated.** Task 4 lists "ROADMAP phase 23 row". The worktree's `.ultrapowers/ROADMAP.md` still reads `{ phase: "23", slug: publish-and-postgres, status: planned, delivery: none }`, and the diff does not touch ROADMAP.md.
- **Phase documents incomplete.** Only `23-STATE.md` (untracked) exists besides this file. Task 4's "Phase documents per the skill" are not in the branch.
- **SKILL.md over its line budget.** Plan Task 1 Step 1 says "Keep it under ~500 lines". `payload/skills/publish/SKILL.md` is 536 lines. The subagent brief is already split out as the plan allowed, so this is a soft overrun, not a missing feature.
- **Review Focus: "no remote at all".** A repo with no remote is covered by a single sentence in No CI/CD path (SKILL.md:510: "No remote at all → merge and tag locally, nothing is pushed"). Mode: dev itself does not gate on it:
  - step 1 still runs `git fetch <remote> <dev>`;
  - steps 6 and 8 push unconditionally;
  - interview step 1 maps "no recognised host" to `host: "none"` but says nothing about a missing remote.

  The behaviour is stated, but not at the step an operator executes.
- **Weak "no npx" check.** `init-stack.test.mjs:337` checks for npx only by the absence of "npx" in captured log lines, under `CLAUDE_INIT_STACK_SKIP_SUBPROCESS=1`. It neither injects `runCmd` nor asserts that `runCmd` is never called. The code path (`continue` before `runCmd` at init-stack.mjs:652-677) does guarantee it, so the claim holds; the test is weaker than the plan's wording.
- Settled by the controller after this pass: `node run-tests.mjs` on `aaf1b9e` (this branch's final commit) — **566 tests, 566 pass, 0 fail**. Matches every task report's incremental counts (547 baseline + 18 new + 1 final-fix-wave guard test = 566).
- unverifiable: `LICENSE-NOTICE.md`'s "Copyright (c) 2026 PlanetScale" is the original copyright line — `.reference/skills/postgres/` has no LICENSE file, so it can only be settled against the upstream `planetscale/database-skills` LICENSE.
- unverifiable: no Write/Edit under `~/.claude/`, and no push, merge, plugin update or deploy, during the work — settled by the session transcripts or `~/.claude` mtimes.
- unverifiable: temp files stayed under `.claude/.scratchpad/phase-23/` and nobody slept or polled — settled by the session transcripts and the scratchpad listing.
- unverifiable: the Review Focus behaviours around unauthenticated `glab`/`gh` and multi-package version detection in a real run. The text is present (interview steps 2 and 5), but `/publish` was not executed; the spec puts real runs out of scope.
