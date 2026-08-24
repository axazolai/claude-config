# Claude Code CLI Update Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use ultrapowers:subagent-driven-development (recommended) or ultrapowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bare native "Update installed · Restart to update" banner with a session
note that names the version delta and points at a new `/claude-code-changelog` command, which
shows the actual changelog entries for that delta so the user (and Claude, live, with project
context) can judge what's actually relevant.

**Architecture:** Add `claude-code-cli` as a new tracked entry in the existing component-update
registry (`payload/hooks/lib/component-registry.mjs` + `component-update-check-run.mjs`), sourced
from the native updater's own `~/.claude/.last-update-result.json` (no network call needed to
detect an update). A new command (`payload/commands/claude-code-changelog.md` +
`payload/bin/claude-code-changelog.mjs` + `payload/bin/lib/claude-code-changelog-lib.mjs`) fetches
`github.com/anthropics/claude-code/CHANGELOG.md` and slices out exactly the version range the
user hasn't seen yet, mirroring the existing `up-update`/`up-update-lib` split between a thin CLI
and a pure, independently-testable library.

**Tech Stack:** Plain Node.js ESM (`.mjs`), `node:test` + `node:assert/strict` for tests (run via
`node --test <file>`), global `fetch` for network calls — no new dependencies.

## Global Constraints

- Never edit anything under `~/.claude/` directly — this repo (`payload/`) is the installer
  source; changes reach a machine only through `setup.mjs`, not this plan.
