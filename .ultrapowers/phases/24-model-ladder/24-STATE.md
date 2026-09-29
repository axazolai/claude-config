---
phase: "24"
status: running
action: "final review, then deploy question"
tasks_done: 5
tasks_total: 6
branch: phase-24-model-ladder
delivery: branch
depends_on: []
updated: 2026-09-29
---

# Phase 24 — model-ladder — state

Implemented inline (Native) on `phase-24-model-ladder`, cut from `master` at `5c9d11f`. Tasks 1-5
done: migrator targets `claude-sonnet-5-5`; `effortLevel` default `medium`; policy text and both
skills carry the five-rung ladder; five `rung-*` agents with a table-vs-agents test; a
`SubagentStop` usage hook. Task 6 (registers, roadmap, per-rung report, full verification) is in
progress. Not deployed, not merged, not pushed. Deploy needs the user's yes (it rewrites
`~/.claude`); the post-deploy check of spec open item 4 (`agent_type` equals the rung agent name)
runs after it.
