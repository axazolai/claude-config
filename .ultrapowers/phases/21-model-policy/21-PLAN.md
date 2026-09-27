# Model policy: Sonnet default, ultrapowers role map — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use ultrapowers:subagent-driven-development (recommended) or ultrapowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sessions start on Sonnet 5 at effort `high`, the bundle's policy says so, ultrapowers dispatches follow one role map, and the fork points at it.

**Architecture:** `variants.json` gains `sessionDefaults`; a pure planner `session-defaults.mjs` decides what to write into `~/.claude/settings.json`, executed by a new block in `setup.mjs`. Policy text changes in CLAUDE.md fragments and the `model-selection-policy` skill (full/base copy gets the role map, lite copy does not). The fork gets delta 016 and revision 2.

**Tech Stack:** Node ESM, `node:test`, the fork's `transform/build-cli.mjs`.

**Spec:** `.ultrapowers/phases/21-model-policy/21-SPEC.md`

## Global Constraints

- Testing mode: test-after. Tags `@critical`/`@important` first token of each test name.
- Run tests with `node run-tests.mjs <files>` (temp dirs under `.claude/.scratchpad/test-tmp/`).
- Never Write/Edit under `~/.claude/`. No push, no plugin update, no deploy inside this plan.
- Managed session defaults: `model` = `sonnet`, `effortLevel` = `high`.
- Default executor Sonnet 5; Opus 5.5 for design/architecture, security-sensitive review, hard debugging, costly-if-wrong work; Haiku 4.5 classification; Fable 5.1 only when the user names it.
- A role not in the ultrapowers map: `sonnet`.
- Fork repo: `D:\6__Work\AI_Projects\ultrapowers`, branch `patch`; its working tree has unrelated deleted `graphify-out/` files — never stage them (`git add` named paths only).

## Review Focus

- `settings.json` absent or unparsable → planner sees `{}`, both keys planned as additions, setup does not crash.
- `settings.json` holds `model: "sonnet"` but `effortLevel: "xhigh"` → only `effortLevel` is a conflict.
- Interactive `n` on the conflict prompt → the absent keys are still written, the conflicting ones kept and reported.
- `--skip-all` → nothing written, plan printed.
- Assembled lite CLAUDE.md must not mention ultrapowers dispatches or the role map.

---

### Task 1: Session defaults — planner, setup block, tests

**Files:**
- Modify: `variants.json` (top-level `sessionDefaults`)
- Create: `session-defaults.mjs`, `session-defaults.test.mjs`
- Modify: `setup.mjs` (import next to the `./mcp-reconcile.mjs` import; new block directly after the MCP reconciliation block, before `/* ---------- opt-in: daily background check`)
- Test: `setup-variants.e2e.test.mjs` (append)

**Interfaces:**
- Produces: `buildSessionDefaultsPlan(settings: object, managed: Record<string,string>) → Change[]`, `Change = { key, from: string|undefined, to: string, conflict: boolean }`; `describeSessionChange(c) → string`.

**Acceptance:**
- `@important` absent keys → one change each, `conflict: false`, described `model: (unset) -> sonnet`.
- `@important` key already at the managed value → no change.
- `@important` a different value → `conflict: true`, described `model: claude-opus-5-5 -> sonnet`.
- `@important` e2e: sandbox `settings.json` with `model: claude-opus-5-5`, `effortLevel: xhigh`, `--variant=base --dry-run` → output has `--- session defaults ---` and both `->` lines; file unchanged.
- `@important` e2e: same sandbox, `--variant=base --replace-all` → file has `model: sonnet`, `effortLevel: high`, other keys intact.

- [ ] **Step 1: Implement**

`variants.json`, after `"keepInstalled": [...]`:

```json
"$sessionDefaults": "Keys setup.mjs manages in ~/.claude/settings.json on every profile. Absent: written. Different: a conflict - written under --replace-all or an interactive yes, otherwise printed.",
"sessionDefaults": { "model": "sonnet", "effortLevel": "high" },
```

`session-defaults.mjs`:

```js
// Pure planner for bundle-managed keys in settings.json. No fs/process access — setup.mjs executes.
export function buildSessionDefaultsPlan(settings, managed) {
  const changes = [];
  for (const [key, to] of Object.entries(managed)) {
    const from = settings?.[key];
    if (from === to) continue;
    changes.push({ key, from, to, conflict: from !== undefined });
  }
  return changes;
}

export const describeSessionChange = (c) => `${c.key}: ${c.conflict ? c.from : "(unset)"} -> ${c.to}`;
```

`setup.mjs` block:

