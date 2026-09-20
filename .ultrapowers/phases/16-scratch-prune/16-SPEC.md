# /scratch-prune — design

Written 2026-09-20 from an `ai_rent` session; step 5 of `scratchpad-hygiene.md` (option B
there). User decisions taken in the brainstorm: scope is `tmp/` only, the root is a summary
line; removals go to the shared `claude-cleanup` trash; the engine is a thin module over
`bin/lib/claude-cleanup-lib.mjs` (approach A). `~/.claude` is not a git repository, so this
document is not committed.

## 1. Purpose

A user-invocable skill that prunes the disposable tier of a project scratchpad,
`<project>/.claude/.scratchpad/tmp/`, the way the CONVENTIONS rule allows: list, let the
user choose, remove the chosen names. The durable tier (the scratchpad root) is shown as
one summary line and never proposed — its per-path rule stays a human job.

Terms used below:

- **entry** — one immediate child of `tmp/`, file or directory. A directory is one entry,
  never split; its age is the age of its newest file (`newestMtime`), its size the sum.
- **aged** — an entry whose age is `KEEP_DAYS` (7) days or more, the same constant
  `claude-cleanup` uses. Aged entries are the ones the rule licenses for removal by age.
- **batch** — one `apply` run: a directory `~/.claude/.cleanup-trash/<ts>/` with a
  `manifest.json`, restorable for `RETENTION_DAYS` (7).

## 2. Placement

| Path | Role |
|---|---|
| `~/.claude/skills/scratch-prune/SKILL.md` | the dialogue; frontmatter `name: scratch-prune`, `disable-model-invocation: true`, `allowed-tools: Bash(node *), AskUserQuestion` |
| `~/.claude/bin/scratch-prune.mjs` | the engine CLI; imports `applyPlan`, `restoreBatch`, `purgeRetention`, `newestMtime`, `dirSize`, `KEEP_DAYS` from `./lib/claude-cleanup-lib.mjs` |
| `~/.claude/bin/lib/scratch-prune-lib.mjs` | `scanScratchpad(...)` — pure, testable |
| `~/.claude/bin/lib/scratch-prune.test.mjs` | the one contract test (`node --test`) |

The project root is `CLAUDE_PROJECT_DIR` when set, else the current directory. The skill
passes the resolved `<root>/.claude/.scratchpad` explicitly as `--scratchpad`; the engine
never guesses a path.

Why a separate `bin/` entry point and not a flag on `claude-cleanup.mjs`: that engine is
allowlist-based over `~/.claude` category roots and its command promises "never outside
them"; a project path would break the promise. The trash contract is shared through the
library, which is the part worth sharing.

## 3. Engine contract

```
node ~/.claude/bin/scratch-prune.mjs scan --scratchpad <abs path>     # read-only, JSON to stdout
node ~/.claude/bin/scratch-prune.mjs apply --plan <file>              # moves items to the trash
node ~/.claude/bin/scratch-prune.mjs restore --ts <ts>                # puts a batch back
node ~/.claude/bin/scratch-prune.mjs purge-retention                  # drops batches older than 7 days
```

`scan` output:

```json
{
  "scratchpad": "D:\\proj\\.claude\\.scratchpad",
  "tmp": "D:\\proj\\.claude\\.scratchpad\\tmp",
  "items": [
    { "absPath": "D:\\proj\\.claude\\.scratchpad\\tmp\\pylib", "name": "pylib", "kind": "dir",
      "size": 55678912, "mtimeMs": 1758000000000, "ageDays": 3.4, "aged": false,
      "category": "scratch", "reason": "scratch:tmp/pylib" }
  ],
  "rootSummary": { "entries": 61, "bytes": 24117248,
                   "largest": [ { "name": "media_session", "size": 8283750 } ] },
  "totals": { "entries": 145, "bytes": 154140672, "aged": { "entries": 12, "bytes": 2306867 } }
}
```

- `items` — one per entry of `tmp/`, sorted aged first, then by size descending. `kind` is
  `dir` or the lower-case extension without the dot (`py`, `json`, `png`, …; a file without
  one is `file`). `category`/`reason`/`mtimeMs`/`size` are the fields `applyPlan` reads —
  passing scan items through unmodified is the whole plan format.
- `rootSummary` — the scratchpad root without `tmp/`: count, bytes, the three largest
  entries. Nothing from the root ever appears in `items`; the engine does not list it as a
  candidate by construction.
- `tmp/` missing → exit code 3, one line on stderr (`no tmp/ under <scratchpad>`), nothing
  created. `tmp/` empty → `items: []`, exit 0.
