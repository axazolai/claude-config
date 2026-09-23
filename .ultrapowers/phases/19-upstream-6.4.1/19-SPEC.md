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
ignored. `version.revision` resets to 1 on a new upstream base (`6.4.1-up.1`); the `$why` in
`transform/config.json` gains that rule: bump when the fork changes on the same base, reset to 1
when `originalTag` moves.

## 3. Why the 25% threshold fires

Upstream touched 18 tracked files (35%). The diff has been read by hand (this spec); the
threshold is overridden for this rebase only, on the partner's word.

## 4. Decided questions

- **Q1 — workspace deletion: by name.** Upstream's `rm -rf <workspace>` is replaced in SDD and
  `executing-plans`: list the workspace's files (ledger, briefs, reports, review packages,
  owner marker), delete each by name, then the empty directory.
- **Q2 — tightly coupled tasks: keep.** SDD's "when to use" gets one row: tightly coupled tasks
  → one agent given the whole chain.
- **Q3 — merge: yes.** 012 folds into 008, 013 into 009; their files are removed. Numbering
  keeps the gaps.

## 5. The TDD switch

Added 2026-09-23 during execution; it supersedes phase 18's single-mode rule and delta 014's
single-mode text.

**Mode.** Each project has a testing mode: `tdd` or `test-after`. It lives in
`<project>/.claude/ultrapowers.json` as `{ "tdd": true | false }` (committed with the project).
No file or no key → `test-after`. Project scope only; there is no global default.

**Command.** `/ultrapowers-tdd enable|disable` writes the key; without an argument it prints the
current mode. In a project with `.planning/config.json` it also sets `workflow.tdd_mode` to the
same value. The command's output states the new mode, so the current session follows it at once.

**Delivery to the model.** The SessionStart hook (`session-init.mjs`) adds one line to the
session context: `Testing mode: tdd|test-after (.claude/ultrapowers.json; /ultrapowers-tdd)`.
Rules and skills name the mode and the file, so a skill read later resolves it the same way.
`gsd-defaults-sync` takes `workflow.tdd_mode` from the project's switch, not from the partial.

**What each mode means.**

| | `tdd` (enable) | `test-after` (disable, default) |
|---|---|---|
| Order | failing test first, then code (RED → GREEN → REFACTOR), per upstream 6.4.1 | code first; tests once the unit stands whole, before its review |
| Test selection | scenario list before code (partitioning, boundaries, budget) | the spec/plan's acceptance list only |
| Plans | steps "write the failing test / watch it fail / implement / pass" | `Acceptance:` list; implement → reconcile → tests → run |
| SDD / Native evidence | TDD Evidence (RED and GREEN output) | Acceptance coverage (criterion → test) |
| Final-review fixes | RED → GREEN per fix | reproduce → fix → test only for stated behaviour |
| Debugging | failing test reproduces the bug before the fix | one-off reproduction; test after, only for stated behaviour |

**Common to both modes:** the bug log; a decision that changes behaviour, scope or an interface
goes into the spec/plan first; Review Focus lines become `Acceptance:`/scenario lines of the
owning task; reviewer findings on behaviour the spec is silent on go to the partner; any failure
a run shows is reported by name; test cadence, scope and tiers from `CONVENTIONS`/`testing.md`.

**Units of change added to this phase.**
- Installer: `payload/rules-src/testing.md` and `payload/claude-md/07-conventions.md` carry both
  modes (the pre-phase-18 TDD text restored as the `tdd` branch); `payload/commands/ultrapowers-tdd.md`;
  `payload/hooks/lib/tdd-mode.mjs` (resolve the mode, write it, sync GSD); `session-init.mjs`
  note; `gsd-defaults-sync` override; `gsd-defaults.partial.json` keeps `tdd_mode: false` as
  the no-switch value.
- Fork: delta 014 becomes two-mode — the upstream TDD skill text stays for `tdd`, the
  test-after section is added beside it; every skill 014 touches branches on the mode.

## 6. Verification

- `node transform/inventory.mjs check` clean; `node --test` in the fork passes.
- `node transform/build-cli.mjs check`: every delta applies, none obsolete; only the threshold
  refusal remains, overridden per § 3.
- The built tree: every TDD instruction sits under a `tdd` mode branch; no `rm -rf` in skill
  prose; no `~/.superpowers/` path.
- Installer: tests for the mode resolution (absent → test-after), the command's write and GSD
  sync, the session note; full suite green.
