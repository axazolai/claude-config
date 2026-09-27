# Phase 21 — Verification

Checked against: branch `feat/model-policy` at `c7dd2f7`, diff
`.ultrapowers/sdd/phases-21-model-policy/review-c673390..c7dd2f7.diff`, and the working-tree
files at that commit. Plan `21-PLAN.md`, spec `21-SPEC.md`. Checked on 2026-09-27.

## Goal

> Sessions start on Sonnet 5 at effort `high`, the bundle's policy says so, ultrapowers
> dispatches follow one role map, and the fork points at it.

**Verdict: ACHIEVED** in source. It reaches a machine only through the next `node setup.mjs`
run, and the plan keeps deploy out of scope. See Gaps.

## Evidence

**1. "Sessions start on Sonnet 5 at effort `high`"**
- `variants.json:26`: `"sessionDefaults": { "model": "sonnet", "effortLevel": "high" }` is a top-level key and is not scoped to any profile, so it applies to full, base and lite.
- `session-defaults.mjs`: `buildSessionDefaultsPlan(settings, managed)` skips a key that already holds the managed value. An absent key becomes a change with `conflict: false`, and a different value becomes one with `conflict: true`. `describeSessionChange` renders `key: from|(unset) -> to`. The module never touches fs or process.
- `setup.mjs:52` imports the module. The block at `setup.mjs:1429-1453` sits directly after the MCP block and before `/* ---------- opt-in: daily background check`, as the plan requires. How the block handles each case:
  - It computes the plan from `settings.json`.
  - It logs `--- session defaults ---` and one line per change.
  - Under `--dry-run` or `--skip-all` it writes nothing.
  - Under `--replace-all` (`BULK === "replace"`) it writes every change.
  - An interactive `y` writes every change.
  - Otherwise, including an interactive `n`, `--merge-all` and a non-TTY run, it writes only the absent keys and logs `kept <key>: <from> (re-run with --replace-all to set <to>)` for each conflict.
  - Other keys are kept: it reads the file, sets only the planned keys, then writes the file back.
- Tests covering it:
  - `session-defaults.test.mjs:7`, `:16`, `:20` are the three planner acceptance cases: absent key, key already at the managed value, and conflict. The two description strings are asserted verbatim. These tests pass: I ran them with `node --test` together with the assembler tests, 10/10.
  - `setup-variants.e2e.test.mjs:496`: `--dry-run` against `claude-opus-5-5`/`xhigh` prints the header and both `->` lines, and the file stays byte-identical.
  - `setup-variants.e2e.test.mjs:509`: `--replace-all` writes `sonnet`/`high` and keeps `statusLine`.
- Final-review fix (`c7dd2f7`), checked in the code:
  - **An unparsable settings.json is no longer destroyed.** `setup.mjs:1161-1164` sets `cur = null` when the JSON does not parse. The session-defaults block is gated on it at `setup.mjs:1430`: `if (cur === null) log("...settings.json: INVALID JSON - left untouched") else { ... }`. Nothing assigns to `cur` again between lines 1164 and 1430 (checked). So in that case the block never reaches the old `safe(...) || {}` fallback, which used to overwrite the file with a two-key object. The regression test is `setup-variants.e2e.test.mjs:524` (`@critical`). It runs with no flags, with `--replace-all` and with `--merge-all`, and asserts the file is byte-identical and that the message is printed.
  - **`--merge-all` no longer overwrites a conflict.** `setup.mjs:1442` now reads `else if (BULK === "replace") apply = changes;`. The plan's snippet had `else if (BULK)`, which matched `"merge"` too. With the fix, `--merge-all` falls through to the default of writing only the absent keys. The regression test is `setup-variants.e2e.test.mjs:538`: `model` is kept as `claude-opus-5-5`, `effortLevel: high` is added, and `kept model:` is printed.