```js
  /* ---------- session defaults: model and effortLevel are bundle-managed ---------- */
  {
    const managedDefaults = loadVariants(REPO_ROOT).sessionDefaults || {};
    const current = safe(() => JSON.parse(readFileSync(SETTINGS, "utf8"))) || {};
    const changes = buildSessionDefaultsPlan(current, managedDefaults);
    if (changes.length) {
      log("\n--- session defaults ---");
      for (const c of changes) log(`  ${describeSessionChange(c)}`);
      const conflicts = changes.filter((c) => c.conflict);
      let apply = changes.filter((c) => !c.conflict);
      if (DRY) { apply = []; log("  (dry-run: settings unchanged)"); }
      else if (BULK === "skip") { apply = []; log("  (--skip-all: settings unchanged)"); }
      else if (BULK) apply = changes;
      else if (INTERACTIVE && conflicts.length &&
        (await ask(`    replace ${conflicts.length} session default(s)? (y/N) > `))[0] === "y") apply = changes;
      for (const c of conflicts) if (!apply.includes(c) && !DRY && BULK !== "skip")
        log(`  kept ${c.key}: ${c.from} (re-run with --replace-all to set ${c.to})`);
      if (apply.length) {
        const s = safe(() => JSON.parse(readFileSync(SETTINGS, "utf8"))) || {};
        for (const c of apply) s[c.key] = c.to;
        if (write(SETTINGS, JSON.stringify(s, null, 2) + "\n"))
          summary.push(`updated  ${SETTINGS} (session defaults: ${apply.map((c) => c.key).join(", ")})`);
      }
    }
  }
```

- [ ] **Step 2: Reconcile** — any change of behaviour goes into spec § 1a first.
- [ ] **Step 3: Write the acceptance tests** — planner tests in `session-defaults.test.mjs`; e2e tests reuse the file's sandbox pattern (`mkdtempSync(join(tmpdir(), ...))`, env `CLAUDE_CONFIG_DIR`, `CLAUDE_SETUP_SKIP_PLUGINS=1`, `CLAUDE_SETUP_SKIP_MCP=1`, `CLAUDE_SETUP_SKIP_PURGE=1`), planting `settings.json` in the sandbox before the run.
- [ ] **Step 4: Run them** — `node run-tests.mjs session-defaults.test.mjs setup-variants.e2e.test.mjs` → PASS
- [ ] **Step 5: Commit** — `feat(setup): bundle-managed session defaults (sonnet, effort high)`

---

### Task 2: Policy text — CLAUDE.md fragments and the skill

**Files:**
- Modify: `payload/claude-md/12-model-selection.md` (add frontmatter `profiles: [base, full]`)
- Create: `payload/claude-md/12-model-selection.lite.md`
- Modify: `payload/skills/model-selection-policy/SKILL.md`, `payload-lite/skills/model-selection-policy/SKILL.md`
- Test: `payload/bin/lib/assemble-claude-md.test.mjs`

**Acceptance:**
- `@important` base and full assembled CLAUDE.md contain "DEFAULT executor: claude-sonnet-5", "Start `high`" and "role map in the `model-selection-policy` skill".
- `@important` lite contains "DEFAULT executor: claude-sonnet-5" and "Start `high`", and neither "role map" nor "ultrapowers".
- The existing real-fragment tests still pass.

- [ ] **Step 1: Implement**

`12-model-selection.md` (base/full) body:

```markdown
---
profiles: [base, full]
---
# Model Selection Policy
- DEFAULT executor: claude-sonnet-5. Step UP to claude-opus-5-5 for design and architecture,
  security-sensitive review, hard debugging, and work where a wrong answer is costly;
  claude-haiku-4-5 for no-judgment classification/extraction. claude-fable-5-1 only when the
  user names it (2.5x Opus 5.5 cost).
- Tune cost with `effort` within a tier. Start `high`; `xhigh` for long agentic runs and
  debugging; `max` is a reserve, not a default. `effort` is inert on claude-haiku-4-5.
- Always set `effort` explicitly where an API call takes it: an omitted `effort` is `medium` on
  Opus 5.5, `high` elsewhere.
- Opus 5.5 always thinks (thinking cannot be disabled — lower `effort` instead) and verifies its
  own work: do not add "verify"/"double-check" scaffolding.
- Ultrapowers subagent dispatches follow the role map in the `model-selection-policy` skill; it
  outranks the Model Selection section inside ultrapowers skills.
- Full routing, the effort ladder, and the per-role GSD effort map → the
  `model-selection-policy` skill.
```

`12-model-selection.lite.md`: the same without frontmatter, without the "Ultrapowers subagent dispatches…" bullet, and with the last bullet ending "→ the `model-selection-policy` skill." (no GSD mention).

Skill (both copies): frontmatter `description` → "When to run claude-sonnet-5 vs claude-opus-5-5 vs claude-haiku-4-5 and how to set reasoning effort — the executor default (Sonnet 5), when to step up to Opus 5.5, and the effort ladder. Use when choosing a model or effort level for a task or subagent." Replace the opening paragraph and the "## Tier" section with:

```markdown
DEFAULT executor: **claude-sonnet-5**. Step *up* to Opus 5.5 where judgment pays for itself;
tune cost within a tier with `effort`.

## Tier: start on Sonnet 5, step up for judgment
- **claude-sonnet-5** — default: implementation from a clear plan, mechanical and high-volume
  work, most reviews of small diffs.
- **claude-opus-5-5** — design and architecture, security-sensitive review, hard debugging,
  multi-file judgment, work where a wrong answer is costly.
- **claude-haiku-4-5** — no-judgment classification/extraction only; **no `effort` parameter**,
  200K window.
- **claude-fable-5-1** — only when the user names it (2.5× Opus 5.5 cost).
```

