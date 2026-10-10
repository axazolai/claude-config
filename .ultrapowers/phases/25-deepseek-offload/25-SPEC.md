# Phase 25 — DeepSeek offload

Offload mechanical, bulk work from Claude Code to the corporate DeepSeek V4.1 Flash model to
save Claude tokens, behind a per-project dial, with a full-takeover fallback for when Claude's
own limits are spent. Claude stays the brain (planning, architecture, debugging, final review);
DeepSeek takes reading, summarizing, commit messages, boilerplate.

## 1. Goal and intent

- A per-project effort dial `/deep-model-effort` with five levels. Below `full`, Claude keeps the
  session and calls DeepSeek through MCP tools for suitable tasks. At `full`, the whole interactive
  session runs on DeepSeek (for when Claude's limits are exhausted).
- Default level is set by the installed profile (lite→light, base→medium, full→heavy), not `off`.
  Offloading sends project code to a corporate server whose owners have not agreed to this use;
  the user accepts this with eyes open (RISK-DSOFFLOAD-001). A project overrides with its own
  `.claude/deepseek.json`, down to `off`.
- When DeepSeek is unavailable (VPN down, backend down), Claude works on its own with no stalls.
- Success: with a level set, Claude offloads the task types that are reliable on this model, checks
  the result, and Claude token spend drops measurably.

## 2. Measured constraints (evidence base)

From the recon in `.claude/.scratchpad/adhoc/2026-10-08-vpn-llm-gateway/` and
`2026-10-09-deepseek-offload-spike/`:

| Fact | Value |
|---|---|
| Gateway | LiteLLM 1.100.1 at the corporate gateway host (set at `node setup.mjs`, stored in `deepseek.config.json`), only via Cisco VPN; model `local/DeepSeek-V4.1-Flash` |
| Working protocol | `/v1/chat/completions` only (stream, tools, json_object, json_schema). `/v1/messages`, `/v1/responses` broken (400); no embeddings |
| Context window | **1M, confirmed**. Single-needle correct across the whole range; last clean success 1,027,688 tokens; a 1,048k request → 400 `ContextWindowExceededError`. Hard limit = declared `context_length` 1,048,576 |
| Prefill speed | ~7,800 tok/s (time ≈ input_tokens / 7,800) |
| Output speed | ~5–7 tok/s |
| Prefix cache | works, ×6.7 on a repeated prefix (RadixAttention); put stable dump first, question last |
| Thinking | `chat_template_kwargs:{thinking:false}` → clean output; `true` → reasoning in `content` before `</think>`; a separate reasoning field cannot be forced |
| Tool calling | valid tool calls and roundtrips, thinking on and off |
| Concurrency | 8 parallel fine; shared `max_running_requests=32` across all gateway users |
| Backend stability | SGLang/vLLM backend `:8051` crashed twice on 2026-10-09, recovered in hours. Shared and fragile |

Working **input** cap for this phase: **100,000 tokens** per call. Deliberately a small fraction of
the 1M window, not a model limit — it reserves headroom inside the window for reworks (the §3 retry
budget) and associated overhead, and keeps each call a safe fraction of load on a shared, fragile
server. The 1M window stands as the model's documented maximum, not as something sent per call.

## 3. The dial: levels and retry budget

Two orthogonal notions: the **level** (the dial, set by command, per project) and the **weight** of
an individual offloaded task (light / medium / heavy), which Claude assigns.

| Level | Mechanism | What is offloaded | Extra attempts (light / medium / heavy task) |
|---|---|---|---|
| `off` | — | nothing | — |
| `light` | A — MCP, thinking off | summaries, commit messages, "where/how is X" lookups | 1 / 1 / 0 |
| `medium` | A — MCP, thinking off | light + draft tests/boilerplate, Bash output compression | 3 / 2 / 1 |
| `heavy` | A — MCP, thinking off | medium + read-exploration, multi-file drafts | 5 / 3 / 2 |
| `full` | B — translator, thinking on | the whole interactive session (relaunch only) | not governed by the matrix |

"Extra attempts" are reworks beyond the first try. Total attempts = 1 + the number. E.g. a light
task at `heavy` gets up to 6 tries; a heavy task at `light` gets one (no rework).

## 4. Architecture and components

All of it installs through `payload/` + `variants.json`, the way the rest of this repo does.

### 4.1 Mode A — MCP server `deepseek` (`payload/mcp-servers/deepseek/`)

Tools (OpenAI-compatible calls to `/v1/chat/completions`):
- `local_summarize(path|text, max_words)` — files, logs, diffs, test output.
- `local_ask(question, paths[])` — code dump first (prefix cache), question last; returns the answer only.
- `local_commit_msg(diff)` — commit messages, PR descriptions.
- `local_draft(spec)` — boilerplate code and tests (`medium`+).

Each tool: thinking off; input cap 100k tokens; semaphore of 2–3 concurrent with a queue that
refuses after 30 s; per-task timeouts (§6); one retry with backoff on malformed output; a single
error shape `{ok:false, reason:"timeout|unavailable|bad_output", ...}`.

### 4.2 Mode B — translator + launcher

- **Translator** (`payload/mcp-servers/deepseek/translator.mjs`, productized from the spike): an
  Anthropic Messages API → OpenAI `chat/completions` proxy on `127.0.0.1`. Thinking on; splits the
  model's reasoning (text before the last `</think>`) from the answer and emits Anthropic
  `thinking` blocks. The raw gateway `/v1/messages` is broken, so this translator is required.
- **Launcher** (`payload/bin/claude-deepseek.ps1`): requires `LLM_KEY`, confirms the corp gateway is
  reachable (metadata GET), starts the translator if it is not already up (thinking on), sets
  `ANTHROPIC_BASE_URL` to it, and launches Claude Code. It is **standalone**, not composed with
  `claude-tunnel.ps1`: in mode B Claude Code only ever talks to `127.0.0.1`, and the translator
  reaches the gateway, which lives on the corp network — so mode B needs the Cisco VPN
  **up**, the opposite of the home-tunnel bypass (which exists to reach api.anthropic.com in normal
  mode). Windows-first. `-CheckOnly` prints the plan without launching.

### 4.3 Command `/deep-model-effort`

- `payload/commands/deep-model-effort.md` + `payload/bin/deep-model-effort.mjs` (the
  `ultrapowers-tdd` pattern). No argument prints the level; `off|light|medium|heavy|full` sets it.
- Level stored per project in `.claude/deepseek.json`. With no project file, the level falls back
  to the installed profile's default (user-scope: lite→light, base→medium, full→heavy).
- On any level ≠ `off`: check the monitor lock and start the monitor if it is not already running.
- `full` additionally prints the relaunch instruction (the dial cannot switch the running process).

### 4.4 Rules for Claude (`payload/skills/` or a CLAUDE.md fragment)

When to offload at each level, how to classify task weight, and the retry/fallback contract (§5).
When not to offload: refactors across files, architecture, non-obvious debugging, final review.

### 4.5 Statusline segment

- In `payload/hooks/statusline.mjs`, a new segment placed **between `context` and `project`**.
- Shows `DS <level>` **always** (including `off`, so the operator can see the model is alive).
- Colour from the health cache (never a live network call in the statusline):

| Colour | Meaning |
|---|---|
| 🟢 green | last check: model responds |
| 🔴 red | Cisco up, but model/backend did not answer |
| 🔵 blue | monitor works, Cisco VPN not up — model behind the tunnel, expectedly unreachable |
| ⚪ grey | monitor not working: no key, check could not run, no/stale cache |

### 4.6 Health monitor (`payload/bin/deepseek-health.mjs`)

- One per machine. PID/lock and cache in `~/.claude/state/` (`deepseek-health.pid`,
  `deepseek-health.json`).
- Polls gateway/backend health + Cisco state (reuses `detectCisco` from
  `cisco-proxy-advisor.mjs`); writes the cache. `GET /v1/models` only — metadata, no generation,
  no load.
- Interval: level ≠ off and active (<30 min since last session activity) → 10 min; level ≠ off and
  idle → 30 min; level `off` → 30 min always. Activity read from the session transcript mtime.
- Self-exit after **2 hours** with no active Claude session, plus a stop-file. This bounds the
  daemon so it cannot become an orphan (see RISK-DSOFFLOAD-002).

## 5. Retry / fallback contract

- The **tool** does mechanical validation: empty or truncated output, invalid JSON, requested
  paths/keys absent → returns `{ok:false, reason}`. It may do one cheap internal retry on malformed
  output.
- **Claude** judges whether the answer satisfies the request and spends the §3 budget by task
  weight, re-prompting DeepSeek (optionally with the critique) up to the budget.
- On budget exhaustion, or `{ok:false}` with no budget left, Claude does the task itself.

## 6. Degradation

| Situation | Behaviour |
|---|---|
| Backend unreachable | health fails or 2 timeouts in a row → "model off" for 10 min, Claude works alone, no retries |
| Bad output | empty/truncated/invalid JSON/missing paths → the §5 budget, then Claude takes over |
| Summary check | for critical spots Claude verifies 1–2 facts against the source |
| Concurrency | ≤2–3 at once, the rest queue, refuse after 30 s |
| Timeouts | `ask` 60 s; `summarize`/`commit` need headroom — large inputs are slow (≈ input/7,800 s prefill + output/6 s), so a summary of a big file can take minutes; size the cap down rather than the timeout up |
| Recovery | after the off-window, one `health` probe, then normal |

## 7. Install / variants

- `managedMcpServers.deepseek` in `variants.json`; added to **all three** profiles (`lite`, `base`,
  `full`). `requires` the `LLM_KEY` env var; absent → registered with a `missingEnvNote`, tools
  return `unavailable`.
- Default level per profile, user-scope so the per-project reader can fall back to it:
  `lite`→`light`, `base`→`medium`, `full`→`heavy`. Carried in `variants.json` per profile
  (alongside `sessionDefaults`) and written by `setup.mjs`.
- Gateway/backend/key are machine-local in `<CLAUDE_CONFIG_DIR>/deepseek.config.json` (entered at
  `node setup.mjs`), overridable by env (`DS_GATEWAY`/`DS_BACKEND`, `LLM_KEY`). Never in bundle
  files or the repo, so nothing internal is published; the key file gets `0600` on POSIX.
- The command, statusline segment, health monitor, translator and launcher deploy as ordinary
  `payload/` files; the statusline change ships in `statusline.mjs`.

## 8. Testing decisions (test-after)

Acceptance criteria — one behaviour per line, verified at the named seam:

- `/deep-model-effort <level>` writes the level to `.claude/deepseek.json` and prints it; an invalid
  arg changes nothing and exits non-zero. — seam: the command's `main()` return + the config file.
- Reading `off` with no file present returns `off`. — seam: config reader.
- The retry budget function maps (level, weight) → extra attempts per the §3 matrix. — seam: the
  pure budget function. `@important` (a table lookup with boundaries).
- The statusline segment renders the right colour for each health-cache state and is hidden only
  when the subsystem is absent (never hidden for `off`). — seam: the segment render function given a
  cache object. `@important`.
- The health monitor writes a cache with status and Cisco state; picks 10/30/30-min intervals by
  (level, activity); self-exits after 2 h idle. — seam: the monitor's decision functions (interval
  picker, exit predicate), not the daemon loop. `@important`.
