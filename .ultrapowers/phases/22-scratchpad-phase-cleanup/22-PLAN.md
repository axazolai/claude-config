# Structured scratchpad and phase cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use ultrapowers:subagent-driven-development (recommended) or ultrapowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every temp file lands in `<project>/.claude/.scratchpad/` in a fixed layout, hooks enforce it, and `/scratch-prune` clears the project scratchpad and the harness temp dirs — after every phase and on demand on any machine.

**Architecture:** The existing `scratch-prune.mjs` engine grows layout-aware scans, `promote`, and a harness scan that reuses `claude-cleanup-lib`'s temp walker; `apply --purge-now` deletes harness items. Three hooks: a PreToolUse layout guard (all profiles), a SessionStart temp-env redirect + hints (all profiles), a PostToolUse phase-end nudge (base/full). The existing `scratch-prune` skill is extended in place. CLAUDE.md rule text rewritten.

**Tech Stack:** Node ESM, `node:test`, Claude Code hooks (`CLAUDE_ENV_FILE`, `hookSpecificOutput`).

**Spec:** `.ultrapowers/phases/22-scratchpad-phase-cleanup/22-SPEC.md`

## Global Constraints

- Testing mode: test-after; tags `@critical`/`@important`; run `node run-tests.mjs <files>`.
- Never Write/Edit under `~/.claude/`. No push, merge, plugin update or deploy inside Tasks 1–7.
- Layout: `.scratchpad/{phase-<NN>/{scripts,data,logs}, adhoc/<YYYY-MM-DD>-<topic>/, proc/, test-tmp/}`; nothing loose in the root; no `tmp/`. Reusable tools: `<project>/.claude/tools/` + `INDEX.md`.
- Thresholds: `adhoc/` older than 24 h; `proc/` older than 2 h; harness session dirs older than 24 h; the current session and every active session (live in `~/.claude/sessions/<pid>.json`) always excluded, whatever their age; harness dirs over 100 MB trigger the SessionStart hint.
- Project content goes to the trash (`~/.claude/.cleanup-trash/<ts>/`, 7 days); harness session dirs are deleted outright (`apply --purge-now`), refused outside the harness temp root.
- Harness temp root: `CLAUDE_CODE_TMPDIR` if set, else `os.tmpdir()`, plus `claude` on Windows, `claude-<uid>` on Unix.
- Script kinds: `.mjs .js .cjs .ts .py .ps1 .psm1 .sh .bat .cmd`; a directory holding one is `script`.
- Every hook: fail-open on unparsable input (exit 0, no output); symlink-safe `isMainModule()` copied from `payload/hooks/schedulewakeup-loop-only-nudge.mjs`.

## Review Focus

- A Windows path with mixed case or forward slashes into the harness scratchpad → still denied.
- A project whose `.claude/.scratchpad/` does not exist yet → guard allows creating `phase-NN/…`; temp-env hook creates `proc/`.
- `CLAUDE_CODE_TMPDIR` set to a path without trailing `claude` → guard and engine append `claude` exactly once.
- `apply --purge-now` with a plan item whose `absPath` is a symlink/junction pointing outside the harness root → refused.
- `promote` when `.claude/tools/INDEX.md` exists without a trailing newline → the new row starts on its own line.

---

### Task 1: Engine — layout scans, promote, harness scan, purge-now

**Files:**
- Modify: `payload/bin/lib/scratch-prune-lib.mjs`, `payload/bin/scratch-prune.mjs`
- Modify: `payload/bin/lib/claude-cleanup-lib.mjs` (extract the temp walker)
- Create: `payload/bin/lib/harness-temp.mjs`
- Test: `payload/bin/lib/scratch-prune-lib.test.mjs`, `payload/bin/scratch-prune.test.mjs`, `payload/bin/lib/harness-temp.test.mjs`

