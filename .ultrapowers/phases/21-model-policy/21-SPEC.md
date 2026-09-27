# Phase 21 — Model policy: cheaper default effort, one role map for ultrapowers

## Intent

Stated by the user: cut cost, remove the contradiction between the bundle's model policy and
ultrapowers' own "Model Selection", and review the default model choice against the current
models. The ultrapowers role map lives in both places: the map itself in the bundle, a pointer
to it in the fork.

The contradiction today:

- The bundle (`12-model-selection.md`, skill `model-selection-policy`): Opus 5.5 for everything,
  cost is tuned with `effort`, start `xhigh` for coding.
- The fork (`subagent-driven-development` → "Model Selection"): "use the least powerful model
  that can handle each role", in tier words (cheap / standard / most capable), no `effort`.
- User CLAUDE.md outranks skills, so a dispatch gets two instructions and no rule for which wins.

Facts this design rests on (checked 2026-09-27):

- Prices per 1M tokens in/out: Opus 5.5 $4/$20, Sonnet 5 $2/$10, Haiku 4.5 $1/$5, Fable 5.1
  $10/$50 (`claude-api` skill, model table).
- The `Agent` tool takes `model` (`sonnet`/`opus`/`haiku`/`fable`), no `effort`. A subagent's
  `effort` inherits the session's unless its definition's frontmatter sets one
  (code.claude.com/docs/en/sub-agents, frontmatter table).
- A subagent's model: per-invocation `model` > frontmatter `model` > `CLAUDE_CODE_SUBAGENT_MODEL`
  > the main conversation's model.

Success: a session starts on Sonnet 5 at effort `high`, reads one rule for every ultrapowers
dispatch — role → model — and steps up to Opus 5.5 only where the policy says.

## 1. Default policy — bundle

`payload/claude-md/12-model-selection.md` (all profiles) and `payload/skills/model-selection-policy/SKILL.md`
plus its lite copy `payload-lite/skills/model-selection-policy/SKILL.md`:

- **Sonnet 5 becomes the default executor** (user decision 2026-09-27). Step up to Opus 5.5 for
  design and architecture, security-sensitive review, hard debugging, and work where a wrong
  answer is costly; Haiku 4.5 for no-judgment classification/extraction; Fable 5.1 only when the
  user names it. The skill's "start on Opus, step effort down" section becomes "start on Sonnet,
  step up to Opus for judgment"; the cost table stays.
- Effort ladder: start **`high`** for coding and agentic work; `xhigh` for long agentic runs and
  debugging; `max` a reserve. Replaces "start `xhigh` for coding/agentic work".
- New line in `12-model-selection.md`, which becomes `profiles: [base, full]`; lite gets its own
  `12-model-selection.lite.md` without it:
  "Ultrapowers subagent dispatches follow the role map in the `model-selection-policy` skill; it
  outranks the Model Selection section inside ultrapowers skills."
- Lite has ultrapowers disabled: its fragment and skill copy get the effort change only, no role
  map and no pointer.

## 1a. Session defaults — `setup.mjs`

The policy text does not change which model a session starts on; `~/.claude/settings.json`
does. Two keys become bundle-managed, all profiles:

| Key | Value |
|---|---|
| `model` | `sonnet` |
| `effortLevel` | `high` |

- Absent → written.
- Present with the managed value → nothing.
- Present with another value → a conflict, shown as `model: claude-opus-5-5 -> sonnet`:
  `--replace-all` and interactive `y` write it; interactive `n`, `--skip-all`, non-interactive
  runs and `--dry-run` print it only.
- A pure planner (`buildSessionDefaultsPlan(settings, managed) -> changes[]`) beside the other
  reconcile modules; setup writes through its existing settings writer.
- `/model opus` in a session still switches for that session; the next run of `setup.mjs` with
  `--replace-all` puts the file back to `sonnet`.
- An unparsable `settings.json` is left untouched: the block writes nothing and prints
  `settings.json: INVALID JSON - left untouched` under its `--- session defaults ---` header.
  This is the same message the settings merge adds to the final summary (§1b); a
  `settings.json` that turns unparsable between the block's first read and its write prints the
  §1b skip message with `<block>` = `session defaults` instead.
- `describeSessionChange` formats a non-string current or managed value with `JSON.stringify`
  (`model: {} -> sonnet`, never `model: [object Object] -> sonnet`).
