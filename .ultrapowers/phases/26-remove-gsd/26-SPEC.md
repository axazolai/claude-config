# Phase 26 — Remove GSD and the `full` profile

Remove the GSD integration (gsd-core and everything this bundle built around it) from the
project, drop the `full` profile, and make every install remove GSD traces from the machine it
runs on.

## 1. Goal and intent

- The bundle ships two profiles, `base` and `lite`. Nothing in `payload/`, `setup.mjs` or the
  assembled `CLAUDE.md` refers to GSD.
- Every `node setup.mjs` run removes GSD traces from the machine automatically and permanently:
  gsd-core, the files this bundle used to install for GSD, `~/.gsd/`, and GSD entries in
  `settings.json` and in bundle state.
- A machine whose manifest records `full` installs as `base` without failing.
- Success: after an install on a machine that ran `full` with gsd-core, `~/.claude` holds no GSD
  file, `settings.json` registers no GSD hook or statusLine, and the full suite passes.

## 2. Facts this design rests on

From the inventory of 2026-10-18 (read-only exploration of the repo and of this machine):

| Fact | Value |
|---|---|
| This machine | `base` profile, 221 manifest files; no `gsd-core/`, `~/.gsd`, GSD hooks or GSD settings entries |
| `full` vs `base` | same plugins and MCP servers; `full` ships 20 more files (15 GSD, 5 not) and runs every `VARIANT === "full"` / `FULL` branch |
| Default profile | `"full"` in three places in `setup.mjs` and in `session-init.mjs` when no manifest exists |
| Stored unknown profile | never validated; with `full` removed, a non-TTY run, an Enter at the prompt or a fresh install throws `unknown profile "full"` |
| gsd-core install | `npx -y @opengsd/gsd-core@<pin> --global --claude`, only through `offerGsdCoreInstall()` |
| Existing remover | `detectForeignGsdCore()`: base/lite only, consent by `--uninstall-gsd` or `y`, moves to `.cleanup-trash`; misses `commands/gsd/`, `get-shit-done/`, top-level `gsd-*`, `~/.gsd`, permissions/env |
| Precedent | `graphify-purge.mjs` at the repo root: a pure plan module that `setup.mjs` executes |

## 3. Profiles

- `variants.json` keeps `base` and `lite`. `profiles.full`, `$gsd`, `gsdCore`, `$gsdCore` and
  `deepseekDefaults.full` are removed; the GSD globs leave `base.exclude`, so `base` resolves to the
  whole payload and `lite` still extends `base`.
- `gsd` moves into `forbiddenPlugins` and stays in `managedPlugins`, so plugin reconciliation
  uninstalls the marketplace plugin on sight.
- Profile resolution in `setup.mjs`:
  - the default is `base`;
  - a manifest recording `full`, and `--variant=full`, resolve to `base` and print
    `profile "full" was removed; using "base"`;
  - any other stored name that is not a known profile resolves to `base` with a warning.
- `session-init.mjs` drops `FULL` and every branch it gates.
- `CLAUDE.md` fragments: `02-precedence.full.md`, `04-reading-order.full.md` and
  `09-plugins.full.md` are deleted; `profiles: [base, full]` becomes `profiles: [base]` in the
  shared fragments; `assemble-claude-md.mjs` accepts only `base` and `lite` overrides.
- Full-only files that stay, now in `base`: `hooks/ci-watch-nudge.mjs`,
  `hooks/worktree-executor-discipline-advisor.mjs` (its messages lose the GSD references).
- Full-only files deleted: `hooks/db-live-access-gate.mjs`, `skills/using-git-worktrees/`,
  `commands/init-session.md`, `references/`.
- The `/init-mcp` suggestion at session start is shown in every profile that ships `/init-mcp`.

## 4. The purge module: `gsd-purge.mjs`

Lives at the repo root beside `graphify-purge.mjs` and follows its contract: no fs or process
access inside planning; `setup.mjs` executes the plan. `bin/lib/gsd-core-detect.mjs` is deleted;
the parts the purge needs (inventory, hook filter) move here.

### 4.1 `planGsdPurge(input)`

Input: the listing of `claudeDir` and `homeDir` entries the plan inspects, the parsed
`settings.json`, the parsed `state/project-init.json`. Output:

```js
{
  paths: [ "<absolute path>", ... ],   // each existing path, listed by name
  settings: { next, changed, removed: [ "<what>", ... ] },
  state: { next, changed, removedKeys: [ "<project>:<key>", ... ] },
}
```

Paths, each included only when it exists:

- gsd-core and its traces under `claudeDir`: `gsd-core/`, `get-shit-done/`, every top-level entry
  named `gsd-*` (e.g. `gsd-user-files-backup/`, `gsd-migration-journal/`,
  `gsd-defaults.partial.json`), `agents/gsd-*.md`, `skills/gsd-*/`, `commands/gsd/`, `hooks/gsd-*`,
  `hooks/lib/gsd-*`.
- Files this bundle used to install (`BUNDLE_RELS`): `apply-gsd-agent-patches.mjs`,
  `sync-gsd-context-mode-tool.mjs`, `gsd-defaults-sync.mjs`, `add-risk.mjs`,
  `hooks/gsd-config-patch.mjs`, `hooks/lib/context-mode-gsd-agents.mjs`,
  `hooks/db-live-access-gate.mjs`, `bin/lib/gsd-core-detect.mjs`, `rules-src/gsd.md`,
  `references/gsd-claude-orchestration-pilot.md`, `commands/init-session.md`,
  `skills/using-git-worktrees/`; a directory left empty by these removals (`references/`) goes too.
- `homeDir/.gsd/`.

`settings.json` edits:

- hook registrations whose command names a purged file or a `hooks/gsd-*` script are removed; an
  event left with no entries is removed;
- a `statusLine` whose command names `gsd-statusline.js` or `gsd-context-meter` is removed (the
  settings merge then installs the bundle's own);
- `permissions` entries and `env` values that name a purged path are removed.

State edits: the keys `gsdModelConfigPatched`, `gsdWorkflowConfigPatched` and
`gsdInitStackGapLastCheck` are removed from every project entry in `project-init.json`.

### 4.2 Execution in `setup.mjs`

- Runs on every install, after the graphify purge and before the settings merge and
  `pruneStale()`.
- A non-empty plan prints every path and settings/state removal, then deletes each listed path,
  writes one backup of `settings.json` before changing it, and writes `settings.json` and the state
  file atomically.
- `--dry-run` prints the plan and changes nothing.
- An empty plan prints nothing and writes nothing.
- `gsd-config-patch.mjs` and `db-live-access-gate.mjs` join `RETIRED_HOOK_FILES`.
- Removed: `offerGsdCoreInstall()`, `quarantineGsdLooking()`, `restoreQuarantine()`,
  `repatchAfterGsdCoreInstall()`, `detectForeignGsdCore()`, the flags `--uninstall-gsd` and
  `--update-gsd-core`.

Projects are not touched: `.planning/`, `claudeMdExcludes` entries and `RISK_REGISTER.md` rows in
user projects stay.

## 5. Removals and edits

Deleted:

- `payload/`: `agents/gsd-executor-decomposing.md`, `agents/gsd-task-verifier.md`,
  `apply-gsd-agent-patches.mjs`, `sync-gsd-context-mode-tool.mjs`, `gsd-defaults-sync.mjs`,
  `add-risk.mjs`, `hooks/gsd-config-patch.mjs`, `hooks/lib/gsd-*.mjs`,
  `hooks/lib/context-mode-gsd-agents.mjs`, `hooks/db-live-access-gate.mjs`,
  `bin/lib/gsd-core-detect.mjs`, `rules-src/gsd.md`, `references/`, `commands/init-session.md`,
  `skills/using-git-worktrees/`, the three `claude-md/*.full.md`.
- Repo root: `gsd-defaults.partial.json`, `gsd-core-patches/`, `RISK_REGISTER.snippet.md`,
  `docs/gsd-config-defaults.md`, `docs/review.md`.
- Tests that cover only deleted code: `gsd-core-detect`, `gsd-agent-patches`, `gsd-hook-patches`,
  `gsd-patch-frontmatter`.

Edited:

- `setup.mjs`: every `VARIANT === "full"` block (gsd agents sync, `~/.gsd/defaults.json`, the
  gsd-core patch loop), the `gsd-defaults.partial.json` special case in `pruneStale()`, the GSD
  statusLine takeover (moved into the purge), the `META` entry for the snippet, the unused `SKILL`
  constant, the full-only lines of the closing "Project setup" text. The closing text for `base`
  stops printing the lite wording ("no plugin machinery in lite").
- `settings.partial.json`: the `gsd-config-patch.mjs` and `db-live-access-gate.mjs` registrations
  and the `.planning/CLAUDE.md` comment.
- `session-init.mjs`: risk-register discovery and the `add-risk` spawn, the `.planning/CLAUDE.md`
  `claudeMdExcludes` write, the GSD-looking skip in the root `CLAUDE.md` auto-mark, the
  `.planning/config.json` gap check, the patch-check import block, the `test_command` note, hints
  naming `/gsd-*`; the `/init-mcp` gate.
- `statusline.mjs`: the GSD milestone bar and the `⚠ gsd-patch` alarm with their inputs; the
  ultrapowers phase segment stays. `commands/status-project-progress.md` loses "gsd milestone bar".
- `bin/init-stack.mjs`, `commands/init-stack.md`: the `.planning/config.json` model migration and
  the gsd agents context-mode sync.
- `bin/lib/model-migration.mjs`: keeps only `migrateSettingsModel`.
- `hooks/lib/leanmode-rules.mjs` (gsd agent defaults), `hooks/lib/tdd-mode.mjs` and
  `bin/ultrapowers-tdd.mjs` (the `.planning/config.json` mirror), `hooks/lib/stack-rules-check.mjs`
  and `rules-src/README.md` (the `gsd` stack fingerprint), `bin/lib/claude-cleanup-lib.mjs` and
  `commands/claude-cleanup.md` (GSD age dirs).
- Text: `skills/model-selection-policy/SKILL.md` (the GSD section), `claude-md/12-model-selection.md`
  ("per-role GSD effort map"), `skills/verification-before-completion/SKILL.md`,
  `hooks/worktree-executor-discipline-advisor.mjs`, `README.md` and `README.en.md` (profiles,
  GSD defaults, gsd-core patches, hooks reference), this repo's `.claude/CLAUDE.md` (the
  `add-risk.mjs` line).
