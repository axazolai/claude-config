---
description: Switch this project's testing mode — enable (tdd, test first) or disable (tests after the code, before review); no argument shows the current mode
argument-hint: "[enable|disable]"
allowed-tools: Bash(node *)
---

Run exactly this, passing `$ARGUMENTS` through unchanged:

```
node ~/.claude/bin/ultrapowers-tdd.mjs $ARGUMENTS
```

Print its output verbatim. Then state the mode it reports in one line, and from this message on
follow that mode for the rest of the session:

- `tdd` — `testing.md` → "tdd mode": failing test first, then the code (RED → GREEN →
  REFACTOR); ultrapowers skills take their tdd branch.
- `test-after` — `testing.md` → "test-after mode": code first; tests once the unit of work stands
  whole, before its review, only for what the spec/plan states; ultrapowers skills take their
  test-after branch.

An error (exit 1 or 2) changes nothing: show it and stop.
