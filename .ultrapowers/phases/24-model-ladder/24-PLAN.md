# Model Ladder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use ultrapowers:subagent-driven-development (recommended) or ultrapowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the model ladder: `medium` default effort, Sonnet 5.5 everywhere, five rung agents, one ladder table, and a small subagent usage log.

**Architecture:** One ladder table in the `model-selection-policy` skill is the single source; five `rung-*` agents in `payload/agents/` carry `model` and `effort`; a table-vs-agents test enforces agreement. A new `SubagentStop` hook writes per-agent usage to `~/.claude/state/token-usage.jsonl`. The installer carries everything; nothing under `~/.claude` is edited by hand.

**Tech Stack:** Node ESM (`node:test`), Markdown fragments and skills, JSON settings.

**Spec:** `.ultrapowers/phases/24-model-ladder/24-SPEC.md`

## Global Constraints

- Docs, config and rule text are English. Rule text states rules only, no justifications.
- Never `Write` or `Edit` a path under `~/.claude/`. Change the source, then deploy with `node setup.mjs`.
- Model ids are exact: `claude-sonnet-5-5`, `claude-opus-5-5`, `claude-haiku-4-5`. Agents and tables use the aliases `haiku`, `sonnet`, `opus`.
- The ladder table has exactly these rows: `rung-haiku`/`haiku`/none, `rung-sonnet-medium`/`sonnet`/`medium`, `rung-sonnet-high`/`sonnet`/`high`, `rung-opus-medium`/`opus`/`medium`, `rung-opus-high`/`opus`/`high`.
- The lite assembled Model Selection section contains neither "role map" nor "ultrapowers" (case-insensitive).
- `xhigh` and `max` appear only as "on the user's ask".
- Run tests with `node run-tests.mjs <files>`. No linter is configured. Before a commit: the tests covering the change; the full suite (`node run-tests.mjs`) before the final review.
- Work on a branch or worktree named `phase-24-model-ladder`; Conventional Commits; never commit to `master` directly.

## Review Focus

- A settings file already holding `effortLevel: "high"` after upgrade → reported as a conflict, kept without `--replace-all` (Task 2).
- `claude-sonnet-5[1m]` and `claude-sonnet-5-5[1m]` ids → the first migrates, the second is untouched (Task 1).
- `SubagentStop` whose `agent_transcript_path` is missing or unreadable → exit 0, nothing written (Task 5).
- `SubagentStop` from an agent that is not a rung (e.g. `general-purpose`) → record with `effort: null` (Task 5).
- Lite profile assembled section drops "role map" and "ultrapowers" while still carrying the ladder (Task 3).

---

### Task 1: Migrator targets Sonnet 5.5

**Files:**
- Modify: `payload/bin/lib/model-migration.mjs:9-21`
- Test: `payload/bin/lib/model-migration.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `migrateSettingsModel(model)` (unchanged signature) returns `{ value: "claude-sonnet-5-5", changed: true, from }` for `claude-sonnet-5`, `claude-sonnet-5[1m]`, and any `claude-sonnet-4*` / `claude-3-5-sonnet*` / `claude-3-7-sonnet*` id; `{ value: model, changed: false }` for `claude-sonnet-5-5`, `claude-sonnet-5-5[1m]`, `claude-sonnet-5-6`, and every alias.

**Acceptance:**
- `migrateSettingsModel("claude-sonnet-5")` → `changed: true`, `value: "claude-sonnet-5-5"`, `from: "claude-sonnet-5"`
- `migrateSettingsModel("claude-sonnet-5[1m]")` → `changed: true`, `value: "claude-sonnet-5-5"`
- `migrateSettingsModel("claude-sonnet-4-6")` → `changed: true`, `value: "claude-sonnet-5-5"`
- `migrateSettingsModel("claude-sonnet-5-5")`, `"claude-sonnet-5-5[1m]"`, `"claude-sonnet-5-6"` → `changed: false`, value unchanged
- existing opus, alias and unknown-id tests still pass

- [ ] **Step 1: Implement**

In `payload/bin/lib/model-migration.mjs` replace the header comment lines 9-11 and the family list:

```js
// Tier-preserving: an old opus id -> claude-opus-5-5, an old sonnet id -> claude-sonnet-5-5, an old
// haiku id -> claude-haiku-4-5. Explicit per-family prefixes (not a "not in current allowlist"
// heuristic) so a future claude-opus-6 is never mis-flagged and no migration crosses tiers.
// `exact` ids match with any `[...]` suffix stripped: claude-opus-5 and claude-sonnet-5 are prefixes
// of claude-opus-5-5 / claude-sonnet-5-5 and of any later -5-N, so they cannot be prefix entries.
```

and the Sonnet line of `SUPERSEDED_MODEL_FAMILIES`:

```js
  { target: "claude-sonnet-5-5", prefixes: ["claude-sonnet-4", "claude-3-5-sonnet", "claude-3-7-sonnet"], exact: ["claude-sonnet-5"] },
