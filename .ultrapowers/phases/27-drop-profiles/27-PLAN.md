# Drop Bundle Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use ultrapowers:subagent-driven-development or ultrapowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The installer ships one bundle. The profile concept (`base`/`lite`, `extends`, overlay, `--variant`, per-profile fragments, plugin tiers) is removed from config, code, tests and docs.

**Why:** Only `base` is used. The profile machinery is code, tests and documentation that select between one real option and one unused one; every change to the bundle pays for it twice.

**Architecture:** `variants.json` becomes `bundle.json`: a flat description of the one bundle (plugins, MCP servers, excludes, defaults). `variants.mjs` becomes `bundle.mjs` with one resolver. `setup.mjs` loses profile selection and writes a manifest without `profile`/`variant`/`maxPluginTier`. CLAUDE.md fragments lose the `profiles:` frontmatter and the `.lite.md` overrides; the assembler concatenates every fragment in `NN` order. Hooks and `init-stack` stop reading the profile from the manifest.

**Tech Stack:** Node ESM, `node --test` via `node run-tests.mjs`.

**Spec:** none. The decisions are in this plan.

**Testing mode:** test-after.

**Branch:** `phase-27-drop-profiles` from `master`; squash-merge at the end.

## Global Constraints

- Never edit anything under `~/.claude/`; change the source here and deploy with `node setup.mjs --replace-all`.
- `leanmode` and `verbosity` dials have a level named `lite` (`off|lite|full|ultra`). That is not the bundle profile; those files are not touched.
- The old flag `--variant=<x>` is still accepted for one release and ignored with one printed line, so bootstrap one-liners in the wild keep working.
- A machine installed as `lite` is upgraded by the ordinary prune: files absent from the bundle manifest are removed, files present are placed. No migration code.
- Documentation and config stay in English; README.md is in Russian already and stays Russian.

## Review Focus

- A manifest written by an older installer (`{ profile: "lite", maxPluginTier: "core", ... }`) is read by the new `setup.mjs`, `statusline.mjs` and `init-stack.mjs` without error, and the unknown fields are dropped on the next write.
- `node setup.mjs --variant=lite --skip-all` exits 0, prints the one deprecation line, installs the bundle.
- `assembleClaudeMd` on a fragment that still carries a `profiles:` frontmatter block strips the frontmatter and includes the body, so a stale fragment cannot leak `---` lines into `~/.claude/CLAUDE.md`.
- `filterPartialHooks` still drops a hook whose script is in `alwaysExclude` (`task-lifecycle-probe`).
- `init-stack` keeps a template plugin that carries `tier: "full"`, since the tier cap no longer exists.

---

### Task 1: One bundle config and resolver

**Why this way:** rename the files with the concept. A file called `variants.json` holding no variants misleads the next reader more than a rename costs.

**Files:**
- Rename: `variants.json` → `bundle.json`; `variants.mjs` → `bundle.mjs`; `variants.test.mjs` → `bundle.test.mjs`
- Modify: `setup.mjs:45` (import), `plugin-reconcile.mjs` (comments naming "profile")

**Interfaces:**
- Produces: `loadBundle(repoRoot) → cfg`; `resolveBundle({ repoRoot, cfg? }) → { rels: string[], srcFor(rel) → absPath, excludedSet: Set<string>, plugins: string[], mcpServers: string[] }`; `globToRe`, `filterPartialHooks` unchanged.
- `bundle.json` shape:

```json
{
  "alwaysExclude": ["hooks/task-lifecycle-probe*", "claude-md/**", "**.test.mjs"],
  "plugins": ["ultrapowers", "context-mode"],
  "mcpServers": ["scrapling", "context7", "deepseek"],
  "deepseekDefault": "medium",
  "managedPlugins": { "...": "unchanged" },
  "marketplaces": { "...": "unchanged" },
  "forbiddenPlugins": ["context7", "gsd"],
  "keepInstalled": ["superpowers"],
  "sessionDefaults": { "model": "sonnet", "effortLevel": "medium" },
  "managedMcpServers": { "...": "unchanged" }
}
```

Removed keys: `profiles`, `deepseekDefaults`. `keepInstalled` loses `ultrapowers` (it was there for `lite` only). The `$...` comment keys are rewritten so none mentions a profile.

Removed from the resolver: `profilesOf`, `resolvedExclude`, `resolvedMcpServers`, `extends`, `overlay`, `include` allowlist, `finalizeResolved`, `uncovered`, `orphanOverlay`. `resolveBundle` is the former "identity" branch: every payload file not matched by `alwaysExclude`.