- Every new/changed pure function gets a unit test; the network-touching functions take an
  injectable fetcher/dependency (see `up-update.mjs`'s `fetchers` parameter and
  `claude-cleanup-lib.mjs`'s explicit `claudeDir` parameter) so tests never hit the real network
  or the real `~/.claude`.
- Match existing code style exactly: `formatUpdateNotes()` messages are English (existing branches
  all are), not Russian — despite the rest of this conversation being in Russian.
- Test invocation for this repo is `node --test <file...>` — there is no root `package.json`/`npm
  test`.
- `CLAUDE_CONFIG_DIR` env var (falling back to `homedir()/.claude`) is the existing convention for
  locating the live `~/.claude` tree from any script; reuse it, don't invent a new one.

---

### Task 1: Register `claude-code-cli` in the component registry

**Files:**
- Modify: `payload/hooks/lib/component-registry.mjs`
- Modify: `payload/hooks/lib/component-registry.test.mjs`

**Interfaces:**
- Produces: a `COMPONENTS` entry `{ name: "claude-code-cli", scope: "global", kind: "version", updateClass: "notify-restart", legacyEnv: null }`.
- Produces: `formatUpdateNotes()` now emits, for any entry with `class: "notify-restart"` and `updateAvailable: true`:
  `"${name}: updated ${installed}→${latest} — restart to activate, then run /claude-code-changelog to see what's new."`

- [ ] **Step 1: Write the failing tests**

Add to `payload/hooks/lib/component-registry.test.mjs` (the existing whitelist assertion on line
14 currently only allows `["safe", "reinit"]` — it must be extended or it will fail the moment the
new component is added; extend it in the same edit that adds the new component test):

```js
test("COMPONENTS: claude-code-cli entry", () => {
  const cli = COMPONENTS.find((c) => c.name === "claude-code-cli");
  assert.equal(cli.scope, "global");
  assert.equal(cli.kind, "version");
  assert.equal(cli.updateClass, "notify-restart");
});

test("formatUpdateNotes: notify-restart says restart, then names the command", () => {
  const notes = formatUpdateNotes({
    "claude-code-cli": { installed: "2.1.240", latest: "2.1.241", updateAvailable: true, class: "notify-restart" },
  });
  assert.equal(notes.length, 1);
  assert.match(notes[0], /2\.1\.240.*2\.1\.241/);
  assert.match(notes[0], /restart/i);
  assert.match(notes[0], /\/claude-code-changelog/);
});
```

Also change the existing loop assertion (line 14) from:

```js
assert.ok(["safe", "reinit"].includes(c.updateClass), `${c.name} class`);
```

to:

```js
assert.ok(["safe", "reinit", "notify-restart"].includes(c.updateClass), `${c.name} class`);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test payload/hooks/lib/component-registry.test.mjs`
Expected: the two new tests FAIL (`cli` is `undefined` / `notes.length` is `0`); the whitelist
line change is not itself a failing test, it's a precondition for Step 1's other test not
regressing once the new component exists.

- [ ] **Step 3: Implement**

In `payload/hooks/lib/component-registry.mjs`, add to the `COMPONENTS` array (after the
`ui-ux-pro-max` entry):

```js
  { name: "claude-code-cli", scope: "global", kind: "version", updateClass: "notify-restart", legacyEnv: null },
```

In `formatUpdateNotes()`, add a branch before the final `else`:

```js
    } else if (e.class === "notify-restart") {
      out.push(`${name}: updated ${e.installed}→${e.latest} — restart to activate, then run /claude-code-changelog to see what's new.`);
    } else if (e.class === "safe" && e.autoUpdated) {
```

(i.e. insert the new `else if` branch ahead of the existing `safe && autoUpdated` branch — order
among `else if` branches on mutually exclusive `e.class` values doesn't matter functionally, but
keep the new one grouped with the other class-specific checks rather than after the generic
`else`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test payload/hooks/lib/component-registry.test.mjs`
Expected: all tests PASS (8 existing + 2 new = 10).

- [ ] **Step 5: Commit**

```bash
git add payload/hooks/lib/component-registry.mjs payload/hooks/lib/component-registry.test.mjs
git commit -m "feat(component-registry): track claude-code-cli as a notify-restart component"
```

---

### Task 2: Detect the CLI's own update via `.last-update-result.json`

**Files:**
- Modify: `payload/hooks/lib/component-update-check-run.mjs`
- Modify: `payload/hooks/lib/component-update-check-run.test.mjs`

**Interfaces:**
- Consumes: nothing new from Task 1 at the code level (no import between the two files); relies
  only on the `updateClass: "notify-restart"` string agreed in Task 1's design.
- Produces: `export function checkClaudeCodeUpdate(claudeDir, priorEntry)` →
  `{ installed: string, latest: string, updateAvailable: boolean } | null`.
- Produces: `main()`'s probe-check call site now passes `state[comp.name]` to `probe.check(...)`
  — every other existing `check()` (`checkBundleUpdate(CLAUDE_DIR)`, `projectProbe`'s `check()`)
  takes no parameters and silently ignores the extra argument (verified below).

- [ ] **Step 1: Write the failing tests**

Add to `payload/hooks/lib/component-update-check-run.test.mjs`:

```js
test("checkClaudeCodeUpdate: null when .last-update-result.json is missing", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { checkClaudeCodeUpdate } = await import("./component-update-check-run.mjs");
  const dir = mkdtempSync(join(tmpdir(), "cc-missing-"));
  assert.equal(checkClaudeCodeUpdate(dir, undefined), null);
  rmSync(dir, { recursive: true, force: true });
});

test("checkClaudeCodeUpdate: null on malformed JSON or a failed outcome", async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { checkClaudeCodeUpdate } = await import("./component-update-check-run.mjs");
  const dir = mkdtempSync(join(tmpdir(), "cc-bad-"));
  const file = join(dir, ".last-update-result.json");

  writeFileSync(file, "{not json");
  assert.equal(checkClaudeCodeUpdate(dir, undefined), null);

  writeFileSync(file, JSON.stringify({ outcome: "failed", version_from: "1.0.0", version_to: "1.0.1" }));
  assert.equal(checkClaudeCodeUpdate(dir, undefined), null);

  rmSync(dir, { recursive: true, force: true });
});

test("checkClaudeCodeUpdate: first-ever run reports version_from -> version_to", async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { checkClaudeCodeUpdate } = await import("./component-update-check-run.mjs");
  const dir = mkdtempSync(join(tmpdir(), "cc-first-"));
  writeFileSync(join(dir, ".last-update-result.json"),
    JSON.stringify({ outcome: "success", version_from: "2.1.240", version_to: "2.1.241" }));
  assert.deepEqual(checkClaudeCodeUpdate(dir, undefined),
    { installed: "2.1.240", latest: "2.1.241", updateAvailable: true });
  rmSync(dir, { recursive: true, force: true });
});

test("checkClaudeCodeUpdate: repeat run with no new version is NOT re-announced", async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { checkClaudeCodeUpdate } = await import("./component-update-check-run.mjs");
  const dir = mkdtempSync(join(tmpdir(), "cc-repeat-"));
  writeFileSync(join(dir, ".last-update-result.json"),
    JSON.stringify({ outcome: "success", version_from: "2.1.240", version_to: "2.1.241" }));
  const prior = { installed: "2.1.240", latest: "2.1.241", updateAvailable: true };
  assert.deepEqual(checkClaudeCodeUpdate(dir, prior),
    { installed: "2.1.241", latest: "2.1.241", updateAvailable: false });
  rmSync(dir, { recursive: true, force: true });
});

test("checkClaudeCodeUpdate: a further update since the prior check IS announced", async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { checkClaudeCodeUpdate } = await import("./component-update-check-run.mjs");
  const dir = mkdtempSync(join(tmpdir(), "cc-again-"));
  writeFileSync(join(dir, ".last-update-result.json"),
    JSON.stringify({ outcome: "success", version_from: "2.1.241", version_to: "2.1.242" }));
  const prior = { installed: "2.1.240", latest: "2.1.241", updateAvailable: true };
  assert.deepEqual(checkClaudeCodeUpdate(dir, prior),
    { installed: "2.1.241", latest: "2.1.242", updateAvailable: true });
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test payload/hooks/lib/component-update-check-run.test.mjs`
Expected: FAIL — `checkClaudeCodeUpdate` is not exported yet.

- [ ] **Step 3: Implement**

In `payload/hooks/lib/component-update-check-run.mjs`, add the new export (near the other
exported helpers, e.g. after `projectProbe`):

```js
export function checkClaudeCodeUpdate(claudeDir, priorEntry) {
  const filePath = join(claudeDir, ".last-update-result.json");
  if (!existsSync(filePath)) return null;
  const data = safe(() => JSON.parse(readFileSync(filePath, "utf8")));
  if (!data || data.outcome !== "success" || !data.version_to) return null;
  const installed = priorEntry?.latest ?? data.version_from ?? data.version_to;
  const latest = data.version_to;
  return { installed, latest, updateAvailable: latest !== installed };
}
```

Add the probe to `PROBES` (after `"claude-config"`):

```js
  "claude-code-cli": { present: () => existsSync(join(CLAUDE_DIR, ".last-update-result.json")), check: (prior) => checkClaudeCodeUpdate(CLAUDE_DIR, prior) },
```

In `main()`, change the check-call site from:

```js
      const res = await safe(() => probe.check());
```

to:

```js
      const res = await safe(() => probe.check(state[comp.name]));
```

This is the only change to the shared loop. `checkBundleUpdate(claudeDir)` and `projectProbe`'s
`check()` (defined `check: () => { ... }` with zero declared parameters) both ignore the extra
argument — confirmed by inspection: neither reads a second parameter.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test payload/hooks/lib/component-update-check-run.test.mjs`
Expected: all tests PASS (3 existing + 5 new = 8).

Also re-run Task 1's file to confirm nothing there regressed from importing the same module graph:

Run: `node --test payload/hooks/lib/component-registry.test.mjs payload/hooks/lib/component-update-check-run.test.mjs`
Expected: 10 + 8 = 18 passing, 0 failing.

- [ ] **Step 5: Commit**

```bash
git add payload/hooks/lib/component-update-check-run.mjs payload/hooks/lib/component-update-check-run.test.mjs
git commit -m "feat(component-update-check-run): detect Claude Code CLI self-updates via .last-update-result.json"
```

---

### Task 3: Changelog fetch + version-range slicing library

**Files:**
- Create: `payload/bin/lib/claude-code-changelog-lib.mjs`
- Create: `payload/bin/lib/claude-code-changelog-lib.test.mjs`

**Interfaces:**
- Produces: `export function parseVer(s)` → `{major, minor, patch} | null`.
- Produces: `export function compareVer(a, b)` → number (negative/zero/positive), for two
  already-parsed version objects (not raw strings).
- Produces: `export function parseChangelogSections(changelogText)` → `Array<{version: string, bullets: string[]}>`, in source file order.
- Produces: `export function sliceChangelogRange(changelogText, fromVersion, toVersion)` →
  same shape, filtered to versions where `fromVersion < version <= toVersion` (both raw string
  args; `fromVersion` exclusive, `toVersion` inclusive).
- Produces: `export function formatChangelogSlice(entries)` → single printable string, `""` for
  an empty array.
- Produces: `export async function realFetchChangelogText()` → the raw text of
  `https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md`, throws on a
  non-OK response or network failure.
- Produces: `export async function fetchChangelogSlice(fromVersion, toVersion, fetchText = realFetchChangelogText)` → awaits `fetchText()`, then `sliceChangelogRange`s it. Task 5 consumes this.

- [ ] **Step 1: Write the failing tests**

Create `payload/bin/lib/claude-code-changelog-lib.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVer, compareVer, parseChangelogSections, sliceChangelogRange, formatChangelogSlice, fetchChangelogSlice }
  from "./claude-code-changelog-lib.mjs";

test("parseVer: parses plain X.Y.Z, rejects junk", () => {
  assert.deepEqual(parseVer("2.1.241"), { major: 2, minor: 1, patch: 241 });
  assert.equal(parseVer("not-a-version"), null);
  assert.equal(parseVer(undefined), null);
});

test("compareVer: orders by major, then minor, then patch", () => {
  assert.ok(compareVer(parseVer("2.1.241"), parseVer("2.1.240")) > 0);
  assert.ok(compareVer(parseVer("2.1.240"), parseVer("2.1.241")) < 0);
  assert.equal(compareVer(parseVer("2.1.241"), parseVer("2.1.241")), 0);
  assert.ok(compareVer(parseVer("2.2.0"), parseVer("2.1.999")) > 0);
});

const SAMPLE = [
  "# Changelog",
  "",
  "## 2.1.241",
  "",
  "- Bug fixes and reliability improvements",
  "",
  "## 2.1.240",
  "",
  "- Bug fixes and reliability improvements",
  "",
  "## 2.1.239",
  "",
  "- Added a thing",
  "- Fixed a thing",
  "",
].join("\n");

test("parseChangelogSections: reads version + bullets, in source order", () => {
  const sections = parseChangelogSections(SAMPLE);
  assert.deepEqual(sections.map((s) => s.version), ["2.1.241", "2.1.240", "2.1.239"]);
  assert.deepEqual(sections[2].bullets, ["Added a thing", "Fixed a thing"]);
});

test("sliceChangelogRange: (from, to] — excludes from, includes to", () => {
  const slice = sliceChangelogRange(SAMPLE, "2.1.239", "2.1.240");
  assert.deepEqual(slice.map((s) => s.version), ["2.1.240"]);
});

test("sliceChangelogRange: multi-version gap after several skipped sessions", () => {
  const slice = sliceChangelogRange(SAMPLE, "2.1.238", "2.1.241");
  assert.deepEqual(slice.map((s) => s.version), ["2.1.241", "2.1.240", "2.1.239"]);
});

test("sliceChangelogRange: empty when already at the latest version", () => {
  assert.deepEqual(sliceChangelogRange(SAMPLE, "2.1.241", "2.1.241"), []);
});

test("formatChangelogSlice: renders headings + bullets; empty slice is empty string", () => {
  const out = formatChangelogSlice(sliceChangelogRange(SAMPLE, "2.1.240", "2.1.241"));
  assert.equal(out, "## 2.1.241\n- Bug fixes and reliability improvements");
  assert.equal(formatChangelogSlice([]), "");
});

test("fetchChangelogSlice: uses the injected fetcher, never the real network", async () => {
  let calls = 0;
  const fakeFetch = async () => { calls++; return SAMPLE; };
  const slice = await fetchChangelogSlice("2.1.239", "2.1.241", fakeFetch);
  assert.equal(calls, 1);
  assert.deepEqual(slice.map((s) => s.version), ["2.1.241", "2.1.240"]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test payload/bin/lib/claude-code-changelog-lib.test.mjs`
Expected: FAIL — the module does not exist yet.

- [ ] **Step 3: Implement**

Create `payload/bin/lib/claude-code-changelog-lib.mjs`:

```js
// Pure changelog-range logic + a thin, injectable fetch wrapper for the Claude Code CLI's own
// public CHANGELOG.md. Mirrors the up-update / up-update-lib split: this file has no side effects
// of its own except the one real network read, which every caller can override for tests.
const CHANGELOG_URL = "https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md";
const HEADING_RE = /^##\s+(\d+\.\d+\.\d+)\s*$/;
const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/;

export function parseVer(s) {
  const m = VERSION_RE.exec(String(s ?? "").trim());
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

export function compareVer(a, b) {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

export function parseChangelogSections(changelogText) {
  const lines = changelogText.split(/\r?\n/);
  const sections = [];
  let current = null;
  for (const line of lines) {
    const m = HEADING_RE.exec(line);
    if (m) { current = { version: m[1], bullets: [] }; sections.push(current); continue; }
    if (!current) continue;
    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) current.bullets.push(trimmed.slice(2).trim());
  }
  return sections;
}

export function sliceChangelogRange(changelogText, fromVersion, toVersion) {
  const from = parseVer(fromVersion);
  const to = parseVer(toVersion);
  return parseChangelogSections(changelogText).filter((s) => {
    const v = parseVer(s.version);
    if (!v) return false;
    if (to && compareVer(v, to) > 0) return false;
    if (from && compareVer(v, from) <= 0) return false;
    return true;
  });
}

export function formatChangelogSlice(entries) {
  if (!entries.length) return "";
  return entries.map((e) => `## ${e.version}\n${e.bullets.map((b) => `- ${b}`).join("\n")}`).join("\n\n");
}

export async function realFetchChangelogText() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(CHANGELOG_URL, { signal: ctrl.signal, headers: { "User-Agent": "claude-config-changelog-check" } });
    if (!res.ok) throw new Error(`GitHub returned ${res.status} for CHANGELOG.md`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

export async function fetchChangelogSlice(fromVersion, toVersion, fetchText = realFetchChangelogText) {
  const text = await fetchText();
  return sliceChangelogRange(text, fromVersion, toVersion);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test payload/bin/lib/claude-code-changelog-lib.test.mjs`
Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add payload/bin/lib/claude-code-changelog-lib.mjs payload/bin/lib/claude-code-changelog-lib.test.mjs
git commit -m "feat(claude-code-changelog-lib): fetch and slice the Claude Code CHANGELOG by version range"
```

---

### Task 4: `/claude-code-changelog` CLI entry point

**Files:**
- Create: `payload/bin/claude-code-changelog.mjs`
- Create: `payload/bin/claude-code-changelog.test.mjs`

**Interfaces:**
- Consumes: `fetchChangelogSlice`, `formatChangelogSlice` from Task 3
  (`./lib/claude-code-changelog-lib.mjs`).
- Produces: `export async function main(claudeDir = defaultClaudeDir(), fetchText = realFetchChangelogText)` → `Promise<number>` (exit code), printing to `console.log`/`console.error`. `defaultClaudeDir` and `realFetchChangelogText` are both re-exported/imported so tests can override each independently.

- [ ] **Step 1: Write the failing tests**

Create `payload/bin/claude-code-changelog.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "./claude-code-changelog.mjs";

function tmpClaudeDir(stateEntry) {
  const dir = mkdtempSync(join(tmpdir(), "cc-cli-"));
  if (stateEntry !== undefined) {
    mkdirSync(join(dir, "state"), { recursive: true });
    writeFileSync(join(dir, "state", "component-updates.json"),
      JSON.stringify({ "claude-code-cli": stateEntry }));
  }
  return dir;
}

function captureLogs() {
  const lines = [];
  const orig = console.log;
  console.log = (...a) => lines.push(a.join(" "));
  return { lines, restore: () => { console.log = orig; } };
}

test("main: no state file at all -> friendly message, exit 0", async () => {
  const dir = tmpClaudeDir(undefined);
  const cap = captureLogs();
  const code = await main(dir, async () => "unused");
  cap.restore();
  assert.equal(code, 0);
  assert.match(cap.lines.join("\n"), /no component-update state/i);
  rmSync(dir, { recursive: true, force: true });
});

test("main: no claude-code-cli entry recorded -> friendly message, exit 0", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-cli-noentry-"));
  mkdirSync(join(dir, "state"), { recursive: true });
  writeFileSync(join(dir, "state", "component-updates.json"), JSON.stringify({ graphify: {} }));
  const cap = captureLogs();
  const code = await main(dir, async () => "unused");
  cap.restore();
  assert.equal(code, 0);
  assert.match(cap.lines.join("\n"), /no claude code cli update/i);
  rmSync(dir, { recursive: true, force: true });
});

test("main: already on the latest known version -> says so, exit 0", async () => {
  const dir = tmpClaudeDir({ installed: "2.1.241", latest: "2.1.241", updateAvailable: false });
  const cap = captureLogs();
  const code = await main(dir, async () => "unused");
  cap.restore();
  assert.equal(code, 0);
  assert.match(cap.lines.join("\n"), /already on the latest/i);
  rmSync(dir, { recursive: true, force: true });
});

test("main: prints the changelog slice for a real range", async () => {
  const dir = tmpClaudeDir({ installed: "2.1.240", latest: "2.1.241", updateAvailable: true });
  const fake = async () => ["## 2.1.241", "", "- New thing", "", "## 2.1.240", "", "- Old thing", ""].join("\n");
  const cap = captureLogs();
  const code = await main(dir, fake);
  cap.restore();
  assert.equal(code, 0);
  assert.match(cap.lines.join("\n"), /## 2\.1\.241/);
  assert.match(cap.lines.join("\n"), /New thing/);
  assert.doesNotMatch(cap.lines.join("\n"), /Old thing/);
  rmSync(dir, { recursive: true, force: true });
});

test("main: fetch failure -> clear error, exit 1", async () => {
  const dir = tmpClaudeDir({ installed: "2.1.240", latest: "2.1.241", updateAvailable: true });
  const failing = async () => { throw new Error("offline"); };
  const origErr = console.error;
  const errLines = [];
  console.error = (...a) => errLines.push(a.join(" "));
  const code = await main(dir, failing);
  console.error = origErr;
  assert.equal(code, 1);
  assert.match(errLines.join("\n"), /offline/);
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test payload/bin/claude-code-changelog.test.mjs`
Expected: FAIL — the module does not exist yet.

- [ ] **Step 3: Implement**

Create `payload/bin/claude-code-changelog.mjs`:

```js
#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { fetchChangelogSlice, formatChangelogSlice, realFetchChangelogText } from "./lib/claude-code-changelog-lib.mjs";

export function defaultClaudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
}

export async function main(claudeDir = defaultClaudeDir(), fetchText = realFetchChangelogText) {
  const statePath = join(claudeDir, "state", "component-updates.json");
  if (!existsSync(statePath)) {
    console.log("No component-update state recorded yet — nothing to compare.");
    return 0;
  }
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const entry = state["claude-code-cli"];
  if (!entry || !entry.installed || !entry.latest) {
    console.log("No Claude Code CLI update has been recorded yet.");
    return 0;
  }
  if (entry.installed === entry.latest) {
    console.log(`Claude Code is already on the latest known version (${entry.latest}). Nothing new to show.`);
    return 0;
  }
  try {
    const entries = await fetchChangelogSlice(entry.installed, entry.latest, fetchText);
    if (!entries.length) {
      console.log(`No changelog sections found between ${entry.installed} and ${entry.latest}.`);
      return 0;
    }
    console.log(formatChangelogSlice(entries));
    return 0;
  } catch (err) {
    console.error(`Could not fetch the Claude Code changelog: ${err.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => { process.exitCode = code; });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test payload/bin/claude-code-changelog.test.mjs`
Expected: all 5 tests PASS.

Then run the full new-file suite together to confirm no cross-file regressions:

Run: `node --test payload/hooks/lib/component-registry.test.mjs payload/hooks/lib/component-update-check-run.test.mjs payload/bin/lib/claude-code-changelog-lib.test.mjs payload/bin/claude-code-changelog.test.mjs`
Expected: 10 + 8 + 8 + 5 = 31 passing, 0 failing.

- [ ] **Step 5: Commit**

```bash
git add payload/bin/claude-code-changelog.mjs payload/bin/claude-code-changelog.test.mjs
git commit -m "feat(claude-code-changelog): add the CLI entry point for the new command"
```

---

### Task 5: `/claude-code-changelog` command definition

**Files:**
- Create: `payload/commands/claude-code-changelog.md`

**Interfaces:**
- Consumes: `payload/bin/claude-code-changelog.mjs` (Task 4), invoked as `node
  ~/.claude/bin/claude-code-changelog.mjs` once deployed (matching how `up-update.md` invokes
  `node ~/.claude/bin/up-update.mjs`).
- Produces: nothing further consumes this — it's the end-user-facing deliverable.

No test: this is a Markdown instruction file (pure documentation), matching the existing
exception in this project's testing rules for pure config/docs with no branching behavior of
their own — `up-update.md` itself has no test.

- [ ] **Step 1: Write the command file**

Create `payload/commands/claude-code-changelog.md`:

```markdown
---
description: Show what changed in Claude Code since the version you last checked, and whether any of it matters here
allowed-tools: Bash(node *), Read
---

Claude Code updates itself in the background and only ever shows a bare "Update installed ·
Restart to update" banner. This command fills in the blank: it prints the actual changelog
entries for the versions you haven't seen yet.

## Run it

```
node ~/.claude/bin/claude-code-changelog.mjs
```

No arguments. It reads the version range from `~/.claude/state/component-updates.json` (written
by the background component-update checker) and fetches the matching slice of
`github.com/anthropics/claude-code/CHANGELOG.md`.

## Show me the output, then do the actual work

Print the raw entries the script returns. Then — using what you already know about the current
project, its stack, and how it uses Claude Code — call out anything in the list that's actually
relevant here: a new hook event, a settings key, a command/flag, a behavior change that touches
something this project already does its own way. Don't just restate the changelog; say plainly
which lines are noise (routine bug fixes) and which ones are worth acting on, and what acting on
one would look like.

If the script says there's nothing recorded yet, or you're already on the latest known version,
say so plainly — don't invent a changelog entry to talk about.

## Do not

- Do not treat every bullet as equally important — most releases are mostly bug fixes.
- Do not run any follow-up install/update commands off the back of this report; this command only
  reads and reports.
```

- [ ] **Step 2: Commit**

```bash
git add payload/commands/claude-code-changelog.md
git commit -m "feat(commands): add /claude-code-changelog"
```

---

## Final verification

- [ ] Run the complete set of touched/created test files together:

  Run: `node --test payload/hooks/lib/component-registry.test.mjs payload/hooks/lib/component-update-check-run.test.mjs payload/bin/lib/claude-code-changelog-lib.test.mjs payload/bin/claude-code-changelog.test.mjs`
  Expected: 31 passing, 0 failing.

- [ ] Confirm no other existing test regressed by running the two hook-lib directories' full
  suites (not just the files this plan touched):

  Run: `node --test payload/hooks/lib/*.test.mjs payload/bin/*.test.mjs payload/bin/lib/*.test.mjs`
  Expected: 0 failing (some pre-existing failures/skip states, if any, are pre-existing — compare
  the failing set against a run on `master` before this branch if anything is red).

This plan does not deploy anything to `~/.claude` — per this repo's own rule, that only happens
via `setup.mjs`, run deliberately by the user after this plan's commits land.
