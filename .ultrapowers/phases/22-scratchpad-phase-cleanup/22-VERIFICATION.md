# Phase 22 — Verification

Range verified: `3c97019..7dbfc9a` on `feat/scratchpad-cleanup` (19 commits). Checked against the
code at `7dbfc9a` and the diff, not against task reports or the SDD ledger. Task 8 (after deploy)
is out of scope by design.

Test runs made for this verification (2026-09-27):
- Phase files: `node run-tests.mjs` over the 9 touched test files — 85/85 pass.
- Full suite: `node run-tests.mjs` — 486/486 pass, 0 skipped.

## Goal

> Every temp file lands in `<project>/.claude/.scratchpad/` in a fixed layout, hooks enforce it,
> and `/scratch-prune` clears the project scratchpad and the harness temp dirs — after every
> phase and on demand on any machine.

**Verdict: ACHIEVED** (in the branch; live harness behaviour is Task 8's to confirm, see Gaps).

## Evidence

### 1. The fixed layout is real

- Engine: `payload/bin/lib/scratch-prune-lib.mjs` — `PHASE_SUBDIRS = {scripts,data,logs}`,
  `PHASE_RE = /^phase-\d{2,}$/`, `LAYOUT = {adhoc, proc, test-tmp}`, `MARKERS = {.cleanup-done}`.
  `candidates()` implements the four modes: `phase` walks `phase-<NN>/{scripts,data,logs}/*`
  (and anything else loose in `phase-<NN>/`); `adhoc`/`proc` list their children; `legacy` lists
  every loose root file (except `.cleanup-done`), every entry of `tmp/`, and every top-level folder
  outside the layout. `test-tmp/` is never listed in any mode.
  Test: `@important scanLayout: each mode lists exactly its set, never test-tmp/ or .cleanup-done, kind classified`.
- Rule text: `payload/claude-md/07-conventions.md` carries spec § 2's two all-profile bullets
  verbatim (layout `phase-<NN>/{scripts,data,logs}/` else `adhoc/<YYYY-MM-DD>-<topic>/`, never the
  harness session scratchpad, "Hooks enforce this"; read `.claude/tools/INDEX.md` before writing a
  helper). The two-tier `tmp/` bullet and the "At a completion boundary…" bullet are removed.
  Tests: `@important real fragments: every profile has the scratchpad layout bullet and the tools-index bullet`,
  `@important real fragments: no profile still carries the old .scratchpad/tmp/ wording`.
- `proc/` is created by `scratchpad-temp-env.mjs`; `test-tmp/` is named as a layout folder in
  `.claude/CLAUDE.md` (project doc line added in the diff).
- Reusable tools: `promote()` in `scratch-prune-lib.mjs` moves into `<project>/.claude/tools/<name>`
  and appends to `INDEX.md` (header on first use).

### 2. Hooks enforce it

All four hook files exist under `payload/hooks/` and are wired in `settings.partial.json`:

| Hook | Event | Matcher | Profiles |
|---|---|---|---|
| `scratchpad-layout-guard.mjs` | PreToolUse | `Write\|Edit\|MultiEdit\|NotebookEdit\|Bash\|PowerShell` | all |
| `background-sleep-guard.mjs` | PreToolUse | `Bash\|PowerShell` | all |
| `phase-end-cleanup-nudge.mjs` | PostToolUse | `Write\|Edit\|MultiEdit` | base/full (`variants.json` `lite.exclude` += `hooks/phase-end-cleanup-nudge*`) |
| `scratchpad-temp-env.mjs` | SessionStart (appended to the existing array) | — | all |

Deny/redirect logic, read from the code:
- `scratchpad-layout-guard.mjs` `decide()`: write tools — path `resolve`d against the project
  root, backslash→slash, lower-cased on win32 (`foldPath`); denies `<harnessRoot>/<slug>/<uuid>/scratchpad/…`
  (`rel[2] === "scratchpad"`); denies anything under `.claude/.scratchpad/` whose first segment is
  not `phase-\d{2,}`/`adhoc`/`proc`/`test-tmp` or that sits directly in the root (covers `tmp/`,
  loose files, unknown folders). Bash/PowerShell — command and harness root both slash-normalised
  and case-folded on win32, regex `<root>/<seg>/<seg>/scratchpad` → deny. Deny reason points at
  `phase-<NN>/scripts/` from ROADMAP frontmatter `current:`, else `adhoc/<today>-<topic>/`.
  Output shape `hookSpecificOutput.permissionDecision: "deny"`. Project root:
  `CLAUDE_PROJECT_DIR` over stdin `cwd`.
  Tests: the four `@critical denies …` tests, `@critical allows the recognised layout folders…`,
  `@important a Bash/PowerShell command naming the harness scratchpad is denied…` (both slash
  directions and upper-case), `@important the deny reason names phase-<NN>/scripts/…`,
  `@important CLAUDE_CODE_TMPDIR moves the guarded harness root`, spawned-run tests.
- `scratchpad-temp-env.mjs`: with `CLAUDE_ENV_FILE` and a non-home root, creates
  `.claude/.scratchpad/proc/`, appends `export TEMP|TMP|TMPDIR="<proc>"` (forward slashes), pins
  `CLAUDE_CODE_TMPDIR` to the real harness root when not already set (so the engine, run from a
  redirected Bash, still finds the real harness root), and ensures `.gitignore` coverage (root
  `.claude/.scratchpad/` or `.claude/.gitignore` `.scratchpad/`). Path over 200 chars → no redirect,
  one-line warning. Tests: the `@important with CLAUDE_ENV_FILE…`, `no CLAUDE_ENV_FILE`,
  `home dir`, `over 200 characters` tests.
- `background-sleep-guard.mjs`: `WAIT_ONLY` regex exactly as the plan's code; denies only when
  `run_in_background === true`. Tests: three `@critical` deny tests plus foreground / real-command
  / chained-before-work pass tests.

### 3. `/scratch-prune` clears the project scratchpad and the harness temp dirs

- Skill `payload/skills/scratch-prune/SKILL.md`: three modes (bare, `phase <NN>`, `--all-harness`);
  steps scan legacy/adhoc/proc(/phase), sort `data`/`script` with the reuse judgement, `promote`
  reusable scripts, `apply` the project plan to the trash, scan the harness (`--harness <slug>` or
  `--harness-all`, `--current <session-uuid>` derived from the harness scratchpad path), one
  `AskUserQuestion` only for other slugs under `--all-harness`, `apply --purge-now`,
  `purge-retention`, remove the plan file, final table with the `restore --ts` command. Plan file
  at `<scratchpad>/adhoc/<today>-scratch-prune/plan.json`.
- Engine `payload/bin/scratch-prune.mjs`: `scan --harness <slug>|--harness-all` over
  `harnessSessionDirs()` (moved into `claude-cleanup-lib.mjs` and reused by `buildPlan`'s temp
  loop), default `--older-hours 2`, `--current` excluded; `apply --purge-now` checks every item via
  `outsideRoot(items, harnessTempRoot(), 2, UUID_RE)` on real paths, then `rmSync`s with an mtime
  drift skip; trash-mode `apply` requires a scratchpad named `.scratchpad` and real paths strictly
  inside it. Tests: `@important scan --harness: this slug's sessions minus --current and fresh; --harness-all spans slugs`,
  `@critical apply --purge-now: deletes harness session dirs and refuses anything else, junction included`,
  `@critical apply: trash mode … refuses any item outside <scratchpad>, junction included`,
  `@critical buildPlan: temp dir respects excludeUuids` and the other unchanged `buildPlan` tests.

### 4. After every phase

`phase-end-cleanup-nudge.mjs`: `SUMMARY_RE = /^\.ultrapowers\/phases\/(\d+)-[^/]+\/(\d+)-SUMMARY\.md$/`
(both NN equal) on the path relative to the project root; enabled-check cascade project
`settings.json` → `settings.local.json` → `CLAUDE_CONFIG_DIR`/user `settings.json`, first file
carrying the key wins; once per phase via `.claude/.scratchpad/.cleanup-done`; emits PostToolUse
`additionalContext` "Phase NN closed: run the scratch-prune skill for phase NN now … (/scratch-prune phase NN)".
Rule backing it: `payload/claude-md/13-phase-cleanup.md` (`profiles: [base, full]`).
Tests: `@important a spawned run on a matching write with ultrapowers enabled nudges phase 22 and records it`,
`@important the same phase again is silent; …`, `@important enabled-check cascades …`,
`@important real fragments: base and full carry the SCRATCHPAD CLEANUP phase-cleanup bullet; lite does not`.

### 5. On demand

`SKILL.md` frontmatter: `name: scratch-prune`, no `disable-model-invocation` (dropped vs the
deployed copy, which still has `disable-model-invocation: true` — expected before deploy),
`allowed-tools: Bash(node *), AskUserQuestion`. Description names all three modes.
`grep -rn "session scratchpad" payload` finds only the forbidding rule, the claude-cleanup
"Never the harness session scratchpad" line, and the guard's own text/tests.

### 6. On any machine

- `resolveVariant` (checked for lite/base/full): all three profiles ship
  `hooks/scratchpad-layout-guard.mjs`, `hooks/scratchpad-temp-env.mjs`,
  `hooks/background-sleep-guard.mjs`, `hooks/lib/phase-segment.mjs`, `bin/scratch-prune.mjs`,
  `bin/lib/{harness-temp,scratch-prune-lib,claude-cleanup-lib}.mjs`, `skills/scratch-prune/SKILL.md`;
  base/full also ship `hooks/phase-end-cleanup-nudge.mjs`. Test:
  `@important lite resolves without the phase-end cleanup nudge hook; base and full ship it`.
- `setup.mjs` settings merge collects hook basenames from `settings.partial.json` and re-adds
  entries through `filterPartialHooks(partial.hooks, variantBasenames)`, so lite gets no entry
  for the excluded nudge; the new entries need no hand-sync in `setup.mjs`.
- Each machine reports its own state: `scratchpad-temp-env.mjs` computes `harnessTempRoot(process.env)`
  and the project slug (`slugify(root)`) locally and emits "Run /scratch-prune: …" for legacy
  content or >100 MB of this project's harness dirs (current session excluded). Tests:
  `@important hints: …` (three), `@important a spawned run surfaces a scratch-prune hint…`,
  `@important the current session's own harness dir is excluded from the 100MB hint…`.
- Docs: `README.md` / `README.en.md` describe the layout, hooks, modes and other machines.

## Global constraints

- Testing mode test-after, `@critical`/`@important` tags, `node run-tests.mjs <files>` — met: every new test carries a tier tag except `case-insensitive match`, `missing toolInput or command passes` (untagged, prune candidates) and one `@temp` (`slugify`); phase files 85/85, full suite 486/486.
- Never Write/Edit under `~/.claude/`; no push, merge, plugin update or deploy in Tasks 1–7 — met: no `~/.claude` path in the diff; branch has no remote-tracking ref containing `7dbfc9a`, not merged into `master`; `~/.claude/bin/lib/harness-temp.mjs` and the new hooks are absent from `~/.claude`, deployed `SKILL.md` is the old one.
- Layout `phase-<NN>/{scripts,data,logs}`, `adhoc/<date>-<topic>/`, `proc/`, `test-tmp/`, nothing loose, no `tmp/`; tools in `.claude/tools/` + `INDEX.md` — met (engine sets, guard allow-list, rule text, `promote`). The only sanctioned root file is the nudge's `.cleanup-done` marker, excluded from scans. The guard checks only the top-level folder, so `adhoc/loose.txt` (no `<date>-<topic>` folder) is allowed; the plan's deny list does not ask for more.
- Thresholds adhoc 24 h, proc 2 h, harness 2 h, current session excluded, >100 MB hint — met: CLI defaults `hours(mode === "adhoc" ? 24 : 2)` and `hours(2)` for harness; `--current` → `excludeUuids`; SessionStart excludes `session_id`; `HUNDRED_MB` in `scratchpad-temp-env.mjs`.
- Project content to the trash (7 days); harness dirs deleted outright, refused outside the harness root — met: trash `apply` → `applyPlan` + `purge-retention`; `--purge-now` → `outsideRoot(..., 2, UUID_RE)` then `rmSync`. Rare partial-failure data loss in the EXDEV fallback is logged as RISK-CLEANUP-002 (see Gaps).
- Harness temp root rule — met: `harnessTempRoot()` in `payload/bin/lib/harness-temp.mjs` matches the plan's code; used by the guard, the temp-env hook and the engine.
- Script kinds `.mjs .js .cjs .ts .py .ps1 .psm1 .sh .bat .cmd`, a directory holding one is `script` — met: `SCRIPT_EXTS` + recursive `holdsScript()`.
- Every hook fail-open, symlink-safe `isMainModule()` copied from `schedulewakeup-loop-only-nudge.mjs` — met: all four hooks return on JSON parse failure, wrap `main()` in try/catch, exit 0; `isMainModule()` is byte-identical to the reference. Tested by an `unparsable/malformed input exits 0 with no output` test per hook.
- Review focus: Windows path with mixed case / forward slashes into the harness scratchpad → denied — met: `foldPath` for write tools, slash-normalise + lower-case for commands; tested for Bash/PowerShell (flipped slashes, upper case); for Write, confirmed by probing `decide()` with `c:/_TEMP/Claude/Some-Slug/…/Scratchpad/a.txt` (denied). No committed Write-tool mixed-case test.
- Review focus: project with no `.scratchpad/` yet → guard allows `phase-NN/…`, temp-env creates `proc/` — met: the guard is pure path logic with no filesystem checks (probe against a non-existent project root returned `null`); `mkdirSync(procDir, { recursive: true })`.
- Review focus: `CLAUDE_CODE_TMPDIR` without trailing `claude` gets it appended exactly once — met: `basename(base)` compare before `join`; probed idempotent (feeding the result back returns it unchanged); the committed test covers the default append and the already-`claude` case.
- Review focus: `apply --purge-now` with a symlink/junction resolving outside the harness root → refused — met: `real()` on both root and item, `relative` must not escape; tested (`… junction included`).
- Review focus: `promote` into an `INDEX.md` without a trailing newline starts the row on its own line — met: `prev.endsWith("\n") ? "" : "\n"`; tested (`@critical promote: appends the row on its own line…`).

## Gaps

- Minor divergence from spec § 5: the skill (step 2) skips the harness steps too when the project
  has no `.claude/.scratchpad/` (engine exit 3), so `/scratch-prune --all-harness` in such a
  project clears no harness dirs. The spec lists harness cleanup unconditionally in every mode.
  Impact is small because `scratchpad-temp-env.mjs` creates `.scratchpad/proc/` at every session
  start where `CLAUDE_ENV_FILE` is set.
- RISK-CLEANUP-002 (partial cross-device trash move can lose already-copied children) is not
  counted as a gap. The defect predates phase 22, the plan's constraints do not promise
  failure-path handling for filesystem errors mid-move, and it is recorded with a stable ID in
  `.ultrapowers/RISK_REGISTER.md`. It does matter more now that phase-end cleanup runs without a
  question, so it should be fixed soon.
- unverifiable: Claude Code applies `CLAUDE_ENV_FILE` exports to the Bash tool, and whether the PowerShell tool sources it — settled by Task 8's `echo "$TEMP"` / `$env:TEMP` checks after deploy.
- unverifiable: the live harness honours the guard's PreToolUse deny and the nudge's PostToolUse `additionalContext` — settled by Task 8's live Write-into-harness check and by closing a phase after deploy.
- unverifiable: `slugify()` matches the harness's slug on non-Windows paths, and the harness root is `claude-<uid>` on Unix — only checked on this Windows machine (`@temp slugify matches the real harness leaf…`); settled by a SessionStart run on a Linux/macOS machine, comparing against the real `$TMPDIR/claude-<uid>/<slug>/` directory.