**Acceptance:**
- `resolveBundle({ repoRoot })` returns every `payload/` file except `alwaysExclude` matches; `excludedSet` holds exactly those matches.
- `plugins` and `mcpServers` come from the top-level keys; every `mcpServers` entry is a key of `managedMcpServers`; every `plugins` entry is a key of `managedPlugins`; no `forbiddenPlugins` entry appears in `plugins`.
- `deepseekDefault` is one of `light|medium|heavy`.
- `bundle.json` has no key named `profiles`, `variants`, `deepseekDefaults`, and no `$` comment mentions "profile" or "lite".
- `filterPartialHooks` drops an entry whose script basename is outside the set and keeps the rest (existing behaviour).

- [ ] **Step 1: Implement** (`git mv` the three files, rewrite `bundle.json`, cut the resolver, fix the import in `setup.mjs` and the comments in `plugin-reconcile.mjs`).
- [ ] **Step 2: Reconcile** — a decision that changed this task's interface is written into this task first.
- [ ] **Step 3: Write the acceptance tests** in `bundle.test.mjs` (replace the retired `lite`/`extends`/overlay tests; keep `globToRe`, the managed-server and forbidden-plugin invariants).
- [ ] **Step 4: Run** `node run-tests.mjs bundle.test.mjs` — PASS.
- [ ] **Step 5: Commit** `refactor(bundle): one bundle, no profiles — variants.json → bundle.json`.

### Task 2: setup.mjs without profile selection

**Why this way:** the manifest is the only place the profile leaked onto the machine; dropping it there is what lets hooks and `init-stack` stop asking.

**Files:**
- Modify: `setup.mjs:98-101` (flag), `:109`, `:618-643` (selection), `:669` (assembler call), `:1178-1190` (deepseek default), `:1345-1347` (manifest), `:1398`, `:1415-1435` (final instructions), comment at `:657-665`
- Test: `setup-variants.e2e.test.mjs` → rename `setup.e2e.test.mjs`

**Interfaces:**
- Consumes: `loadBundle`, `resolveBundle` (Task 1).
- Produces: manifest `{ files, installedSha? }` only. `--variant=<x>`: accepted, prints `profiles were removed; installing the bundle`, continues.

Removed: the `bundle profile [...]` prompt, `resolveProfile`, "Switching variant", the `Variant:` lines, `profileDef`, `maxPluginTier`, the `VARIANT !== "lite"` branches (the base branch text stays, unconditional). `deepseek-defaults.json` is written from `cfg.deepseekDefault`.