- The §6.3 Part B model-migration prompt (a superseded id, e.g. `claude-opus-4-8`, offered a
  tier-preserving migration to `claude-opus-5-5`) is skipped whenever the session-defaults block
  is about to cover `model` anyway — the comparison is the bundle-managed default against the
  user's CURRENT value, and no superseded id ever equals that default, so this holds
  unconditionally today. It stops holding only if `sessionDefaults.model` is removed from
  `variants.json` entirely; reshaping the default's value (e.g. to a full id instead of an
  alias) does not disable it, since the comparison is still against the user's current
  (superseded) value, never against the migration target. One question/report covers `model`;
  there is no back-to-back migrate-then-replace-default prompt pair. Because `--replace-all`
  only ever offers the bundle default, never the tier-preserving id, the session-defaults report
  line and its `kept` line both append the tier-preserving id as a hint whenever the current
  `model` is superseded, in every mode (interactive, non-interactive, `--dry-run`, `--skip-all`,
  `--merge-all`).

## 1b. Setup.mjs JSON safety

§1a's rule holds for every block of `setup.mjs` that reads a JSON file and may act on it.

- One reader, `readJsonOrNull(path)`: an absent file → `{}`; a file that parses to an object →
  that object; anything else (unreadable, invalid JSON, not an object) → `null`. A leading UTF-8
  BOM is stripped before parsing, so a BOM-prefixed valid file is handled normally.
- `settings.json` readers that write back — the main additive merge, session defaults,
  `enabledPlugins` reconciliation, the update-check opt-in, the PowerShell-tool opt-in — use it.
  On `null` every one of them writes nothing. Two message formats come from two code paths, and
  one run against a broken `settings.json` prints both:
  - The main merge adds `settings.json: INVALID JSON - left untouched` to the final summary;
    session defaults reuses the merge's read and prints the same text in its own section (§1a).
  - Plugin reconciliation, the update-check opt-in and the PowerShell-tool opt-in each print
    `<path to settings.json>: not valid JSON — skipped (<block>)`, where `<block>` is
    `plugin reconciliation`, `update-check opt-in` or `PowerShell-tool opt-in`. A re-read
    immediately before a write that finds the file unparsable prints the same format (plugin
    reconciliation's re-read, and session defaults' with `<block>` = `session defaults`).
  - Under `--dry-run` the update-check and PowerShell-tool blocks do not read `settings.json`, so
    they print nothing.
- The `autoUpdates` block reads the Claude Code state file (`.claude.json`) and `settings.json`
  through the same reader; on `null` for the state file it writes nothing and adds
  `autoUpdates: state file is not valid JSON - left untouched` to the summary. `--doctor` reads
  `settings.json` through it too; an absent file or `null` prints
  `settings.json missing or invalid JSON.` and exits 1. A BOM-prefixed valid file is parsed by
  both (`@important`, `setup-variants.e2e.test.mjs`).
- MCP reconciliation reads `.claude.json` through the same reader. An existing but unparsable
  `.claude.json` skips the whole step — no plan, no `claude mcp` command — and prints
  `cannot read .claude.json — MCP step skipped`. An absent `.claude.json` still plans from `{}`.
- `write()` never fails silently: a failed write prints
  `WARNING: could not write <path> (<error code>)` and returns `false`.
- Tests: `@critical` per block (plugin reconciliation, MCP, update-check, PowerShell tool) — an
  unparsable file is byte-identical after a `--replace-all` run that would otherwise write it;
  `@important` BOM-prefixed valid `settings.json`, the MCP skip message with no `claude mcp`
  command run, and the write-failure warning (`setup-variants.e2e.test.mjs`).

## 1c. Verification skill — model-conditional

`payload/skills/verification-before-completion/SKILL.md` is model-conditional, matching §1's
Opus-5.5-specific "do not add verify/double-check scaffolding" line:

- **On Opus 5.5 or newer:** no-op — Opus 5.5 always thinks and verifies its own work, so no
  scaffolding is added. **On any other model** (Opus 5 and older, Sonnet, Haiku, Fable): before
  claiming work complete, check the result against the spec/plan's stated acceptance criteria —
  name each criterion with its evidence — instead of a generic "double-check".
