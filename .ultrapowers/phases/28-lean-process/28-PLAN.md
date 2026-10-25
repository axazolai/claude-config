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
- [ ] 06: replace the RISK_REGISTER bullet with: a risk is closed in place or delegated to a named
      ROADMAP phase; flag a decision that touches a delegated risk.
- [ ] 07: replace the Bug log bullet with: a bug found during the work is fixed in the work; one
      outside its scope goes to `RESUME.md` `## Open`. Keep the testing-mode, cadence, tier and
      prune bullets; the scratchpad bullet keeps `current` in `ROADMAP.md`.
- [ ] 17: `RESUME.md` sections `## Summary` and `## Open` only; a closed item is deleted; a plan's
      boxes are its state.
- [ ] Acceptance (`payload/bin/lib/assemble-claude-md.test.mjs` already `@important`): assembled
      text contains no `RISK_REGISTER`, `BUGS.md`, `## Done`.

### Task 1.2 — remove the decision-records tooling
Files: `payload/bin/adr.mjs`, `glossary.mjs`, `risks.mjs`, `payload/bin/lib/records-paths.mjs`,
`payload/hooks/decision-records-nudge.mjs`, their tests, `setup.mjs` (hook registration, purge
list), `bundle.json` (if listed), `README.md`/`README.en.md` rows, `payload/hooks/lib/phase-segment.mjs`,
`payload/hooks/phase-end-cleanup-nudge.mjs`.
- [ ] Delete the three CLIs, the lib, the hook and their tests by name; drop the hook from the
      settings template the installer merges; add the five deployed paths to the installer's
      stale-file purge so the next deploy removes them from `~/.claude`.
- [ ] `phase-segment.mjs`: read `ROADMAP.md` `current` + the live ledger only; no `NN-STATE.md`.
- [ ] `phase-end-cleanup-nudge.mjs`: trigger on the ROADMAP row flipping to `complete`, not on a
      `NN-SUMMARY.md` write (its current trigger).
- [ ] Acceptance: `setup.e2e` fresh install writes no `bin/adr.mjs`, `bin/risks.mjs`,
      `bin/glossary.mjs`, `hooks/decision-records-nudge.mjs`; statusline test renders the phase
      segment from ROADMAP + ledger alone (`@critical` if it was, else `@important`).

### Task 1.3 — this tree's own documents
- [ ] `ROADMAP.md` → the table form above (27 rows + phase 28 `running`); keep `deployed_through`.
- [ ] `RESUME.md` → `## Summary` + `## Open` (the standing rulings that still bind move into the
      project `.claude/CLAUDE.md` as one-line rules or are dropped — listed to the user first).
- [ ] `BUGS.md`: `BUG-005` → `RESUME.md` `## Open` as one line; file deleted.
- [ ] `RISK_REGISTER.md`: each Open risk → closed with a one-line reason, or a ROADMAP row goal;
      file deleted. The list goes to the user before deletion.
- [ ] `GLOSSARY.md`, `adr/0001-0003`: deleted (git keeps them).
- [ ] Per-phase `NN-SPEC.md` (20), `NN-STATE.md` (20), `NN-SUMMARY.md` (20), `NN-VERIFICATION.md`
      (10), `docs/*deploy-impact*` (5): deleted by name after the user's confirmation; `NN-PLAN.md`
      files stay as they are (history, not rewritten).
- [ ] Project `.claude/CLAUDE.md`: remove the risk-register and bug-log location sections.
- [ ] Acceptance: `docs-claims`/docs tests green; `node run-tests.mjs` green.

### Task 1.4 — deploy
- [ ] `node setup.mjs --replace-all`; `~/.claude/CLAUDE.md` shows the new 06/07/17 text; the five
      purged paths are gone from `~/.claude`.
- [ ] Commit; `RESUME.md` save point.

**Result:** _(filled at stage end)_

---

## Stage 2 — re-author the fork deltas against 7.0.1

