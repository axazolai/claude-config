@stack-rules.md

## NEVER edit a deployed file. Edit the source, then deploy.

This repository IS the installer. Everything under `~/.claude/` is its **output**, never its
source. This rule outranks convenience, urgency and "just to test it".

- **Never** `Write` or `Edit` any path under `~/.claude/`. Not to try something, not to fix
  it quickly, not once.
- Change the source — `payload/`, `payload/setting-templates/`, `bundle.json`, `setup.mjs`
  — then run `node setup.mjs` and let the installer carry it. A change that cannot reach a
  machine through the installer is not finished.
- `~/.claude/CLAUDE.md` is assembled from `payload/claude-md/*.md`. Edit the fragment. The
  `CURATED:NOEDIT` marker and the PreToolUse hook that denies edits to it are this rule
  enforcing itself — a denial there means you are editing the wrong file.
- On rollout the installer offers to replace a conflicting `CLAUDE.md`: answer `r`, or pass
  `--replace-all` with no TTY. That is the normal path, not a workaround.
- A live edit reaches no other machine and the next deploy erases it.

Machine-side state that no bundle file produces (an MCP server someone added by hand, a
plugin enabled outside `bundle.json`) is the one exception, and it is not an excuse: say
plainly that the change is machine-local and nothing in the project carries it.

## Project rules

- Development goes to `payload/` or the installer (`setup.mjs`, its tests, `bundle.json`,
  `settings.partial.json`, the READMEs, `.ultrapowers/`); never to `~/.claude` or this repo's own
  `.claude/` configuration.
- Deploy from `master` only, via `node setup.mjs`; never from a feature branch.
- A shipped or removed unit (hook, skill, command, CLI) updates the READMEs that describe or count
  it, in the same commit.

## Running tests

Run the suite with `node run-tests.mjs` (arguments pass through to `node --test`). It points
TEMP/TMP/TMPDIR at `.claude/.scratchpad/test-tmp/<run>/` and deletes that directory afterwards.
A test that builds a temporary project gives it its own root marker (`.git` or `package.json`).
`test-tmp/` is one of the scratchpad layout's four top-level folders, alongside `phase-<NN>/`,
`adhoc/`, and `proc/`.