```

Keep the `// `exact` ids match...` sentence that already follows the opus explanation only once; delete the older duplicate lines 12-13.

- [ ] **Step 2: Reconcile** — nothing changed behaviour beyond the spec; no bug-log entries expected.

- [ ] **Step 3: Write the acceptance tests** — in `model-migration.test.mjs`, next to the opus tests, add one `@important` test per Acceptance group (superseded sonnet ids migrate; current and later 5.x ids are not flagged), written like the two opus tests at lines 8-23. Then the mutation check: revert Step 1 and confirm the new tests fail.

- [ ] **Step 4: Run them**

Run: `node run-tests.mjs payload/bin/lib/model-migration.test.mjs`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add payload/bin/lib/model-migration.mjs payload/bin/lib/model-migration.test.mjs
git commit -m "feat(model-migration): sonnet family targets claude-sonnet-5-5"
```

---

### Task 2: Session default effort is `medium`

**Files:**
- Modify: `variants.json:26`
- Modify: `README.md:701,719`, `README.en.md:710,729`
- Modify (tests): `session-defaults.test.mjs`, `setup-variants.e2e.test.mjs` (lines 523, 538, 564, 587, 610, 622), `variants.test.mjs`

**Interfaces:**
- Consumes: `loadVariants(root).sessionDefaults` (already exported where `variants.test.mjs` imports it).
- Produces: `sessionDefaults` = `{ "model": "sonnet", "effortLevel": "medium" }`.

**Acceptance:**
- `loadVariants(<repo root>).sessionDefaults` → `{ model: "sonnet", effortLevel: "medium" }`
- a settings file with no keys after install → `settings.model === "sonnet"` and `settings.effortLevel === "medium"`
- a settings file holding `effortLevel: "xhigh"` → printed as `effortLevel: xhigh -> medium`, kept without `--replace-all`, replaced with it
- a settings file holding `effortLevel: "high"` → a conflict (`from: "high", to: "medium"`), not silently overwritten

- [ ] **Step 1: Implement**

`variants.json:26`:

```json
  "sessionDefaults": { "model": "sonnet", "effortLevel": "medium" },
