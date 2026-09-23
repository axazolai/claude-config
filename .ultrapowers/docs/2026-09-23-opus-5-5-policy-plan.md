# Plan: Model Selection Policy for Claude Opus 5.5

Status: option A applied on `feat/opus-5-5-policy` (2026-09-23), stages 1–3; stage 4 unverified
(no GSD agents installed on this machine). Facts re-checked against live docs on 2026-09-23:
GA since 2026-09-22, $4/$20, thinking always on, default effort `medium`. Same pass corrected
the cost table: Sonnet 5 $2/$10, Fable 5 → Fable 5.1. `claude-opus-5` matches as an exact id
(suffix-stripped), since it is a prefix of `claude-opus-5-5` and any later `claude-opus-5-N`.

## Facts (claude-api skill, cache 2026-06-24; model marked "launching")
- `claude-opus-5-5`: $4 / $20 per MTok (Opus 5: $5 / $25), cache read $0.20; fast mode $8 / $40.
- Same 1M context, 128K output, tokenizer and feature set as Opus 5.
- Breaking vs Opus 5:
  1. Thinking cannot be disabled: `{type:"disabled"}` / `budget_tokens` → 400 at every effort.
  2. Default `effort` is `medium` (Opus 5: `high`).
  3. Forced `tool_choice` `any`/`tool` → 400.
  4. Preserved thinking: blocks bound to model + conversation; history-edit check for accounts
     created on/after 2026-08-31.
  5. Computer use only via `computer_toolset_20260801`.
- Progress text between tool calls arrives as `thinking` blocks (`display: "updates"`).
- Wider refusal classifiers: `bio`, `reasoning_extraction` added to `cyber`.

## Decision required before execution
**D1 — default executor.**
- A) Switch default to `claude-opus-5-5`. Affects: fragment 12, skill, `model-migration.mjs`
  (opus-5 → opus-5-5 becomes a superseded family), its test, cost table. 20% cheaper; every role
  without an explicit effort drops from `high` to `medium`.
- B) Keep `claude-opus-5` default, add Opus 5.5 as a named option with its caveats. Affects:
  fragment 12 (one line), skill (a section + cost row). No code change.
Recommendation: B now, A after the model leaves "launching" and effort per role is re-checked.

## Stage 1 — `payload/claude-md/12-model-selection.md` (both options)
Why: this fragment is in every session's context; it must not give advice that 400s on 5.5.
- Line 8–9: "Opus 5 thinks by default" → "Opus 5 / 5.5 think by default (5.5: always; thinking
  cannot be disabled)".
- Add: "On claude-opus-5-5 the default effort is `medium`; set `effort` explicitly."
- Option A only: line 2 `claude-opus-5` → `claude-opus-5-5`; line 4 cost ratio for Fable
  (`2.5x Opus 5.5`).

Example (option B, added bullet):
```md
- claude-opus-5-5 only when the user names it: $4/$20, thinking always on (cannot be
  disabled), default effort `medium` — always pass `effort` explicitly; forced `tool_choice`
  `any`/`tool` is a 400.
```

## Stage 2 — `payload/skills/model-selection-policy/SKILL.md`
Why: the skill holds the full ladder; its "If thinking is ever off, keep effort ≤ high" line is
wrong for 5.5.
- Tier list: add `claude-opus-5-5` (B: named-only; A: replaces opus-5 as default).
- Effort section: "Omitting `effort` means `high` on Opus 5 but `medium` on Opus 5.5 — never rely
  on the default."
- Thinking section: "On Opus 5.5 thinking cannot be disabled (400); lower effort instead."
- New bullet: forced `tool_choice` → 400 on 5.5; use `auto` + `strict: true`.
- Cost table row:
  `| Opus 5.5 | claude-opus-5-5 | $4 | $20 | 1M | Thinking always on; default effort medium |`
- `description:` frontmatter: mention Opus 5.5 (A: as default).

## Stage 3 — option A only: `payload/bin/lib/model-migration.mjs` + test
Why: `setup.mjs` rewrites superseded model ids in `settings.json`; without this the session
default stays on opus-5.
```js
{ target: "claude-opus-5-5", prefixes: ["claude-opus-5", "claude-opus-4", "claude-3-opus", "opus[1m]"] },
```
Pitfall: `"claude-opus-5-5".startsWith("claude-opus-5")` is true → the entry would "migrate"
5.5 to itself and report `changed: true` each deploy. Guard: skip when `model === fam.target`
or `model.startsWith(fam.target)`. Test (`@important`): opus-5 → opus-5-5; opus-5-5 unchanged,
`changed: false`; `claude-opus-5[1m]` handling decided explicitly.

## Stage 4 — GSD effort (option A only, check, likely no change)
Why: roles on alias `opus` without explicit effort would silently drop to `medium` if the alias
resolves to 5.5. Check `gsd-defaults.partial.json` `effort.agent_overrides` and
`gsd-agent-patches.mjs` §6.1: every opus role must carry an explicit effort.

## Out of scope
- Token-usage pricing: `token-usage-pricing-refresh.mjs` scrapes the live pricing page; no edit.
- `statusline` / `autocompact` tests use `claude-opus-5` as fixture data; no edit.

## Verification
- `node setup.mjs --dry-run`, then `node setup.mjs --replace-all`.
- Deployed `~/.claude/CLAUDE.md` contains the new Model Selection lines (read, not edit).
- Option A: `node --test payload/bin/lib/model-migration.test.mjs` + linter; full suite before push.
- Grep payload for "keep effort ≤ `high`" / "disable thinking" advice left without a 5.5 caveat.

## Risk
- Opus 5.5 data is from a cached skill table marked "launching"; re-check prices and the
  `medium` default against live docs before option A.
