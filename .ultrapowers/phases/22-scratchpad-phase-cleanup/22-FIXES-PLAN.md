# Phases 21–22 pre-deploy fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use ultrapowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close the user's five pre-deploy decisions (2026-09-27) and every deferred minor and out-of-spec item from the phase 21 and 22 final reviews, before both phases are merged and deployed.

**Architecture:** Fixes in place on `feat/scratchpad-cleanup` (which carries phase 21 too). Each task amends the owning spec (`21-SPEC.md` or `22-SPEC.md`) first, then code, then tests.

**Tech Stack:** Node ESM, `node:test`.

**Specs:** `.ultrapowers/phases/21-model-policy/21-SPEC.md`, `.ultrapowers/phases/22-scratchpad-phase-cleanup/22-SPEC.md`

## Global Constraints

- Testing mode test-after; tags `@critical`/`@important`; `node run-tests.mjs <files>`, full suite `node run-tests.mjs`.
- Never Write/Edit under `~/.claude/`; `node setup.mjs` only with `--dry-run`. No push, merge, plugin update, deploy.
- Temp files only under `.claude/.scratchpad/phase-22/{scripts,data,logs}/`. Never `sleep`/poll to wait.
- User decisions (binding):
  1. Cross-device trash move = copy everything, verify, then delete the source.
  2. Another session's harness dir is never touched while that session is active; an inactive one is eligible after 24 h (was 2 h). `proc/` keeps 2 h.
  3. `promote --src` only from the project scratchpad.
  4. Unparsable `settings.json` / `.claude.json` never overwritten anywhere in `setup.mjs`.
  5. `verification-before-completion`: no self-verification only on Opus 5.5 and newer; any other model checks the result against the spec/plan before claiming done.
- Active session = a `~/.claude/sessions/<pid>.json` (`CLAUDE_CONFIG_DIR`-aware) whose `sessionId` matches and whose `pid` is alive (`process.kill(pid, 0)` succeeds or throws `EPERM`). Registry dir missing or unparsable → every other session counts as active for this run (fail safe), reported in the output.

## Review Focus

- A PID reused by an unrelated process keeps a dead session "active" → acceptable (errs toward keeping).
- Copy phase fails half-way → source untouched, partial destination removed, item reported as skipped, no manifest entry for it.
- `promote --src` through a junction/symlink that resolves outside the scratchpad → refused.
- `settings.json` with a UTF-8 BOM → parsed (BOM stripped), not treated as invalid.

---

### Task 1: Copy-then-delete trash move (decision 1; closes RISK-CLEANUP-002)

**Files:** `payload/bin/lib/claude-cleanup-lib.mjs` (`moveInto`/`copyMoveNoFollow`/`applyPlan`), its test file; `.ultrapowers/RISK_REGISTER.md` (RISK-CLEANUP-002 → Closed with the fix commit).

**Acceptance:**
- `@critical` same-device: `renameSync` as today.
- `@critical` cross-device (`EXDEV`, injected): the whole item is copied (no-follow for links) into the batch; the copy is verified (file count and total bytes equal); only then the source is removed; manifest entry written after the source removal succeeds.
- `@critical` a copy failure part-way (injected `EPERM` on the Nth child): source fully intact, partial destination deleted, item reported `skipped`, no manifest entry, later `restore`/`purge-retention` unaffected.
- `@important` symlinks/junctions: `holdsScript`, `newestMtime`, `dirSize` no longer follow links (lstat walk) — the Task-1 deferred minor of phase 22.

### Task 2: Active-session protection and 24 h threshold (decision 2)

**Files:** `payload/bin/lib/harness-temp.mjs` (new `activeSessionIds({ configDir, isAlive })`), `payload/bin/lib/claude-cleanup-lib.mjs` (`harnessSessionDirs` excludes active ids), `payload/bin/scratch-prune.mjs` (default `--older-hours 24` for harness scans; `apply --purge-now` re-checks activity and age at apply time), `payload/hooks/scratchpad-temp-env.mjs` (hint sum excludes active sessions), `payload/skills/scratch-prune/SKILL.md`, `22-SPEC.md` §§ 4–6, `22-PLAN.md` constraint line.

