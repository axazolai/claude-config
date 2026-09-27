# `/publish` and bundled `postgres` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use ultrapowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** One depersonalised `/publish` skill with launch keys and first-run project settings, and a clean `postgres` skill shipped in the bundle and copied into SQL projects by `/init-stack`.

**Architecture:** `payload/skills/publish/SKILL.md` (base/full) written from the four reference skills' process, with every project identifier replaced by `.claude/publish.json` fields. `payload/skill-library/postgres/` holds the cleaned skill; `init-stack.mjs` gains an install kind `bundled` that copies it; the DB template entry switches to it.

**Tech Stack:** Markdown skills, Node ESM (`init-stack.mjs`), `node:test`.

**Spec:** `.ultrapowers/phases/23-publish-and-postgres/23-SPEC.md`

## Global Constraints

- Testing mode test-after; tags `@critical`/`@important`; `node run-tests.mjs <files>`, full suite `node run-tests.mjs`.
- Sources to read (git-ignored, this machine): `.reference/skills/publish-{dev,prod,fast,step}/SKILL.md`, `.reference/skills/postgres/`. Nothing from them is copied verbatim where it names the project.
- Identifier list the depersonalisation test forbids (case-insensitive): `pik.mes`, `pik-mes`, `pik_mes`, `pikmes`, `git.pik.ru`, `pik.ru`, `mono/`, `apps/web`, `PROD-RELOAD`, `monorepo`, `v0.88.0`, `v0.63.0`, `v0.57.0`, `v0.68.`, `planetscale.com/blog`, `PlanetScale is the best`.
- Never Write/Edit under `~/.claude/`; no push, merge, plugin update, deploy.
- Temp files only under `.claude/.scratchpad/phase-23/{scripts,data,logs}/`. Never `sleep`/poll to wait for a subagent.
- `/publish` ships in base and full; `variants.json` `lite.exclude` gets `"skills/publish/**"`.

## Review Focus

- A repository with no remote at all → the interview settles `host: none` and `/publish dev` still merges locally and pushes nothing.
- `glab`/`gh` installed but not authenticated → steps needing the API become printed manual commands after one question; no silent skip.
- A monorepo with several `package.json` files → the interview lists them and asks which carry the release version; never picks one silently.
- `/publish prod 1.2.3` when dev's version is `1.2.4` → stop and report the version on dev (the original hard rule).
- `--dry-run` never runs a git command that writes (`push`, `merge`, `tag`, `branch -d`) — it prints them.

---

### Task 1: `/publish` skill

**Files:** Create `payload/skills/publish/SKILL.md`; modify `variants.json` (`lite.exclude`); test `payload/skills/publish/publish-skill.test.mjs`.

**Acceptance:**
- `@critical` no forbidden identifier (Global Constraints) anywhere under `payload/skills/publish/` except inside the test file's own list.
- `@important` SKILL.md frontmatter: `name: publish`, a `description` naming the four modes, `argument-hint: "dev | prod [X.Y.Z] | fast | step [X.Y.Z] [--dry-run] [--reconfigure] [--agent-merge] [--no-watch]"`.
- `@important` body sections, in order: Settings (`.claude/publish.json` schema from spec § 1.2 and the first-run interview), Hard rules (spec § 1.1 last paragraph), one section per mode with numbered steps matching spec § 1.1, Host specifics (GitLab via `glab`: MR, `glab ci status`/`view`; GitHub via `gh`: PR, `gh run watch`), No CI/CD path, Dry run, Report format.
- `@important` every step that writes (merge, push, tag, branch delete) is marked as skipped-and-printed under `--dry-run`.
- lite resolves without `skills/publish/SKILL.md` (`variants.test.mjs`).

- [ ] **Step 1: Implement** — read the four reference skills fully; write one skill that keeps their process (step order, gates, stop conditions, subagent brief of `publish-step`, failure-report contract) and replaces every project fact with a settings field or an interview question. Keep it under ~500 lines; put the `publish-step` subagent brief in `payload/skills/publish/step-subagent-brief.md` if it pushes the main file over.
- [ ] **Step 2: Reconcile** — spec § 1 updated for any schema field added or renamed.
- [ ] **Step 3: Tests** — the grep test and the structure test (headings, argument-hint, `--dry-run` marks).
- [ ] **Step 4: Run** — `node run-tests.mjs payload/skills/publish/publish-skill.test.mjs variants.test.mjs` → PASS
- [ ] **Step 5: Commit** — `feat(skills): /publish — one release skill with launch keys and project settings`

### Task 2: Bundled `postgres` library copy

**Files:** Create `payload/skill-library/postgres/SKILL.md`, `payload/skill-library/postgres/references/<16 files>`, `payload/skill-library/postgres/LICENSE-NOTICE.md`; test `payload/skill-library/postgres/postgres-library.test.mjs`.

**Acceptance:**
- `@important` exactly the 16 references named in spec § 2, no `ps-*` file.
- `@important` SKILL.md: frontmatter `name: postgres`, generic description, no `metadata.author` vendor line, no hosting recommendation, every relative link resolves to a kept file.
- `@critical` no forbidden identifier and no `planetscale` mention outside `LICENSE-NOTICE.md`.
- `LICENSE-NOTICE.md`: "Derived from PlanetScale's database-skills (`postgres`), MIT License", the original copyright line, the list of removed files.
- `payload/skill-library/**` is shipped by `setup.mjs` (every profile) and is not under `skills/` — check `variants.json` excludes nothing there.

- [ ] Steps: copy, clean, notice · reconcile · tests · `node run-tests.mjs payload/skill-library/postgres/postgres-library.test.mjs` · commit `feat(skill-library): clean postgres skill`.

### Task 3: `/init-stack` installs bundled skills; DB template switches

**Files:** Modify `payload/bin/init-stack.mjs` (`gatherSkills` state for bundled entries, `installSkills`), `payload/setting-templates/DB/_base.json`, `payload/setting-templates/README.md` (skills schema: `install.bundled`); test `payload/bin/init-stack.test.mjs`.

**Interfaces:**
- Template entry: `{ "id": "bundled:postgres", "name": "postgres", "description": "…", "install": { "bundled": "postgres" } }`.
- `installSkills(entries, { libraryDir = join(claudeDir, "skill-library"), projectRoot })` — `install.bundled` → `cpSync(join(libraryDir, name), join(projectRoot, ".claude", "skills", name), { recursive: true })`, refuse when the target exists; `install.cmd` path unchanged.

**Acceptance:**
- `@important` a SQL project: `gatherSkills` lists `bundled:postgres`, state `available`; after `installSkills` the tree exists under `<project>/.claude/skills/postgres/` byte-equal to the library copy; `gatherSkills` then reports `installed`.
- `@important` no `npx` command is run for a bundled entry (inject `runCmd` or assert it is never called).
- `@important` the install refuses to overwrite an existing `<project>/.claude/skills/postgres/`.
- The interactive label says "copy from the bundle" for bundled entries and "npx skills add" for the rest.

- [ ] Steps 1–5; commit `feat(init-stack): bundled stack skills; DB template ships the clean postgres skill`.

### Task 4: Docs and full suite

- `README.md` / `README.en.md`: `/publish` (modes, keys, settings file, no-CI path), `skill-library/` and bundled stack skills.
- `node run-tests.mjs` full suite; report counts.
- Phase documents per the skill; ROADMAP phase 23 row.