- `effortLevel` as a settings.json key: the claude-config tree contains no Claude Code documentation for this key. The only reference found is a GSD ADR vendored under `.test/` (`443-opus48-...md`). See Gaps.

**2. "the bundle's policy says so"**
- `payload/claude-md/12-model-selection.md:1-18` has frontmatter `profiles: [base, full]`. It contains "DEFAULT executor: claude-sonnet-5", the step-up list for Opus 5.5, Haiku and Fable, "Start `high`", and the pointer to the role map in the `model-selection-policy` skill.
- `payload/claude-md/12-model-selection.lite.md:1-12` has the same body without the ultrapowers bullet. Its last bullet has no GSD mention.
- `payload/skills/model-selection-policy/SKILL.md` and `payload-lite/skills/model-selection-policy/SKILL.md` both carry:
  - the new description;
  - "DEFAULT executor: **claude-sonnet-5**";
  - the "## Tier: start on Sonnet 5, step up for judgment" section;
  - the new effort bullets (`low`/`medium` "on both Sonnet 5 and Opus 5.5", "Start **`high`**");
  - the advisor paragraph, now reading "Sonnet 5 by default, stepped up".
- Test: `payload/bin/lib/assemble-claude-md.test.mjs:56`. It checks:
  - Assembled base and full both contain the three required strings.
  - The lite Model Selection section contains "DEFAULT executor: claude-sonnet-5" and "Start `high`".
  - The lite section contains neither "role map" nor "ultrapowers".
  - The test scopes this check to the section because other lite fragments name the ultrapowers plugin legitimately. That matches the Review Focus wording: no mention of ultrapowers *dispatches* or the role map.

**3. "ultrapowers dispatches follow one role map"**
- `payload/skills/model-selection-policy/SKILL.md:53-73`: "## Ultrapowers per-role model map". It states that the map outranks the Model Selection section inside ultrapowers skills. The ten-row table matches spec §2 row for row. The four rules follow it, ending with "A role not in the table: `sonnet`." It is placed before "## Cost reference".
- The lite skill copy has no role-map section (grep: no "role map" or "Ultrapowers per-role").
- The CLAUDE.md side (base and full) points to the map with the `12-model-selection.md:15-16` bullet, "...follow the role map in the `model-selection-policy` skill; it outranks the Model Selection section inside ultrapowers skills."

**4. "the fork points at it"**
- *This evidence comes from the fork repo (`D:\6__Work\AI_Projects\ultrapowers`, branch `patch`, commit `5146baf`), which is outside the diff I was given. It was verified and task-reviewed there, and is taken as reported.*
  - Delta `transform/deltas/016-model-policy-pointer.patch` inserts this paragraph under "## Model Selection" in `subagent-driven-development/SKILL.md`: "If the environment provides a model-selection policy (a `model-selection-policy` skill or a CLAUDE.md model section), its role map decides the model for every dispatch in this plugin and this section is the fallback."
  - `build-cli check` gave 14 applied, 0 obsolete, 0 failed. The fork's `node --test` passed 73/73. `build-cli drift` was clean. The built `plugin.json` version is `6.4.1-up.2`.

**Docs (Task 4):** `README.md:657` and `README.en.md:666` add a "Session defaults" section covering:
- the managed keys and values, and that they apply on every profile;
- conflict handling, including that `--merge-all` keeps a conflict;
- dry-run and `--skip-all`;
- the invalid-JSON skip;
- the Sonnet 5 policy default.

## Global constraints

