# Phase 28 — lean process: one plan per phase, deltas rewritten, fork on 7.0.1

**Goal:** a phase produces one living document (its plan), the tree keeps two (ROADMAP, RESUME),
and the ultrapowers fork ships that model on upstream superpowers 7.0.1.

**Branch:** `phase-28-lean-process` from `master`, squash-merged. Fork work on
`D:\5__AIWorks\ultrapowers` branches `patch` and `main`, published only on the user's explicit yes.

**Constraints:**
- Instructions, not justifications, in every file an AI reads (skills, CLAUDE.md fragments).
- Nothing edited under `~/.claude/`; every change reaches the machine through `node setup.mjs`.
- Deletion by named path; no recursive delete; no `git clean`/`reset --hard`.
- Fork licence files stay byte-for-byte (LICENSE, plugin LICENSE, README attribution, manifest).
- `/up-update update` never publishes without `--publish`; `--publish` only after the user says yes.

**Out of scope:** upstream features new in 7.0.1 beyond what the deltas touch (antigravity
marketplace, writing-skills references) — they are classified and carried as upstream ships them;
the statusline's rendering beyond what the STATE removal forces; the WinIso tree (it adopts the
model when its next phase starts).

---

## The process-document model (stage 1 deliverable, decided here)

Per project, under `.ultrapowers/`:

| Document | Holds | Written when | Never holds |
|---|---|---|---|
| `ROADMAP.md` | frontmatter `current`, `deployed_through`, `updated`; one table row per phase: `NN`, slug, one-line goal, `status`, `delivery` | a phase is added, starts, ends, merges or deploys | prose history, per-phase detail, rulings |
| `phases/NN-slug/NN-PLAN.md` | header (Goal, Branch, Constraints, Out of scope, Design ≤300 words when the work is architectural); stages → tasks with `- [ ]` boxes, each task: files, steps, acceptance lines; a one-line `Ruling:` under a task when execution deviated; a `Result:` line per stage (commit range, suite count) | written before the work; boxes ticked and `Ruling:`/`Result:` lines added during it; rewritten in place, never versioned beside itself | a copy of a spec, a task-by-task narrative, review transcripts |
| `RESUME.md` | `## Summary` (≤5 lines: where the project stands, what is uncommitted or undeployed) and `## Open` (ordered next steps, the first concrete enough to start cold) | at a save point | `## Done` — git log and the ticked plans hold it; a closed item is deleted |
| `sdd/<kind>-<NN>-<slug>/progress.md` (git-ignored) | the executor's ledger as today: `Task N: complete`, `Ruling:` lines | per task, by the scripts | anything that must outlive the phase — that goes to the plan's `Ruling:`/`Result:` lines before the workspace is deleted by name |

Not produced any more: `NN-SPEC.md` (the design is the plan header), `NN-STATE.md` (the plan's
boxes are the state; ROADMAP has the status), `NN-SUMMARY.md` and `NN-VERIFICATION.md` (the ticked
plan with its `Result:` lines is the record; the final whole-branch review stays and its verdict is
the stage `Result:`), `BUGS.md`, `RISK_REGISTER.md`, `GLOSSARY.md`, `adr/`.

- **Bugs:** a bug found during the work is fixed in the work, under systematic-debugging. One
  outside the work's scope becomes a line in `RESUME.md` `## Open` or a ROADMAP row; it is never
  logged beside the work and carried across sessions.
- **Risks:** a risk is closed in place (a test, a guard, a constraint in the plan header) or
  delegated to a named phase as part of that ROADMAP row's goal. No register.
- **Save point:** plan written; stage done; phase done. Each writes `RESUME.md`; a phase end also
  writes its ROADMAP row.
- **Brainstorming:** spike and bounded paths unchanged (in-chat). Architectural path ends by
  writing the plan header's Design section and handing to writing-plans for the tasks — one
  document, one approval gate for the design, one for the tasks.
- **Rulings reach the user once:** in the final message of the run. The plan's `Ruling:` lines are
  the persistent copy. No third copy.

---

## Stage 1 — apply the model to claude-config

**Why:** the installer carries the user-scope rules and the tooling that assumes BUGS, RISK_REGISTER,
ADR, GLOSSARY and NN-STATE exist; left in place they contradict the skills stage 2 ships.
**Why this way:** the bundle is where behaviour on this machine comes from; deleting the dead
tooling here is what makes the fork change hold without a second source of truth.

### Task 1.1 — CLAUDE.md fragments
Files: `payload/claude-md/06-collaboration.md`, `07-conventions.md`, `17-save-points.md`.
- [x] 06: replace the RISK_REGISTER bullet with: a risk is closed in place or delegated to a named
      ROADMAP phase; flag a decision that touches a delegated risk.
