---
name: scratch-prune
description: Clean this project's .claude/.scratchpad/ and its harness temp session dirs. Modes — bare /scratch-prune (legacy content outside the layout, adhoc/ older than 24h, proc/ older than 2h, this project's ended harness sessions older than 24h); /scratch-prune phase <NN> (the same plus phase-<NN>/, run at phase end); /scratch-prune --all-harness (the same plus every project's harness sessions on this machine, after one yes/no). Scripts are judged for reuse and promoted to .claude/tools/; the rest goes to the 7-day restorable trash; harness dirs are deleted outright.
allowed-tools: Bash(node *), AskUserQuestion
---

# /scratch-prune

Clean `<project>/.claude/.scratchpad/` and the harness temp session dirs with the
`~/.claude/bin/scratch-prune.mjs` engine. Project content moves to
`~/.claude/.cleanup-trash/<ts>/` and stays restorable for 7 days. Harness session dirs are
deleted outright. Reusable scripts move to `<project>/.claude/tools/` with a row in its
`INDEX.md`.

Modes:

| Invocation | Cleans |
|---|---|
| `/scratch-prune` | legacy (everything outside the layout), `adhoc/` older than 24h, `proc/` older than 2h, this project's ended harness session dirs older than 24h |
| `/scratch-prune phase <NN>` | the above plus `phase-<NN>/` |
| `/scratch-prune --all-harness` | the above plus every project's harness session dirs on this machine |

Questions: none for this project's own content and none for this project's harness dirs. One
yes/no for `--all-harness`, in step 5.

Follow these steps:

1. **Resolve.**
   - `<root>`: `node -e "console.log(process.env.CLAUDE_PROJECT_DIR || process.cwd())"`.
     `<scratchpad>` = `<root>/.claude/.scratchpad`.
   - `<today>`: `node -e "console.log(new Date().toLocaleDateString('sv'))"` (`YYYY-MM-DD`).
     `<plan>` = `<scratchpad>/adhoc/<today>-scratch-prune/plan.json`.
   - From the harness scratchpad path your environment names, shape
     `<TEMP_ROOT>/<slug>/<session-uuid>/scratchpad`, walk up:
     `<session-uuid>` = the scratchpad's parent directory, `<slug>` = the uuid dir's parent,
     `<TEMP_ROOT>` = the slug dir's parent. Never put that scratchpad path itself in a command.
     No such path in your environment: skip every harness step and say so in the report.

2. **Scan the project.** Run each scan of the chosen mode:

   ```
   node ~/.claude/bin/scratch-prune.mjs scan --scratchpad "<scratchpad>" --legacy
   node ~/.claude/bin/scratch-prune.mjs scan --scratchpad "<scratchpad>" --adhoc
   node ~/.claude/bin/scratch-prune.mjs scan --scratchpad "<scratchpad>" --proc
   node ~/.claude/bin/scratch-prune.mjs scan --scratchpad "<scratchpad>" --phase <NN>
   ```

   The `--phase` scan only in `phase <NN>` mode. Each prints JSON
   `{ scratchpad, mode, items, totals }`; an item is
   `{ absPath, name, kind, size, mtimeMs, ageHours, category, reason }` with `kind` `script` or
   `data` and `name` relative to `.scratchpad/`. Exit code 3 with `no scratchpad at …`: the
   project has no scratchpad — do not create it, skip steps 3–6 and 8, and report
   "harness cleanup skipped: no `.scratchpad/` found".

3. **Sort the project items.** Keep each item whole and exactly as scanned.
   - `data` items → the project plan.
   - `proc/` items → the project plan, whatever their `kind`.
   - Every other `script` item: read it (a directory: read the scripts inside) and decide.
     Reusable = parameterised or general enough that later work in this project would run it
     again (a checker, a converter, a probe taking arguments). One-off = hard-coded to one
     phase's files, a single probe, a patch applier. One-off → the project plan. Reusable →
     read `<root>/.claude/tools/INDEX.md` if it exists; a listed tool that already does the
     job makes this copy one-off. Otherwise promote it:

     ```
     node ~/.claude/bin/scratch-prune.mjs promote --project "<root>" --src "<absPath>" --name "<file>" --purpose "<one line>" --usage "<command line>" --origin "<phase NN | adhoc | legacy>"
     ```

     `--src` is the script file itself; `--name` its file name. `--origin` is `phase NN` for
     `phase-<NN>/` items, `adhoc` for `adhoc/` items, `legacy` for legacy items. It prints
     `{"dest": …}`. `refusing to overwrite …`: pick another name, or treat the copy as one-off
     when the existing tool is the same script. When the promoted file came out of a directory
     entry, re-run that entry's scan and put the directory's fresh item in the project plan
     instead of the old one.

4. **Apply the project plan.** Skip when the plan is empty. Write it and apply it:

   ```
   node -e "const fs=require('fs'),p=process.argv[1];fs.mkdirSync(require('path').dirname(p),{recursive:true});fs.writeFileSync(p,fs.readFileSync(0,'utf8'))" "<plan>" <<'JSON'
   { "scratchpad": "<scratchpad>", "items": [ ... ] }
   JSON
   node ~/.claude/bin/scratch-prune.mjs apply --plan "<plan>" --scratchpad "<scratchpad>"
   ```

   Apply re-checks each item's live mtime against `mtimeMs` and skips it on drift. A plan naming
   anything outside `<scratchpad>` is refused before any move (exit code 2). It prints
   `Moved N items (B bytes) to <batchDir>; skipped S.` and, when `S > 0`, a second line
   `skipped: <names>`. The batch `<ts>` is the last path segment of `<batchDir>`.

5. **Scan the harness.**
   - Default and `phase <NN>` mode:

     ```
     node ~/.claude/bin/scratch-prune.mjs scan --harness "<slug>" --current "<session-uuid>"
     ```

   - `--all-harness` mode:

     ```
     node ~/.claude/bin/scratch-prune.mjs scan --harness-all --current "<session-uuid>"
     ```

   Each prints `{ tempRoot, registry, items, totals }`; an item is
   `{ absPath, name: "<slug>/<uuid>", slug, uuid, kind, size, mtimeMs, ageHours, category, reason }`.
   The current session, every other active session (whatever its age) and dirs changed in the
   last 24 hours are already left out. `registry: "unavailable"` means the session registry could
   not be read: `items` is empty; report that the harness part was skipped. When
   `tempRoot` is not `<TEMP_ROOT>` (compare case-insensitively, either slash direction), stop
   the harness part: delete nothing and report both paths, e.g.
   "harness cleanup skipped: tempRoot mismatch (environment expects `<TEMP_ROOT>`, scan reported
   `<tempRoot>`)".

   Every item whose `slug` is `<slug>` → the harness plan. In `--all-harness` mode, when other
   slugs are present, show one table — project slug, session count, size — over those items,
   then ask one `AskUserQuestion`: delete them all, yes/no. Yes → add them to the harness plan.
   No → leave them.

