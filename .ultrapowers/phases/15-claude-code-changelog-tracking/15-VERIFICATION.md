---
phase: "15"
slug: claude-code-changelog-tracking
verdict: ACHIEVED
verified_against: 5206def..b97aad2 (14 commits)
verified: 2026-08-26
---

# Phase 15 — claude-code-changelog-tracking — verification

## Goal

> Replace the bare native "Update installed · Restart to update" banner with a session note that
> names the version delta and points at a new `/claude-code-changelog` command, which shows the
> actual changelog entries for that delta so the user (and Claude, live, with project context) can
> judge what's actually relevant.

**Verdict: ACHIEVED.** The full chain — native updater artifact → probe → state → session note →
command → sliced changelog — exists in the branch and runs end to end; the one literal shortfall
(the native banner itself is Claude Code's own UI and is not suppressed) is recorded under Gaps.

## Evidence

**Claim: a session note that names the version delta.**
`payload/hooks/lib/component-registry.mjs:59-61` adds the `notify-restart` branch to
`formatUpdateNotes()`; `payload/hooks/session-init.mjs:560-565` reads
`state/component-updates.json` and pushes every returned line as `Component update: …` into
`notes`, which is emitted at `session-init.mjs:579`. Covered by
`component-registry.test.mjs` "formatUpdateNotes: notify-restart says restart, then names the
command". End-to-end run with a synthetic `.last-update-result.json` (`version_from` 2.1.240,
`version_to` 2.1.242) produced the literal note:
`claude-code-cli: updated 2.1.240→2.1.242 — restart to activate, then run /claude-code-changelog to see what's new.`

**Claim: the delta is detected without a network call, from the native updater's own artifact.**
`payload/hooks/lib/component-update-check-run.mjs:63-74` (`checkClaudeCodeUpdate`) reads
`<claudeDir>/.last-update-result.json`, requires `outcome === "success"` and `version_to`, and
carries `priorEntry.latest` forward as `installed` so an already-announced delta is not repeated.
Wired as a probe at `component-update-check-run.mjs:32`; the shared loop passes prior state at
`:98` (`probe.check(state[comp.name])`) and stamps `class: comp.updateClass` at `:93`, which is
what `formatUpdateNotes` keys on. Six tests in `component-update-check-run.test.mjs` cover
missing file, malformed JSON, failed outcome, first run, repeat run, backwards/stale prior, and a
further update. The field names were checked against the real artifact on this machine
(`~/.claude/.last-update-result.json`: `outcome:"success"`, `version_from:"2.1.245"`,
`version_to:"2.1.246"`) — the schema the code assumes is the schema the native updater writes.

**Claim: it notifies rather than acting.**
`decide()` (`component-registry.mjs:32-36`) returns `notify` for `notify-restart` regardless of the
auto-update toggle, and the `claude-code-cli` probe declares no `update` — confirmed by direct
call in the end-to-end run (`decide: notify`). Registry entry at `component-registry.mjs:16`, and
the class whitelist at `component-registry.test.mjs:14` was widened to admit it.

**Claim: a new `/claude-code-changelog` command exists.**
`payload/commands/claude-code-changelog.md` (36 lines, frontmatter `description` +
`allowed-tools: Bash(node *), Read`), invoking `node ~/.claude/bin/claude-code-changelog.mjs` —
same shape as the existing `up-update.md`. It resolves into the file set of all three installer
profiles (`full`, `base`, `lite`) together with `bin/claude-code-changelog.mjs` and
`bin/lib/claude-code-changelog-lib.mjs`, checked by calling `resolveVariant()` from
`variants.mjs` for each profile; the `**.test.mjs` alwaysExclude keeps the tests out.

**Claim: it shows the actual changelog entries for that delta.**
`payload/bin/lib/claude-code-changelog-lib.mjs` — `parseChangelogSections` (`:15`),
`sliceChangelogRange` (`:29`, half-open `(from, to]`), `formatChangelogSlice` (`:41`),
`realFetchChangelogText` (`:46`, 8s abort, non-OK throws), `fetchChangelogSlice` (`:58`, fetcher
injectable). `payload/bin/claude-code-changelog.mjs:12-50` reads the recorded range from
`state/component-updates.json` and prints the slice. Eight lib tests + seven CLI tests cover
ordering, both range edges, multi-version gaps, the empty slice, and every CLI branch. Verified
against reality twice: a live `realFetchChangelogText()` against
`raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md` parsed 376 sections with
correct bullets (heading format `## X.Y.Z` is what the file actually uses), and the end-to-end run
over a 2.1.240→2.1.242 state printed exactly `## 2.1.242` and `## 2.1.241`, excluding the
installed version below the range and a 2.1.243 section above it.

