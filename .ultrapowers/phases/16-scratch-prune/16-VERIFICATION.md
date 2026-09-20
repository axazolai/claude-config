---
phase: "16"
slug: scratch-prune
verdict: ACHIEVED
verified_against: ad3e922..48a88e4 (5 commits)
verified: 2026-09-20
---

# Phase 16 — scratch-prune — verification

## Goal

> A user-invocable `/scratch-prune` skill that lists `<project>/.claude/.scratchpad/tmp/`, lets
> the user choose, and moves the chosen names into the shared `claude-cleanup` trash — shipped
> through `payload/` and `node setup.mjs`.

Verdict: **ACHIEVED** — every claim in the goal has a file, a symbol or a test in the branch
that delivers it; all Global Constraints hold, including the three recorded spec deviations.
The deploy (plan Task 5) follows the merge and is outside this verification.

Method: read the branch diff and the five shipped files against the plan's Goal and Global
Constraints and the spec's § 3 contract; ran `node --test payload/bin/lib/scratch-prune-lib.test.mjs
payload/bin/scratch-prune.test.mjs` (3 tests, 3 pass, 0 fail, Node v26.7.0); ran the read-only
`scan` on this repo's scratchpad and on a scratchpad without `tmp/`; ran `node setup.mjs --dry-run`
to see what the installer would carry. `apply`, `restore`, `purge-retention` were not run.

## Evidence

| Goal claim | Where it is delivered |
|---|---|
| A user-invocable `/scratch-prune` skill | `payload/skills/scratch-prune/SKILL.md:2` `name: scratch-prune`; `:4` `disable-model-invocation: true` — the skill exists only as a user invocation. |
| lists `<project>/.claude/.scratchpad/tmp/` | `scanScratchpad` in `payload/bin/lib/scratch-prune-lib.mjs:24-42` iterates `safeReaddir(join(scratchpad, "tmp"))` only and emits `items[]` with `name`, `kind`, `size`, `mtimeMs`, `ageDays`, `aged`, `category`, `reason`; the CLI `scan` subcommand prints it as JSON (`payload/bin/scratch-prune.mjs:40-44`); `SKILL.md:24-39` resolves the project root, runs `scan --scratchpad "<root>/.claude/.scratchpad"` and renders the table. Covered by `scratch-prune-lib.test.mjs:25` (`@important scan: …`) — fixture with an 8-day file, a 2-day file, a directory whose newest file is 2 days old, a root entry; asserts kind, aged flag, age, size, reason, aged-first ordering, `rootSummary`, `totals`. Live: `scan` on this repo returned `items: []`, `rootSummary.entries: 21`, exit 0. |
| lets the user choose | `SKILL.md:41-49` — one `AskUserQuestion` over the aged set (*remove all N (X MB)* / *pick by number* / *keep all*), then a plain-text index prompt, then a count/bytes/names confirmation with yes/no; on no, nothing is written. `SKILL.md:5` grants `AskUserQuestion`. This is dialogue text; it has no mechanical test and none was promised. |
| moves the chosen names into the shared `claude-cleanup` trash | `payload/bin/scratch-prune.mjs:45-55` — `apply --plan` reads `{ items }`, refuses anything outside `<…>/.scratchpad/tmp/` (`outsideTmp`, `:28-35`, exit 2), then calls `applyPlan({ dir: claudeDir(), items, nowMs, ts })` from `payload/bin/lib/claude-cleanup-lib.mjs:178`. The batch directory is `join(trashRoot(dir), ts)` = `<CLAUDE_CONFIG_DIR or ~/.claude>/.cleanup-trash/<ts>/` (`claude-cleanup-lib.mjs:160,179`) — the same trash `/claude-cleanup` writes; `restore --ts` and `purge-retention` are the library's `restoreBatch`/`purgeRetention` (`scratch-prune.mjs:57,61`). The move itself is library behaviour with its own tests: `claude-cleanup-lib.test.mjs:103` (`@critical applyPlan moves items to a batch + manifest; restore puts them back`), `:115` (TOCTOU skip), `:124` (manifest written unconditionally), `:148` (`purgeRetention` retention window). The plan items are the scan items passed through unmodified (`SKILL.md:44-46`), which is the format `applyPlan` reads (`absPath`, `mtimeMs`, `size`, `category`, `reason`). |
| shipped through `payload/` and `node setup.mjs` | All three runtime files sit under `payload/` (`payload/bin/scratch-prune.mjs`, `payload/bin/lib/scratch-prune-lib.mjs`, `payload/skills/scratch-prune/SKILL.md`); `variants.json` includes new files unless excluded, and its `alwaysExclude` carries `**.test.mjs` — no profile exclude names `scratch-prune`. `node setup.mjs --dry-run` at 48a88e4 lists exactly `created C:\Users\Axa\.claude\bin\lib\scratch-prune-lib.mjs`, `created …\bin\scratch-prune.mjs`, `created …\skills\scratch-prune\SKILL.md`, and no `*.test.mjs`. The deploy happens after the merge (Task 5) and is out of scope here. |

Additional contract points checked against spec § 3 (all match): `kind` is `dir` / lower-case
extension / `file` (`scratch-prune-lib.mjs:34`); `rootSummary.largest` is at most three
(`:21`); `apply` prints `Moved N items (B bytes) to <batchDir>; skipped S.` (`scratch-prune.mjs:51`);
`purge-retention` prints `Purged N trash batch(es): …` (`:58`); `restore` prints
`Restored N; skipped S.` (`:62`); missing `--scratchpad`, `--plan`, `--ts` and an unknown command
each yield one stderr line and exit 1 (`:41,46,60,63`; confirmed live for `scan` without a path and
for `frobnicate`).

## Global constraints

| Constraint | Status | Checked at |
|---|---|---|
| Everything ships from `payload/`; nothing is written under `~/.claude/` by hand | HELD | Diff touches only `payload/**`, `README*.md`, `.ultrapowers/**`. `setup.mjs --dry-run` reports all three runtime files as `created` — they are absent from `~/.claude/` today, so nothing was placed there by hand. |
| The engine only proposes immediate children of `tmp/`; the scratchpad root appears in `rootSummary` only | HELD | `scratch-prune-lib.mjs:28` reads `tmp` only; `summariseRoot` (`:12-22`) skips `tmp` and emits `{ entries, bytes, largest[{name,size}] }` with no `absPath`, so a root entry cannot become a plan item. Asserted at `scratch-prune-lib.test.mjs:33`. The CLI additionally refuses a plan whose `absPath` is not `<…>/.scratchpad/tmp/<name>` (`scratch-prune.mjs:28-35`, test `scratch-prune.test.mjs:6`, which also rejects a nested `tmp/pylib/a.py`). |
| `KEEP_DAYS` (7) and `RETENTION_DAYS` (7) are imported from `claude-cleanup-lib.mjs`, never redeclared | HELD | `scratch-prune-lib.mjs:5` imports `KEEP_DAYS` (with `DAY_MS`, `newestMtime`, `dirSize`) and uses it at `:36`. Neither new module declares a `KEEP_DAYS`, `RETENTION_DAYS` or a literal `7` (grep). `RETENTION_DAYS` is not imported by name: it reaches the CLI as `purgeRetention`'s default `retentionDays = RETENTION_DAYS` (`claude-cleanup-lib.mjs:214`), which satisfies "never redeclared". |
| `applyPlan`, `restoreBatch`, `purgeRetention` are used unchanged; the trash is `~/.claude/.cleanup-trash/<ts>/` | HELD | `git diff --stat ad3e922..48a88e4 -- payload/bin/lib/claude-cleanup-lib.mjs payload/bin/claude-cleanup.mjs` is empty. Calls at `scratch-prune.mjs:50,57,61` with the library's own signatures; `trashRoot(dir) = join(dir, ".cleanup-trash")` and `batchDir = join(trashRoot(dir), ts)` (`claude-cleanup-lib.mjs:160,179`), `dir = claudeDir()` (`scratch-prune.mjs:38`). |
| `tmp/` missing → exit code 3, one stderr line `no tmp/ under <scratchpad>`, nothing created | HELD | `scratch-prune-lib.mjs:26` returns `{ error }` before any write; `scratch-prune.mjs:43` prints it and sets `exitCode = 3`. Test `scratch-prune-lib.test.mjs:38`. Live: exit 3, exactly one stderr line, target directory listing unchanged afterwards. |
| SKILL.md frontmatter: `name: scratch-prune`, `disable-model-invocation: true`, `allowed-tools: Bash(node *), AskUserQuestion` | HELD | `SKILL.md:2,4,5`, byte-for-byte. `allowed-tools` mirrors `payload/commands/claude-cleanup.md:3`; `disable-model-invocation:` is the field used by the official `claude-security` and `claude-automation-recommender` plugin skills installed on this machine. Every command the skill issues starts with `node` (`SKILL.md:20,25,28,55,58,66`). |
| Rule text and skill text are instructions, not justifications | HELD | `SKILL.md` steps 1–6 are imperative; the spec's explanatory sentences (the four-option cap, why a separate binary) were not carried over. The one parenthetical that states a reason, `:69` "(its per-path rule stays a human job)", restates the scope boundary rather than defending a rejected alternative. |
| Test tiers: `@important` for the scan contract; no tests for `parseArgs` (a mapping) or apply/restore (library behaviour) | HELD | Three tests, all `@important`: `scratch-prune-lib.test.mjs:25,38` (scan contract) and `scratch-prune.test.mjs:6` (`outsideTmp`, added by 48a88e4 — a silent, plausible failure, so the tier fits). No test imports `parseArgs`; no new apply/restore test. |
| Deviation 1 — test file is `bin/lib/scratch-prune-lib.test.mjs`, never deployed | HELD | File exists at `payload/bin/lib/scratch-prune-lib.test.mjs`; `variants.json` `alwaysExclude` has `**.test.mjs`; `setup.mjs --dry-run` output contains no `test.mjs`. |
| Deviation 2 — `ageDays` truncated to one decimal, not rounded, so a displayed age never exceeds the raw age that decided `aged` | HELD | `trunc1 = Math.floor(n * 10) / 10` (`scratch-prune-lib.mjs:9`), applied only to the displayed field (`:35`); `aged` is computed from the untruncated `ageDays` (`:36`). The fixture ages are whole days, so the test would also pass with rounding — the deviation is verified by reading the code, not pinned by a test. |
| Deviation 3 — `apply` prints a second line `skipped: <names>` when anything was skipped | HELD | `scratch-prune.mjs:52-55`: when `res.skipped > 0`, reads `<batchDir>/manifest.json`, takes the set of `originalAbsPath`, and prints the `name` of every plan item not in it. `applyPlan` writes `originalAbsPath: it.absPath` verbatim (`claude-cleanup-lib.mjs:193`), so the set difference is exact. `SKILL.md:63-64` tells the skill to relay it. Untested, consistent with the "no apply tests" tier decision. |

One refinement beyond the recorded deviations: `SKILL.md:41-42` skips the `AskUserQuestion` when
`totals.aged.entries` is 0 and goes straight to the index prompt (added in 48a88e4). Spec § 4 step 4
always asks "about the aged set" and does not address an empty set; the short-circuit removes a
degenerate question (*remove all 0 (0 MB)*) and changes no engine contract. It is not in the plan's
list of three; recording it there is a one-line doc edit, not a defect.

## Gaps

- None against the goal: the skill, the scanner, the CLI, the trash reuse and the `payload/`
  placement are all in the branch.
- Plan Task 5 (full suite, `--no-ff` merge, deploy, ROADMAP waterline, restart notice) is not in
  the branch by construction — the branch is 5 commits ahead of `master` at `ad3e922`, unmerged.
  Note that `16-STATE.md:3-4,10-11` and `ROADMAP.md` (phase-16 row: `merged into master, branch
  deleted`; frontmatter `status: complete, delivery: merged`) already state the post-Task-5
  status, as the plan's Task 4 instructed. At 48a88e4 those lines are ahead of the tree; they
  become true only when Task 5 runs.
- `unverifiable: the scan → apply → restore round trip on a real fixture (plan Task 2 Step 3;
  16-STATE.md claims it ran)` — nothing in the branch records it; this repo's
  `.claude/.scratchpad/tmp/` exists, is empty and git-ignored, which matches Task 2 Step 4 but
  proves no round trip. Settled by re-running the plan's Step 3 commands on the merged tree. The
  library functions the round trip exercises are independently covered by
  `claude-cleanup-lib.test.mjs:103,115,124,148`.
- `unverifiable: full suite green (plan Task 5 Step 1, expected 365 + 2)` — only the two new test
  files were run here (3/3 pass). Settled by `node --test` at Task 5 Step 1.
- `unverifiable: cross-device apply (project on D:, trash on C:)` — no run performed; the EXDEV
  fallback is the library's (`claude-cleanup-lib.mjs:162-176`), and its partial-copy residual is
  recorded under `RISK-CLEANUP-001` in `.ultrapowers/RISK_REGISTER.md` (update of 2026-09-20) with
  the hardening owed. Settled by the first real `/scratch-prune` apply on a `D:` project.
