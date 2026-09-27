# Phase 22 — Structured scratchpad, cleanup after every phase, no temp files outside the project

## Intent

Stated by the user (2026-09-27):

- Everything temporary is written to the project scratchpad and falls under the cleanup rules.
  Where an instruction does not hold, a hook enforces it.
- When ultrapowers is active, the scratchpad is cleaned after every phase, after its final
  review, without asking, with a report.
- A temporary file is deleted. A script or tool is judged for reuse; a reusable one moves to
  `<project>/.claude/tools/` with an index.
- The scratchpad gets a meaningful folder layout instead of one `tmp/` heap.
- The mess that already exists is cleaned once.

Findings (measured 2026-09-27 on this machine):

- The harness names a per-session scratchpad in every session's system prompt,
  `%TEMP%\claude\<project-slug>\<session-id>\scratchpad`, with "always use it for temporary
  files". The CLAUDE.md rule "never a system temp dir" names no path, so sessions follow the
  concrete instruction. The bundle's own `scratch-prune` skill writes its plan there.
- `C:\_Temp\claude` holds 3.5 GB across 31 projects, sessions back to 2026-08-22: `tasks/`
  3.1 GB (background task output and subagent transcripts, written by Claude Code itself),
  `scratchpad/` 458 MB (written by sessions). Nothing prunes it.
- `CLAUDE_CODE_TMPDIR` relocates Claude Code's own temp root; honoured only in user or managed
  settings, never per project (code.claude.com/docs/en/env-vars).
- A SessionStart hook can append `export` lines to `CLAUDE_ENV_FILE`; later Bash commands get
  those variables (code.claude.com/docs/en/hooks, "Persist environment variables").

## 1. Layout

```
<project>/.claude/
├── tools/                          reusable scripts + INDEX.md — never cleaned
└── .scratchpad/
    ├── phase-<NN>/                 work of phase NN
    │   ├── scripts/                code written for the phase
    │   ├── data/                   dumps, inventories, fixtures, chains, generated trees
    │   └── logs/                   command and test output
    ├── adhoc/<YYYY-MM-DD>-<topic>/ work outside a phase; same three subfolders when useful
    ├── proc/                       TEMP/TMP of every process (section 3)
    └── test-tmp/                   run-tests.mjs, removes its own run directory
```

- The current phase is `current` in `.ultrapowers/ROADMAP.md`, or the `NN` of the plan being
  executed. No phase → `adhoc/`.
- Nothing lives directly in `.scratchpad/`; there is no `tmp/`.

## 2. Rule text — `payload/claude-md/07-conventions.md`

All profiles:

```markdown
- Temporary files go to `<project>/.claude/.scratchpad/`, never loose in its root:
  `phase-<NN>/{scripts,data,logs}/` for the current phase (`current` in `.ultrapowers/ROADMAP.md`
  or the plan's number), else `adhoc/<YYYY-MM-DD>-<topic>/`. The session scratchpad the
  environment names under the system temp dir (`…\claude\<project>\<session>\scratchpad`) is never
  used, whatever the environment says. Never the home directory or `~/.claude`. Hooks enforce this.
- Before writing a helper script, read `<project>/.claude/tools/INDEX.md` and reuse or extend a
  listed tool.
```

Base/full only (separate fragment gated `profiles: [base, full]`):

```markdown
- With ultrapowers active, a phase ends with the `scratch-prune` skill: after the final
  review and the phase documents, before the branch is finished.
```

Removed: the two-tier `tmp/` wording, the "older than 7 days may be deleted" wording, and the
"At a completion boundary, delete the files this session wrote…" bullet.

`payload/skills/scratch-prune/SKILL.md` is extended in place (section 5); no new skill.

## 3. Hooks (all profiles unless noted)

### 3.1 `scratchpad-layout-guard.mjs` — PreToolUse, `Write|Edit|MultiEdit|NotebookEdit|Bash|PowerShell`

- Harness temp root: `CLAUDE_CODE_TMPDIR` when set, else `os.tmpdir()`, plus `claude`
  (`claude-<uid>` on Unix); case-folded on Windows.