- **Test-after; `@critical`/`@important` is the first token of each test name — HELD.** All seven new tests carry the tag as their leading word, at `session-defaults.test.mjs:7,16,20`, `setup-variants.e2e.test.mjs:496,509,524,538` and `payload/bin/lib/assemble-claude-md.test.mjs:56`.
- **Run tests with `node run-tests.mjs <files>` (temp dirs under `.claude/.scratchpad/test-tmp/`) — HELD in the code.** The new e2e tests use `mkdtempSync(join(tmpdir(), ...))` (`setup-variants.e2e.test.mjs:497,510,527,539`). `run-tests.mjs:11,15` points `TMPDIR`/`TEMP`/`TMP` at `.claude/.scratchpad/test-tmp/<run>`. Whether each run went through `run-tests.mjs` is not provable from the diff (see Gaps).
- **Never Write/Edit under `~/.claude/`; no push, plugin update or deploy inside the plan — HELD as far as the diff shows.** The diff touches no path under `.claude/`: `grep -c '^+++ b/.*\.claude/'` gives 0. All changes are sources: `payload/`, `payload-lite/`, `variants.json`, `setup.mjs`, root `.mjs` files and READMEs. The absence of a push or deploy cannot be read from a diff (see Gaps).
- **Managed session defaults `model` = `sonnet`, `effortLevel` = `high` — HELD.** `variants.json:26`.
- **Default executor Sonnet 5; Opus 5.5 for design/architecture, security-sensitive review, hard debugging, costly-if-wrong work; Haiku 4.5 for classification; Fable only when named — HELD.**
  - `payload/claude-md/12-model-selection.md:5-8` and `12-model-selection.lite.md:2-5`.
  - `payload/skills/model-selection-policy/SKILL.md:11-18`, identical in the lite copy.
  - The plan's constraint names Fable "5.1". The source says `claude-fable-5-1`, consistent with the spec.
- **A role not in the ultrapowers map gets `sonnet` — HELD.** `payload/skills/model-selection-policy/SKILL.md:73`.
- **Fork repo `patch` branch; stage named paths only, never the deleted `graphify-out/` files — HELD per the fork report.** This is outside this repo and was reviewed there, not re-checked here.

## Gaps

- **Spec §3 wants the fork delta published; the plan defers it.** Spec §3 says the fork delta is "Built, tested and published the way the fork's previous deltas were (… push)". The plan's Global Constraints forbid any push inside this plan. So `6.4.1-up.2` exists only on the fork's local `patch` branch. Until it is pushed and the marketplace update installs it, the installed ultrapowers plugin has no pointer. The bundle-side pointer in `12-model-selection.md` and the skill still gives the role map precedence on its own. This deferral is the plan's own decision, not a missed task, but a machine does not yet have "the fork points at it".
- **unverifiable: "Sessions start on Sonnet 5 at effort `high`" on a real machine.** This needs two things:
  - a run of `node setup.mjs` after merge (deploy is outside the plan);
  - Claude Code honouring the `effortLevel` key in `settings.json`. The only support for that in this tree is a vendored GSD ADR under `.test/`.

  What would settle it: deploy, then start a fresh session and check `/model` and `/effort`. On a machine whose `model` is already set to something else, a plain or `--merge-all` run keeps the old value by design (spec §1a). Only `--replace-all` or an interactive `y` switches it.
- **unverifiable: the interactive paths.** The interactive `n` path (absent keys written, conflicts kept and reported) and the interactive `y` path have no test, because the e2e harness has no TTY. From reading `setup.mjs:1439-1446`, `n` takes the same branch as `--merge-all`, which is tested at `setup-variants.e2e.test.mjs:538`. What would settle it: a manual interactive run against a sandbox `CLAUDE_CONFIG_DIR`.
- **unverifiable: Task 4's acceptance, "`node run-tests.mjs` full suite passes; count reported".** No run log or count is in the material I was given. I did not run the full suite: it includes e2e runs of `setup.mjs`, and per project memory the e2e sandbox does not isolate HOME. I ran only the pure unit files (`session-defaults.test.mjs` and `payload/bin/lib/assemble-claude-md.test.mjs`), 10/10 pass. What would settle it: the full-suite output from `node run-tests.mjs` at `c7dd2f7`.
- **unverifiable: no push or deploy happened during the plan.** What would settle it: `git log origin/feat/model-policy` or the remote's reflog, and the `~/.claude` mtime.
