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

4. **Selection.** When `totals.aged.entries` is 0, skip the question and go straight to the
   indices prompt below. Otherwise ask one `AskUserQuestion` about the aged set: *remove all N
   (X MB)* / *pick by number* / *keep all*. Then, in plain text, invite indices for anything
   else: "номера через запятую, или «нет»". Take the chosen rows from `items` whole and exactly
   as scanned — every field, `name` included; `absPath`, `size`, `category`, `reason`, `mtimeMs`
   unmodified.

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
   A plan that names anything outside `<scratchpad>/tmp/` is refused before any move (exit code 2).
   It prints `Moved N items (B bytes) to <batchDir>; skipped S.` and, when `S > 0`, a second
   line `skipped: <names>`. Report the bytes moved, every skipped name, the batch `<ts>` (the
   last path segment of `<batchDir>`), the restore command
   `node ~/.claude/bin/scratch-prune.mjs restore --ts <ts>`, and that the next `purge-retention`
   after 7 days deletes the batch for good.

Out of scope: the scratchpad root (its per-path rule stays a human job); worktree scratchpads
(`<root>/.claude/worktrees/*/.claude/.scratchpad/` — a session in that worktree runs its own
`/scratch-prune`); the session temp tree `C:\_Temp\claude\…` (`/claude-cleanup`).