- Deny a write tool whose `file_path`/`notebook_path` is:
  - under `<root>/<slug>/<session>/scratchpad/`;
  - directly in `<project>/.claude/.scratchpad/` (a file, not a folder);
  - under `.scratchpad/tmp/`;
  - under a `.scratchpad/` top-level folder other than `phase-<NN>`, `adhoc`, `proc`, `test-tmp`.
- Deny Bash/PowerShell whose command string names the harness scratchpad path (either slash
  direction). This denies a command that only *reads* from it too (`cat`, `Get-Content`, …), not
  just writes: the match is on the path string appearing anywhere in the command, regardless of
  what the command does with it — spec intent, not a write-only guard.
- The deny reason names the right target: `phase-<NN>/scripts/` etc. when a current phase is
  known, `adhoc/<today>-<topic>/` otherwise.
- Anything else → no output. Unparsable input → exit 0.

### 3.2 `scratchpad-temp-env.mjs` — SessionStart

Resolves the project root (`CLAUDE_PROJECT_DIR`, else `cwd`), creates `.claude/.scratchpad/proc/`
(and `.claude/.gitignore` coverage), appends to `CLAUDE_ENV_FILE`. Values are single-quoted with
`'` escaped (`'\''`), so a `$` or backtick in the path is never expanded by the shell that later
sources the file:

```sh
export TEMP='<project>/.claude/.scratchpad/proc'
export TMP='<project>/.claude/.scratchpad/proc'
export TMPDIR='<project>/.claude/.scratchpad/proc'
```

