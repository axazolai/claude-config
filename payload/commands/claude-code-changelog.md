---
description: Show what changed in Claude Code since the version you last checked, and whether any of it matters here
allowed-tools: Bash(node *), Read
---

Claude Code updates itself in the background and only ever shows a bare "Update installed ·
Restart to update" banner. This command fills in the blank: it prints the actual changelog
entries for the versions you haven't seen yet.

## Run it

```
node ~/.claude/bin/claude-code-changelog.mjs
```

No arguments. It reads the version range from `~/.claude/state/component-updates.json` (written
by the background component-update checker) and fetches the matching slice of
`github.com/anthropics/claude-code/CHANGELOG.md`.

## Show me the output, then do the actual work

Print the raw entries the script returns. Then — using what you already know about the current
project, its stack, and how it uses Claude Code — call out anything in the list that's actually
relevant here: a new hook event, a settings key, a command/flag, a behavior change that touches
something this project already does its own way. Don't just restate the changelog; say plainly
which lines are noise (routine bug fixes) and which ones are worth acting on, and what acting on
one would look like.

If the script says there's nothing recorded yet, or you're already on the latest known version,
say so plainly — don't invent a changelog entry to talk about.

## Do not

- Do not treat every bullet as equally important — most releases are mostly bug fixes.
- Do not run any follow-up install/update commands off the back of this report; this command only
  reads and reports.
