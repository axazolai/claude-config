# Remove GSD and the `full` Profile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use ultrapowers:subagent-driven-development (recommended) or ultrapowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The bundle ships `base` and `lite` only, nothing in it refers to GSD, and every `node setup.mjs` run removes GSD traces from the machine.

**Architecture:** A pure plan module `gsd-purge.mjs` at the repo root (same contract as `graphify-purge.mjs`: no fs inside, `setup.mjs` executes). Runtime hooks and libs lose their GSD branches first, then the `full` profile and every GSD file go, then `setup.mjs` swaps the gsd-core detector and installer for the purge. Docs last.

**Tech Stack:** Node.js ESM (`.mjs`), built-ins only, `node:test`; tests run through `node run-tests.mjs [files...]`.

**Spec:** `.ultrapowers/phases/26-remove-gsd/26-SPEC.md`

## Global Constraints

- Edit sources only (`payload/`, `payload-lite/`, `variants.json`, `setup.mjs`, repo-root modules); never a path under `~/.claude/`.
- Testing mode is test-after: code first, then tests for the task's Acceptance lines only.
- Test names start with `@critical` or `@important` per the spec's § 6 table; other new tests are untagged.
- Run only the tests covering the task before its commit; the full suite (`node run-tests.mjs`) runs at the end of Task 5.
- Profiles after this phase: `base`, `lite`. Default `base`. `full` → `base` with the line `profile "full" was removed; using "base"`.
- Purge removal is automatic and permanent; the only backup is `settings.json.pre-gsd-purge` next to `settings.json`.
- Never touch user projects: `.planning/`, project `.claude/settings.json`, project `RISK_REGISTER.md`.
- Commits: Conventional Commits, ending with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

- A gsd-core hook registered as one quoted Windows command line (`"C:/…/node.exe" "C:/…/hooks/gsd-check-update.js"`) must be removed — Task 1.
- A settings entry holding a GSD hook and a foreign hook keeps the foreign hook — Task 1.
- A user file whose name contains but does not start with `gsd-` (`hooks/my-gsd-helper.mjs`) is untouched — Task 1.
- An unparsable `settings.json` must not stop the purge from removing paths, and must not be rewritten — Task 4.
- Answering `full` at the interactive profile prompt resolves to `base` with the removal line — Task 3.

---

### Task 1: The purge plan module

**Files:**
- Create: `gsd-purge.mjs`
- Test: `gsd-purge.test.mjs`

**Interfaces:**
- Produces:
  - `BUNDLE_RELS: string[]`, `RETIRED_HOOK_FILES: string[]` (`["gsd-config-patch.mjs", "db-live-access-gate.mjs"]`), `STATE_KEYS: string[]`
  - `stripGsdSettings(settings, claudeDir) -> { settings, removed: string[] }` — never mutates its input
  - `stripProjectInitGsd(state) -> { state, removedKeys: string[] }` — keys as `"<project>:<key>"`
  - `planGsdPurge({ claudeDir, homeDir, list, exists, settings = null, projectInit = null }) -> { paths: string[], settings: { next, changed, removed }, state: { next, changed, removedKeys } }` — `list(absDir) -> string[]` (`[]` when missing), `exists(absPath) -> boolean`; `paths` absolute, claudeDir entries sorted, `homeDir/.gsd` last
  - `isEmptyPlan(plan) -> boolean`
  - `formatGsdPurge(plan, dry) -> string`

**Acceptance:**
- `@critical` fake claudeDir with `gsd-core/`, `get-shit-done/`, `gsd-user-files-backup/`, `agents/gsd-x.md`, `skills/gsd-y/`, `commands/gsd/`, `hooks/gsd-z.js`, `hooks/lib/gsd-w.mjs`, every `BUNDLE_RELS` entry, and `homeDir/.gsd` → each appears in `paths`; foreign `agents/my-agent.md`, `hooks/my-hook.mjs`, `hooks/my-gsd-helper.mjs`, `skills/notgsd/` do not.
- `@critical` settings with a gsd-core single-command hook (quoted Windows paths), a `gsd-config-patch.mjs` args hook, a `db-live-access-gate.mjs` hook with backslashes, a GSD statusLine, a `gsd-core` permission and a `.gsd` env value, beside the bundle's own and foreign hooks → GSD items removed, every other hook kept, an entry mixing GSD and foreign hooks keeps the foreign one, an event left empty is deleted; input object unchanged.
- `@important` `references/` holding only the pilot doc → `references` listed; holding another file too → not listed.
- `@important` project-init with GSD keys and other keys → GSD keys removed, others kept, `removedKeys` names each.
- `@important` nothing GSD on disk, settings `{ hooks: { Stop: [] } }`, project-init without GSD keys → `isEmptyPlan` true.