- When `CLAUDE_CODE_TMPDIR` is not already set ambiently, the hook also appends
  `export CLAUDE_CODE_TMPDIR='<base temp dir>'` — the base temp dir, without the
  `claude`/`claude-<uid>` leaf `harnessTempRoot()` itself appends, so a later `harnessTempRoot()`
  call (this session's own later Bash/PowerShell calls, or a nested session that inherits it)
  appends exactly one leaf instead of doubling it.
- A repeated `SessionStart` in the same `CLAUDE_ENV_FILE` appends nothing further once the file
  already holds the exact export lines this run would write.
- No `CLAUDE_ENV_FILE`, or a project root equal to the home directory → nothing written.
- A target path over 200 characters → no redirect, one-line warning.
- A failure inside the redirect (proc/ creation, the env-file append, `.gitignore` coverage)
  never drops the `/scratch-prune` hint below: the redirect is wrapped in its own best-effort
  guard, independent of the hint computation.
- `.gitignore` coverage recognises, case-sensitively, either the root `.gitignore` containing
  `.claude/`, `.claude/*`, or `.claude/.scratchpad/` (with or without a leading `/`), or
  `.claude/.gitignore` containing `.scratchpad/` or `.scratchpad/*` (with or without a leading
  `/`) — any of those already covers it, no new file is written.
- The plan's first task checks whether the PowerShell tool sources `CLAUDE_ENV_FILE`; if not,
  the gap is recorded here and the guard still covers the harness path.
- Verified 2026-09-27, Windows: Bash sources it (`$TEMP`/`$TMP`/`$TMPDIR` all resolve to
  `<project>/.claude/.scratchpad/proc`); the PowerShell tool does not (`$env:TEMP`/`$env:TMP`
  still show the ambient system value, `$env:TMPDIR` empty) — it starts its own shell without
  reading `CLAUDE_ENV_FILE`. The layout guard still denies writes into the harness scratchpad
  regardless of which tool issues them, so the gap is cosmetic (PowerShell temp files land in
  the system temp dir, not the project scratchpad) rather than a layout-enforcement hole.
- The hook also emits `additionalContext` "Run /scratch-prune: <reason>" when the project
  has legacy scratchpad content (files in the root, a `tmp/`, folders outside the layout) or its
  harness session dirs other than the current one and other active sessions (§ 4.2), counting
  only dirs whose newest file is older than 24 hours (the age `/scratch-prune` removes), exceed
  100 MB. An unavailable registry leaves every other session out of that sum.

### 3.3 `phase-end-cleanup-nudge.mjs` — PostToolUse, `Write|Edit|MultiEdit` (base/full)

- Fires on a write of `.ultrapowers/phases/<NN>-<slug>/<NN>-SUMMARY.md` while ultrapowers is
  enabled (`enabledPlugins["ultrapowers@ultrapowers"] === true` in the project's
  `.claude/settings.json`, else `.claude/settings.local.json`, else the user `settings.json`).
- `additionalContext`: "Phase closed: run the scratch-prune skill now, before finishing the
  branch. (/scratch-prune phase <NN>)" — the phase number appears once, in the actionable
  command.
- Once per phase: records `<NN>` in `.claude/.scratchpad/.cleanup-done`, silent for a recorded
  phase.
- The relative-path regex check runs before any settings/marker file is read, so a `Write` to a
  path that is not a phase's `<NN>-SUMMARY.md` never touches the filesystem beyond stdin.

### 3.4 `background-sleep-guard.mjs` — PreToolUse, `Bash|PowerShell` (all profiles)

Found 2026-09-27: a subagent waited for its own dispatches by starting `sleep 590 && echo done`
in the background every ~10 s — 34 of them, 70 bash processes, each also leaving a
`claude-*-cwd` file in the system temp dir.

- `tool_input.run_in_background === true` and the command does nothing but wait —
  `sleep N`, `Start-Sleep …`, `timeout N`, optionally followed by `&& echo …` / `; echo …` → deny:
  "A background wait does no work: dispatched subagents and background tasks re-invoke you with
  a completion notification. End the turn instead."
- Anything else (a real command, a foreground call, a wait chained before real work) → no
  output. Unparsable input → exit 0.

## 4. Engine — `payload/bin/scratch-prune.mjs`

Existing `apply`, `restore`, `purge-retention` stay (trash `~/.claude/.cleanup-trash/<ts>/`,
restorable 7 days). New and changed commands, all emitting the existing item JSON shape plus
`kind` (`script` for `.mjs .js .cjs .ts .py .ps1 .psm1 .sh .bat .cmd` files and directories
holding one, else `data`):

- `scan --phase <NN>`: every entry under `phase-<NN>/`.
- `scan --adhoc --older-hours 24`: `adhoc/` folders whose newest file is older than 24 hours.
- `scan --proc --older-hours 2`: `proc/` entries older than 2 hours (`proc/` keeps 2 h).
- `scan --legacy`: every file directly in `.scratchpad/`, every entry of `tmp/`, every top-level
  folder outside the layout — regardless of age.
- `scan --harness <slug> --current <session-id> [--older-hours 24]`: this project's session
  directories under the harness temp root, except the current one, every active session (§ 4.2)
  whatever its age, and inactive ones changed in the last 24 hours (the default).
- `scan --harness-all --current <session-id> [--older-hours 24]`: the same across every project
  slug.
- An empty `--current` value is rejected with exit 1. An empty `--harness` value — `--harness ""`,
  `--harness=`, or a bare `--harness` with no value or followed by another flag — is rejected
  with exit 1 and `--harness requires a non-empty project slug`. `--harness=<slug>` equals
  `--harness <slug>`.
- `--phase`, `--adhoc`, `--proc`, `--legacy`, `--harness`, `--harness-all` are mutually exclusive
  scan-mode flags. `scan` checks this first, before any harness/scratchpad branching: more than
  one present exits 1 naming every flag found (e.g. `conflicting scan modes: --adhoc, --proc`).
- Harness scan JSON: `{ tempRoot, registry, items, totals }`; `registry` is `"ok"` when the
  session registry was read, `"unavailable"` when it was missing or unparsable (then `items` is
  empty).
- Harness scans reuse `claude-cleanup-lib`'s temp walker (`harnessSessionDirs`), the one
  `/claude-cleanup`'s `buildPlan` runs.
- `apply --plan <f>` (trash): the scratchpad comes from `--scratchpad` or the plan's
  `scratchpad` field. Its last path component as given (not resolved) must be `.scratchpad`;
  otherwise `apply` exits 1. Every item that exists (`lstat` succeeds) must then have its
  realpath strictly inside the realpath of the scratchpad — both sides resolved — else `apply`
  exits 2 and moves nothing. An item that no longer exists is not checked and is counted as
  skipped. Supported relocation: `.scratchpad` itself may be a junction or symlink to another
  directory of any name (cross-drive follows the same realpath rule, not exercised by tests),
  and a `.scratchpad` reached through an ancestor junction passes the same way. A link inside
  the scratchpad that resolves outside it is refused.
- `apply --purge-now`: deletes the plan's items instead of moving them to the trash (harness
  dirs only; refuses any item that does not resolve to a `<slug>/<uuid>` dir inside the harness
  temp root, junctions and symlinks included). At apply time it re-reads the registry and skips an
  item whose uuid is active (every item when the registry is unavailable) or named by
  `--current`, whose newest mtime changed since the scan, or whose newest file is now younger
  than 24 h (`--older-hours` overrides). Skipped items are counted in `skipped`.
