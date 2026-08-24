# Claude Code CLI update tracking — design

Date: 2026-08-24
Status: approved, not yet planned

## Context

The native Claude Code CLI auto-updater downloads and installs updates silently, then shows a
generic `Update installed · Restart to update` banner with no detail on what changed. The full
release history is public at `github.com/anthropics/claude-code/CHANGELOG.md` (one `## X.Y.Z`
section per version, flat bullet list, newest first) but nothing in this project surfaces it —
the user has to go read the changelog by hand to find out whether a given update matters to what
they're working on.

This project already runs a background update checker for other components — graphify,
context-mode, claude-config, impeccable, ui-ux-pro-max — via `payload/hooks/lib/component-registry.mjs`
and `payload/hooks/lib/component-update-check-run.mjs`, wired into `SessionStart` by
`payload/hooks/session-init.mjs`. The Claude Code CLI itself is not a tracked component. Its own
updater already writes `~/.claude/.last-update-result.json` with `{version_from, version_to,
outcome}` on every self-update — a reliable local signal with no network call needed to detect
that an update happened.

## Architecture

Add Claude Code CLI as a new tracked component in the existing registry, rather than building a
parallel mechanism. Split responsibilities the same way `up-update` splits them: a deterministic
Node script does detection and data-fetching; a slash command's Markdown instructs the live
Claude session to do the judgment call ("does this matter to what I'm doing"), since that
judgment needs the current project's context and isn't something a background hook can decide.

## Components changed

**`payload/hooks/lib/component-registry.mjs`**
- New `COMPONENTS` entry:
  ```js
  { name: "claude-code-cli", scope: "global", kind: "version", updateClass: "notify-restart", legacyEnv: null }
  ```
- New branch in `formatUpdateNotes()` for `updateClass === "notify-restart"`, matching the
  English phrasing of every existing branch in that function:
  `"${name}: updated ${installed}→${latest} — restart to activate, then run /claude-code-changelog to see what's new."`
  `decide()` needs no change — it only special-cases `"safe"`, so `"notify-restart"` already falls
  through to `"notify"`.

**`payload/hooks/lib/component-update-check-run.mjs`**
- `PROBES` is a module-level const built before `main()` ever runs, so its closures cannot see
  `main()`'s local `state` variable — confirmed by reading the current file. `claude-code-cli`'s
  probe needs the previously-recorded `latest` to detect "already announced" vs. "new since last
  time", so `check()` needs that value handed to it explicitly. One-line change to the shared call
  site in `main()`:
  ```js
  // before: const res = await safe(() => probe.check());
  const res = await safe(() => probe.check(state[comp.name]));
  ```
  Every existing `check()` (`checkBundleUpdate(CLAUDE_DIR)`, `projectProbe`'s `check()`) ignores
  an extra argument it doesn't declare — zero behavior change for them.
- New probe:
  ```js
  "claude-code-cli": {
    present: () => existsSync(join(CLAUDE_DIR, ".last-update-result.json")),
    check: (prior) => checkClaudeCodeUpdate(CLAUDE_DIR, prior),
  }
  ```
- New pure helper `checkClaudeCodeUpdate(claudeDir, priorEntry)`: reads
  `.last-update-result.json`, returns `null`/skip when `outcome !== "success"` or the file is
  missing/unparseable. `installed` = `priorEntry?.latest ?? version_from`; `latest` =
  `version_to`; `updateAvailable = latest !== installed`. Without this, the file's own
  `version_from`/`version_to` never change between checks, so a naive "diff against the file
  alone" would re-announce the same update forever — the whole reason `priorEntry` is threaded
  through. No `update()` is defined for this probe — the CLI updates itself; `decide()` for a
  non-`"safe"` class never reaches the auto branch regardless.
- Existing throttle (`THROTTLE_MS`, `fresh()`), `safe()` wrapping, and `component-updates.json`
  persistence are reused unchanged.

**New command `payload/commands/claude-code-changelog.md`** (+ helper, `payload/bin/claude-code-changelog.mjs`)
- Helper fetches `https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md`
  with `fetch` + `AbortController` + an 8s timeout + `User-Agent` header, matching the existing
  convention in `config-update-check-run.mjs`. Reads `installed`/`latest` for `claude-code-cli`
  from `~/.claude/state/component-updates.json`, slices out the `##` sections in
  `(installed, latest]`, and prints the raw bullets — no summarization in the script.
- The command's Markdown (styled like `up-update.md`: Run it / Show me / What it means) instructs
  Claude to run the helper, print the raw slice, then — using its own knowledge of the current
  project — call out which entries are actually relevant here (new hook events, settings keys,
  command syntax, behavior changes that intersect with this project's own hooks/config) versus
  generic bugfix noise. No separate agent or heuristic does this classification.

## Data flow

1. Claude Code's own updater installs a new version in the background and writes
   `.last-update-result.json`.
2. On the next `SessionStart` (throttled 24h like every other component), the background worker
   notices `version_to` differs from the last-recorded `latest`, updates
   `component-updates.json`, and `formatUpdateNotes()` adds one line to the session banner.
3. The user sees `claude-code-cli: updated X→Y — restart to activate, then run
   /claude-code-changelog ...` instead of the bare native banner.
4. Running `/claude-code-changelog` re-reads the same state file for the version range, fetches
   the changelog slice, and the live session reasons about relevance in place.

## Testing Decisions

- `checkClaudeCodeUpdate()` is a pure function (given file contents in, state out) — unit-tested
  alongside the existing `component-update-check-run.test.mjs` coverage: missing file, malformed
  JSON, `outcome: "failed"`, first-ever run (no prior state), and a repeat run with no new
  version.
- The new `formatUpdateNotes()` branch is unit-tested next to its existing cases.
- The changelog-fetch helper is tested at the same seam `config-update-check-run.mjs` already
  uses: a mocked `fetch`, verifying the version-range slicing logic against a fixed sample
  `CHANGELOG.md` string (including the edge case of a single-version range and a multi-version
  gap after several skipped sessions).

## Out of scope

- No influence over the native auto-updater's own decision to download/install — this project
  only observes the result.
- No automatic, no-command-needed changelog analysis on every session start — rejected during
  design in favor of banner + on-demand command, to keep `SessionStart` cheap.
- Not generalized to arbitrary npm/global packages — scoped to the `claude` CLI only.