- [ ] **Step 1: Implement** `gsd-purge.mjs`:

```js
// Pure purge plan for GSD: gsd-core and the files this bundle used to install around it. No fs or
// process access here - setup.mjs lists directories, checks existence and executes the plan.
import { join } from "node:path";

export const BUNDLE_RELS = [
  "apply-gsd-agent-patches.mjs", "sync-gsd-context-mode-tool.mjs", "gsd-defaults-sync.mjs",
  "add-risk.mjs", "hooks/gsd-config-patch.mjs", "hooks/lib/context-mode-gsd-agents.mjs",
  "hooks/db-live-access-gate.mjs", "bin/lib/gsd-core-detect.mjs", "rules-src/gsd.md",
  "references/gsd-claude-orchestration-pilot.md", "commands/init-session.md",
  "skills/using-git-worktrees",
];
const EMPTIED_DIRS = ["references"];
export const RETIRED_HOOK_FILES = ["gsd-config-patch.mjs", "db-live-access-gate.mjs"];
export const STATE_KEYS = ["gsdModelConfigPatched", "gsdWorkflowConfigPatched", "gsdInitStackGapLastCheck"];
const PATTERNS = [ // [dir under claudeDir ("" = claudeDir), entry-name test]
  ["", (n) => n.startsWith("gsd-") || n === "get-shit-done"],
  ["agents", (n) => n.startsWith("gsd-") && n.endsWith(".md")],
  ["skills", (n) => n.startsWith("gsd-")],
  ["commands", (n) => n === "gsd"],
  ["hooks", (n) => n.startsWith("gsd-")],
  ["hooks/lib", (n) => n.startsWith("gsd-")],
];
// gsd-core registers `"…/node" "…/hooks/gsd-x.js"` as one command; this bundle uses command + args.
// Settings strings are matched on path segments: a boundary is a separator, quote, parenthesis,
// whitespace or string start, and `/` and `\` both separate. Product names and the `.gsd` directory
// match anywhere. Bundle and gsd-* names match only directly under the config dir: a `.claude`
// segment or the configured claudeDir.
const BOUND = String.raw`(?:^|[\s"'(\\/])`;
const SEP = String.raw`[\\/]`;
const NAME_END = String.raw`(?![\w.-])`;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const segsRe = (p) => p.replace(/\\/g, "/").split("/").filter(Boolean).map(esc).join(SEP);
const PRODUCT_RE = new RegExp(`${BOUND}(?:gsd-core|get-shit-done|@opengsd)|${BOUND}\\.gsd${NAME_END}`, "i");
const PATH_NAMES = [
  ...BUNDLE_RELS.map((r) => segsRe(r) + NAME_END),
  ...RETIRED_HOOK_FILES.map((f) => segsRe(`hooks/${f}`) + NAME_END),
  ...["gsd-", "agents/gsd-", "skills/gsd-", "hooks/gsd-", "hooks/lib/gsd-"].map(segsRe),
  segsRe("commands/gsd") + NAME_END,
];
const purgedMatcher = (claudeDir) => {
  const cfg = [`${BOUND}\\.claude`];
  if (claudeDir) cfg.push(String.raw`(?:^|[\s"'(])[\\/]*` + segsRe(String(claudeDir)));
  const pathRe = new RegExp(`(?:${cfg.join("|")})${SEP}(?:${PATH_NAMES.join("|")})`, "i");
  return (s) => PRODUCT_RE.test(s) || pathRe.test(s);
};
const GSD_STATUSLINE = /gsd-statusline\.js|gsd-context-meter/;
const strs = (o) => [o?.command, ...(Array.isArray(o?.args) ? o.args : [])].map((s) => String(s ?? ""));

export function stripGsdSettings(settings, claudeDir) {
  const named = purgedMatcher(claudeDir);
  const namesGsdHook = (h) => strs(h).some((s) => named(s));
  const out = JSON.parse(JSON.stringify(settings || {}));
  const removed = [];
  for (const [event, entries] of Object.entries(out.hooks && typeof out.hooks === "object" ? out.hooks : {})) {
    if (!Array.isArray(entries)) continue;
    let dropped = 0;
    const kept = [];
    for (const e of entries) {
      const hooks = Array.isArray(e?.hooks) ? e.hooks : [];
      const left = hooks.filter((h) => !namesGsdHook(h));
      dropped += hooks.length - left.length;
      if (left.length === hooks.length) kept.push(e);
      else if (left.length) kept.push({ ...e, hooks: left });
    }
    if (!dropped) continue;
    removed.push(`${event}: ${dropped} hook(s)`);
    if (kept.length) out.hooks[event] = kept; else delete out.hooks[event];
  }
  if (out.statusLine && strs(out.statusLine).some((s) => GSD_STATUSLINE.test(s))) {
    delete out.statusLine;
    removed.push("statusLine");
  }
  for (const kind of ["allow", "deny", "ask"]) {
    const list = out.permissions?.[kind];
    if (!Array.isArray(list)) continue;
    const kept = list.filter((p) => !named(String(p)));
    if (kept.length === list.length) continue;
    removed.push(`permissions.${kind}: ${list.length - kept.length}`);
    out.permissions[kind] = kept;
  }
  for (const [k, v] of Object.entries(out.env && typeof out.env === "object" ? out.env : {}))
    if (named(String(v))) { delete out.env[k]; removed.push(`env.${k}`); }
  return { settings: out, removed };
}

export function stripProjectInitGsd(state) {
  const out = JSON.parse(JSON.stringify(state || {}));
  const removedKeys = [];
  for (const [project, entry] of Object.entries(out)) {
    if (!entry || typeof entry !== "object") continue;
    for (const key of STATE_KEYS) if (key in entry) { delete entry[key]; removedKeys.push(`${project}:${key}`); }
  }
  return { state: out, removedKeys };
}

export function planGsdPurge({ claudeDir, homeDir, list, exists, settings = null, projectInit = null }) {
  const at = (rel) => join(claudeDir, ...rel.split("/").filter(Boolean));
  const rels = new Set();
  for (const [dir, match] of PATTERNS) for (const n of list(at(dir))) if (match(n)) rels.add(dir ? `${dir}/${n}` : n);
  for (const rel of BUNDLE_RELS) if (exists(at(rel))) rels.add(rel);
  for (const dir of EMPTIED_DIRS) {
    const names = list(at(dir));
    if (names.length && names.every((n) => rels.has(`${dir}/${n}`))) rels.add(dir);
  }
  const paths = [...rels].sort().map(at);
  if (exists(join(homeDir, ".gsd"))) paths.push(join(homeDir, ".gsd"));
  const s = settings ? stripGsdSettings(settings, claudeDir) : { settings, removed: [] };
  const st = projectInit ? stripProjectInitGsd(projectInit) : { state: projectInit, removedKeys: [] };
  return {
    paths,
    settings: { next: s.settings, changed: s.removed.length > 0, removed: s.removed },
    state: { next: st.state, changed: st.removedKeys.length > 0, removedKeys: st.removedKeys },
  };
}

export const isEmptyPlan = (p) => !p.paths.length && !p.settings.changed && !p.state.changed;

export function formatGsdPurge(plan, dry) {
  const lines = ["\n--- GSD: removing every trace (no longer part of this bundle) ---"];
  for (const p of plan.paths) lines.push(`  ${dry ? "would remove" : "removing"} ${p}`);
  if (plan.settings.changed) lines.push(`  ${dry ? "would clean" : "cleaning"} settings.json: ${plan.settings.removed.join(", ")}`);
  if (plan.state.changed) lines.push(`  ${dry ? "would clean" : "cleaning"} state/project-init.json: ${plan.state.removedKeys.join(", ")}`);
  return lines.join("\n");
}
```

- [ ] **Step 2: Reconcile** — any behaviour change goes into this task and spec § 4.1 before the tests.
- [ ] **Step 3: Write the acceptance tests** in `gsd-purge.test.mjs` — one per Acceptance line. Fake the tree as a `Set` of absolute paths built with `path.join` (add every ancestor), `list = (d) => [...tree].filter((p) => dirname(p) === d).map((p) => basename(p))`, `exists = (p) => tree.has(p)`. Then the mutation check.
- [ ] **Step 4: Run them** — `node run-tests.mjs gsd-purge.test.mjs` → PASS.
- [ ] **Step 5: Commit** — `feat(setup): add the GSD purge plan module`.

---

### Task 2: Strip GSD from runtime hooks and libraries

`full` still exists during this task; only GSD code paths go. Each file must stop importing or spawning any GSD file, so Task 3 can delete them.

**Files:**
- Modify: `payload/hooks/session-init.mjs`, `payload/hooks/statusline.mjs`, `payload/commands/status-project-progress.md`, `payload/hooks/lib/status-project-progress.mjs` (comment), `payload/bin/init-stack.mjs`, `payload/commands/init-stack.md`, `payload/bin/lib/model-migration.mjs`, `payload/hooks/lib/leanmode-rules.mjs`, `payload/hooks/lib/tdd-mode.mjs`, `payload/bin/ultrapowers-tdd.mjs`, `payload/hooks/lib/stack-rules-check.mjs`, `payload/rules-src/README.md`, `payload/bin/lib/claude-cleanup-lib.mjs`, `payload/commands/claude-cleanup.md`, `payload/hooks/worktree-executor-discipline-advisor.mjs`
- Test: `payload/hooks/session-init.test.mjs`, `payload/hooks/statusline.test.mjs`, `payload/bin/init-stack.test.mjs`, `payload/bin/lib/model-migration.test.mjs`, `payload/hooks/lib/tdd-mode.test.mjs`, plus any test the removals break.

**Interfaces:**
- Produces: `model-migration.mjs` exports only `migrateSettingsModel`; `statusline.mjs` `render()` without the `gsd` and `hookPatches` inputs; `session-init.mjs` without `FULL`.

**Acceptance:**
- `@important` session start in a project with a GitHub remote and no matching MCP, on a `base` manifest → the `/init-mcp` suggestion appears (it was `full`-only).
- `@important` session start in a project with `.planning/` on any manifest → no `claudeMdExcludes` write, no `add-risk` spawn, no `.planning/config.json` read.
- `@important` statusline in a directory with `.planning/STATE.md` and `gsd-core/VERSION` → no milestone bar, no `⚠ gsd-patch`; the `.ultrapowers` phase segment still renders.
- `migrateProjectModelConfig` is gone and `migrateSettingsModel` behaves as before (its existing tests pass unchanged).

- [ ] **Step 1: Implement** — remove, by function or block:
  - `session-init.mjs`: `VARIANT`/`FULL` (≈L46-55); `looksGsd()` and its use in the root `CLAUDE.md` auto-mark (≈L112-115, L192-203); risk-register discovery and the `add-risk` spawn (≈L117-167); the `.planning/CLAUDE.md` `claudeMdExcludes` write (≈L174-190); the fallow gap check (≈L296-333); the dynamic-import patch-check block (≈L335-432); the `test_command`/`build_command` note (≈L434-455); hint text naming `/gsd-*`. The `/init-mcp` suggestion (≈L254) loses its `FULL &&` condition and keeps the rest. Keep `.planning` as a `findRoot` marker (spec § 7).
  - `statusline.mjs`: `renderHookPatches`, `renderGsd`, `gsdPercent`, `gsdState`, `gsdActive`, `hookPatchStatuses` and their two slots in `render()`; the phase segment from `lib/phase-segment.mjs` stays. `status-project-progress.md` description: "Show or hide the statusline phase counter".
  - `init-stack.mjs`: `migrateProjectModelConfigFile` and `syncGsdContextModeAgents` with their calls; `commands/init-stack.md` lines about the `.planning` re-migration; drop the matching budget exception in `variants.test.mjs` if it names that text.
  - `model-migration.mjs`: `PROJECT_OVERRIDE_MIGRATIONS`, `migrateProjectModelConfig`, the GSD sentences of the header comment.
  - `leanmode-rules.mjs`: the gsd-* agent defaults; `tdd-mode.mjs` and `ultrapowers-tdd.mjs`: the `.planning/config.json` mirror (`gsdSynced`); `stack-rules-check.mjs`: the `["gsd", /^\.planning$/]` fingerprint, and `rules-src/README.md` lines naming it; `claude-cleanup-lib.mjs` `AGE_DIRS` and `claude-cleanup.md`: the two `gsd-*` dirs.
  - `worktree-executor-discipline-advisor.mjs`: comments and messages citing `rules-src/gsd.md` or gsd-executor patches; reword to the behaviour itself.
- [ ] **Step 2: Reconcile** — any removal that changed behaviour beyond the list above goes into spec § 5 first.
- [ ] **Step 3: Write the acceptance tests** — the three tagged lines into `session-init.test.mjs` and `statusline.test.mjs`; delete tests of removed code (statusline GSD bar and alarm, session-init risk-register and FULL-default tests, init-stack L228 migration, model-migration project-config block, tdd-mode GSD sync). Grep the payload for imports of deleted functions: `grep -rn "gsd" payload --include=*.mjs` lists only files Task 3 deletes.
- [ ] **Step 4: Run them** — `node run-tests.mjs payload/hooks/session-init.test.mjs payload/hooks/statusline.test.mjs payload/bin/init-stack.test.mjs payload/bin/lib/model-migration.test.mjs payload/hooks/lib/tdd-mode.test.mjs` → PASS.
- [ ] **Step 5: Commit** — `refactor(hooks): drop GSD code paths from runtime hooks and libraries`.

---

### Task 3: Remove the `full` profile and every GSD file

**Files:**
- Modify: `variants.json`, `variants.mjs` (identity-branch comment), `setup.mjs`, `settings.partial.json`, `payload/bin/lib/assemble-claude-md.mjs`, the shared `payload/claude-md/*.md` with `profiles: [..., full]`
- Delete: `payload/agents/gsd-executor-decomposing.md`, `payload/agents/gsd-task-verifier.md`, `payload/apply-gsd-agent-patches.mjs`, `payload/sync-gsd-context-mode-tool.mjs`, `payload/gsd-defaults-sync.mjs`, `payload/add-risk.mjs`, `payload/hooks/gsd-config-patch.mjs`, `payload/hooks/lib/gsd-agent-patches.mjs`, `payload/hooks/lib/gsd-skill-patches.mjs`, `payload/hooks/lib/gsd-hook-patches.mjs`, `payload/hooks/lib/gsd-patch-frontmatter.mjs`, `payload/hooks/lib/gsd-defaults-sync.mjs`, `payload/hooks/lib/gsd-statusline-registration.mjs`, `payload/hooks/lib/context-mode-gsd-agents.mjs`, `payload/hooks/db-live-access-gate.mjs`, `payload/rules-src/gsd.md`, `payload/references/gsd-claude-orchestration-pilot.md`, `payload/commands/init-session.md`, `payload/skills/using-git-worktrees/SKILL.md`, `payload/claude-md/02-precedence.full.md`, `payload/claude-md/04-reading-order.full.md`, `payload/claude-md/09-plugins.full.md`, `gsd-defaults.partial.json`, `gsd-core-patches/README.md`, `RISK_REGISTER.snippet.md`, and the tests `payload/hooks/lib/gsd-agent-patches.test.mjs`, `payload/hooks/lib/gsd-hook-patches.test.mjs`, `payload/hooks/lib/gsd-patch-frontmatter.test.mjs`. Keep `payload/bin/lib/gsd-core-detect.mjs` (Task 4 removes it with the detector).
- Test: `setup-variants.e2e.test.mjs`, `variants.test.mjs`, `payload/bin/lib/assemble-claude-md.test.mjs`, `payload/hooks/phase-end-cleanup-nudge.test.mjs`, `plugin-reconcile.test.mjs`

**Interfaces:**
- Consumes: Task 2 (nothing imports the deleted files).
- Produces: `profilesOf(variants)` keys exactly `["base", "lite"]`; `setup.mjs` resolves the profile through `resolveProfile(name)`.

**Acceptance:**
- `@critical` manifest `profile: "full"`, non-TTY → installs as `base`, prints `profile "full" was removed; using "base"`, exit 0.
- `@critical` no manifest, non-TTY → installs as `base`, exit 0.
- `@critical` `--variant=full` → installs as `base` with the removal line; `--variant=nope` still exits 1.
- `@important` interactive prompt answered `full` → `base` with the removal line (drive the prompt by piping `full\n` through a pseudo-TTY only if the harness already supports it; otherwise cover `resolveProfile("full")` directly).
- `@important` assembled `CLAUDE.md` for `base` and `lite` → no `rules-src/gsd.md`, no `GSD` (case-insensitive `\bgsd\b`).
- `base` install tree contains `hooks/ci-watch-nudge.mjs` and `hooks/worktree-executor-discipline-advisor.mjs`; `lite` contains neither (existing `assertTreeEquals` helper).

- [ ] **Step 1: Implement**
  - `variants.json`: delete `$gsd`, `$gsdCore`, `gsdCore`, `profiles.full`, `deepseekDefaults.full`; delete `base.exclude`; add `"hooks/ci-watch-nudge*", "hooks/worktree-executor-discipline-advisor.mjs"` to `lite.exclude`; `forbiddenPlugins: ["context7", "gsd"]` (keep `gsd` in `managedPlugins`); add a `$gsd` line stating it is forbidden because GSD left the bundle in phase 26; update `$comment` if it names `full`.
  - `setup.mjs` profile selection (≈L856-876) becomes:

```js
  const known = Object.keys(profilesOf(loadVariants(REPO_ROOT)));
  const resolveProfile = (name, source) => {
    if (!name) return null;
    if (name === "full") { log(`profile "full" was removed; using "base"`); return "base"; }
    if (known.includes(name)) return name;
    if (source === "arg") { log(`Unknown --variant=${name}. Known: ${known.join(", ")}`); process.exit(1); }
    log(`profile "${name}" is unknown; using "base"`);
    return "base";
  };
  const oldManifestEarly = safe(() => JSON.parse(readFileSync(MANIFEST, "utf8")));
  const installedVariant = oldManifestEarly ? (oldManifestEarly.profile || oldManifestEarly.variant || null) : null;
  VARIANT = resolveProfile(VARIANT_ARG, "arg");
  if (!VARIANT && INTERACTIVE) {
    const def = resolveProfile(installedVariant, "manifest") || "base";
    const a = (await ask(`  bundle profile [${known.join("/")}] (Enter = ${def}) > `)).trim().toLowerCase();
    VARIANT = a === "full" || known.includes(a) ? resolveProfile(a, "prompt") : def;
  }
  if (!VARIANT) VARIANT = resolveProfile(installedVariant, "manifest") || "base";
```

    The "Switching variant" line compares against the resolved installed profile, so `full` → `base` is not reported as a switch.
  - `setup.mjs` removals: every `VARIANT === "full"` block in `main()` (gsd agents context-mode sync, `gsd-defaults.partial.json` copy and `~/.gsd/defaults.json` merge, the gsd-core patch loop and `.pre-*` pruning); `offerGsdCoreInstall()` and its call; `installedGsdCoreVersion`, `quarantineGsdLooking()`, `restoreQuarantine()`, `repatchAfterGsdCoreInstall()`; `UPDATE_GSD_CORE_FLAG` and its doc line; the `gsd-defaults.partial.json` special case in `pruneStale()`; `RISK_REGISTER.snippet.md` in `META`; the unused `SKILL` constant. Closing text: branch on `VARIANT === "lite"` — `base` prints the `/init-mcp` lines and the plugin-tier `/init-stack` Step 3/Step 4; `lite` prints its current Step 3; drop the two GSD-only bullet groups.
  - `settings.partial.json`: remove the `gsd-config-patch.mjs` and `db-live-access-gate.mjs` registrations and the `.planning/CLAUDE.md` sentence in `_comment`.
  - Fragments: `profiles: [base, full]` → `profiles: [base]` in `01-title.md`, `06-collaboration.md`, `12-model-selection.md`, `13-phase-cleanup.md`, `15-web-access.md`, `17-save-points.md`; `assemble-claude-md.mjs` override regex accepts `base|lite`.
  - Delete the files listed above with `git rm <file>`, one named path per command.
- [ ] **Step 2: Reconcile** — record any change to spec § 3 or § 5.
- [ ] **Step 3: Write the acceptance tests** — in `setup-variants.e2e.test.mjs` replace the `full` round trips (≈L63, L79) and the `["lite","full"]` dry-run loop (≈L159) with `base`/`lite`, add the profile rows; in `variants.test.mjs` change the profile loops and `deepseekDefaults` keys to `base`/`lite`, drop the `full` fixture and the `full` mcpServers/`/publish` cases; `assemble-claude-md.test.mjs` drops the `full` assertions and gains the no-GSD row; `phase-end-cleanup-nudge.test.mjs` resolves `base`; `plugin-reconcile.test.mjs` renames the `gsd` surplus fixture to a neutral name.
- [ ] **Step 4: Run them** — `node run-tests.mjs setup-variants.e2e.test.mjs variants.test.mjs payload/bin/lib/assemble-claude-md.test.mjs payload/hooks/phase-end-cleanup-nudge.test.mjs plugin-reconcile.test.mjs` → PASS.
- [ ] **Step 5: Commit** — `feat(setup)!: remove the full profile and every GSD file`.

---

### Task 4: Run the purge on every install, retire the gsd-core detector

**Files:**
- Modify: `setup.mjs`
- Delete: `payload/bin/lib/gsd-core-detect.mjs`, `payload/bin/lib/gsd-core-detect.test.mjs`
- Test: `setup-variants.e2e.test.mjs`

**Interfaces:**
- Consumes: Task 1 `planGsdPurge`, `isEmptyPlan`, `formatGsdPurge`, `RETIRED_HOOK_FILES`.

**Acceptance:**
- `@critical` fake config dir with gsd-core traces, `homeDir/.gsd`, former bundle GSD files and a `settings.json` with gsd-core hooks and a GSD statusLine → after install none of those paths exist, `settings.json` has no GSD hook and carries the bundle statusLine, `settings.json.pre-gsd-purge` holds the old content, foreign files (`FOREIGN` fixture) are intact.
- `@critical` same machine with `--dry-run` → output lists every path under `would remove`; every planted path and `settings.json` are byte-identical afterwards.
- `@important` clean machine → output has no `GSD:` section and no `settings.json.pre-gsd-purge` exists.
- `@important` GSD traces plus an unparsable `settings.json` → the paths are removed, `settings.json` is byte-identical, no backup written.

- [ ] **Step 1: Implement** — import from `./gsd-purge.mjs`; delete the `gsd-core-detect.mjs` import, `UNINSTALL_GSD` and its doc lines, `detectForeignGsdCore()`, and change its call site to `await pruneStale();`; extend `RETIRED_HOOK_FILES` with the purge module's list; drop the `isGsdCoreDefault` / `gsd-context-meter` statusLine takeover in the settings merge (the purge removes those statusLines first). Add this block right after the graphify block and before the settings merge, outside the `CLAUDE_SETUP_SKIP_PURGE` guard:

```js
  /* ---------- GSD: remove every trace ---------- */
  // Unconditional: no profile ships GSD. Automatic and permanent by design (RISK-GSDPURGE-001).
  {
    const projectInitPath = join(CDIR, "state", "project-init.json");
    const settingsText = read(SETTINGS);
    const settingsJson = settingsText === undefined ? null : safe(() => JSON.parse(settingsText)) ?? null;
    const plan = planGsdPurge({
      claudeDir: CDIR, homeDir: HOME, exists: existsSync,
      list: (p) => safe(() => readdirSync(p)) || [],
      settings: settingsJson,
      projectInit: safe(() => JSON.parse(readFileSync(projectInitPath, "utf8"))) ?? null,
    });
    if (!isEmptyPlan(plan)) {
      log(formatGsdPurge(plan, DRY));
      if (!DRY) {
        for (const p of plan.paths) {
          safe(() => rmSync(p, { recursive: true, force: true }));
          if (existsSync(p)) log(`  FAILED to remove ${p}`);
        }
        if (plan.settings.changed) {
          copyFileSync(SETTINGS, `${SETTINGS}.pre-gsd-purge`);
          if (!write(SETTINGS, JSON.stringify(plan.settings.next, null, 2) + "\n")) log(`  FAILED to clean ${SETTINGS}`);
        }
        if (plan.state.changed) write(projectInitPath, JSON.stringify(plan.state.next, null, 2) + "\n");
      }
      summary.push(`GSD ${DRY ? "purge (dry run)" : "purged"}: ${plan.paths.length} path(s) - listed above`);
    }
  }
```

  Then `git rm payload/bin/lib/gsd-core-detect.mjs` and `git rm payload/bin/lib/gsd-core-detect.test.mjs`.
- [ ] **Step 2: Reconcile** — record any change to spec § 4.2.
- [ ] **Step 3: Write the acceptance tests** — replace the foreign gsd-core detector suite in `setup-variants.e2e.test.mjs` (≈L169-488, fixtures ≈L209-244) with the four rows above, run through the file's existing `run()`/`setupEnv()` (they sandbox `HOME` and `USERPROFILE`, so `~/.gsd` is the sandbox's). Plant `.gsd` under the sandbox home the spawn uses.
- [ ] **Step 4: Run them** — `node run-tests.mjs setup-variants.e2e.test.mjs gsd-purge.test.mjs` → PASS.
- [ ] **Step 5: Commit** — `feat(setup): purge GSD traces on every install`.

---

### Task 5: Texts and documentation

**Files:**
- Modify: `payload/skills/model-selection-policy/SKILL.md`, `payload/claude-md/12-model-selection.md`, `payload/skills/verification-before-completion/SKILL.md`, `README.md`, `README.en.md`, `.claude/CLAUDE.md`, `.ultrapowers/RISK_REGISTER.md`
- Delete: `docs/gsd-config-defaults.md`, `docs/review.md`

**Acceptance:** documentation only — no new tests. The full suite passes.

- [ ] **Step 1: Implement**
  - `model-selection-policy/SKILL.md`: delete the section "GSD's own per-role map lives elsewhere, not in this skill"; in the advisor section replace `/gsd-execute-phase`, `/gsd-debug` with "long plan executions and debugging sessions".
  - `12-model-selection.md`: "Full routing, the ladder rules, and the per-role GSD effort map →" becomes "Full routing and the ladder rules →".
  - `verification-before-completion/SKILL.md`: drop the GSD agent and command names from the "other model" sentence.
  - `README.md` / `README.en.md`: profiles section (`base`, `lite`; `full` removed, falls back to `base`), "what goes where" tree, flags (`--uninstall-gsd`, `--update-gsd-core` gone), auto-init list, hooks reference (`gsd-config-patch`, `db-live-access-gate` gone, `ci-watch-nudge` and `worktree-executor-discipline-advisor` in `base`); delete the "gsd-defaults.partial.json → ~/.gsd/defaults.json" and gsd-core patches sections; add one paragraph: every install removes GSD traces automatically and permanently, `--dry-run` lists them.
  - `.claude/CLAUDE.md`: in "Risk register location", delete the clause "and `add-risk.mjs` is pointed there".
  - `git rm docs/gsd-config-defaults.md` and `git rm docs/review.md`.
  - `.ultrapowers/RISK_REGISTER.md`: move `RISK-GSDEXEC-001`, `RISK-GSDSURFACE-001`, `RISK-GSDSURFACE-002`, `RISK-GSDSURFACE-003`, `RISK-ULTRAPOWERS-010`, `RISK-VARIANT-003`, `RISK-VARIANT-004`, `RISK-VARIANT-005` to `## Closed` with `- **Status:** Closed (YYYY-MM-DD, the day this task runs) — GSD left the bundle in phase 26.` and update the Contents list.
- [ ] **Step 2: Check** — `git grep -niE "\bgsd\b|gsd-|full profile|--variant=full" -- payload payload-lite setup.mjs variants.json variants.mjs settings.partial.json README.md README.en.md` lists only: `gsd-purge` references, `forbiddenPlugins`/`managedPlugins`/`$gsd` in `variants.json`, the README purge paragraph and `full`→`base` note, `update-changelog/SKILL.md`, `.planning` root-marker lines (spec § 7).
- [ ] **Step 3: Run the full suite** — `node run-tests.mjs` → all pass; report the count.
- [ ] **Step 4: Commit** — `docs: remove GSD and the full profile from skills and READMEs`.