**Claim: Claude judges relevance live, with project context.**
`payload/commands/claude-code-changelog.md:20-30` instructs Claude to print the raw entries and
then triage them against the current project — naming noise vs. what is worth acting on — and
forbids inventing entries when the script reports nothing. This is instruction text, not code; it
is verifiable as present and specific, not as effective.

**Test state.** All green on this branch: 34 tests across the four phase test files; 581 across
`payload/**` ; 95 across the root-level suites (`variants`, `docs-coverage`, `docs-claims`,
`setup-variants.e2e`, …). 0 failing anywhere — no regression from the `hooks/lib → bin/lib`
import added at `component-update-check-run.mjs:17`.

## Global constraints

- **Never edit anything under `~/.claude/` directly** — HELD. Every path in the branch diff's
  file list is under `.ultrapowers/` or `payload/` (11 files); nothing writes to the live tree.
  The only contact with `~/.claude/` during this verification was read-only inspection.
- **Every new/changed pure function gets a unit test; network-touching functions take an
  injectable dependency** — HELD. `parseVer`, `compareVer`, `parseChangelogSections`,
  `sliceChangelogRange`, `formatChangelogSlice`, `fetchChangelogSlice` are each covered in
  `claude-code-changelog-lib.test.mjs:6-70`; `checkClaudeCodeUpdate` in
  `component-update-check-run.test.mjs`; the `notify-restart` branch in
  `component-registry.test.mjs`. Injection points: `fetchChangelogSlice(from, to, fetchText)`
  (`claude-code-changelog-lib.mjs:58`), `main(claudeDir, fetchText)`
  (`claude-code-changelog.mjs:12`), `checkClaudeCodeUpdate(claudeDir, prior)`
  (`component-update-check-run.mjs:63`) — no test touches the real network or the real
  `~/.claude`. Untested by design: `realFetchChangelogText` (the network boundary that exists to
  be injected past), `defaultClaudeDir` (a two-term env read), and the `isMainModule` guard at
  `claude-code-changelog.mjs:52-57`, whose exact form is already covered by the pre-existing
  `payload/bin/lib/entrypoint-guard.test.mjs:14-17`.
- **English messages, matching existing style** — HELD. `component-registry.mjs:60` and every
  `console.log`/`console.error` in `claude-code-changelog.mjs:15-47` are English; the command file
  is English throughout.
- **Test invocation is `node --test <file...>`; no root `package.json`/`npm test`** — HELD. No
  root `package.json` exists; all three suites above were run with bare `node --test`, and neither
  the plan's files nor the fix commits introduce a package manifest or a script runner.
- **Reuse `CLAUDE_CONFIG_DIR` with a `homedir()/.claude` fallback** — HELD.
  `claude-code-changelog.mjs:8-10` (`defaultClaudeDir`) and `component-update-check-run.mjs:19`
  (`CLAUDE_DIR`) both use exactly that expression; no new env var is introduced.

## Gaps

- The native "Update installed · Restart to update" banner is not removed or suppressed — nothing
  in this repo can reach Claude Code's own UI. What landed is additive: the session note appears
  alongside the banner rather than in place of it. The goal's substance (a delta-naming note that
  points at a command) is delivered; only the word "replace" overstates it.
- Nothing is deployed to `~/.claude` yet, so `/claude-code-changelog` is not live on this machine
  and the live `~/.claude/state/component-updates.json` still has no `claude-code-cli` entry. This
  is the plan's own closing stipulation (deploy happens only via a deliberate `setup.mjs` run),
  not an omission — and the profile-resolution check above confirms the installer will carry all
  three files when it runs.
- unverifiable: that Claude's live triage of the printed entries is actually useful in a real
  session — the command file specifies the behavior but nothing exercises it. What would settle
  it: one real post-update session where the note fires and the command is run against a genuine
  multi-version delta.

Not a gap against this plan, but worth a decision before merge: `README.md` and `README.en.md`
enumerate every `bin/` script and every `commands/*.md` file in their tree sections
(`README.md:439-461`), and the two new entries are absent. The plan never asked for it and
`docs-coverage.test.mjs` is deliberately narrow to hooks, so nothing is red.