6. **Apply the harness plan.** Skip when the plan is empty. Write it to `<plan>` (overwriting
   the project plan) and delete:

   ```
   node -e "const fs=require('fs'),p=process.argv[1];fs.mkdirSync(require('path').dirname(p),{recursive:true});fs.writeFileSync(p,fs.readFileSync(0,'utf8'))" "<plan>" <<'JSON'
   { "items": [ ... ] }
   JSON
   node ~/.claude/bin/scratch-prune.mjs apply --plan "<plan>" --purge-now --current "<session-uuid>"
   ```

   `--purge-now` refuses the whole plan (exit code 2) when any item is not a `<slug>/<uuid>` dir
   under the harness temp root. It skips an item whose live mtime drifted, whose session became
   active, or whose newest file is now younger than 24 hours. It prints
   `Deleted N items (B bytes); skipped S.`

7. **Retention.** Run `node ~/.claude/bin/scratch-prune.mjs purge-retention`. It prints
   `Purged N trash batch(es): …`.

8. **Remove the plan.** When step 4 or 6 wrote it, delete the plan file and its dated
   `<today>-scratch-prune/` folder; if `adhoc/` is now empty too, remove it as well (harmless
   no-op when it still holds other entries):

   ```
   node -e "const fs=require('fs'),path=require('path'),p=process.argv[1],dir=path.dirname(p);fs.unlinkSync(p);fs.rmdirSync(dir);try{fs.rmdirSync(path.dirname(dir))}catch{}" "<plan>"
   ```

9. **Report.** One table: entry (`name`), kind, decision (`trashed` / `promoted → tools/<name>` /
   `deleted` / `skipped`), size in human units. Harness rows of other projects collapse to one
   row per slug: `<slug>/* (N sessions)`. Under it: totals trashed, deleted and promoted; the
   `purge-retention` line; the trash batch `<ts>` and the restore command
   `node ~/.claude/bin/scratch-prune.mjs restore --ts <ts>`, restorable until a
   `purge-retention` run 7 days on. Nothing found in any set: say so in one line.

Out of scope: worktree scratchpads (`<root>/.claude/worktrees/*/.claude/.scratchpad/` — a
session in that worktree runs its own `/scratch-prune`); `~/.claude` itself (`/claude-cleanup`).