**Acceptance:**
- `@critical` a session dir whose id is in the registry with a live pid is never listed, whatever its age, in `--harness` and `--harness-all`.
- `@critical` `apply --purge-now` skips an item that became active or fresh (< 24 h) since the scan.
- `@important` inactive sessions: listed only when older than 24 h; the current session never.
- `@important` registry dir missing/unparsable → no other session's dir listed, and the scan JSON carries `registry: "unavailable"`.
- `@important` an empty `--current` is rejected (exit 1).

### Task 3: `promote` restricted (decision 3) and engine CLI hardening

**Files:** `payload/bin/lib/scratch-prune-lib.mjs`, `payload/bin/scratch-prune.mjs`, tests.

**Acceptance:**
- `@critical` `promote --src` whose realpath is outside `<project>/.claude/.scratchpad/` → refused, nothing moved.
- `@important` `promote` is atomic: the index row is written first to a temp copy, then the move, then the index replaced; a failure leaves neither an orphan move nor a dangling row.
- `@important` `--origin` must match `phase \d+|adhoc|legacy`, else exit 1.
- `@important` `INDEX.md` date is the local date.
- `@important` more than one scan mode flag → exit 1 naming the conflict.

### Task 4: Unparsable JSON never overwritten in `setup.mjs` (decision 4)

**Files:** `setup.mjs` blocks: enabledPlugins (reconcile + write), MCP reconciliation (`.claude.json`), update-check opt-in, PowerShell-tool opt-in, session defaults (already fixed — reuse its helper). `setup-variants.e2e.test.mjs`.

**Acceptance:**
- `@critical` for each block: a sandbox `settings.json` holding invalid JSON is byte-identical after a `--replace-all` run; the output names the file and "not valid JSON — skipped".
- `@important` a BOM-prefixed valid `settings.json` is parsed and handled normally.
- `@important` an unparsable `.claude.json` → MCP step prints "cannot read .claude.json — MCP step skipped" and runs no `claude mcp` command.
- `@important` a failed `write(SETTINGS, …)` prints a warning line (phase 21 out-of-spec item).

### Task 5: Verification policy by model (decision 5)

**Files:** `payload/skills/verification-before-completion/SKILL.md` (+ `payload-lite/…` copy if present), `payload/claude-md/12-model-selection.md`, `12-model-selection.lite.md`, `payload/skills/model-selection-policy/SKILL.md` (+ lite copy), `README.md`/`README.en.md` lines that say "Opus 5 verifies its own work", `21-SPEC.md` § 1.

**Acceptance:**
- The skill's description and body: on Opus 5.5 or newer, no self-verification pass (current text); on any other model (Opus 5 and older, Sonnet, Haiku), before claiming work complete, check the result against the spec/plan's acceptance criteria — each stated criterion named with its evidence — instead of a generic "double-check".
- `@important` assembled CLAUDE.md (all profiles) says the no-scaffolding rule applies to Opus 5.5+ only.
- The re-added policy sentences dropped in phase 21: "do not carry effort values over between models"; "revisit any `max_tokens` sized for a no-thinking budget".

### Task 6: Phase 21 deferred minors

**Files:** `session-defaults.mjs`, `setup.mjs`, tests, `payload/skills/model-selection-policy/SKILL.md`.

- `@important` e2e: `--skip-all` writes nothing; interactive `n` writes absent keys only (simulate TTY via the existing test helper if present, else a unit seam on the decision function); planner unit test for `model` correct + `effortLevel` conflicting; e2e with `settings.json` absent entirely.
- `describeSessionChange` renders a non-string current value as JSON (`model: null -> sonnet`).
- Interactive run: the model-migration prompt and the session-defaults prompt are merged or ordered so one question covers `model` (no back-to-back prompts about the same key).
- Skill: rename the GSD sentence's heading so it cannot be read as the ultrapowers map; the skill `description` names the ultrapowers role map.

