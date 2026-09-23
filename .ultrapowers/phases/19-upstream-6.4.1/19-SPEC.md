# Phase 19 — rebase the ultrapowers fork onto upstream 6.4.1 — design

Written 2026-09-23. Scope: the fork `../ultrapowers` (`transform/`), rebased from upstream
`v6.3.0` to `v6.4.1`, keeping phase 18's rule (tests after the code, before review, only for
stated behaviour; a bug log). No build is run until this spec is approved.

## 1. Upstream changes and decisions

| # | Upstream change (6.3.0 → 6.4.1) | Decision |
|---|---|---|
| 1 | `executing-plans` rebuilt as Native inline execution (continuous, ledger shared with SDD, `task-start`/`task-done`, one final review, workspace deleted at the end) | Take. Workspace deletion accepted. Testing and bug handling rewritten to phase 18 (§ 2, delta 014) |
| 2 | `writing-plans` handoff: partner reviews the saved plan; Subagent-driven vs Native with cost and a recommendation | Take upstream text; our delta edits on this block are rewritten or dropped where upstream now carries the intent |
| 3 | SDD "when to use": inline chosen or no subagent tool → `executing-plans`, else SDD | Take; resolve the conflict with delta 009 |
| 4 | `using-superpowers/references/claude-code-tools.md`: opt-in nested SDD controller on a mid-tier model | Take; the platform list keeps Claude Code only |
| 5 | `writing-plans` Review Focus: ≤5 implied inputs/failure modes, each pinned by a test | Adapt: each line becomes an `Acceptance:` line of the owning task |
| 6 | Reviewer: spec is a vision document; "Declined to judge" list | Adapt: out-of-spec findings and declined lines go to the partner — into the spec (then a test) or rejected |
| 7 | TDD: the whole project suite is green; every failure reported by name | Take the reporting half only; test scope stays per `CONVENTIONS` |
| 8 | SDD workspace: `plan-path` marker, slug disambiguation | Keep ours (§ 3, delta 007), rewritten over the new script |
| 9 | `review-package`: exit 3 on empty or non-descendant range | Take |
| 10 | `bash scripts/…` / `node …` invocation everywhere | Take |
| 11 | `requesting-code-review`: `git merge-base origin/main HEAD` | Take |
| 12 | `brainstorming`: establish shared understanding; staged approval gate | Take |
| 13 | New skill `diagnosing-superpowers` | Take with delta 015: workspace in the project scratchpad; GitHub-issue step removed; the 7-analyst fan-out only on explicit permission |
| 14 | `writing-skills`: interpreter rule for bundled scripts | Take |
| 15 | OpenCode 2, Muse, Qwen; Muse branch in `hooks/session-start` | Ignore (the hook change arrives with the rebase and is inert on Claude Code) |
| 16 | Docs, `AGENTS.md`, CoC, README, release notes, upstream tests, specs/plans | Ignore, not carried |

## 2. Delta audit

Legend: **keep** — unchanged; **rewrite** — same intent, re-authored over 6.4.1; **merge** —
folded into another delta; **drop** — upstream now carries the intent or it contradicts a
decision.