- Tests adapted to the above: `setup-variants.e2e`, `variants`, `assemble-claude-md`, `statusline`,
  `session-init`, `tdd-mode`, `init-stack`, `model-migration`, `phase-end-cleanup-nudge`,
  `plugin-reconcile` (fixture name only).

## 6. Testing decisions (test-after)

| # | Input | Expected | Tier |
|---|---|---|---|
| 1 | Manifest records `full`; no manifest; `--variant=full` | Installs as `base`, the first and third print the removal notice, no failure | `@critical` |
| 2 | Fake `claudeDir` with gsd-core traces, former bundle GSD files and `homeDir/.gsd`, beside foreign files (`agents/my-agent.md`, `hooks/my-hook.mjs`, `skills/notgsd/`) | The plan lists exactly the GSD traces; foreign files are absent from it | `@critical` |
| 3 | `settings.json` with gsd-core hooks, `gsd-config-patch`, a GSD statusLine, the bundle's own and foreign hooks | GSD registrations and statusLine removed; bundle and foreign hooks kept; one backup written | `@critical` |
| 4 | `--dry-run` with GSD traces present | The plan is printed; nothing on disk changes | `@critical` |
| 5 | A machine with no GSD traces | Empty plan: no output, no writes, no backup | `@important` |
| 6 | `project-init.json` with GSD keys and other keys | GSD keys removed, other keys kept | `@important` |
| 7 | Assembled `CLAUDE.md` for `base` and `lite` | No `rules-src/gsd.md` pointer, no GSD mention | `@important` |

Seams: the purge plan is checked at the pure function (fake directory listing and settings in,
plan out) for rows 2, 3, 5, 6; profile resolution and plan execution through an end-to-end run of
the real `setup.mjs` against a fake config dir for rows 1 and 4; row 7 on the assembled
`CLAUDE.md`. The full suite runs at the end.

## 7. Out of scope

- Artefacts in user projects: `.planning/`, `claudeMdExcludes`, `RISK_REGISTER.md` rows.
- `.planning` as a project-root marker (`session-init`, `leanmode-rules`, `mark-initstack-done`,
  the `aidev` and `leanmode` commands).
- History: `.ultrapowers/`, `docs/opus5/*`.
- The `update-changelog` rule that keeps GSD out of release notes.
- Text inside the ultrapowers plugin.

## 8. Risks

- Closed by this phase once it ships: `RISK-GSDEXEC-001`, `RISK-GSDSURFACE-001`,
  `RISK-GSDSURFACE-002`, `RISK-GSDSURFACE-003`, `RISK-ULTRAPOWERS-010`, `RISK-VARIANT-003`,
  `RISK-VARIANT-004`, `RISK-VARIANT-005`.
- Touched: `RISK-VARIANT-001` (a switch deleting a hand-edited file). The purge deletes former
  bundle GSD files whatever their hash; the user chose automatic permanent removal.
- New: `RISK-GSDPURGE-001` — the `gsd-*` name patterns remove a user's own artefact that shares
  the prefix.