### Task 7: Phase 22 deferred minors and out-of-spec fixes

**Files:** the phase 22 hooks, engine, skill and their tests.

- Guard: tests for mixed-case/forward-slash `file_path` and for `CLAUDE_CODE_TMPDIR` without a trailing `claude`; shared test builder instead of repeated literals; spawned tests clear ambient `CLAUDE_PROJECT_DIR`. The read-deny of the harness scratchpad stays (spec intent) — write that sentence into spec § 3.1.
- Temp-env hook: a failure in the redirect block does not drop the hints; `hints()` doc says it does I/O; slug and harness-dir matching case-insensitive on win32; `.gitignore` coverage recognises `.claude/`, `.claude/*`, `.claude/.scratchpad/` with or without leading `/`; no duplicate export lines on a repeated SessionStart (skip when `CLAUDE_ENV_FILE` already holds them); exported values single-quoted with `'` escaped, so `$` and backticks are literal; the exported `CLAUDE_CODE_TMPDIR` is the base temp dir **without** the `claude` leaf (so a nested session appends exactly one); tests clean their temp dirs and pass a redirected `tmp` in the round-trip test.
- Nudge: cheap path filter before any file I/O; message names the phase once.
- Sleep guard: drop the duplicate `@important` `Start-Sleep` test.
- Skill: step 8 removes an empty `adhoc/`; `claude-cleanup.md` plan path refuses the home directory as project root; the "harness cleanup skipped" line names both sides.
- BUG-003 test name matches what it asserts; remove Task 3's back-dated fixture workaround.
- `harnessTempRoot` test asserts the no-trailing-`claude` case; the import-cycle comment states only what is true.
- A `.scratchpad` reached through a junction: trash `apply` compares realpaths of both sides instead of the basename.

### Task 8: Full suite and docs

- README sections touched by Tasks 2, 4, 5 updated (24 h, active sessions, verification by model).
- `node run-tests.mjs` full suite; report counts.
- Update `22-SUMMARY.md` / `21-SUMMARY.md` with a "Pre-deploy fixes" paragraph (commit range, what closed).

---

## Addendum (user decision 2026-09-27): the final review's four out-of-spec items

### Task 9: `.scratchpad` reached through a junction to another drive is supported

`scratch-prune.mjs` `apply()` (trash mode): accept an item when `realpath(item)` is under
`realpath(<project>/.claude/.scratchpad)` — both sides resolved — instead of any basename check on
the resolved path. A link inside the scratchpad that points outside it is still refused.

- `@critical` scratchpad itself a junction/symlink to another directory (temp tree; skip on
  platforms where the link cannot be created) → apply accepts its items.
- `@critical` an item that is a link inside the scratchpad pointing outside → refused.
- Spec 22 § 4 records the supported relocation.

### Task 10: e2e tests never touch the real home

Every spawn of `setup.mjs` in `setup-variants.e2e.test.mjs` (and any other test that runs it)
gets a sandbox `HOME`/`USERPROFILE` and a sandbox `.claude.json`, so no block — `autoUpdates`
included — can write to the real `~/.claude.json`.

- `@critical` a guard test: snapshot the real `~/.claude.json` mtime+size (if present) before the
  e2e file's tests and assert unchanged after (read-only check).
- The memory note "e2e sandbox covers the config dir, not HOME" becomes obsolete — say so in the
  task report; the main session updates the memory.

### Task 11: BOM-aware parsing everywhere in `setup.mjs`

The `autoUpdates` block and `--doctor` use the same BOM-stripping JSON reader Task 4 introduced.

- `@important` a BOM-prefixed valid `~/.claude.json`/`settings.json` (sandboxed) is parsed by both.

### Task 12: `--harness ""` rejected

`scratch-prune.mjs`: an empty `--harness` value exits 1 with a message, like empty `--current`.

- `@important` `scan --harness ""` → exit 1.

Run: targeted tests per task, then the full suite `node run-tests.mjs`; update 22-SUMMARY.md
"Pre-deploy fixes" with the addendum commits.