**Why:** the eight refusing deltas are where the bureaucracy lives (audit §1–§6); rebuilding them
as they are would ship it again on a newer base.
**Why this way:** deltas are rewritten against the 7.0.1 `original` tree in the local clone, so
each is checked by `transform/patch.mjs` before `/up-update` ever sees it, and the licence
assertions run in the same build.

### Task 2.1 — base
- [ ] `git fetch upstream`; `original` → tag `upstream/7.0.1`; read 7.0.1 brainstorming,
      writing-plans, executing-plans, subagent-driven-development, test-driven-development to
      anchor the deltas (upstream already leaned plans and scaled brainstorming; take what it gives).

### Task 2.2 — deltas
- [ ] **Delete** `008-sdd-summary` (SUMMARY, read-back), fork-owned `summary-writer-prompt.md`,
      `verification-prompt.md`.
- [ ] **007-planning-tree** → `phase-dir` + `.ultrapowers/phases/NN-slug/NN-PLAN.md` as the one
      document; architectural brainstorming writes the plan header's Design section; no spec file,
      no `refs/`/`docs/` taxonomy prose, no `spec-document-reviewer-prompt.md` (upstream removed it).
- [ ] **009-agent-first** → `009-roadmap-and-plan-state`: tick the task's box and add `Ruling:`
      lines in the plan as the ledger records them; at phase end a `Result:` line per stage and the
      ROADMAP row; no STATE, no VERIFICATION, no "who writes which document" table.
- [ ] **010-design-records** → `010-stack-drift-check`: keep the `stack-rules-check.mjs` step only;
      ADR and glossary bullets gone.
- [ ] **014-test-after-coverage** → re-anchored: testing mode, test-after order, Acceptance lists,
      mutation check, Review Focus lines into task acceptance. Removed: bug log (fixed in-work),
      "reconcile into spec" (plan only), the `Final:` ledger ceremony beyond `fixed`/`Ruling:`.
- [ ] **006, 011, 015** → re-anchored, text unchanged in substance.
- [ ] **001–005, 016** → apply as they are (they did).
- [ ] Acceptance: `node transform/build.mjs` (or `build-cli`) produces a tree; `transform/*.test.mjs`
      green; `grep -r "SUMMARY\|STATE.md\|BUGS.md\|RISK_REGISTER\|GLOSSARY\|adr/" plugins/` empty
      except LICENSE/README attribution lines.

### Task 2.3 — inventory
- [ ] `.antigravity-plugin/plugin.json` → `ignored` (not Claude Code).
- [ ] 24 new paths → accept the rule proposals (12 `tracked` skill references, 12 `ignored`
      assets/docs/tests); 25 removed paths → dropped from the manifest.
- [ ] Acceptance: `up-update check` from the clone reports no unclassified, no new, no missing.

**Result:** _(filled at stage end)_

---

## Stage 3 — rebuild, publish, install

**Why:** a delta set that builds locally is not on any machine until the fork's `main` is rebuilt
and the plugin updated.
**Why this way:** `/up-update update` rebuilds in a throwaway clone and refuses on any drift, so the
published `main` is exactly original + patch — the same guarantee every earlier revision had.

- [ ] Push `patch`; `node ~/.claude/bin/up-update.mjs update` → prepared, no refusal. Show the
      summary to the user.
- [ ] On the user's yes: `--publish` (new version `7.0.1-up.1`).
- [ ] User runs `/plugin update ultrapowers` and restarts; `README.md`/`README.en.md` here name the
      new base version; commit.
- [ ] Finish the branch (squash-merge into `master`, push, prune), `ROADMAP.md` row 28 `complete`,
      `RESUME.md`.

**Result:** _(filled at stage end)_

---

## Decisions the user owns before stage 1 runs

1. Deleting this tree's 70 per-phase documents (SPEC/STATE/SUMMARY/VERIFICATION) and 5 docs/ impact
   assessments — yes, or keep them as history under `archive/`.
2. `RISK_REGISTER.md`'s Open risks: close or delegate, per the list produced in Task 1.3.
3. The standing rulings in `RESUME.md` ("Payload-only", "Deploy only via setup.mjs", "Layout",
   status model): which survive as one-line rules in the project `.claude/CLAUDE.md`.
