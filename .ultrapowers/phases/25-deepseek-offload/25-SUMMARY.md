# Phase 25 — DeepSeek offload: summary

Offload mechanical work from Claude Code to the corporate DeepSeek V4.1 Flash model behind a
per-project `/deep-model-effort` dial, with a mode-B full takeover (Claude Code running on DeepSeek
via a local Anthropic→OpenAI translator) for when Claude's own limits are spent.

Branch `phase-25-deepseek-offload`, inline execution (test-after), 10 tasks + a final-review fix
pass. Full suite green: **658/658**. Spec: `25-SPEC.md`. Plan: `25-PLAN.md`.

## What shipped

| Area | Files |
|---|---|
| Level + retry-budget library | `payload/hooks/lib/deepseek-mode.mjs` (`resolveLevel`, `setLevel`, `retryBudget`, `LEVELS`) |
| Command | `payload/bin/deep-model-effort.mjs`, `payload/commands/deep-model-effort.md` |
| Install wiring | `variants.json` (managed `deepseek` MCP server in all profiles; `deepseekDefaults`), `setup.mjs` (`{{CLAUDE_DIR}}` substitution + per-profile default write) |
| Mode-A MCP tools | `payload/mcp-servers/deepseek/server.mjs` (dependency-free stdio JSON-RPC), `lib/tools.mjs`, `lib/gateway.mjs`, `lib/validate.mjs`, `lib/limit.mjs` |
| Health monitor | `payload/bin/deepseek-health.mjs` (+ reuses `payload/hooks/cisco-proxy-advisor.mjs`) |
| Statusline segment | `payload/hooks/lib/deepseek-segment.mjs`, wired into `payload/hooks/statusline.mjs` |
| Mode-B | `payload/mcp-servers/deepseek/translator.mjs`, `payload/bin/claude-deepseek.ps1` |
| Rules | `payload/claude-md/16-deepseek.md` |

## Levels and retry budget (as built)

`off / light / medium / heavy / full`. Default per installed profile: lite→light, base→medium,
full→heavy (user-scope `deepseek-defaults.json`, overridden per project by `.claude/deepseek.json`).
Extra rework attempts by level×task-weight (light/medium/heavy): light `1/1/0`, medium `3/2/1`,
heavy `5/3/2`; off/full `0`. Claude spends the budget; the tool does only mechanical validation.

## Measured facts that shaped it

1M context confirmed (clean to 1,027,688 tokens; 1,048k → ContextWindowExceeded). Working input cap
100k/call. Prefix cache works (×6.7). Thinking off → clean output; on → reasoning before `</think>`.
Only `/v1/chat/completions` works; `/anthropic/*` passthrough targets the real Anthropic API (noted
for a separate Cisco-bypass spike, out of scope here).

## Key rulings (full list in the ledger)

- MCP arg uses `{{CLAUDE_DIR}}` substituted to the absolute config dir (node spawned without a shell, so `~` would not expand).
- Command uses an async guarded dynamic import of the monitor (ESM; plan sample used CommonJS `require`).
- `server.mjs` implements MCP stdio JSON-RPC directly (no SDK, no npm deps allowed).
- Health monitor cadence is driven by session idle time (machine-global; cannot enumerate per-project levels).
- Mode-B launcher is **standalone**, not composed with `claude-tunnel.ps1`: mode B needs Cisco **up** (the gateway is corp-internal), the opposite of the Anthropic bypass. Spec §4.2 updated.
- Rules fragment numbered `16-deepseek.md` (next free; plan guessed 26).

## Final review (fresh reviewer, Opus) → one fix pass

- **Critical:** `deepseek-health.mjs` imported the untracked `cisco-proxy-advisor.mjs` → committed it (+test); the branch now builds from its own commits.
- **Important:** streaming translator stranded the answer in a thinking block when the model emitted no `</think>` → new `createThinkSplitter` buffers reasoning until the tag and flushes as text on end, matching the non-stream path.
- **Important:** added spec §6 concurrency limiter (≤3, refuse after 30 s) + per-tool timeouts (ask 60 s, writers 120 s).
- Deferred minors: `text.trim()||raw` can surface raw `<think>` content if the post-tag answer is empty; `checkOnce` inlines two classify branches; STOP map omits `content_filter`/`function_call`.

## Not done / out of scope

Request router (claude-code-router) — a later phase. Contacting gateway owners / the drafted letter
— the user's call. The `/anthropic` passthrough Cisco-bypass spike. Embeddings/rerank/audio/images
(model does not serve them). Risks `RISK-DSOFFLOAD-001..003` registered (001 Accepted).