- `promote --src <path> --name <file> --purpose "<line>" --usage "<command>" --origin <phase NN|adhoc|legacy>`:
  moves one script into `.claude/tools/<name>`, refuses to overwrite, appends
  `| name | purpose | usage | origin, YYYY-MM-DD |` to `.claude/tools/INDEX.md` (created with its
  header on first use). `--origin` must match `phase \d+|adhoc|legacy`; the CLI checks this before
  calling `promote()` and exits 1 on a mismatch (every other `promote` failure exits 2, thrown from
  the pure function and caught by the CLI). The `YYYY-MM-DD` date is the local calendar date of
  `nowMs` (`Date`'s local getters — `getFullYear`/`getMonth`/`getDate`), never `toISOString`'s UTC
  date.
  - **Scratchpad boundary:** `promote()` refuses (throws, before any side effect — no `tools/`
    dir created, nothing written, nothing moved) unless both of these fall strictly inside the
    realpath of `<project>/.claude/.scratchpad`: `src`'s realpath (where it points), and
    `join(realpath(dirname(src)), basename(src))` (where `src` itself sits). A link inside the
    scratchpad pointing outside it, a link in a parent directory of `src`, and a link outside the
    scratchpad pointing into it are all refused.
  - **Atomic ordering:** once the boundary and name checks pass, `promote()` (1) builds the full
    new `INDEX.md` content (existing content, or the header for a first tool, plus the new row)
    and writes it to a temp file inside `.claude/tools/`, in the same directory as `INDEX.md` so
    the final replace is a same-device rename; (2) refuses if `dest` already exists, else moves
    `src` to `dest` with `renameSync`; (3) replaces `INDEX.md` with the temp file via `renameSync`.
    A failure at (1) leaves nothing written. A failure at (2) — including the refuse-if-exists
    check — deletes the orphaned temp file and leaves the source, destination and `INDEX.md`
    untouched. A failure at (3) (e.g. `INDEX.md` held open by another process) rolls step (2)
    back — `renameSync(dest, src)` moves the file back to its original location — then deletes
    the orphaned temp file, so no step ever leaves an orphan move or a dangling index row.

### 4.1 Trash move — `payload/bin/lib/claude-cleanup-lib.mjs` (`moveInto` / `copyMoveNoFollow`)

`apply` (trash) and `restore` both move an item with `moveInto`:

- Same device: one `renameSync`. Nothing else.
- Cross-device (`renameSync` throws `EXDEV`): `copyMoveNoFollow` runs three phases in order.
  1. Copy: walk the source with `lstat` and write the whole item to the destination. A symlink or
     junction is recreated as a link (a Windows directory link as a junction to its absolute
     target), never followed. The source is not touched.
  2. Verify: walk source and destination with `lstat`; the count of non-directory entries and the
     total bytes of regular files must be equal. Links count as entries with 0 bytes.
  3. Delete source: remove the source with an `lstat` walk that unlinks links and never enters them.
- Copy or verify fails: the partial destination is removed with the same no-follow walk, the source
  stays fully intact, the error propagates. `applyPlan` counts the item `skipped` and writes no
  manifest entry for it. Later `restore` and `purge-retention` never see it.
- Delete-source fails part-way (the destination holds a verified full copy): every entry the delete
  already removed is copied back from the destination into the source, the destination is removed,
  the error propagates. The item is `skipped`, no manifest entry, the source is whole again. If that
  copy-back also fails, the destination stays in the batch, `copyMoveNoFollow` returns normally and
  `applyPlan` records the item in the manifest, so the verified copy is tracked and kept for the
  retention period. The manifest entry carries `partial: true`, `applyPlan` returns it in
  `partials`, and both `apply` commands (`scratch-prune`, `claude-cleanup`) print a `WARNING:` line
  per partial item naming the original path and the copy's path in the batch. `restore` skips it
  while the source remnant exists (never clobber); recover it by hand from the batch slot.
- The manifest entry is written only after `moveInto` returns.

`newestMtime` and `dirSize` walk with `lstat`: a symlink or junction is a leaf dated and sized as the
link itself, never its target. `scratch-prune-lib`'s `holdsScript` walks the same way: a link is
classified by its own name and never entered.

### 4.2 Active sessions — `activeSessionIds` (`payload/bin/lib/claude-cleanup-lib.mjs`, re-exported from `harness-temp.mjs`)

Active session = a `~/.claude/sessions/<pid>.json` (`CLAUDE_CONFIG_DIR`-aware) whose `sessionId` matches and whose `pid` is alive (`process.kill(pid, 0)` succeeds or throws `EPERM`). Registry dir missing or unparsable → every other session counts as active for this run (fail safe), reported in the output.

- `activeSessionIds({ configDir, isAlive })` returns `{ available: true, ids: Set<sessionId> }`,
  or `{ available: false, ids: ∅ }` when `<configDir>/sessions/` cannot be read or any `*.json`
  in it fails to parse or lacks a positive integer `pid` and a string `sessionId`. Non-`.json`
  siblings (`<pid>.<hash>.key`) are skipped. `configDir` defaults to `CLAUDE_CONFIG_DIR` else
  `~/.claude`; `isAlive` defaults to the `process.kill(pid, 0)` probe. Both are injectable.
- It is defined in `claude-cleanup-lib.mjs` beside `harnessSessionDirs` and re-exported from
  `harness-temp.mjs` the same way `harnessSessionDirs` is, so the two modules import in one
  direction only.
- `harnessSessionDirs` takes `active` (default: `activeSessionIds()`), drops every active uuid
  before the age filter, and returns nothing when `active.available` is false. Every caller
  gets the protection: the harness scans, `/claude-cleanup`'s `buildPlan` (which passes
  `activeSessionIds({ configDir: dir })`), and the SessionStart hint sum (default).
