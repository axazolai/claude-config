---
description: Set this project's DeepSeek offload level — off | light | medium | heavy | full; no argument opens a picker
argument-hint: "[off|light|medium|heavy|full]"
allowed-tools: Bash(node *), AskUserQuestion
---

If `$ARGUMENTS` is non-empty, run exactly this, passing it through unchanged:

```
node ~/.claude/bin/deep-model-effort.mjs $ARGUMENTS
```

If `$ARGUMENTS` is empty:

1. Run `node ~/.claude/bin/deep-model-effort.mjs` to read the current level.
2. Call `AskUserQuestion` once: header `DS level`, `multiSelect: false`, question
   `DeepSeek offload level (current: <level>)?`, four options in this order, the current level's
   label suffixed with ` (current)`:
   - `off` — never offload; everything runs on this model.
   - `light` — summaries, commit messages, "where is X" lookups.
   - `medium` — light + draft tests/boilerplate, compressing long Bash output.
   - `heavy` — medium + read-exploration and multi-file drafts.
3. Run `node ~/.claude/bin/deep-model-effort.mjs <chosen label without suffix>`. A free-text
   answer is passed through as typed; `full` is accepted this way.

Print the script's output verbatim. Then, from this message on, apply that level per the DeepSeek
offload rules (see the `deepseek` rules fragment): which task types to send to `local_*` tools and
the retry budget by task weight. `full` requires a relaunch via `bin/claude-deepseek.ps1`; it cannot
be switched inside a running session.