- The "what this does not touch" section (structural verification by a separate agent, CI gates,
  honest reporting) applies to every model.
- The bundle's effort/model-selection text carries two further sentences:
  - "Do not carry `effort` values over between models" — in `12-model-selection.md` and
    `12-model-selection.lite.md` (the `Tune cost with effort` bullet), and in
    `payload/skills/model-selection-policy/SKILL.md` and its `payload-lite` copy (the
    "Effort is the primary cost / latency control" section's `Start high...` bullet).
  - "revisit any `max_tokens` that was sized for a no-thinking budget" — in
    `12-model-selection.md` and `12-model-selection.lite.md` (the `Opus 5.5 always thinks...`
    bullet), and in `model-selection-policy/SKILL.md` (base and lite) under "Opus 5.5 thinks and
    verifies itself".
- Tests: `@important` assembled CLAUDE.md (all profiles) carries the no-scaffolding rule scoped
  to Opus 5.5, not generic to every model (`assemble-claude-md.test.mjs`). The SKILL.md
  conditional wording itself is doc-only prose with no branching logic to unit-test.

## 2. Ultrapowers role map — bundle skill (base/full)

New section "Ultrapowers per-role model map" in `payload/skills/model-selection-policy/SKILL.md`:

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

Rules under the table:

- Always pass `model` explicitly; an omitted one inherits the session's model.
- Effort is not per dispatch: subagents inherit the session's effort.
- `fable` only when the user names it, including for the final review.
- A role not in the table: `sonnet`, the default executor.

GSD's map is a separate heading further down the same file (after "## Cost reference"), titled
"GSD's own per-role map lives elsewhere, not in this skill", so it cannot be misread as part of
this table. The `description:` frontmatter names the ultrapowers role map explicitly.

## 3. Fork delta — ultrapowers

New delta `016-model-policy-pointer.patch` in `D:\6__Work\AI_Projects\ultrapowers\transform\deltas\`.
It adds one paragraph at the top of `subagent-driven-development/SKILL.md` → "## Model Selection":

> If the environment provides a model-selection policy (a `model-selection-policy` skill or a
> CLAUDE.md model section), its role map decides the model for every dispatch in this plugin and
> this section is the fallback.

The upstream text below it stays unchanged. `transform/config.json` `version.revision` 1 → 2
(`6.4.1-up.2`). Built, tested and published the way the fork's previous deltas were
(`build.mjs`, the fork's test suite, push). `claude-config` pins no fork version; the marketplace
update carries it.

## 4. Testing decisions

Seams: the session-defaults planner (input settings → changes), the setup dry-run output, the
assembled CLAUDE.md per profile, and the fork build. Checks:

- `@important` session defaults: absent keys are written; managed values produce nothing; a
  different value is a conflict carrying old and new; `--dry-run` changes no file (planner tests
  + one e2e dry-run against a sandbox settings.json holding `claude-opus-5-5`/`xhigh`).
- `@important` the assembled CLAUDE.md for base and full carries "start `high`" and the role-map
  pointer; lite carries "start `high`" and no pointer (`assemble-claude-md.test.mjs`).
- Fork: the fork's own suite passes with delta 016 applied; the built
  `subagent-driven-development/SKILL.md` contains the pointer paragraph above the upstream text.
- Every test spawn of `setup.mjs` runs with a sandbox `HOME` and `USERPROFILE` (a fresh temp dir
  holding its own `.claude.json`) besides the sandbox `CLAUDE_CONFIG_DIR`, so no block — the
  `autoUpdates` fallback to `<home>/.claude.json` included — reaches the real home.
  `@critical` guard, last test of `setup-variants.e2e.test.mjs`: every spawn it recorded carried a
  sandbox home that is neither the real home, nor an ancestor of it, nor inside it (the one
  exception: a sandbox inside the OS temp dir when that temp dir itself sits under the home), and the real `~/.claude.json`'s `autoUpdates` value is unchanged. The real file's
  mtime and size are not asserted: a running Claude Code session rewrites that file at any time.
- Suite via `node run-tests.mjs`.

## Out of scope

- GSD's role map (`gsd-defaults.partial.json`, agent patches).
- Custom agent definitions with frontmatter `effort` for ultrapowers roles.
- `CLAUDE_CODE_SUBAGENT_MODEL`.
- Rewriting upstream's Model Selection text in the fork.