| Delta | Applies on 6.4.1 | Still relevant | Verdict and change |
|---|---|---|---|
| 001 fallow-graft | yes | yes — fallow is wired in `gsd-config-patch`, `session-init` | **rewrite (small)**: the "install fallow" Minor note only when the repo root has `package.json`; otherwise skip silently |
| 002 drop-platform-adaptation | no (upstream added two list lines) | yes, changed by decision 4 | **rewrite**: keep the section with one line, Claude Code → `references/claude-code-tools.md` |
| 003 plugin-version-source | yes | yes — the build ships only `.claude-plugin/plugin.json` | **keep** |
| 004 plugin-manifest | yes | yes, but the description still says "TDD" | **rewrite (small)**: description without TDD |
| 005 brand-link | yes | yes | **keep** |
| 006 grilling-fact-lookup | yes | yes — complements upstream's intent discovery (facts vs decisions, a recommendation per question); no overlap | **keep** |
| 007 planning-tree | no (handoff text, script invocation) | yes — the phase tree is in use | **rewrite**: new handoff wording with phase paths; `sdd-workspace` keeps our phase-derived slug and `.plan` owner marker in place of upstream's `plan-path`; prose and examples in `executing-plans` (workspace path, `docs/superpowers/plans/…`) added |
| 008 sdd-summary | no | partly — decision 1 accepts deletion | **rewrite**: the summary writer runs **before** the deletion and carries rulings/deviations into `NN-SUMMARY.md`; drop "keep the workspace", the "premise was false" paragraph and the main-checkout root in `sdd-workspace`; `summary-writer-prompt.md` cites hash ranges only; the same summary step added to `executing-plans`; deletion follows the no-`rm -rf` rule (§ 4 Q1) |
| 009 agent-first | no | partly — "agent-driven execution is the norm, >1 commit → agent" contradicts Native (decision 2/3) | **rewrite**: drop the replacement flowchart and the execution table; keep "who writes which document" (SPEC/PLAN main session, SUMMARY/VERIFICATION subagent), the STATE/ROADMAP frontmatter rules and `tasks_done`; add the same state writes to `executing-plans`; § 4 Q2 for the coupled-tasks row |
| 010 design-records | yes | yes | **rewrite (small)**: "Testing Decisions" also carries the acceptance list — the behaviours the tests will confirm — since tests now confirm only what the spec states |
| 011 planning-rules-are-run | yes (text), numbering now wrong | yes | **rewrite (small)**: upstream's new check 4 (Review Focus) → ours become 5 and 6, intro "Checks 1-4 are read. Checks 5 and 6 are run"; the command check runs what exists at plan time (build, lint, the runner over the existing suite) — tests for not-yet-written code are checked for runner and path only |
| 012 ledger-read-back | no (edits 008's text) | yes — more so: it is the last check before the workspace is deleted | **merge into 008**; applies to `executing-plans` too |
| 013 status-files-keep-history | no (edits 009's text) | yes | **merge into 009** |
| 014 test-after-coverage | no | yes | **rewrite + extend**: `executing-plans` (§ 2 order per task, `task-done` is the unit's test run, final-review fixes reproduce → fix → test only for stated behaviour, bug-log drain before the final review); Review Focus → Acceptance (decision 5); reviewer vision/declined → partner rulings (decision 6); TDD skill gains "report every observed failure by name" (decision 7) |
| 015 diagnosing (new) | — | — | **new**: `~/.superpowers/diagnosing-superpowers/<id>/` → `<project>/.claude/.scratchpad/diagnosing/<id>/`; step 5 (GitHub issues) removed, `templates/issue.md` and `references/github-issues.md` classified ignored; step 3 fan-out only after the partner allows it — otherwise the session reads the region itself |

Inventory: `skills/diagnosing-superpowers/**` tracked (minus the two ignored above),
`skills/executing-plans/scripts/*` tracked, `using-superpowers/references/claude-code-tools.md`
tracked, `muse-tools.md`, `.muse-plugin/*`, `index.js`, `.github/**`, `docs/**`, `tests/**`
ignored. `version.revision` is bumped, as the previous rebase to 6.3.0 left it running
(`6.4.1-up.7`).

## 3. Why the 25% threshold fires

Upstream touched 18 tracked files (35%). The diff has been read by hand (this spec); the
threshold is overridden for this rebase only, on the partner's word.

## 4. Open questions

- **Q1 — how the workspace is deleted.** Upstream: `rm -rf <workspace>`, forbidden by
  `CONVENTIONS`. (a) delete by name: the ledger, briefs, reports and review packages are listed
  and removed one by one, then the empty directory; (b) move into the shared restorable trash —
  needs a trash CLI that takes a path, which the bundle does not ship today.
- **Q2 — tightly coupled tasks.** 009's "one agent for the whole chain" vs upstream's "manual
  execution or brainstorm first": keep ours as a row in SDD's "when to use", or drop it.
- **Q3 — merge 012→008 and 013→009.** Removes two delta files; numbering keeps gaps.

## 5. Verification

- `node transform/inventory.mjs check` clean; `node --test` in the fork passes.
- `node transform/build-cli.mjs check`: every delta applies, none obsolete; only the threshold
  refusal remains, overridden per § 3.
- The built tree: no `TDD|failing test|watched fail|RED→GREEN` outside `writing-skills/*`,
  `systematic-debugging/CREATION-LOG.md`, `dispatching-parallel-agents` example text; no
  `rm -rf` in skill prose; no `~/.superpowers/` path.