- The unavailable case is reported: the harness scan JSON's `registry` field, and
  `/claude-cleanup scan`'s plan `registry` field (`"ok"` | `"unavailable"`) plus a
  `registry: unavailable …` line on stderr.
- `harnessSessionDirs`'s `slug` filter matches the on-disk directory name case-insensitively on
  win32 (case-sensitively elsewhere), the same reasoning `scratchpad-layout-guard.mjs`'s
  `foldPath` already applies to full paths: a project root's original case is not guaranteed to
  agree with whatever slug the harness itself used when it first created the session directory.

## 5. Skill — `payload/skills/scratch-prune/SKILL.md`, extended (all profiles)

The existing `/scratch-prune` skill (phase 16, `tmp/` only, user-invocable only) is extended in
place: same name, same engine, same trash. `disable-model-invocation` is dropped so the phase-end
nudge can call it. Shipped by `setup.mjs`, so every machine that runs the installer has it. The
harness scans reuse the temp walker `/claude-cleanup` already has.

Modes:

| Invocation | Cleans |
|---|---|
| `/scratch-prune` | this project: everything outside the layout (legacy), aged `adhoc/`, aged `proc/`, and this project's harness session dirs |
| `/scratch-prune phase <NN>` | the above plus `phase-<NN>/` (what the phase-end nudge runs) |
| `/scratch-prune --all-harness` | the default set plus every project's harness session dirs on this machine |

- The current session id comes from the harness scratchpad path the environment names
  (`…\claude\<slug>\<session-id>\scratchpad`); the skill passes it as `--current`. Every
  active session (§ 4.2) is excluded whatever its age, and anything changed in the last 24 hours
  as well. An unavailable registry lists no harness dir; the skill reports it and cleans nothing
  there. When a scan's reported `tempRoot` does not match the environment's own `<TEMP_ROOT>`,
  the harness part stops too — nothing there is deleted, and the report names both paths.
- Harness session dirs are deleted outright, not trashed: they hold Claude Code's task output
  for sessions that have ended, and a week in the trash would keep gigabytes on disk. The engine
  gets `apply --purge-now` for them.