**Interfaces:**
- Produces:
  - `harnessTempRoot(env = process.env, platform = process.platform, tmpdir = os.tmpdir(), uid) → string`
  - `harnessSessionDirs({ tempRoot, slug?: string, excludeUuids: string[], olderThanMs: number, nowMs }) → Item[]` (used by `buildPlan`'s temp loop too, with its own bucket logic on top)
  - `scanLayout({ scratchpad, mode: "phase"|"adhoc"|"proc"|"legacy", phase?: string, olderHours?: number, nowMs }) → { items: Item[], totals }`, `Item` = existing shape + `kind: "script"|"data"`
  - `promote({ project, src, name, purpose, usage, origin, nowMs }) → { dest }` (throws on existing dest)
  - CLI: `scan --scratchpad <p> --phase <NN> | --adhoc --older-hours 24 | --proc --older-hours 2 | --legacy`; `scan --harness <slug> | --harness-all` with `--current <uuid> --older-hours 24`; `promote …`; `apply --plan <f> [--purge-now]`.

**Acceptance:**
- `@important` each `scanLayout` mode lists exactly its set; `test-tmp/` and `.cleanup-done` are never listed; `kind` classified.
- `@important` harness scan: this slug's session dirs minus current and fresh; `--harness-all` spans slugs; never lists a non-UUID dir.
- `@critical` `apply` refuses items outside `<scratchpad>` (trash mode) and, with `--purge-now`, items outside the harness root, including a junction/symlink resolving outside it.
- `@critical` `promote` moves, never overwrites, appends one `INDEX.md` row on its own line, creates the header first time.
- `@important` `/claude-cleanup`'s `buildPlan` temp results unchanged (its existing tests pass).

- [ ] **Step 1: Implement**

```js
// harness-temp.mjs
import { tmpdir as osTmpdir } from "node:os";
import { join, basename } from "node:path";
export function harnessTempRoot(env = process.env, platform = process.platform, tmp = osTmpdir(), uid = process.getuid?.()) {
  const base = env.CLAUDE_CODE_TMPDIR || tmp;
  const leaf = platform === "win32" ? "claude" : `claude-${uid}`;
  return basename(base).toLowerCase() === leaf.toLowerCase() ? base : join(base, leaf);
}
```

`harnessSessionDirs` moves the `<tempRoot>/<slug>/<uuid>/` loop out of `buildPlan` (same `UUID_RE`, `newestMtime`, `dirSize`), filtered by `slug`, `excludeUuids` and `nowMs - mtime >= olderThanMs`; `buildPlan` calls it with `olderThanMs: 0` and keeps its bucket split.

`apply` guard: trash mode — every `absPath` `realpathSync`-resolves under `realpathSync(scratchpad)`; `--purge-now` — under `realpathSync(harnessTempRoot())`; then `rmSync(p, { recursive: true, force: true })` per listed item.

`promote`: `renameSync(src, join(project, ".claude/tools", name))` after `existsSync` check; `INDEX.md` header `| tool | purpose | usage | origin |\n|---|---|---|---|\n`.

- [ ] **Step 2: Reconcile** — spec § 4 gains "harness scans reuse `claude-cleanup-lib`'s temp walker".
- [ ] **Step 3: Write the acceptance tests** — temp trees under `os.tmpdir()` (redirected by `run-tests.mjs`); harness root injected via `CLAUDE_CODE_TMPDIR`.
- [ ] **Step 4: Run** — `node run-tests.mjs payload/bin/scratch-prune.test.mjs payload/bin/lib/scratch-prune-lib.test.mjs payload/bin/lib/harness-temp.test.mjs payload/bin/lib/claude-cleanup-lib.test.mjs` → PASS
- [ ] **Step 5: Commit** — `feat(scratch): layout-aware scans, promote, harness scan and purge`

---

### Task 2: `scratchpad-layout-guard.mjs` (all profiles)

**Files:**
- Create: `payload/hooks/scratchpad-layout-guard.mjs`, `payload/hooks/scratchpad-layout-guard.test.mjs`
- Modify: `settings.partial.json` (PreToolUse entry, matcher `Write|Edit|MultiEdit|NotebookEdit|Bash|PowerShell`; insert textually, keep file formatting)

**Interfaces:**
- Consumes: `harnessTempRoot` (Task 1).
- Produces: `decide({ toolName, toolInput, projectRoot, env, today, currentPhase }) → string | null` (deny reason).

**Acceptance:**
- `@critical` deny: file path under `<harness>/<slug>/<uuid>/scratchpad/`; a file directly in `.scratchpad/`; under `.scratchpad/tmp/`; under a top-level folder outside `phase-<NN>|adhoc|proc|test-tmp`.
- `@critical` allow: `phase-22/scripts/x.mjs`, `adhoc/2026-09-27-probe/a.txt`, `proc/x`, a path outside `.scratchpad/` entirely.
- `@important` Bash/PowerShell command containing the harness scratchpad path (either slash direction, any case on Windows) → deny; other commands → no output.
- `@important` reason names `phase-<NN>/scripts/` when `.ultrapowers/ROADMAP.md` has `current: "<NN>"`, else `adhoc/<today>-<topic>/`.
- `CLAUDE_CODE_TMPDIR` moves the guarded root.

- [ ] **Step 1: Implement** — `decide` normalises paths (`resolve`, backslash→slash, lower-case on win32); current phase read from ROADMAP frontmatter `current:`; output `{ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason } }`.
- [ ] **Step 2: Reconcile**
- [ ] **Step 3: Write the acceptance tests** — `decide` directly plus one spawned run.
- [ ] **Step 4: Run** — `node run-tests.mjs payload/hooks/scratchpad-layout-guard.test.mjs` → PASS
- [ ] **Step 5: Commit** — `feat(hooks): scratchpad layout guard`

---

### Task 3: `scratchpad-temp-env.mjs` — SessionStart (all profiles)

**Files:**
- Create: `payload/hooks/scratchpad-temp-env.mjs`, `payload/hooks/scratchpad-temp-env.test.mjs`
- Modify: `settings.partial.json` (append to the existing `SessionStart` hooks array)

**Interfaces:**
- Consumes: `harnessTempRoot`, `harnessSessionDirs` (Task 1), `scanLayout(mode: "legacy")`.
- Produces: `envLines(procDir) → string` and `hints({ scratchpad, harnessBytes }) → string[]`.

**Acceptance:**
- `@important` with `CLAUDE_ENV_FILE`: appends three `export TEMP|TMP|TMPDIR="<project>/.claude/.scratchpad/proc"` lines (forward slashes), creates `proc/`, and makes sure `.claude/.gitignore` or the root `.gitignore` covers `.claude/.scratchpad/`.
- `@important` no `CLAUDE_ENV_FILE`, or project root equal to the home dir → nothing written.
- `@important` target path over 200 characters → no redirect, a one-line warning in `additionalContext`.
- `@important` legacy content or this project's harness dirs (minus current) over 100 MB → `additionalContext` "Run /scratch-prune: <reason>"; clean project → no context.

- [ ] **Step 1: Implement** — project root `CLAUDE_PROJECT_DIR` else stdin `cwd`; project slug = the harness convention (path with `:`, `\`, `/` replaced by `-`), cross-checked against the existing `…\claude\<slug>` naming.
- [ ] **Step 2: Reconcile**
- [ ] **Step 3: Write the acceptance tests**
- [ ] **Step 4: Run** — `node run-tests.mjs payload/hooks/scratchpad-temp-env.test.mjs` → PASS
- [ ] **Step 5: Commit** — `feat(hooks): redirect process temp into the project scratchpad`

---

### Task 4: `phase-end-cleanup-nudge.mjs` — PostToolUse (base/full)

**Files:**
- Create: `payload/hooks/phase-end-cleanup-nudge.mjs`, `payload/hooks/phase-end-cleanup-nudge.test.mjs`
- Modify: `settings.partial.json` (PostToolUse, matcher `Write|Edit|MultiEdit`); `variants.json` `lite.exclude` += `"hooks/phase-end-cleanup-nudge*"`

**Acceptance:**
- `@important` a write of `.ultrapowers/phases/22-x/22-SUMMARY.md` with ultrapowers enabled → `additionalContext` naming phase 22 and `/scratch-prune phase 22`; records `22` in `.claude/.scratchpad/.cleanup-done`.
- `@important` same phase again → silent; ultrapowers disabled → silent; another file → silent.
- `@important` enabled-check order: project `.claude/settings.json`, then `.claude/settings.local.json`, then user `settings.json` (`CLAUDE_CONFIG_DIR` aware).
- lite resolves without the hook file.

- [ ] Steps 1–5 as above; commit `feat(hooks): phase-end scratchpad cleanup nudge`.

---

### Task 4b: `background-sleep-guard.mjs` (all profiles)

**Files:**
- Create: `payload/hooks/background-sleep-guard.mjs`, `payload/hooks/background-sleep-guard.test.mjs`
- Modify: `settings.partial.json` (PreToolUse, matcher `Bash|PowerShell`)

**Acceptance:** spec § 3.4 and its `@critical` test line.

- [ ] **Step 1: Implement**

```js
const WAIT_ONLY = /^\s*(sleep\s+\d+[smhd]?|start-sleep\b[^;&|]*|timeout(\s+\/t)?\s+\d+)(\s*(&&|;)\s*echo\b[^;&|]*)?\s*$/i;
export function decide(toolInput) {
  if (!toolInput || toolInput.run_in_background !== true) return null;
  return WAIT_ONLY.test(String(toolInput.command || "")) ? "background-sleep-guard: a background wait does no work: dispatched subagents and background tasks re-invoke you with a completion notification. End the turn instead." : null;
}
```

Deny via `hookSpecificOutput.permissionDecision: "deny"`; `isMainModule()` as in the other hooks.
- [ ] Step 2 reconcile · Step 3 tests · Step 4 `node run-tests.mjs payload/hooks/background-sleep-guard.test.mjs` · Step 5 commit `feat(hooks): deny background sleep-only waits`.

---

### Task 5: Extend the `scratch-prune` skill

**Files:**
- Modify: `payload/skills/scratch-prune/SKILL.md` (rewritten to spec § 5, same `name`), `payload/commands/claude-cleanup.md` (plan file moves from the session scratchpad to `<project>/.claude/.scratchpad/adhoc/<today>-claude-cleanup/plan.json`)

**Acceptance:**
- The skill's steps match spec § 5: modes (default, `phase <NN>`, `--all-harness`), current session id from the harness scratchpad path, plan file under `adhoc/<today>-scratch-prune/`, reuse judgement wording, trash vs `--purge-now`, one question only for `--all-harness`, final table with `restore` command.
- `scratch-prune/SKILL.md` keeps `name: scratch-prune` and drops `disable-model-invocation`; its description names the new modes; `allowed-tools` still limits it to `Bash(node *)` and `AskUserQuestion`.
- No file in `payload/` still tells the model to write to "the session scratchpad named in your environment" (`grep -rn "session scratchpad" payload` finds only the rule that forbids it).

- [ ] Steps: implement · reconcile · verify with the grep above · commit `feat(skills): scratch-prune covers the layout, phases and harness temp`.

---

### Task 6: Rule text

**Files:**
- Modify: `payload/claude-md/07-conventions.md` (all profiles)
- Create: `payload/claude-md/13-phase-cleanup.md` (`profiles: [base, full]`)
- Test: `payload/bin/lib/assemble-claude-md.test.mjs`

**Acceptance:**
- `@important` every profile's assembled CLAUDE.md has the layout bullet and the tools-index bullet from spec § 2 and no `.scratchpad/tmp/` wording; base and full have the phase-cleanup bullet, lite does not.

- [ ] **Step 1: Implement** — replace the two-tier temp bullet and the "At a completion boundary…" bullet in `07-conventions.md` with spec § 2's two all-profile bullets verbatim; put spec § 2's base/full bullet in `13-phase-cleanup.md` under a `## SCRATCHPAD CLEANUP` heading.
- [ ] Steps 2–5; commit `feat(claude-md): scratchpad layout and phase cleanup rules`.

---

### Task 7: Docs and full suite

**Files:** `README.md`, `README.en.md` (layout, three hooks, `/scratch-prune` modes, other machines), `.claude/CLAUDE.md` (`test-tmp/` is part of the layout — one line).

- [ ] Docs · `node run-tests.mjs` full suite, report the count · commit `docs: structured scratchpad and cleanup`.

---

### Task 8: After deploy (executor: the main session, with the user)

Not part of the branch. After merge, push, `node setup.mjs --replace-all` and a Claude Code restart:

- [ ] Bash: `echo "$TEMP"` → `<project>/.claude/.scratchpad/proc`. PowerShell tool: `$env:TEMP` → record whether it sources `CLAUDE_ENV_FILE`; write the result into spec § 3.2.
- [ ] Guard live check: a Write into the harness scratchpad is denied.
- [ ] One-time: `/scratch-prune --all-harness` in claude-config — this project's legacy content, then the harness table for all projects, one confirmation.