- `apply` — `applyPlan` from the library, unchanged: re-checks each item's live mtime
  (`newestMtime` for directories) against `mtimeMs`, skips on drift, moves into
  `<trash>/<ts>/<slot>/`, writes `manifest.json` unconditionally, prints
  `Moved N items (B bytes) to <batchDir>; skipped S.` Cross-device moves (project on D:,
  trash on C:) are the library's copy-then-remove fallback.
- `restore` / `purge-retention` — the library functions, re-exported so the skill has one
  binary to name. `node ~/.claude/bin/claude-cleanup.mjs restore --ts <ts>` restores the
  same batch; the manifest holds absolute original paths.

The load-bearing part of `scratch-prune-lib.mjs` (`statOr`, `safeReaddir`, `round1`, `sum`,
`summariseRoot` are local helpers — the cleanup library does not export its own;
`newestMtime`, `dirSize`, `DAY_MS`, `KEEP_DAYS` are imported from it):

```js
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
    const ext = st.isDirectory() ? "dir" : (extname(e.name).slice(1).toLowerCase() || "file");
    items.push({ absPath, name: e.name, kind: ext, size, mtimeMs, ageDays: round1(ageDays),
                 aged: ageDays >= KEEP_DAYS, category: "scratch", reason: `scratch:tmp/${e.name}` });
  }
  items.sort((a, b) => (b.aged - a.aged) || (b.size - a.size));
  const rootSummary = summariseRoot(scratchpad, tmp);   // entries, bytes, largest[3], tmp/ excluded
  const aged = items.filter(i => i.aged);
  return { scratchpad, tmp, items, rootSummary,
           totals: { entries: items.length, bytes: sum(items), aged: { entries: aged.length, bytes: sum(aged) } } };
}
```

## 4. The dialogue (SKILL.md)

1. **Retention.** `purge-retention`; report `Purged N trash batch(es): …` (batches from any
   earlier `/scratch-prune` or `/claude-cleanup` run older than 7 days).
2. **Scan.** Resolve the project root, run `scan`, parse the JSON. Exit 3 → say the
   scratchpad has no `tmp/` and stop.
3. **Table.** One table over `items`: `#`, name (directories with a trailing `/`), kind,
   size (human units), age in whole days, `aged` mark. Then the root summary line
   (`root: 61 entries, 23 MB; largest: media_session/ 7.9M, …`) and the totals. State that
   nothing has moved.
4. **Selection.** `AskUserQuestion`, one question, about the aged set: *remove all N
   (X MB)* / *pick by number* / *keep all*. Then, in plain text, invite indices for
   anything else: "номера через запятую, или «нет»". A numbered list is how a set larger
   than four rows fits the tool's four-option cap. The chosen rows are taken from `items`
   as scanned, unmodified.
5. **Confirm.** Show the final set (count, bytes, the names) and ask yes/no. No → stop,
   nothing written.
6. **Apply.** Write `{ "items": [...] }` with `node -e` into the session scratchpad given in
   the environment (never into the project `tmp/` — it is the thing being pruned), run
   `apply --plan`, report bytes moved, skipped items by name, the batch `<ts>`, the restore
   command and the 7-day window.

## 5. Error handling

- Missing `tmp/`: stop, do not create it.
- Empty `tmp/`: show the root summary and stop.
- Drift between scan and apply: the library skips the item; the skill names each skipped
  entry so the user knows what stayed.
- The plan file is written only after the explicit yes; a "no" leaves no file behind.
- The skill never runs unattended: `disable-model-invocation: true`, and every removal
  passes the table, the selection and the yes/no.

## 6. Testing

One seam: the `scan` contract, checked through `scanScratchpad` on a fixture tree built in
a temporary directory with `utimesSync`: a file 8 days old, a file 2 days old, a directory
whose newest file is 2 days old and oldest 20, a root entry outside `tmp/`. Expected: the
8-day file `aged`, the 2-day file not, the directory not aged (newest file rules), the root
entry absent from `items` and present in `rootSummary`, aged-first ordering. Tier
`@important`: a wrong age is silent and plausible, and its consequence is proposing a
young file for removal. `apply`/`restore` are the library's existing behaviour and get no
new test here. Run: `node --test ~/.claude/bin/lib/scratch-prune.test.mjs`.

## 7. Out of scope

- The scratchpad root: summary only; deletion there stays the per-path rule.
- Worktree scratchpads (`<root>/.claude/worktrees/*/.claude/.scratchpad/`): a session in
  that worktree runs its own `/scratch-prune`.
- The session temp tree `C:\_Temp\claude\…`: `/claude-cleanup`.
- Deciding what is durable: that is the CONVENTIONS rule, not the skill.
- Scheduling, auto-runs, a global sweep over every project.