- [x] 07: replace the Bug log bullet with: a bug found during the work is fixed in the work; one
      outside its scope goes to `RESUME.md` `## Open`. Keep the testing-mode, cadence, tier and
      prune bullets; the scratchpad bullet keeps `current` in `ROADMAP.md`.
- [x] 17: `RESUME.md` sections `## Summary` and `## Open` only; a closed item is deleted; a plan's
      boxes are its state.
- [x] Acceptance: assembled text contains no `RISK_REGISTER`, `BUGS.md`, `## Done` (checked with
      `assembleClaudeMd` directly; no new test — a string absence is obvious from the fragments).

### Task 1.2 — remove the decision-records tooling
Files: `payload/bin/adr.mjs`, `glossary.mjs`, `risks.mjs`, `payload/bin/lib/records-paths.mjs`,
`payload/hooks/decision-records-nudge.mjs`, their tests, `setup.mjs` (hook registration, purge
list), `bundle.json` (if listed), `README.md`/`README.en.md` rows, `payload/hooks/lib/phase-segment.mjs`,
`payload/hooks/phase-end-cleanup-nudge.mjs`.
- [x] Delete the three CLIs, the libs, the hook and their tests by name; drop the hook from
      `settings.partial.json`; add the eight deployed paths to `RETIRED_RELS` in `setup.mjs`.
- [x] `phase-segment.mjs`: the running phase's slug from `ROADMAP.md` (`current`, else the single
      `running` row), else the git branch name; one word, no counters.
      Ruling: the ledger is no longer read either (decision 5 asked for the name only), so the
      segment never depends on the SDD workspace layout.
- [x] `phase-end-cleanup-nudge.mjs`: fires when a write to `ROADMAP.md` moves `current` off a
      phase whose row reads `complete`; previous `current` kept in `.claude/.scratchpad/.phase-current`.
- [x] Acceptance: the two hooks smoke-tested by hand (`phase-end-cleanup-nudge` on a ROADMAP
      write, `readPhaseState` on this tree); suite 237/237. Their unit tests were pruned before
      this phase, and neither is an install or rebuild path, so none were re-added.

### Task 1.3 — this tree's own documents
- [x] `ROADMAP.md` → closed phases collapsed to one line (decision 4), rows for 28 and 29, then
      30–33 from the delegated risks; schema comment in the frontmatter (decision 3).
- [x] `RESUME.md` → `## Summary` + `## Open`; three rulings moved to the project `.claude/CLAUDE.md`.
- [x] `BUGS.md`: `BUG-005` → `RESUME.md` `## Open` as one line; file deleted.
- [x] `RISK_REGISTER.md`: 40 closed, 8 delegated to ROADMAP rows 30–33; file deleted on the
      user's yes (`5b081fb`).
- [x] `GLOSSARY.md`, `adr/0001-0003`: deleted (git keeps them).
- [x] Per-phase SPEC/STATE/SUMMARY/VERIFICATION (70) and `docs/*deploy-impact*` (5): deleted by
      name (decision 1).
- [x] Project `.claude/CLAUDE.md`: risk-register and bug-log sections replaced by three project rules.
- [x] Acceptance: `node run-tests.mjs` 237/237.

### Task 1.4 — review and deploy
- [x] Final whole-branch review (fresh reviewer, Opus 5.5): 1 Critical, 4 Important, 9 Minor.
      Fixed in one pass: the retired hook's `settings.json` entry (added to `RETIRED_HOOK_FILES`,
      e2e test extended); the nudge no longer depends on a remembered `current` — it nudges the
      highest-numbered `complete` row that is not current and not yet nudged (`.phase-current`
      gone); ROADMAP frontmatter names `phases:` as the machine-readable source and carries rows
      29–33; `rules-src/testing.md` without the bug log and the spec; README statusline sections
      replaced by one paragraph; `12-model-selection` "plan or spec review" → "plan review";
      command description and a stale comment. Suite 237/237.
      Deferred minors: code comments still cite `22-SPEC.md` (`scratchpad-layout-guard.mjs`,
      `scratchpad-temp-env.mjs`, `claude-cleanup-lib.mjs`); `branchName` climbs up to 16 parents,
      so a git-less project inside another repo shows that repo's branch.
      Ruling: no unit tests re-added for the two rewritten hooks — neither is an install or
      rebuild path; `decide()` was exercised by hand on four ROADMAP shapes.
- [ ] Squash-merge into `master`, push, `node setup.mjs --replace-all` from `master`; the eight
      retired paths gone from `~/.claude`, the hook entry gone from `settings.json`.

**Result:** _(filled at stage end)_

---

## Stage 2 — re-author the fork deltas against 7.0.1

**Why:** the eight refusing deltas are where the bureaucracy lives (audit §1–§6); rebuilding them
as they are would ship it again on a newer base.
**Why this way:** deltas are rewritten against the 7.0.1 `original` tree in the local clone, so
each is checked by `transform/patch.mjs` before `/up-update` ever sees it, and the licence
assertions run in the same build.