- The translator converts a representative Anthropic request (system, tool defs, tool_result
  roundtrip, image) to the OpenAI shape the gateway accepts, and converts the response (incl.
  `</think>` split and tool_use) back. — seam: `toOpenAI`/`fromOpenAI` pure functions. `@critical`
  (a wrong conversion silently corrupts every mode-B turn).
- An MCP tool returns `{ok:false, reason}` on a non-200 / malformed answer and never throws. —
  seam: the tool's result contract against a stubbed gateway.
- `variants.test.mjs` asserts the new MCP server and files land in the right profiles and not in
  `lite`. — seam: the variant resolver.

Live-gateway behaviour (needle accuracy, tool trajectories, ceiling) is covered by the recon
probes, not the unit suite — no test calls the shared backend.

## 9. Out of scope

- Full request router (claude-code-router / LiteLLM routing of subagents) — a later phase, and only
  if mode-A tool calling proves out in daily use.
- Contacting the gateway owners / the drafted letter — the user's call, tracked separately.
- Non-text protocols (embeddings, rerank, audio, images) — the model does not serve them.
- Cross-platform mode-B launcher — Windows-first now, like the Cisco work.

## 10. Risks

Logged to `.ultrapowers/RISK_REGISTER.md`:
- **RISK-DSOFFLOAD-001** — offloading sends project code to a corporate server whose owners have
  not consented to this use, and the default level is non-`off` per profile, so offloading is on
  right after install. Accepted by the user with eyes open; a project opts out via
  `.claude/deepseek.json: off`. Status: Accepted.
- **RISK-DSOFFLOAD-002** — the health monitor is a long-lived daemon that can orphan. Mitigation:
  2 h idle self-exit + stop-file + single per-machine lock.
- **RISK-DSOFFLOAD-003** — the shared backend is fragile and unmetered at `:8051`. Mitigation: 100k
  input cap, ≤2–3 concurrency, degradation off-window, no load from the statusline.
