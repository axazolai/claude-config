# DEEPSEEK OFFLOAD (local executor)

The project's offload level is in `.claude/deepseek.json` (`level`), else the installed default
(`~/.claude/deepseek-defaults.json`). `/deep-model-effort [off|light|medium|heavy|full]` sets it; the session-start note and the
statusline `DS <level>` segment show it. When the `deepseek` MCP tools return `unavailable`, do the
task yourself and do not retry.

## When to offload, by level

- `off`: never. Do everything yourself.
- `light`: summaries of large files/logs, commit messages, "where/how is X" lookups.
- `medium`: light + draft tests/boilerplate, compressing long Bash output.
- `heavy`: medium + read-exploration and multi-file drafts.
- `full`: the whole session runs on DeepSeek — relaunch only (`bin/claude-deepseek.ps1`), never
  switched in-session.

At `light` and above, offloading is the default for every task type the level lists:
- Before reading a file or log over ~300 lines to learn what it holds, call `local_summarize`.
- Before a Bash command that may print over ~100 lines, pipe it to a file and call `local_summarize` on the file.
- Write commit messages with `local_commit_msg`.
- Load the `local_*` schemas with `ToolSearch` `select:mcp__deepseek__local_ask,mcp__deepseek__local_summarize,mcp__deepseek__local_commit_msg,mcp__deepseek__local_draft` at the first such task of the session.

Routine summary, classification and extraction work goes to `local_*` instead of `rung-haiku`; at
`medium` and above, rung-2 work that neither reads nor edits code does too (see
`model-selection-policy`, "DeepSeek before rung 1 and rung 2").

Never offload: refactors across files, architecture, non-obvious debugging, final review.

## Tools

`local_summarize(path|text, maxWords)`, `local_ask(question, paths[])` (code dumped first, question
last), `local_commit_msg(diff)`, `local_draft(spec)` (medium+). Cap input near 100k tokens.

## Task weight and the retry budget

Classify each offloaded task: light (one file/lookup/commit), medium (a few files or a draft+test),
heavy (large multi-file). When a result does not satisfy the request (empty, truncated, wrong, or
missing what was asked), rework it up to this many EXTRA attempts, then take the task over yourself:

| level \ weight | light | medium | heavy |
|---|---|---|---|
| light | 1 | 1 | 0 |
| medium | 3 | 2 | 1 |
| heavy | 5 | 3 | 2 |

For critical spots, verify one or two facts from a summary against the source before relying on it.