```

`README.md` line 701 `(сейчас `{ "model": "sonnet", "effortLevel": "high" }`)` → `"effortLevel": "medium"`; line 719 `` `sonnet`/`high` `` → `` `sonnet`/`medium` ``. `README.en.md` line 710 and 729 the same two edits. Read each paragraph once; change nothing else.

- [ ] **Step 2: Reconcile** — none expected. Fix this task's open bug-log entries.

- [ ] **Step 3: Update and write tests**

`session-defaults.test.mjs`: line 5 `effortLevel: "medium"`; line 11 `to: "medium"`; line 17 `effortLevel: "medium"`; line 24 `to: "medium"`; the test at line 29-34 uses `effortLevel: "high"` as the user's value and expects `{ key: "effortLevel", from: "high", to: "medium", conflict: true }`.

`setup-variants.e2e.test.mjs`: every `"high"` / `xhigh -> high` expectation at the six lines above becomes `"medium"` / `xhigh -> medium`. Change no other line.

`variants.test.mjs`: add one `@important` test asserting `sessionDefaults` equals `{ model: "sonnet", effortLevel: "medium" }`.

Mutation check: set `variants.json` back to `"high"` and confirm the new and edited tests fail.

- [ ] **Step 4: Run them**

Run: `node run-tests.mjs session-defaults.test.mjs variants.test.mjs setup-variants.e2e.test.mjs`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add variants.json README.md README.en.md session-defaults.test.mjs variants.test.mjs setup-variants.e2e.test.mjs
git commit -m "feat(session-defaults): default effortLevel medium"
```

---

### Task 3: Policy text — ladder, Sonnet 5.5, medium start

**Files:**
- Modify: `payload/claude-md/12-model-selection.md`, `payload/claude-md/12-model-selection.lite.md`
- Modify: `payload/skills/model-selection-policy/SKILL.md`, `payload-lite/skills/model-selection-policy/SKILL.md`
- Test: `payload/bin/lib/assemble-claude-md.test.mjs:52-70`

