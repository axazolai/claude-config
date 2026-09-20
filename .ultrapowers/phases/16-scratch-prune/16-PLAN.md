# /scratch-prune Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use ultrapowers:subagent-driven-development (recommended) or ultrapowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user-invocable `/scratch-prune` skill that lists `<project>/.claude/.scratchpad/tmp/`, lets the user choose, and moves the chosen names into the shared `claude-cleanup` trash — shipped through `payload/` and `node setup.mjs`.

**Architecture:** One pure scanner (`scanScratchpad`) beside `claude-cleanup-lib.mjs`, a thin CLI that wraps it plus the library's `applyPlan`/`restoreBatch`/`purgeRetention` unchanged, and a `SKILL.md` that runs the dialogue. Spec: `16-SPEC.md` (copied verbatim from the ai_rent brainstorm).

**Tech Stack:** Node ≥ 18 ESM, `node:test`, no dependencies. Repo conventions: tests beside modules as `<module>.test.mjs` (excluded from the bundle by `alwaysExclude`), inline `isMain()` entry-point guard as in `bin/claude-cleanup.mjs`.

## Global Constraints

- Everything ships from `payload/`; nothing is written under `~/.claude/` by hand (project `CLAUDE.md`).
- The engine only proposes immediate children of `tmp/`; the scratchpad root appears in `rootSummary` only (spec § 1, § 7).
- `KEEP_DAYS` (7) and `RETENTION_DAYS` (7) are imported from `claude-cleanup-lib.mjs`, never redeclared (spec § 1).
- `applyPlan`, `restoreBatch`, `purgeRetention` are used unchanged; the trash is `~/.claude/.cleanup-trash/<ts>/` (spec § 3).
- `tmp/` missing → exit code 3, one stderr line `no tmp/ under <scratchpad>`, nothing created (spec § 3).
- SKILL.md frontmatter: `name: scratch-prune`, `disable-model-invocation: true`, `allowed-tools: Bash(node *), AskUserQuestion` (spec § 2; both fields verified against the Claude Code skills reference on 2026-09-20).
- Rule text and skill text are instructions, not justifications (`~/.claude/CLAUDE.md` § CONVENTIONS).
- Test tiers: `@important` for the scan contract (a wrong age is silent and plausible); no tests for `parseArgs` (a mapping) or for apply/restore (library behaviour, already covered).
- Spec deviations, all recorded here: test file is `bin/lib/scratch-prune-lib.test.mjs` (repo convention; the spec's `~/.claude/bin/lib/scratch-prune.test.mjs` cannot exist — tests are never deployed); `ageDays` is truncated to one decimal, not rounded, so a displayed age never exceeds the raw age that decided `aged`; `apply` prints a second line `skipped: <names>` when anything was skipped (spec § 5 asks the skill to name them and the library only counts).

**Branch:** `feat/scratch-prune` from `master`; merge `--no-ff` with `Merge feat/scratch-prune: <one line>`; deploy from `master` only (RESUME ruling).

---

### Task 1: `scanScratchpad` — the scan contract

**Files:**
- Create: `payload/bin/lib/scratch-prune-lib.mjs`
- Test: `payload/bin/lib/scratch-prune-lib.test.mjs`

**Interfaces:**
- Consumes: `newestMtime(path)`, `dirSize(path)`, `DAY_MS`, `KEEP_DAYS` from `./claude-cleanup-lib.mjs`.
- Produces: `scanScratchpad({ scratchpad, nowMs = Date.now() })` → either `{ error: string }` or `{ scratchpad, tmp, items, rootSummary, totals }` where `items[]` = `{ absPath, name, kind, size, mtimeMs, ageDays, aged, category: "scratch", reason }` sorted aged-first then size-desc; `rootSummary` = `{ entries, bytes, largest: [{ name, size }] (≤3) }`; `totals` = `{ entries, bytes, aged: { entries, bytes } }`. Task 2 passes `items` through to `applyPlan` unmodified.

- [ ] **Step 1: Write the failing tests**

```js
// payload/bin/lib/scratch-prune-lib.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DAY_MS } from "./claude-cleanup-lib.mjs";
import { scanScratchpad } from "./scratch-prune-lib.mjs";

const NOW = Date.UTC(2026, 8, 20);
const daysAgo = (n) => NOW - n * DAY_MS;
const touch = (p, ms, bytes) => { writeFileSync(p, "x".repeat(bytes)); utimesSync(p, new Date(ms), new Date(ms)); };

function fixture() {
  const d = mkdtempSync(join(tmpdir(), "sp-"));
  const scratchpad = join(d, ".scratchpad"), tmp = join(scratchpad, "tmp");
  mkdirSync(join(tmp, "pylib"), { recursive: true });
  touch(join(tmp, "old.py"), daysAgo(8), 10);
  touch(join(tmp, "new.json"), daysAgo(2), 20);
  touch(join(tmp, "pylib", "a.py"), daysAgo(20), 100);
  touch(join(tmp, "pylib", "b.py"), daysAgo(2), 100);
  touch(join(scratchpad, "archive_cutoffs.json"), daysAgo(30), 500);
  return { d, scratchpad };
}

test("@important scan: a tmp/ entry is aged by its newest file, the root is summarised and never proposed, aged rows come first", () => {
  const { d, scratchpad } = fixture();
  const res = scanScratchpad({ scratchpad, nowMs: NOW });
  assert.deepEqual(res.items.map((i) => [i.name, i.kind, i.aged, i.ageDays, i.size, i.reason]), [
    ["old.py", "py", true, 8, 10, "scratch:tmp/old.py"],
    ["pylib", "dir", false, 2, 200, "scratch:tmp/pylib"],
    ["new.json", "json", false, 2, 20, "scratch:tmp/new.json"],
  ]);
  assert.deepEqual(res.rootSummary, { entries: 1, bytes: 500, largest: [{ name: "archive_cutoffs.json", size: 500 }] });
  assert.deepEqual(res.totals, { entries: 3, bytes: 230, aged: { entries: 1, bytes: 10 } });
  rmSync(d, { recursive: true, force: true });
});

test("@important scan: a scratchpad without tmp/ is an error, not an empty list", () => {
  const d = mkdtempSync(join(tmpdir(), "sp-"));
  const scratchpad = join(d, ".scratchpad");
  mkdirSync(scratchpad);
  assert.deepEqual(scanScratchpad({ scratchpad, nowMs: NOW }), { error: `no tmp/ under ${scratchpad}` });
  rmSync(d, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test payload/bin/lib/scratch-prune-lib.test.mjs`
Expected: both fail — `Cannot find module '.../scratch-prune-lib.mjs'`.

- [ ] **Step 3: Write the module**

```js
// payload/bin/lib/scratch-prune-lib.mjs
// Scanner for /scratch-prune: only the immediate children of <scratchpad>/tmp/ are candidates;
// the scratchpad root is summarised and never proposed.
import { readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { newestMtime, dirSize, DAY_MS, KEEP_DAYS } from "./claude-cleanup-lib.mjs";

function statOr(p) { try { return statSync(p); } catch { return null; } }
function safeReaddir(p) { try { return readdirSync(p, { withFileTypes: true }); } catch { return []; } }
const trunc1 = (n) => Math.floor(n * 10) / 10;
const sum = (rows) => rows.reduce((acc, r) => acc + r.size, 0);

function summariseRoot(scratchpad, tmp) {
  const rows = [];
  for (const e of safeReaddir(scratchpad)) {
    const absPath = join(scratchpad, e.name);
    if (absPath === tmp) continue;
    const st = statOr(absPath); if (!st) continue;
    rows.push({ name: e.name, size: st.isDirectory() ? dirSize(absPath) : st.size });
  }
  rows.sort((a, b) => b.size - a.size);
  return { entries: rows.length, bytes: sum(rows), largest: rows.slice(0, 3) };
}

export function scanScratchpad({ scratchpad, nowMs = Date.now() }) {
  const tmp = join(scratchpad, "tmp");
  if (!statOr(tmp)?.isDirectory()) return { error: `no tmp/ under ${scratchpad}` };
  const items = [];
  for (const e of safeReaddir(tmp)) {
    const absPath = join(tmp, e.name);
    const st = statOr(absPath); if (!st) continue;
    const mtimeMs = st.isDirectory() ? newestMtime(absPath) : st.mtimeMs;
    const size = st.isDirectory() ? dirSize(absPath) : st.size;
    const ageDays = (nowMs - mtimeMs) / DAY_MS;
    const kind = st.isDirectory() ? "dir" : (extname(e.name).slice(1).toLowerCase() || "file");
    items.push({ absPath, name: e.name, kind, size, mtimeMs, ageDays: trunc1(ageDays),
                 aged: ageDays >= KEEP_DAYS, category: "scratch", reason: `scratch:tmp/${e.name}` });
  }
  items.sort((a, b) => (b.aged - a.aged) || (b.size - a.size));
  const aged = items.filter((i) => i.aged);
  return { scratchpad, tmp, items, rootSummary: summariseRoot(scratchpad, tmp),
           totals: { entries: items.length, bytes: sum(items), aged: { entries: aged.length, bytes: sum(aged) } } };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test payload/bin/lib/scratch-prune-lib.test.mjs`
Expected: `pass 2`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add payload/bin/lib/scratch-prune-lib.mjs payload/bin/lib/scratch-prune-lib.test.mjs
git commit -m "feat(scratch-prune): scan the disposable tier of a project scratchpad"
```

---

### Task 2: `scratch-prune.mjs` — the engine CLI

**Files:**
- Create: `payload/bin/scratch-prune.mjs`

**Interfaces:**
- Consumes: `scanScratchpad` (Task 1); `claudeDir`, `applyPlan({ dir, items, nowMs, ts })` → `{ batchDir, moved, bytes, skipped }`, `restoreBatch({ dir, ts })` → `{ restored, skipped }`, `purgeRetention({ dir, nowMs })` → `string[]` from `./lib/claude-cleanup-lib.mjs`.
- Produces: the four subcommands of spec § 3 — `scan --scratchpad <abs>` (JSON on stdout; exit 3 when `tmp/` is missing), `apply --plan <file>`, `restore --ts <ts>`, `purge-retention`. Output lines are byte-compatible with `claude-cleanup.mjs` so the SKILL.md wording can quote them.

- [ ] **Step 1: Write the CLI**

```js
// payload/bin/scratch-prune.mjs
import { fileURLToPath } from "node:url";
import { realpathSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { claudeDir, applyPlan, purgeRetention, restoreBatch } from "./lib/claude-cleanup-lib.mjs";
import { scanScratchpad } from "./lib/scratch-prune-lib.mjs";

export function parseArgs(argv) {
  const opts = {};
  const cmd = (argv[0] && !argv[0].startsWith("--")) ? argv[0] : "scan";
  for (let i = (cmd === argv[0] ? 1 : 0); i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === "--scratchpad") opts.scratchpad = next();
    else if (a === "--ts") opts.ts = next();
    else if (a === "--plan") opts.plan = next();
  }
  return { cmd, opts };
}

function isMain() {
  const a = process.argv[1]; if (!a) return false;
  const self = fileURLToPath(import.meta.url);
  if (resolve(a) === self) return true;
  try { return realpathSync(a) === self; } catch { return false; }
}

function stamp(nowMs) { return new Date(nowMs).toISOString().replace(/[:.]/g, "").replace(/-/g, ""); }

export function main(argv = process.argv.slice(2), nowMs = Date.now()) {
  const dir = claudeDir();
  const { cmd, opts } = parseArgs(argv);
  if (cmd === "scan") {
    if (!opts.scratchpad) { process.stderr.write("scan requires --scratchpad <abs path>\n"); process.exitCode = 1; return; }
    const res = scanScratchpad({ scratchpad: resolve(opts.scratchpad), nowMs });
    if (res.error) { process.stderr.write(res.error + "\n"); process.exitCode = 3; return; }
    process.stdout.write(JSON.stringify(res, null, 2));
  } else if (cmd === "apply") {
    if (!opts.plan) { process.stderr.write("apply requires --plan <file>\n"); process.exitCode = 1; return; }
    const finalized = JSON.parse(readFileSync(opts.plan, "utf8"));
    const res = applyPlan({ dir, items: finalized.items, nowMs, ts: finalized.ts || stamp(nowMs) });
    process.stdout.write(`Moved ${res.moved} items (${res.bytes} bytes) to ${res.batchDir}; skipped ${res.skipped}.\n`);
    if (res.skipped) {
      const moved = new Set(JSON.parse(readFileSync(join(res.batchDir, "manifest.json"), "utf8")).entries.map((e) => e.originalAbsPath));
      process.stdout.write(`skipped: ${finalized.items.filter((i) => !moved.has(i.absPath)).map((i) => i.name ?? i.absPath).join(", ")}\n`);
    }
  } else if (cmd === "purge-retention") {
    const removed = purgeRetention({ dir, nowMs });
    process.stdout.write(`Purged ${removed.length} trash batch(es): ${removed.join(", ") || "none"}.\n`);
  } else if (cmd === "restore") {
    if (!opts.ts) { process.stderr.write("restore requires --ts <ts>\n"); process.exitCode = 1; return; }
    const res = restoreBatch({ dir, ts: opts.ts });
    process.stdout.write(`Restored ${res.restored}; skipped ${res.skipped}.\n`);
  }
}

if (isMain()) main();
```

- [ ] **Step 2: Smoke-run the exit-3 path and the scan path against a fixture in this repo's own scratchpad**

The fixture lives in the disposable tier of this project, per the CONVENTIONS rule; it is deleted by name in Step 4.

```bash
cd /d/6__Work/AI_Projects/claude-config
mkdir -p .claude/.scratchpad/tmp/sp-fixture/pylib
printf 'x' > .claude/.scratchpad/tmp/sp-fixture/old.py
printf 'yy' > .claude/.scratchpad/tmp/sp-fixture/pylib/a.py
touch -d '2026-09-01' .claude/.scratchpad/tmp/sp-fixture/old.py
node payload/bin/scratch-prune.mjs scan --scratchpad "$PWD/.claude/.scratchpad/nope"; echo "exit=$?"
node payload/bin/scratch-prune.mjs scan --scratchpad "$PWD/.claude/.scratchpad" | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(r.items.map(i=>[i.name,i.kind,i.aged]), r.rootSummary.entries, r.totals)"
```
Expected: first command prints `no tmp/ under .../nope` on stderr and `exit=3`; second prints one row `[ 'sp-fixture', 'dir', false ]` (its newest file is today's `a.py`), a root entry count ≥ 1 (this repo's root holds `tag.mjs` and others), and totals with `aged.entries: 0`.

- [ ] **Step 3: Smoke-run apply → restore as a round trip on the fixture**

The plan file goes to the session scratchpad from the environment (as the skill itself does), not into `tmp/` — a file created there between scan and apply would be listed at size 0 and then skipped on drift.

```bash
cd /d/6__Work/AI_Projects/claude-config
SP="$PWD/.claude/.scratchpad"
PLAN="<session-scratchpad>/sp-plan.json"
node payload/bin/scratch-prune.mjs scan --scratchpad "$SP" > "$PLAN"
node payload/bin/scratch-prune.mjs apply --plan "$PLAN"
ls .claude/.scratchpad/tmp/
```
Expected: `Moved 1 items (3 bytes) to C:\Users\Axa\.claude\.cleanup-trash\<ts>; skipped 0.` and `tmp/` is empty. Then:

```bash
node payload/bin/scratch-prune.mjs restore --ts <ts>
ls .claude/.scratchpad/tmp/sp-fixture/pylib
ls "$HOME/.claude/.cleanup-trash/"
```
Expected: `Restored 1; skipped 0.`, `a.py` is back, and the `<ts>` batch directory is gone (a fully restored batch removes itself).

- [ ] **Step 4: Delete the fixture by name**

```bash
cd /d/6__Work/AI_Projects/claude-config
rm .claude/.scratchpad/tmp/sp-fixture/pylib/a.py .claude/.scratchpad/tmp/sp-fixture/old.py "<session-scratchpad>/sp-plan.json"
rmdir .claude/.scratchpad/tmp/sp-fixture/pylib .claude/.scratchpad/tmp/sp-fixture
ls -a .claude/.scratchpad/tmp/
```
Expected: `tmp/` is empty (keep the directory: it is this project's disposable tier from now on).

- [ ] **Step 5: Commit**

```bash
git add payload/bin/scratch-prune.mjs
git commit -m "feat(scratch-prune): engine CLI — scan, apply, restore, purge-retention over the shared trash"
```

---

### Task 3: `SKILL.md` — the dialogue

**Files:**
- Create: `payload/skills/scratch-prune/SKILL.md`

**Interfaces:**
- Consumes: the CLI of Task 2 at `~/.claude/bin/scratch-prune.mjs`; the session scratchpad path from the environment for the plan file.
- Produces: the user-facing `/scratch-prune` skill. `disable-model-invocation: true` keeps its description out of the model's context; only `Bash(node *)` and `AskUserQuestion` are available inside it.

- [ ] **Step 1: Write the skill**

````markdown
---
name: scratch-prune
description: Prune the disposable tier of this project's scratchpad, .claude/.scratchpad/tmp/ — one table of entries with age and size, the user picks, the chosen names move to the shared 7-day restorable trash. The scratchpad root is one summary line and is never proposed.
disable-model-invocation: true
allowed-tools: Bash(node *), AskUserQuestion
---

# /scratch-prune

Prune `<project>/.claude/.scratchpad/tmp/` with the `~/.claude/bin/scratch-prune.mjs` engine.
Candidates are the immediate children of `tmp/` only; the scratchpad root is reported as one
summary line and is never proposed. Nothing is deleted outright: chosen entries move to
`~/.claude/.cleanup-trash/<ts>/` and stay restorable for 7 days.

Terms: an **entry** is one immediate child of `tmp/`, file or directory — a directory is one
entry, aged by its newest file, sized as the sum. **Aged** means 7 days or older.

Follow these steps:

1. **Retention.** Run `node ~/.claude/bin/scratch-prune.mjs purge-retention` and report its
   line (`Purged N trash batch(es): …`). It drops batches older than 7 days left by any earlier
   `/scratch-prune` or `/claude-cleanup` run.

2. **Scan.** Resolve the project root with
   `node -e "console.log(process.env.CLAUDE_PROJECT_DIR || process.cwd())"`, then run:

   ```
   node ~/.claude/bin/scratch-prune.mjs scan --scratchpad "<root>/.claude/.scratchpad"
   ```

   Read-only. Prints JSON `{ scratchpad, tmp, items, rootSummary, totals }`. Exit code 3 with
   `no tmp/ under …` on stderr: say the scratchpad has no `tmp/` and stop — do not create it.
   `items: []`: show the root summary line (step 3) and stop.

3. **Table.** One table over `items` in scan order: `#`, name (directories with a trailing `/`),
   kind, size in human units, age in whole days (round `ageDays` down), and an `aged` mark.
   Under it one line from `rootSummary` — `root: <entries> entries, <bytes>; largest: <name>
   <size>, …` — then `totals` (entries, bytes, aged entries and bytes). State that nothing has
   moved.

4. **Selection.** Ask one `AskUserQuestion` about the aged set: *remove all N (X MB)* / *pick by
   number* / *keep all*. Then, in plain text, invite indices for anything else: "номера через
   запятую, или «нет»". Take the chosen rows from `items` exactly as scanned — `absPath`, `size`,
   `category`, `reason`, `mtimeMs` unmodified.

5. **Confirm.** Show the final set — count, bytes, every name — and ask yes/no. On no, stop:
   nothing is written.

6. **Apply.** Write the plan into the session scratchpad named in your environment, never into
   the project `tmp/`:

   ```
   node -e "require('fs').writeFileSync(process.argv[1], require('fs').readFileSync(0,'utf8'))" "<session-scratchpad>/scratch-prune-plan.json" <<'JSON'
   { "items": [ ... ] }
   JSON
   node ~/.claude/bin/scratch-prune.mjs apply --plan "<session-scratchpad>/scratch-prune-plan.json"
   ```

   Apply re-checks each entry's live mtime against the scanned `mtimeMs` and skips it on drift.
   It prints `Moved N items (B bytes) to <batchDir>; skipped S.` and, when `S > 0`, a second
   line `skipped: <names>`. Report the bytes moved, every skipped name, the batch `<ts>` (the
   last path segment of `<batchDir>`), the restore command
   `node ~/.claude/bin/scratch-prune.mjs restore --ts <ts>`, and that the next `purge-retention`
   after 7 days deletes the batch for good.

Out of scope: the scratchpad root (its per-path rule stays a human job); worktree scratchpads
(`<root>/.claude/worktrees/*/.claude/.scratchpad/` — a session in that worktree runs its own
`/scratch-prune`); the session temp tree `C:\_Temp\claude\…` (`/claude-cleanup`).
````

- [ ] **Step 2: Check the frontmatter parses and the skill is whole**

Run: `node -e "const s=require('fs').readFileSync('payload/skills/scratch-prune/SKILL.md','utf8'); const fm=s.split('---')[1]; console.log(fm.trim().split('\n').map(l=>l.split(':')[0]))"`
Expected: `[ 'name', 'description', 'disable-model-invocation', 'allowed-tools' ]`.

- [ ] **Step 3: Commit**

```bash
git add payload/skills/scratch-prune/SKILL.md
git commit -m "feat(scratch-prune): the /scratch-prune skill — table, selection, confirm, apply"
```

---

### Task 4: Documents that state the shipped unit

**Files:**
- Modify: `README.en.md` (after the `Cleaning up ~/.claude` bullet, ~line 358; `bin/` tree after `claude-cleanup.mjs` ~line 445; `skills/` tree after `model-selection-policy/SKILL.md` ~line 470)
- Modify: `README.md` (same three places: ~line 347, ~432, ~457)
- Modify: `.ultrapowers/ROADMAP.md` (frontmatter, leading paragraph, phase table)
- Modify: `.ultrapowers/RESUME.md` (`## Open`, first bullet)
- Create: `.ultrapowers/phases/16-scratch-prune/16-STATE.md`

**Interfaces:**
- Consumes: the file names of Tasks 1–3.
- Produces: nothing executable. The RESUME ruling binds: a change of status updates every document that states it.

- [ ] **Step 1: README.en.md — feature bullet, inserted right after the `Cleaning up ~/.claude` bullet (after the line ending `stays restorable for 7 days.`)**

```markdown
- **Pruning a project scratchpad** — the `/scratch-prune` skill + `bin/scratch-prune.mjs`. Scope is
  the disposable tier only, `<project>/.claude/.scratchpad/tmp/`: one table of entries (a directory
  is one entry, aged by its newest file), an `AskUserQuestion` over the 7-day-old set, indices for
  the rest, a yes/no, then the chosen names move to the same `~/.claude/.cleanup-trash/<batch>/`
  and stay restorable for 7 days. The scratchpad root is one summary line and is never proposed.
  User-invoked only (`disable-model-invocation`).
```

Tree lines (same column as their neighbours):

```
    scratch-prune.mjs                    # the /scratch-prune engine (project scratchpad tmp/ → shared trash)
```
after `claude-cleanup.mjs`, and
```
    scratch-prune/SKILL.md               # /scratch-prune — prune <project>/.claude/.scratchpad/tmp/ (user-invoked)
```
after `model-selection-policy/SKILL.md`.

- [ ] **Step 2: README.md — the same three insertions in Russian**

```markdown
- **Чистка scratchpad проекта** — skill `/scratch-prune` + `bin/scratch-prune.mjs`. Область — только
  одноразовый ярус `<project>/.claude/.scratchpad/tmp/`: одна таблица записей (каталог — одна
  запись, возраст по самому свежему файлу), `AskUserQuestion` по набору старше 7 дней, номера для
  остального, да/нет — и выбранные имена переезжают в ту же `~/.claude/.cleanup-trash/<партия>/`,
  восстановимо 7 дней. Корень scratchpad — одна строка сводки, никогда не предлагается. Только по
  вызову пользователя (`disable-model-invocation`).
```
```
    scratch-prune.mjs                    # движок /scratch-prune (tmp/ scratchpad проекта → общая корзина)
```
```
    scratch-prune/SKILL.md               # /scratch-prune — чистка <проект>/.claude/.scratchpad/tmp/ (по вызову)
```

- [ ] **Step 3: ROADMAP.md**

Frontmatter: `updated: 2026-09-20`; append to `phases:`
```yaml
  - { phase: "16", slug: scratch-prune, status: complete, delivery: merged }
```
`current` stays `null` (the phase is merged in the same session it opened). `deployed_through` is set in Task 5 after the deploy.

Prepend to the prose, above the existing `Nothing is running. Fourteen phases…` paragraph (that paragraph stays as the 2026-08-02 record):

```markdown
Nothing is running. Phase 16 (`scratch-prune`) opened and merged on 2026-09-20: a user-invoked
skill that prunes the disposable tier of a project scratchpad (`.claude/.scratchpad/tmp/`) into
the shared `claude-cleanup` trash — the option-B step of the scratchpad-hygiene brief, whose
two-tier rule landed in `CLAUDE.md` on 2026-09-19 (`cba3614`). Spec and plan in
`phases/16-scratch-prune/`. The paragraphs below record the 2026-08-02 state.
```

Table: append after the `| 15 …` row:
```markdown
| 16 scratch-prune | complete | merged into `master`, branch deleted |
```

- [ ] **Step 4: RESUME.md — first bullet under `## Open`**

```markdown
- **Restart Claude Code after the 2026-09-20 deploy.** Phase 16's `/scratch-prune` skill and the
  two-tier scratchpad rule of 2026-09-19 are on disk; skills and `CLAUDE.md` load at startup.
```

- [ ] **Step 5: 16-STATE.md**

```markdown
# Phase 16 — scratch-prune — state

- **Status:** complete; `delivery: merged` (feat/scratch-prune → master, `--no-ff`).
- **Tasks:** 5/5 — scanner + contract tests, engine CLI, SKILL.md, documents, finish (suite, merge, deploy).
- **Spec:** `16-SPEC.md` (verbatim copy of the ai_rent brainstorm of 2026-09-20). Deviations are
  listed in `16-PLAN.md` § Global Constraints.
- **Deploy impact:** three new files under `~/.claude/` (`bin/scratch-prune.mjs`,
  `bin/lib/scratch-prune-lib.mjs`, `skills/scratch-prune/SKILL.md`), no settings, no hooks, all
  profiles. Verified by `node setup.mjs --dry-run` before the real run.
- **Verification:** `node --test` full suite green on the merged tree; smoke round trip
  scan → apply → restore on a fixture in this repo's `.claude/.scratchpad/tmp/` (Task 2).
- **Touches:** `RISK-CLAUDEMD-002` — the skill and the rule name `tmp/`, which nothing creates or
  verifies mechanically.
```

- [ ] **Step 6: Commit**

```bash
git add README.en.md README.md .ultrapowers/ROADMAP.md .ultrapowers/RESUME.md .ultrapowers/phases/16-scratch-prune/
git commit -m "docs(scratch-prune): phase 16 — READMEs, roadmap, resume, spec and plan"
```

---

### Task 5: Finish — suite, merge, deploy

- [ ] **Step 1: Full suite on the branch**

Run: `node --test`
Expected: `fail 0` (365 + 2 new).

- [ ] **Step 2: Merge**

```bash
git checkout master
git merge --no-ff -m "Merge feat/scratch-prune: prune a project scratchpad's tmp/ into the shared trash" feat/scratch-prune
git rev-parse feat/scratch-prune^{tree} HEAD^{tree}   # identical → the suite result carries over
git branch -d feat/scratch-prune
```

- [ ] **Step 3: Deploy — dry-run, then ask, then `--replace-all`**

```bash
node setup.mjs --dry-run 2>&1 | grep -n "scratch-prune\|would remove\|would clean\|conflict\|by category" 
```
Expected: three `scratch-prune` lines marked new/updated, no other `would remove`/`would clean` beyond what the user has already seen. Present the summary and ask; on yes:

```bash
node setup.mjs --replace-all
ls "$HOME/.claude/bin/scratch-prune.mjs" "$HOME/.claude/bin/lib/scratch-prune-lib.mjs" "$HOME/.claude/skills/scratch-prune/SKILL.md"
```

- [ ] **Step 4: Waterline**

In `.ultrapowers/ROADMAP.md` set `deployed_through: "16"` and, in the phase-16 paragraph, append `Deployed from \`master\` on 2026-09-20.`; in the phase table change the 16 row to `merged into \`master\`, branch deleted; deployed 2026-09-20`. Commit:

```bash
git add .ultrapowers/ROADMAP.md
git commit -m "docs(roadmap): waterline at 16 after the 2026-09-20 deploy"
```

- [ ] **Step 5: Report**

Tell the user: restart Claude Code (skills load at startup); `/scratch-prune` needs a `tmp/` to exist — the ai_rent backlog migration (brief step 4) is what creates it there.