- The plan file lives in `adhoc/<YYYY-MM-DD>-scratch-prune/plan.json` and is removed as the
  last step, along with its now-empty `<YYYY-MM-DD>-scratch-prune/` folder and, when that leaves
  `adhoc/` itself empty too, `adhoc/` as well (a no-op when `adhoc/` still holds other entries).
- Questions: none for this project's own content (trash, restorable 7 days) and this project's
  harness dirs; one yes/no for `--all-harness`, after a table of project slug, session count and
  size.

Steps:

1. Scan the sets of the chosen mode (engine section 4).
2. `data` items → the apply plan.
3. `script` items: read each and decide. Reusable = parameterised or general enough that later
   work in this project would run it again (a checker, a converter, a probe taking arguments).
   One-off = hard-coded to one phase's files, a single probe, a patch applier. Reusable →
   `promote`; one-off → the apply plan.
4. `apply` the project plan (trash), `apply --purge-now` the harness plan, then
   `purge-retention`.
5. Report one table: entry, kind, decision (trashed / promoted → `tools/<name>` / deleted), size;
   the trash batch id and the `restore` command.

## 6. One-time cleanup and other machines

- **This machine:** after phase 22 is deployed and Claude Code restarted, the executor runs
  `/scratch-prune --all-harness` in claude-config itself: this project's legacy content
  (`run1..9.txt`, `pass2.mjs`, `tmp/`, …) through the reuse judgement, and the harness dirs
  across every project after the one confirmation, minus every active session and anything
  changed in the last 24 hours.
- **Other projects on this machine:** their harness dirs go in that sweep; their own
  `.claude/.scratchpad` is migrated by `/scratch-prune` in a session there. The
  SessionStart hook reports a legacy layout in each project until then.
- **Other machines:** `node setup.mjs` installs the skill, the engine and the hooks. The
  SessionStart hook in each project reports the legacy layout and, when this project's inactive
  harness dirs older than 24 hours exceed 100 MB, suggests `/scratch-prune`; running it once with `--all-harness` per
  machine clears the backlog there.

## 7. Testing decisions

Seams: hook stdin → stdout, engine CLI JSON and filesystem effect in a temp tree, assembled
CLAUDE.md.

- `@critical` guard: writes into the harness scratchpad, loose into `.scratchpad/`, into `tmp/`
  or into an unknown top-level folder are denied; writes into `phase-22/scripts/`, `adhoc/…`,
  `proc/` pass; `CLAUDE_CODE_TMPDIR` moves the guarded harness root.
- `@important` guard: the deny reason names `phase-<NN>/…` when ROADMAP has `current`, else
  `adhoc/<today>-…`.
- `@important` guard: a Bash command naming the harness scratchpad (both slash directions) is
  denied; one without it passes.
- `@important` temp env: with `CLAUDE_ENV_FILE` the three exports are appended and `proc/`
  exists; without it nothing is written; a home-directory root is refused.
- `@critical` sleep guard: `sleep 590 && echo done`, `Start-Sleep -Seconds 60`, `timeout 30` with
  `run_in_background: true` → deny; the same in the foreground, or `sleep 5 && npm test` in the
  background → no output.
- `@important` nudge: `NN-SUMMARY.md` with ultrapowers enabled nudges once per phase; disabled or
  another file → silent.
- `@important` engine scans: each mode lists exactly its set (phase, aged adhoc, aged proc,
  legacy, this project's harness sessions minus the current one, every active session and those
  changed in the last 24 hours, all projects' harness sessions with the same exclusions) with
  `kind` classified.
- `@critical` engine `promote`: moves the file, never overwrites, appends the index row.
- `@critical` engine `apply --purge-now`: deletes harness items and refuses an item outside the
  harness temp root.
- `@important` temp env hint: legacy content or >100 MB of this project's inactive harness dirs
  older than 24 hours adds the `/scratch-prune` hint; a clean project gets none.
- `@important` assembled CLAUDE.md: layout bullet in every profile, phase-cleanup bullet only in
  base/full, no `tmp/` wording left.

## Out of scope

- Moving Claude Code's `tasks/` output into the project (not possible per project).
- Setting `CLAUDE_CODE_TMPDIR` globally.
- Changing the fork's skills.
- Sweeping other projects' `.claude/.scratchpad` from this repository.