In "## Effort is the primary cost / latency control", replace the `xhigh` start bullet with: "Start **`high`** for coding and agentic work; **`xhigh`** for long agentic runs and debugging; sweep *down* on your own evals." Replace "`low`/`medium` on Opus 5.5 are strong" with "`low`/`medium` are strong on both Sonnet 5 and Opus 5.5".

Full/base copy only — new section before "## Cost reference":

```markdown
## Ultrapowers per-role model map
This map decides the `model` of every ultrapowers subagent dispatch and outranks the Model
Selection section inside ultrapowers skills.

| Role | Model |
|---|---|
| Implementer, plan carries the complete code (transcription + tests) | `sonnet` |
| Implementer from prose, several files, integration | `opus` |
| Task reviewer, small mechanical diff | `sonnet` |
| Task reviewer, logic, security or concurrency | `opus` |
| Scoped re-review of a fix | `sonnet` |
| Fix rounds 4–5 | `opus` |
| Verification ("was the goal met") | `opus` |
| Final whole-branch review | `opus` |
| Summary writer | `haiku` |
| Orchestrator in the cheaper-orchestration mode | `sonnet` |

- Always pass `model` explicitly; an omitted one inherits the session's model.
- Effort is not set per dispatch: subagents inherit the session's effort.
- `fable` only when the user names it, including for the final review.
- A role not in the table: `sonnet`.
```

- [ ] **Step 2: Reconcile**
- [ ] **Step 3: Write the acceptance tests** — extend the real-fragment tests in `assemble-claude-md.test.mjs`.
- [ ] **Step 4: Run them** — `node run-tests.mjs payload/bin/lib/assemble-claude-md.test.mjs variants.test.mjs` → PASS
- [ ] **Step 5: Commit** — `feat(model-policy): Sonnet 5 default, effort high, ultrapowers role map`

---

### Task 3: Fork delta 016 and revision 2

Work in `D:\6__Work\AI_Projects\ultrapowers` on branch `patch`.

**Files (fork repo):**
- Create: `transform/deltas/016-model-policy-pointer.patch`
- Modify: `transform/config.json` (`version.revision` 1 → 2)
- Modify: `transform/fork-owned/README.plugin.md`, `README.plugin.ru.md` (delta table row), `README.repo.md`, `README.repo.ru.md` ("thirteen" → "fourteen", «тринадцать» → «четырнадцать»)

**Acceptance:**
- `node transform/build-cli.mjs check` → 14 applied, 0 obsolete, 0 failed.
- The built `plugins/ultrapowers/skills/subagent-driven-development/SKILL.md` has the pointer paragraph directly under `## Model Selection`, upstream text unchanged below it.
- Built `plugin.json` version `6.4.1-up.2`.
- `node --test` in the fork passes; `build-cli drift` clean after `build-cli commit`.

- [ ] **Step 1: Implement** — author the delta over base + 001..015:

```bash
S=/d/6__Work/AI_Projects/claude-config/.claude/.scratchpad/tmp/p21
cd /d/6__Work/AI_Projects/ultrapowers
node transform/build-cli.mjs emit "$S/chain"          # base + all current deltas
git -C "$S/chain" init -q && git -C "$S/chain" add -A && git -C "$S/chain" commit -qm pre016
# edit $S/chain/plugins/ultrapowers/skills/subagent-driven-development/SKILL.md:
#   insert the paragraph below as the first paragraph under "## Model Selection"
git -C "$S/chain" diff > transform/deltas/016-model-policy-pointer.patch
```

Paragraph:

```markdown
If the environment provides a model-selection policy (a `model-selection-policy` skill or a
CLAUDE.md model section), its role map decides the model for every dispatch in this plugin and
this section is the fallback.
```

README table row (en): `| \`016-model-policy-pointer\` | Model Selection defers to an environment's model-selection policy |`; (ru): `| \`016-model-policy-pointer\` | Model Selection уступает политике выбора моделей окружения |`.

- [ ] **Step 2: Reconcile**
- [ ] **Step 3: Verify** — `node transform/build-cli.mjs check`; grep the built SKILL.md via `node transform/build-cli.mjs emit "$S/built"`.
- [ ] **Step 4: Run** — `node --test` in the fork → PASS; then `node transform/build-cli.mjs commit`; `node transform/build-cli.mjs drift` → clean.
- [ ] **Step 5: Commit** (fork, `patch` branch, named paths only) — `feat(transform): delta 016 — Model Selection defers to the environment's policy`. Delete `$S` by name afterwards.

---

### Task 4: Docs and full suite

**Files:**
- Modify: `README.md`, `README.en.md` — setup section: session defaults (`model: sonnet`, `effortLevel: high`, conflict handling); model policy mention (Sonnet 5 default).

**Acceptance:**
- `node run-tests.mjs` full suite passes; count reported.

- [ ] **Step 1: Docs**
- [ ] **Step 2: Full suite** — `node run-tests.mjs`
- [ ] **Step 3: Commit** — `docs: Sonnet 5 default and managed session defaults`