### Task 2.1 — base
- [x] `original` → orphan commit of the `v7.0.1` tree, tag `upstream/7.0.1`; `config.json`
      `originalTag`/`originalTree` moved, revision 1. Deltas authored in a scratch repo built from
      `build-cli.mjs emit --base` (one commit per delta, exported with `git diff`).

### Task 2.2 — deltas
- [x] **Deleted** `008-sdd-summary`, fork-owned `summary-writer-prompt.md`, `verification-prompt.md`.
      Ruling: `006-grilling-fact-lookup` deleted too — upstream 7.0.1's brainstorming already
      looks before asking and recommends with each question; the delta is obsolete.
- [x] **007-planning-tree**: the design is the header of `NN-PLAN.md`; writing-plans appends tasks
      below it; "the spec" means the header; workspace path text only.
      Ruling: the fork's `sdd-workspace` rewrite is dropped — upstream's 7.0.1 script already
      disambiguates same-basename plans by parent directory and records the owner; its fork test
      (`transform/sdd-workspace.test.mjs`) goes with it.
- [x] **009-plan-is-the-state**: tick the box and copy `Ruling:` lines into the plan per task;
      `Result:` lines and the ROADMAP row at the end; workspace deleted by name (`plan-path` marker).
- [x] **010-stack-drift-check**: the stack-rules check in "Look Before You Ask"; nothing else.
- [x] **014-test-after-coverage**: re-anchored (TDD skill unchanged upstream; SDD text that moved
      to `references/` edited there). Removed: bug log everywhere, "reconcile into spec", the
      "Drain the bug log" node and step. The design lists the behaviours the tests confirm.
- [x] **011, 015** re-anchored (checks 6 and 7 after upstream's new check 5; diagnosing hunk 6).
- [x] **001–005, 016** unchanged.
- [x] Acceptance: `build-cli.mjs check` applies 12/12; `node --test transform/` 65/65; `drift`
      clean after `commit`; grep for SUMMARY/STATE/BUGS/RISK_REGISTER/GLOSSARY/adr in the built
      skills is empty.

### Task 2.3 — inventory
- [x] `.antigravity-plugin/**` → `ignored` rule; `inventory.mjs sync upstream/7.0.1` accepted the
      24 proposals and dropped the 25 gone paths; `describesTag` moved.
- [x] Fork READMEs (plugin en/ru, repo en/ru): delta table and counts rewritten.

**Result:** fork `patch` at `badd113`, `main` rebuilt at `ce3d563` (`7.0.1-up.1`), not pushed.

---

## Stage 3 — rebuild, publish, install

**Why:** a delta set that builds locally is not on any machine until the fork's `main` is rebuilt
and the plugin updated.
**Why this way:** `/up-update update` rebuilds in a throwaway clone and refuses on any drift, so the
published `main` is exactly original + patch — the same guarantee every earlier revision had.

- [ ] On the user's yes: push `patch`, `main` and `+original` with the `upstream/7.0.1` tag from
      the local clone. Ruling: `/up-update update` cannot land a release whose deltas were
      re-authored locally (it refuses on `main` drift against the old `patch`); that gap is
      ROADMAP row 31. `/up-update check` afterwards must report up to date with 12 deltas.
- [ ] User runs `/plugin update ultrapowers` and restarts; `README.md`/`README.en.md` here name the
      new base version; commit.
- [ ] Finish the branch (squash-merge into `master`, push, prune), `ROADMAP.md` row 28 `complete`,
      `RESUME.md`.

**Result:** _(filled at stage end)_

---

## Decisions taken 2026-10-26

1. The 70 per-phase documents (SPEC/STATE/SUMMARY/VERIFICATION) and the 5 `docs/` impact
   assessments are deleted; git keeps them.
2. `RISK_REGISTER.md`: each Open risk is closed with a one-line reason or delegated to a ROADMAP
   row; the list is shown before the file is deleted.
3. Standing rulings: three survive as one-line rules in the project `.claude/CLAUDE.md` —
   payload-only development with its exceptions; deploy from `master` only, via `node setup.mjs`;
   a shipped or removed unit updates the READMEs that describe or count it in the same commit.
   The status schema lives in `ROADMAP.md`'s frontmatter comment. Layout, "never drop what is
   finished", the statusline measurements and the withdrawn deploy warning are dropped.
4. `ROADMAP.md` collapses closed phases: one line `phases 01–NN closed` instead of a row each;
   rows only for the phases still open or in flight.
5. The statusline phase segment shows only the phase slug (or the branch name when no phase is
   running), in the position after the `DS` segment.
6. A dropped task in a plan is marked `- [-]` with a `Ruling:` line.
