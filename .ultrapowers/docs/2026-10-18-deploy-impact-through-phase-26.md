# Deploy impact — master at `d4b28b1`

Written **before** the deploy, from `node setup.mjs --dry-run`. Variant `base`, 220 files.
Working tree clean, 625 tests / 0 failures on the merged result, 20 commits ahead of
`origin/master` (push pending: the `origin` credential needs the user). The waterline was 24: this
deploy carries phase 25 (DeepSeek offload), A (Haiku 5.5 routing), C (save points) and phase 26
(GSD and `full` removed).

## Files

- **Created (2):** `hooks/ci-watch-nudge.mjs`, `hooks/worktree-executor-discipline-advisor.mjs` —
  formerly `full`-only, now in `base`.
- **Updated (213):** real content changes (CR-normalized hashes differ), across agents 6, bin 39,
  commands 9, hooks 49, mcp-servers 7, rules-src 37, setting-templates 31, skill-library 18,
  skills 17. Spot checks: `hooks/lib/atomic-json.mjs` and `rules-src/README.md` lose their GSD
  lines.
- **Unchanged (5).**
- **Stale, pruned (2):** `add-risk.mjs`, `bin/lib/gsd-core-detect.mjs`.

## GSD purge

Lists 2 paths — the same two former bundle files. No gsd-core, `~/.gsd`, GSD settings entries or
project-init keys exist on this machine, so `settings.json.pre-gsd-purge` is not written.

## settings.json

Additive merge: adds the PreToolUse registration for `worktree-executor-discipline-advisor.mjs`
(`Bash|Read`) and the one for `ci-watch-nudge.mjs` (`Bash`). Nothing removed. Expected `/hooks`
after restart: PreToolUse x11, PostToolUse x4, PostToolUseFailure x1, SubagentStop x1,
PreCompact x1, SessionStart x1, SubagentStart x1.

## CLAUDE.md

`~/.claude/CLAUDE.md` is the one curated conflict (the `12-model-selection.md` GSD line, the
save-points fragment, the A routing text). It needs `(r)eplace`.

## Session defaults — the hazard

The bundle's `sessionDefaults.model` is `sonnet`; this machine's `model` is `opus[1m]`, kept by the
user's standing decision. `--replace-all` applies every session default, so it switches the
model. Asked before the run, the user chose `sonnet` (2026-10-18), superseding the
`opus[1m]` decision of 2026-07-31.

## MCP

`scrapling`, `context7` and `deepseek` are not registered at user scope on this machine; the run
adds them (`scrapling install` downloads browsers; `context7` has no `CONTEXT7_API_KEY`). The user
chose all three.

## How it runs

Every answer the user gave equals the `--replace-all` outcome (`CLAUDE.md` replaced, the
`settings.json` merge result written, session defaults applied, MCP actions run, stale files
pruned), so the deploy is `node setup.mjs --replace-all` from `master`.

## Plugins

No plugin actions. `superpowers@claude-plugins-official` stays installed, disabled.

## DeepSeek

`deepseek-defaults.json` is written with `level=medium` (the `base` default).

## Result

Ran `node setup.mjs --replace-all` at `42c88f4`, exit 0. 2 created, 213 updated, `CLAUDE.md`
replaced, `settings.json` written with the merge result (two new hook registrations, `model`
`opus[1m]` → `sonnet`), GSD purge removed the 2 listed paths, MCP `scrapling` (plus
`scrapling install`: 49 packages and the browsers), `context7` and `deepseek` added at user scope.
A dry run immediately afterwards reports every category unchanged, no GSD section and no MCP
action. `settings.json` holds no `gsd` string. Hooks and MCP servers bind after a restart.