**Acceptance:**
- Non-TTY, no manifest: exit 0, bundle installed, manifest has `files` and no `profile`/`variant`/`maxPluginTier` keys.
- `--variant=lite --skip-all` and `--variant=anything --skip-all`: exit 0, stdout contains `profiles were removed`.
- A pre-existing manifest `{ files: [...], profile: "lite", maxPluginTier: "core" }`: install succeeds, next manifest has neither key, files listed in the old manifest but absent from the bundle are pruned.
- No interactive prompt mentions a profile (TTY run with no answers completes).
- `deepseek-defaults.json` is written with `{ "level": "medium" }`.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Reconcile.**
- [ ] **Step 3: Write the acceptance tests** (rewrite the `lite`/`full`/prompt cases in the renamed e2e file; drop `--variant=base` from the other cases' args).
- [ ] **Step 4: Run** `node run-tests.mjs setup.e2e.test.mjs` — PASS.
- [ ] **Step 5: Commit** `refactor(setup): drop profile selection and manifest profile fields`.

### Task 3: One CLAUDE.md, no overlay

**Why this way:** with one bundle the per-profile fragment override and the `payload-lite/` overlay have nothing to select; deleting them is the whole change.

**Files:**
- Delete: `payload/claude-md/01-title.lite.md`, `06-collaboration.lite.md`, `09-plugins.lite.md`, `12-model-selection.lite.md`, `payload-lite/rules-src/README.md`, `payload-lite/skills/model-selection-policy/SKILL.md`
- Modify: `payload/claude-md/{01-title,06-collaboration,09-plugins,12-model-selection,15-web-access,17-save-points}.md` (remove the `profiles:` frontmatter), `payload/claude-md/09-plugins.md:5-7` (drop the sentence about the `lite` profile), `payload/bin/lib/assemble-claude-md.mjs`, `payload/skills/model-selection-policy/skill.test.mjs` (drop `LITE`)
- Test: `payload/bin/lib/assemble-claude-md.test.mjs`

**Interfaces:**
- Produces: `assembleClaudeMd(fragmentsDir) → string`. `parseFragment(text) → { body }`: strips a leading `---…---` block if present, normalises CRLF.

**Acceptance:**
- Fragments are concatenated in `NN` order, separated by one blank line, after the `CURATED:NOEDIT` marker.
- A fragment with a leading frontmatter block contributes its body only; the output contains no line equal to `---` and no `profiles:` line.
- A CRLF fragment produces the same output as its LF twin.
- The real fragments assemble with no `(lite)`, `lite profile`, `lite variant` text.
- `payload-lite/` does not exist; `model-selection-policy/skill.test.mjs` passes without it.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Reconcile.**
- [ ] **Step 3: Write the acceptance tests** (replace the base/lite split tests).
- [ ] **Step 4: Run** `node run-tests.mjs payload/bin/lib/assemble-claude-md.test.mjs payload/skills/model-selection-policy/skill.test.mjs` — PASS.
- [ ] **Step 5: Commit** `refactor(claude-md): single fragment set, no lite overrides or overlay`.

### Task 4: Hooks and init-stack stop reading the profile

**Why this way:** three consumers read `profile` or `maxPluginTier` from the manifest; after Task 2 the fields are gone, so each must stop looking or fail open forever.

**Files:**
- Modify: `payload/hooks/statusline.mjs:36-39,92` (delete `installedProfile`, the `up` segment depends on `progress` only), `payload/bin/init-stack.mjs:153-161,214,231,324-336,386` (delete `keepPlugin`, `readMaxPluginTier`, the `maxPluginTier` option), header comments in `payload/hooks/statusline.mjs:2`, `phase-end-cleanup-nudge.mjs:2`, `scratchpad-temp-env.mjs:2`, `lib/statusline-lib.mjs:2-3`, `lib/git-command.mjs:1`
- Test: `payload/hooks/statusline.test.mjs:155-175`, `payload/hooks/session-init.test.mjs:36-57`, `payload/hooks/phase-end-cleanup-nudge.test.mjs:143-147`, `payload/bin/init-stack.test.mjs` (keepPlugin cases)

**Acceptance:**
- Statusline shows the ultrapowers segment whenever progress exists, with a manifest that says `profile: "lite"`, with one that has no profile field, and with no manifest.
- `init-stack` `gather` keeps a template plugin entry with `tier: "full"`.
- `session-init` suggests `/init-mcp` regardless of what the manifest says.
- `phase-end-cleanup-nudge.mjs` is in `resolveBundle().rels`.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Reconcile.**
- [ ] **Step 3: Write the acceptance tests** (rewrite the four profile-dependent tests).
- [ ] **Step 4: Run** `node run-tests.mjs payload/hooks/statusline.test.mjs payload/hooks/session-init.test.mjs payload/hooks/phase-end-cleanup-nudge.test.mjs payload/bin/init-stack.test.mjs` — PASS.
- [ ] **Step 5: Commit** `refactor(hooks,init-stack): no profile or plugin tier read from the manifest`.

### Task 5: Docs, full suite, deploy

**Files:**
- Modify: `README.md` (section «Варианты бандла (base/lite)» → «Состав бандла»; remove every `(нет в lite)`, `base/lite`, `--variant=` mention; the bootstrap examples lose `--variant=lite`), `.ultrapowers/ROADMAP.md` (phase 27 row: `complete`), `.ultrapowers/RESUME.md`
- Modify: `.ultrapowers/GLOSSARY.md` — remove the `profile` and `variant` entries. (`bootstrap.sh`/`bootstrap.ps1` carry no `--variant` text; only README's examples do.)

**Acceptance:**
- `grep -rIn -w -i 'lite' --include=*.md --include=*.mjs --include=*.json . | grep -v -i 'leanmode\|verbosity\|.ultrapowers\|node_modules\|.scratchpad'` returns nothing.
- `grep -rn 'profilesOf\|resolveVariant\|loadVariants\|variants.json\|maxPluginTier\|payload-lite' --include=*.mjs --include=*.json --include=*.md . | grep -v '.ultrapowers\|node_modules\|.scratchpad'` returns nothing.
- `node run-tests.mjs` — full suite passes.
- `node setup.mjs --dry-run` lists no `profile` line; `node setup.mjs --replace-all` installs; `~/.claude/state/bundle-manifest.json` has no `profile` key.

- [ ] **Step 1: Implement** the doc edits.
- [ ] **Step 2: Run** the two greps and the full suite.
- [ ] **Step 3: Deploy** `node setup.mjs --replace-all`; restart Claude Code is the user's step.
- [ ] **Step 4: Commit** `docs: one bundle, profiles removed`.
- [ ] **Step 5: Finish the branch** (ultrapowers:finishing-a-development-branch): squash-merge into `master`.