**Interfaces:**
- Consumes: nothing.
- Produces: the ladder table in the skill, in exactly this form (Task 4's test parses it):

```md
| Rung | Agent | Model alias | Effort |
|---|---|---|---|
| 1 | `rung-haiku` | `haiku` | none |
| 2 | `rung-sonnet-medium` | `sonnet` | `medium` |
| 3 | `rung-sonnet-high` | `sonnet` | `high` |
| 4 | `rung-opus-medium` | `opus` | `medium` |
| 5 | `rung-opus-high` | `opus` | `high` |
```

**Acceptance:**
- assembled `CLAUDE.md` for `full` and `base` contains `DEFAULT executor: claude-sonnet-5-5`, `Start `medium``, and `role map in the `model-selection-policy` skill`; contains no "Start `high`"
- the lite Model Selection section contains `DEFAULT executor: claude-sonnet-5-5` and `Start `medium``; contains neither "role map" nor "ultrapowers" (case-insensitive)
- both skills contain the ladder table above, the Sonnet 5.5 section, and no "Start **`high`**"; only the full skill contains the role → start rung table

- [ ] **Step 1: Implement**

`12-model-selection.md` (full and base; keep its `profiles: [base, full]` frontmatter) — the body becomes:

```md
# Model Selection Policy
- DEFAULT executor: claude-sonnet-5-5. Step UP to claude-opus-5-5 for design and architecture,
  security-sensitive review, hard debugging, and work where a wrong answer is costly;
  claude-haiku-4-5 for no-judgment classification/extraction and routine work whose steps are
  known. claude-fable-5-1 only when the user names it (2.5x Opus 5.5 cost).
- Start `medium`. Dispatched work climbs the ladder one rung per failed check (a failing test
  or a reviewer rejection): rung-haiku, rung-sonnet-medium, rung-sonnet-high, rung-opus-medium,
  rung-opus-high. Judgment roles start on rung-opus-medium with two attempts. After
  rung-opus-high fails, stop and report. `xhigh` and `max` only on the user's ask.
- Always set `effort` explicitly where an API call takes it: an omitted `effort` is `medium` on
  Opus 5.5, `high` on Sonnet 5.5. `effort` is inert on claude-haiku-4-5. Do not carry `effort`
  values over between models.
- Opus 5.5 always thinks (thinking cannot be disabled — lower `effort` instead) and verifies its
  own work: do not add "verify"/"double-check" scaffolding, and revisit any `max_tokens` that
  was sized for a no-thinking budget. On Sonnet 5.5 `thinking: {type: "disabled"}` is a 400:
  lower `effort`, or send `{type: "between_tools"}` at effort `high` or below.
- Ultrapowers subagent dispatches follow the role map in the `model-selection-policy` skill; it
  outranks the Model Selection section inside ultrapowers skills.
- Full routing, the ladder rules, and the per-role GSD effort map → the
  `model-selection-policy` skill.
```

`12-model-selection.lite.md` — same body with these differences: no "Ultrapowers subagent dispatches…" bullet; last bullet `- Full routing and the ladder rules → the `model-selection-policy` skill.`; no occurrence of "role map" or "ultrapowers".

`SKILL.md` (both files). Apply these replacements; text not listed stays.

1. `description:` → `When to run claude-sonnet-5-5 vs claude-opus-5-5 vs claude-haiku-4-5, how to set reasoning effort, and the escalation ladder — the executor default (Sonnet 5.5 at medium), the rungs a failed task climbs, and (full skill only) the role-to-rung map for ultrapowers dispatches. Use when choosing a model or effort level for a task or subagent, or the model for an ultrapowers subagent dispatch.` In the lite skill drop the parenthetical and the trailing "or the model for an ultrapowers subagent dispatch".
2. The lines `DEFAULT executor: **claude-sonnet-5**. …` through the Tier bullets become:

```md
DEFAULT executor: **claude-sonnet-5-5** at effort `medium`. Step *up* to Opus 5.5 where judgment
pays for itself; tune cost within a tier with `effort`.

## Tier: start on Sonnet 5.5, step up for judgment
- **claude-sonnet-5-5** — default: implementation from a clear plan, mechanical and high-volume
  work, most reviews of small diffs.
- **claude-opus-5-5** — design and architecture, security-sensitive review, hard debugging,
  multi-file judgment, work where a wrong answer is costly.
- **claude-haiku-4-5** — no-judgment classification/extraction and routine work whose steps are
  known; **no `effort` parameter**, 200K window. A new Haiku version takes over the alias `haiku`.
- **claude-fable-5-1** — only when the user names it (2.5× Opus 5.5 cost).
```

3. The whole `## Effort is the primary cost / latency control` section becomes:

```md
## Effort is the primary cost / latency control
- Start **`medium`** on Sonnet 5.5 and Opus 5.5. `high` only by the ladder below. `xhigh` and
  `max` only on the user's ask or a measured gain.
- Do not carry `effort` values over between models — they do not transfer.
- Always pass `effort` explicitly: omitted, it is `medium` on Opus 5.5 and `high` on Sonnet 5.5.
- `effort` is inert on claude-haiku-4-5.
- At `xhigh`/`max`, keep any `max_tokens` ≥ 64K — thinking and the answer share that budget.
```

4. After the `## Opus 5.5 thinks and verifies itself` section insert:

```md
## Sonnet 5.5
- `thinking: {type: "disabled"}` returns a 400. To think less, lower `effort`; to turn thinking
  off send `{type: "between_tools"}` (effort `high` or below, no other field in `thinking`).
- Forced `tool_choice` (`any` / `tool`) returns a 400: use `auto` with `strict: true` and name
  the tool in the prompt, or structured outputs.
- The default `effort` is `high`: pass `medium` explicitly.
- A coding agent at `low` effort runs a real check that exercises the change (tests, type-check,
  build) before reporting it done.
```

5. Replace the `## Ultrapowers per-role model map` section (full skill) with the ladder and the map; in the lite skill insert only the `## Escalation ladder` part at the same position:

```md
## Escalation ladder
| Rung | Agent | Model alias | Effort |
|---|---|---|---|
| 1 | `rung-haiku` | `haiku` | none |
| 2 | `rung-sonnet-medium` | `sonnet` | `medium` |
| 3 | `rung-sonnet-high` | `sonnet` | `high` |
| 4 | `rung-opus-medium` | `opus` | `medium` |
| 5 | `rung-opus-high` | `opus` | `high` |

| Track | Starts on | Moves up after | Ends |
|---|---|---|---|
| Routine (the plan carries the code; classification; summaries) | 1 | 1 failure per rung | after rung 5 fails: stop, report to the user |
| Implementation | 2 | 1 failure per rung | same |
| Judgment (design, architecture, security review, hard debugging, verification, final review) | 4 | 2 failures on rung 4, then rung 5 | same |

- An attempt is one dispatched round on one task that ends in a failed check: a failing test or
  a reviewer rejection. A task with no check runs on its start rung and is not laddered.
- A task that reaches rung 4 by escalation moves to rung 5 after 1 failure.
- Success closes the task; the next task starts on its own track's start rung.
- The orchestrator counts and names the rung in the line that narrates each dispatch. The
  dispatch to the next rung carries the failure evidence (test output, reviewer finding).
- Dispatch by agent: `subagent_type` is the rung agent; it carries model and effort.
- The main session is not a rung; only the user changes its model and effort.
- `xhigh` and `max` only on the user's ask; `fable` only when the user names it.
```

Full skill only, directly after it:

```md
## Ultrapowers dispatch: role → start rung
This map decides the agent of every ultrapowers subagent dispatch and outranks the Model
Selection section inside ultrapowers skills.

| Role | Start rung |
|---|---|
| Implementer, plan carries the complete code | 1 |
| Summary writer | 1 |
| Implementer from prose, several files, integration | 2 |
| Task reviewer, small mechanical diff | 2 |
| Scoped re-review of a fix | 2 |
| Task reviewer, logic, security or concurrency | 4 |
| Verification ("was the goal met") | 4 |
| Final whole-branch review | 4 |
| Any role not listed | 2 |

- Orchestrator in the cheaper-orchestration mode: `sonnet` (session-level, not a rung).
```

6. Cost table: replace the Sonnet 5 row with `| Sonnet 5.5 | \`claude-sonnet-5-5\` | $2 | $10 | 1M | Default effort \`high\`; pass \`medium\` explicitly |` (write the backticks unescaped in the file).
7. `## Advisor tool` section: `Sonnet 5 by default` → `Sonnet 5.5 by default`.
8. `Prefer tier **aliases** …` line stays.

`assemble-claude-md.test.mjs`: in the test at line 57 rename to "Sonnet 5.5 default, medium start"; the three `assert.match(o, /DEFAULT executor: claude-sonnet-5/)` and the lite one become `/DEFAULT executor: claude-sonnet-5-5/`; the three `/Start \`high\`/` become `/Start \`medium\`/`; add `assert.doesNotMatch(o, /Start \`high\`/)` inside the full/base loop.

- [ ] **Step 2: Reconcile** — write any changed behaviour into the spec first. Fix open bug-log entries.

- [ ] **Step 3: Write the acceptance tests** — the assemble test edits above cover the fragment lines. Add one `@important` test in `payload/bin/lib/assemble-claude-md.test.mjs` (or a sibling `payload/skills/model-selection-policy/skill.test.mjs`) asserting both skill files contain the ladder table with the five exact rows and no "Start **`high`**", and that only the full skill contains "role → start rung". Mutation check: restore a "Start `high`" line and confirm the test fails.

- [ ] **Step 4: Run them**

Run: `node run-tests.mjs payload/bin/lib/assemble-claude-md.test.mjs payload/skills/model-selection-policy/skill.test.mjs`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add payload/claude-md payload/skills/model-selection-policy payload-lite/skills/model-selection-policy payload/bin/lib/assemble-claude-md.test.mjs
git commit -m "feat(model-policy): ladder, Sonnet 5.5 default, medium start"
```

---

### Task 4: Rung agents and the table-vs-agents test

**Files:**
- Create: `payload/agents/rung-haiku.md`, `rung-sonnet-medium.md`, `rung-sonnet-high.md`, `rung-opus-medium.md`, `rung-opus-high.md`
- Test: `payload/agents/rung-agents.test.mjs`

**Interfaces:**
- Consumes: the ladder table from Task 3 in `payload/skills/model-selection-policy/SKILL.md`.
- Produces: five agent files; each has frontmatter `name`, `description`, `model`, and `effort` except `rung-haiku`.

**Acceptance:**
- each row of the skill's ladder table has an agent file named `<Agent>.md` whose `name` equals the Agent column, whose `model` equals the alias column, and whose `effort` equals the Effort column (`rung-haiku` has no `effort` line)
- no `rung-*.md` file exists without a table row
- every agent's `tools` line is absent (inherit)

- [ ] **Step 1: Implement**

Each file, with the values from the table (example for rung 3):

```md
---
name: rung-sonnet-high
description: Ladder rung 3. Sonnet at high effort; dispatched only by the model-selection ladder.
model: sonnet
effort: high
---
Do the task in the dispatch prompt. If the prompt carries failure evidence from an earlier
rung, address that evidence first. Report what changed and which check now passes or fails.
```

Descriptions: `rung-haiku` — `Ladder rung 1. Haiku for routine work whose steps are known; dispatched only by the model-selection ladder.` (no `effort` line); `rung-sonnet-medium` — rung 2, Sonnet at medium effort; `rung-opus-medium` — rung 4, Opus at medium effort; `rung-opus-high` — rung 5, Opus at high effort. One line each. The body is identical in all five.

- [ ] **Step 2: Reconcile** — if lite must not ship the agents, the decision goes into the spec first; `variants.json` lite `exclude` lists no `agents/` entry today, so they ship in every profile.

- [ ] **Step 3: Write the acceptance test** — `payload/agents/rung-agents.test.mjs` reads the skill, parses table rows with `/^\| (\d) \| `(rung-[a-z-]+)` \| `(\w+)` \| (?:`(\w+)`|none) \|$/gm`, reads each `<agent>.md` frontmatter (`name`, `model`, `effort`, `tools` lines between the first two `---`), and asserts the Acceptance lines. Tag `@important`. Mutation check: change one agent's `effort` and confirm the test fails.

- [ ] **Step 4: Run it**

Run: `node run-tests.mjs payload/agents/rung-agents.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add payload/agents/rung-*.md payload/agents/rung-agents.test.mjs
git commit -m "feat(agents): five ladder rung agents"
```

---

### Task 5: Subagent usage log hook

**Files:**
- Create: `payload/hooks/rung-usage-log.mjs`
- Modify: `settings.partial.json` (new `SubagentStop` block before `PreCompact`)
- Test: `payload/hooks/rung-usage-log.test.mjs`, `setup-variants.e2e.test.mjs` (extend the test at line 136)

**Interfaces:**
- Consumes: `safe`, `readJSONLRecords` from `payload/hooks/lib/jsonl-io.mjs`.
- Produces: `buildRecord(d, entries, now = new Date())` → `null` when no assistant entry carries `usage`, else
  `{ date, session_id, agent, model, effort, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens }`; `effort` is `"medium"` or `"high"` for `rung-sonnet-*` / `rung-opus-*` names, `null` otherwise. The script appends one JSON line to `<CLAUDE_CONFIG_DIR or ~/.claude>/state/token-usage.jsonl`.

**Acceptance:**
- stdin `null`, empty, or invalid JSON → exit 0, no file written
- `SubagentStop` from `rung-sonnet-high` with two usage-bearing assistant entries → one record with summed tokens, model without a `-YYYYMMDD` suffix, `effort: "high"`
- the same event from `general-purpose` → `effort: null`; from `rung-haiku` → `effort: null`
- no `agent_transcript_path`, or a path that does not exist → exit 0, no file written
- a transcript with no assistant entry carrying `usage` → nothing written
- a settings file still registering `token-usage-log.mjs` is stripped on deploy and the `rung-usage-log.mjs` registration is present after it

- [ ] **Step 1: Implement**

`payload/hooks/rung-usage-log.mjs`:

```js
#!/usr/bin/env node
// SubagentStop: one usage record per finished subagent -> <config dir>/state/token-usage.jsonl.
// Any failure exits 0; a hook must never block a turn.
import { readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { safe, readJSONLRecords } from "./lib/jsonl-io.mjs";

const EFFORT = /^rung-(?:sonnet|opus)-(medium|high)$/;

export function buildRecord(d, entries, now = new Date()) {
  const usage = entries.filter((e) => e && e.type === "assistant" && e.message && e.message.usage);
  if (!usage.length) return null;
  const t = { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0 };
  let model = null;
  for (const e of usage) {
    const u = e.message.usage;
    t.input_tokens += u.input_tokens || 0;
    t.output_tokens += u.output_tokens || 0;
    t.cache_read_tokens += u.cache_read_input_tokens || 0;
    t.cache_creation_tokens += u.cache_creation_input_tokens || 0;
    if (e.message.model) model = e.message.model.replace(/-\d{8}$/, "");
  }
  const agent = typeof d.agent_type === "string" ? d.agent_type : null;
  const m = agent && EFFORT.exec(agent);
  return { date: now.toISOString(), session_id: d.session_id ?? null, agent, model, effort: m ? m[1] : null, ...t };
}

function main() {
  let d;
  try { d = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { process.exit(0); }
  d = (d && typeof d === "object") ? d : {};
  if (d.hook_event_name !== "SubagentStop" || !d.agent_transcript_path) process.exit(0);
  const rec = buildRecord(d, readJSONLRecords(d.agent_transcript_path));
  if (!rec) process.exit(0);
  const log = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "state", "token-usage.jsonl");
  safe(() => { mkdirSync(dirname(log), { recursive: true }); appendFileSync(log, JSON.stringify(rec) + "\n"); });
  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
```

`settings.partial.json`: insert before the `"PreCompact": [` key, inside `hooks`:

```json
    "SubagentStop": [
      {
        "hooks": [
          { "type": "command", "command": "node", "args": ["<HOME>/.claude/hooks/rung-usage-log.mjs"] }
        ]
      }
    ],
```

- [ ] **Step 2: Reconcile** — verify the open item: `agent_type` equals the agent name for a rung agent. If a real `SubagentStop` shows another value, write the change into the spec first, then adjust `EFFORT`.

- [ ] **Step 3: Write the acceptance tests** — `payload/hooks/rung-usage-log.test.mjs` in the style of `web-block-nudge.test.mjs`: `buildRecord` cases for the summed record, `general-purpose`, `rung-haiku`, no-usage transcript; `spawnSync` cases with `CLAUDE_CONFIG_DIR` pointing at a temp dir for stdin `null` / empty / invalid / missing path, asserting exit 0 and no `state/token-usage.jsonl`. Extend the e2e test at `setup-variants.e2e.test.mjs:136` with `assert.match(JSON.stringify(hooks.SubagentStop), /rung-usage-log/)`. Tag `@important`. Mutation check: remove the stdin guard line and confirm the `null` case fails.

- [ ] **Step 4: Run them**

Run: `node run-tests.mjs payload/hooks/rung-usage-log.test.mjs setup-variants.e2e.test.mjs`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add payload/hooks/rung-usage-log.mjs payload/hooks/rung-usage-log.test.mjs settings.partial.json setup-variants.e2e.test.mjs
git commit -m "feat(hooks): SubagentStop usage log for ladder rungs"
```

---

### Task 6: Registers, full verification, gated deploy

**Files:**
- Modify: `.ultrapowers/RISK_REGISTER.md` (RISK-HOOKSTDIN-001)
- Modify: `.ultrapowers/ROADMAP.md` (phase 24 entry)
- Create: `.claude/tools/rung-usage-report.mjs`, `.claude/tools/INDEX.md` (not shipped)

**Interfaces:**
- Consumes: Tasks 1-5.
- Produces: a verified branch ready for review.

**Acceptance:**
- `RISK-HOOKSTDIN-001` no longer says Active: it is recorded the way `RISK-TOKENLOG-001` was in commit `308dfe4` (`git show 308dfe4 -- .ultrapowers/RISK_REGISTER.md`), with the reason "the hook was retired; `rung-usage-log.mjs` carries the guard"
- the full suite passes: `node run-tests.mjs`
- `node setup.mjs --variant=lite --dry-run --skip-all` and the same for `--variant=full` exit 0, write nothing, and their plan lists `agents/rung-*.md` and `hooks/rung-usage-log.mjs`
- Global Constraints hold: grep the four policy files for "Start `high`" and `claude-sonnet-5[^-]` → no match
- `node .claude/tools/rung-usage-report.mjs` prints, per `agent` in `~/.claude/state/token-usage.jsonl`: records, and summed input, output, cache-read and cache-write tokens; with an empty or missing log it prints `no records` and exits 0

- [ ] **Step 1: Implement** — edit the register entry; add a phase 24 entry to `ROADMAP.md` in the format of the phase 23 entry (`ROADMAP.md:87-108`). Create `.claude/tools/INDEX.md` with the line `- rung-usage-report.mjs — per-agent token totals from ~/.claude/state/token-usage.jsonl (phase 24 measurement).` and the report:

```js
#!/usr/bin/env node
// Per-agent token totals from the ladder usage log. Usage: node .claude/tools/rung-usage-report.mjs [log]
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const log = process.argv[2] || join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "state", "token-usage.jsonl");
const rows = existsSync(log)
  ? readFileSync(log, "utf8").split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
  : [];
if (!rows.length) { console.log("no records"); process.exit(0); }
const by = {};
for (const r of rows) {
  const a = by[r.agent ?? "(unknown)"] ??= { n: 0, in: 0, out: 0, cr: 0, cw: 0 };
  a.n++; a.in += r.input_tokens || 0; a.out += r.output_tokens || 0;
  a.cr += r.cache_read_tokens || 0; a.cw += r.cache_creation_tokens || 0;
}
console.log("agent".padEnd(22), "recs", "input", "output", "cacheR", "cacheW");
for (const [k, a] of Object.entries(by).sort((x, y) => y[1].n - x[1].n))
  console.log(k.padEnd(22), String(a.n).padStart(4), a.in, a.out, a.cr, a.cw);
```

- [ ] **Step 2: Reconcile** — fix open bug-log entries (`.ultrapowers/BUGS.md`).

- [ ] **Step 3: Verify**

Run: `node run-tests.mjs`
Expected: PASS (full suite; report the scope).

Run: `node setup.mjs --variant=lite --dry-run --skip-all` then `node setup.mjs --variant=full --dry-run --skip-all`
Expected: exit 0; plans list the new files.

- [ ] **Step 4: Deploy — ask the user first.** Deploying changes `~/.claude` on this machine. After the user says yes: show the dry-run, then `node setup.mjs --replace-all` (a bare non-TTY run keeps the old `CLAUDE.md`). After deploy dispatch one `rung-sonnet-medium` agent on a trivial task and confirm the last line of `~/.claude/state/token-usage.jsonl` has `agent: "rung-sonnet-medium"` and `effort: "medium"`; if `agent` differs, that is open item 4 of the spec.

- [ ] **Step 5: Commit**

```bash
git add .ultrapowers/RISK_REGISTER.md .ultrapowers/ROADMAP.md .claude/tools
git commit -m "docs(phase-24): registers, roadmap, per-rung usage report"
```
