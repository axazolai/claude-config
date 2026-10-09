---
description: Set this project's DeepSeek offload level — off | light | medium | heavy | full; no argument shows the current level
argument-hint: "[off|light|medium|heavy|full]"
allowed-tools: Bash(node *)
---

Run exactly this, passing `$ARGUMENTS` through unchanged:

```
node ~/.claude/bin/deep-model-effort.mjs $ARGUMENTS
```

Print its output verbatim. Then, from this message on, apply that level per the DeepSeek offload
rules (see the `deepseek` rules fragment): which task types to send to `local_*` tools and the
retry budget by task weight. `full` requires a relaunch via `bin/claude-deepseek.ps1`; it cannot be
switched inside a running session.
