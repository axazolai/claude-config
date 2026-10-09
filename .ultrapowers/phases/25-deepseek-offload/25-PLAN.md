# DeepSeek offload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use ultrapowers:subagent-driven-development (recommended) or ultrapowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Claude Code offload mechanical work to the corporate DeepSeek V4.1 Flash model behind a per-project dial (`/deep-model-effort`), with a full-takeover mode for when Claude's limits are spent, installed through this repo's `payload/` + `variants.json`.

**Architecture:** Mode A is an MCP server whose `local_*` tools call the gateway's `/v1/chat/completions`; the dial level (per project, with a per-profile default) decides which tools are offered and the retry budget Claude spends. Mode B relaunches Claude Code with `ANTHROPIC_BASE_URL` pointed at a local Anthropic→OpenAI translator. A machine-global health monitor writes a cache the statusline reads to paint a `DS <level>` segment.

**Tech Stack:** Node.js (ESM `.mjs`, `node:test`), the gateway LiteLLM API (OpenAI-compatible), PowerShell for the Windows mode-B launcher. No new npm dependencies.

**Spec:** `.ultrapowers/phases/25-deepseek-offload/25-SPEC.md`

## Global Constraints

- Source lives in `payload/`; never edit `~/.claude/`. Deploy with `node setup.mjs`. (project CLAUDE.md)
- Gateway `http://10.81.0.13:4002`, model `local/DeepSeek-V4.1-Flash`, only `/v1/chat/completions`. Backend `http://10.81.0.13:8051`.
- `LLM_KEY` is read from the environment only; it is never written to any bundle file, log, or argv.
- Working input cap: **100,000 tokens per call**. The 1M window is the model's maximum, not sent per call.
- Mode A sends `chat_template_kwargs:{thinking:false}`; mode B sends `{thinking:true}` and splits reasoning at the last `</think>`.
- Concurrency to the shared backend: ≤2–3 at once; the statusline never makes a network call.
- Levels: `off`, `light`, `medium`, `heavy`, `full`. Retry budget (extra attempts) by level×task-weight: light `1/1/0`, medium `3/2/1`, heavy `5/3/2`; off/full `0`.
- Per-profile default level: `lite`→`light`, `base`→`medium`, `full`→`heavy`.
- Tests run with `node run-tests.mjs`. Test files are `*.test.mjs` beside their source. Testing mode: test-after.
- ASCII-only in source and config output; JSON written with `JSON.stringify(obj, null, 2) + "\n"`; strip a leading BOM on read (`.replace(/^﻿/, "")`).

## Review Focus

- `.claude/deepseek.json` present but malformed JSON → `resolveLevel` must fall back, never throw (owner of code: Task 1).
- An unknown level string in the project or profile file → treated as absent, resolve continues to the next source (Task 1).
- Health cache missing or older than its interval → segment is grey, not stale-green; a never-written cache is grey, not a crash (Task 7).
- Gateway returns 500/400 or the socket drops mid-call → a tool returns `{ok:false,reason}`, it never throws into the MCP runtime (Task 4/5).
- Translator given an assistant turn that carries both text and `tool_use`, and a `tool_result` that is an error → both convert to the OpenAI shape the gateway accepts without dropping the tool link (Task 8).

---

## Task 1: Config + budget library (`deepseek-mode.mjs`) and risk registration

**Files:**
- Create: `payload/hooks/lib/deepseek-mode.mjs`
- Create: `payload/hooks/lib/deepseek-mode.test.mjs`
- Modify: `.ultrapowers/RISK_REGISTER.md` (register RISK-DSOFFLOAD-001..003 from spec §10)

**Interfaces:**
- Produces:
  - `LEVELS = ["off","light","medium","heavy","full"]` (array of string)
  - `resolveLevel(root: string, claudeDir: string) -> string` — project `.claude/deepseek.json` `.level`, else user-scope `<claudeDir>/deepseek-defaults.json` `.level`, else `"off"`; an unknown/invalid value at a source is skipped, not returned.
  - `setLevel(root: string, level: string) -> {level, file}` — writes `<root>/.claude/deepseek.json`; throws on an invalid level or malformed existing file (nothing written).
  - `retryBudget(level: string, weight: "light"|"medium"|"heavy") -> number` — extra attempts; `0` for off/full/unknown.

- [ ] **Step 1: Implement** `payload/hooks/lib/deepseek-mode.mjs`

```javascript
// The project's DeepSeek offload level and the retry budget derived from it.
// /deep-model-effort writes the level; the MCP tools, the health monitor and the statusline read it.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export const LEVELS = ["off", "light", "medium", "heavy", "full"];

// Extra attempts (reworks beyond the first try), by [level][task weight]. off/full are not
// governed by the matrix, so they yield 0.
const BUDGET = {
  light:  { light: 1, medium: 1, heavy: 0 },
  medium: { light: 3, medium: 2, heavy: 1 },
  heavy:  { light: 5, medium: 3, heavy: 2 },
};

const readJSON = (p) => JSON.parse(readFileSync(p, "utf8").replace(/^﻿/, ""));
const writeJSON = (p, obj) => writeFileSync(p, JSON.stringify(obj, null, 2) + "\n");
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const validLevel = (v) => (LEVELS.includes(v) ? v : null);

function levelFrom(path) {
  try { return validLevel(readJSON(path).level); } catch { return null; }
}

export function resolveLevel(root, claudeDir) {
  return levelFrom(join(root, ".claude", "deepseek.json"))
    || levelFrom(join(claudeDir, "deepseek-defaults.json"))
    || "off";
}

export function setLevel(root, level) {
  if (!LEVELS.includes(level)) throw new Error(`invalid level "${level}"; expected one of ${LEVELS.join(", ")}`);
  const file = join(root, ".claude", "deepseek.json");
  let cfg = {};
  if (existsSync(file)) {
    try { cfg = readJSON(file); } catch { throw new Error(`${file} is not valid JSON; nothing was changed`); }
    if (!isObject(cfg)) throw new Error(`${file} is not a JSON object; nothing was changed`);
  }
  cfg.level = level;
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeJSON(file, cfg);
  return { level, file };
}

export function retryBudget(level, weight) {
  return BUDGET[level]?.[weight] ?? 0;
}
```

- [ ] **Step 2: Reconcile** — if `resolveLevel`'s source precedence or the budget numbers changed while implementing, update spec §3/§4.3 and this task before writing tests. Register the three risks now: open `.ultrapowers/RISK_REGISTER.md`, add `RISK-DSOFFLOAD-001`, `-002`, `-003` to the `### Active` contents list and a detail section each (copy Status/Context/Mitigation from spec §10, matching the file's existing `### RISK-… ` section shape). Fix any open bug-log entries for this task.

- [ ] **Step 3: Write the acceptance tests** — `payload/hooks/lib/deepseek-mode.test.mjs`, one per Acceptance line, then the mutation check.

**Acceptance:**
- `resolveLevel` with a project file `{level:"heavy"}` returns `"heavy"`. `@important`
- `resolveLevel` with no project file but a defaults file `{level:"medium"}` returns `"medium"`. `@important`
- `resolveLevel` with neither file returns `"off"`.
- `resolveLevel` with a project file of invalid JSON falls through to the defaults file, then `"off"`; never throws. `@important`
- `resolveLevel` with `{level:"bogus"}` skips that source (treats it as absent). `@important`
- `setLevel(root,"light")` writes `{level:"light"}` and returns it; `setLevel(root,"bogus")` throws and writes nothing. `@important`
- `setLevel` preserves other keys already in `.claude/deepseek.json`.
- `retryBudget` returns the full matrix: `("light","heavy")=0`, `("medium","light")=3`, `("heavy","heavy")=2`, `("off",*)=0`, `("full",*)=0`, `("medium","bogus")=0`. `@critical`

- [ ] **Step 4: Run them** — `node run-tests.mjs payload/hooks/lib/deepseek-mode.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** — `git add payload/hooks/lib/deepseek-mode.* .ultrapowers/RISK_REGISTER.md && git commit -m "feat(deepseek): offload level + retry-budget library; register risks"`

---

## Task 2: Command `/deep-model-effort`

**Files:**
- Create: `payload/bin/deep-model-effort.mjs`
- Create: `payload/bin/deep-model-effort.test.mjs`
- Create: `payload/commands/deep-model-effort.md`

**Interfaces:**
- Consumes: `resolveLevel`, `setLevel`, `LEVELS` (Task 1); `findRoot` (`../hooks/lib/leanmode-rules.mjs`); `ensureMonitor` (Task 6 — until Task 6 lands, guard the call so a missing import does not break level-setting; see Step 1).
- Produces: `main(argv: string[], cwd: string) -> number` (exit code).

- [ ] **Step 1: Implement** `payload/bin/deep-model-effort.mjs` (mirror `ultrapowers-tdd.mjs`). No arg → print the resolved level. A level arg → `setLevel`, then, when the level is not `off`, best-effort start the monitor (`ensureMonitor`), swallowing its failure so the dial still succeeds.

```javascript
#!/usr/bin/env node
// Usage: node deep-model-effort.mjs [off|light|medium|heavy|full] [--root <dir>]
// No argument prints the current offload level of the project containing the working directory.
import { realpathSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { findRoot } from "../hooks/lib/leanmode-rules.mjs";
import { resolveLevel, setLevel, LEVELS } from "../hooks/lib/deepseek-mode.mjs";

const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");

export function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  const i = argv.indexOf("--root");
  const root = i !== -1 && argv[i + 1] ? resolve(argv[i + 1]) : findRoot(cwd);
  const cmd = argv.find((a, k) => !a.startsWith("--") && argv[k - 1] !== "--root");
  if (cmd === undefined) {
    console.log(`DeepSeek offload: ${resolveLevel(root, CLAUDE_DIR)} (${root})`);
    return 0;
  }
  let r;
  try { r = setLevel(root, cmd); }
  catch (e) { console.error(`deep-model-effort: ${e.message}`); return e.message.startsWith("invalid level") ? 2 : 1; }
  let note = "";
  if (r.level !== "off") {
    try { note = ensureMonitorSafe(CLAUDE_DIR) ? "; monitor started" : ""; }
    catch { /* dial still succeeded; monitor is best-effort */ }
  }
  if (r.level === "full") note += "; mode B needs a relaunch: run bin/claude-deepseek.ps1";
  console.log(`DeepSeek offload: ${r.level} (${r.file})${note}`);
  return 0;
}

// Isolated so a not-yet-present monitor module cannot break the command.
function ensureMonitorSafe(claudeDir) {
  try {
    const { ensureMonitor } = require("../bin/deepseek-health.mjs"); // CJS-safe dynamic require shim
    return ensureMonitor(claudeDir);
  } catch { return false; }
}

function isMain() {
  const a = process.argv[1]; if (!a) return false;
  const self = fileURLToPath(import.meta.url);
  if (resolve(a) === self) return true;
  try { return realpathSync(a) === self; } catch { return false; }
}
if (isMain()) process.exitCode = main();
```

Note for the implementer: this repo is ESM (`"type":"module"` context). Replace the `require(...)` shim with a dynamic `await import("./deepseek-health.mjs")` inside an async helper once Task 6 exists; at Task 2 time, keep `ensureMonitorSafe` returning `false` (monitor not yet built) so the command is testable alone.

- [ ] **Step 2: Reconcile** — write any interface change (e.g. the final monitor-start mechanism) into this task and Task 6.
- [ ] **Step 3: Write the acceptance tests** — `deep-model-effort.test.mjs`, then the mutation check.

**Acceptance:**
- `main([], root)` prints `DeepSeek offload: off (...)` for a project with no file; exit 0.
- `main(["medium"], root)` writes the level, prints it, exit 0.
- `main(["bogus"], root)` prints an error and returns 2; the config file is unchanged. `@important`
- `main(["full"], root)` includes the relaunch hint in its output. `@important`
- `--root <dir>` targets that directory rather than `cwd`.

- [ ] **Step 4: Run them** — `node run-tests.mjs payload/bin/deep-model-effort.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** — `git add payload/bin/deep-model-effort.* payload/commands/deep-model-effort.md && git commit -m "feat(deepseek): /deep-model-effort command"`

`payload/commands/deep-model-effort.md` body (create in Step 1):

```markdown
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
```

---

## Task 3: Install wiring — `variants.json` + `setup.mjs` per-profile default

**Files:**
- Modify: `variants.json` (add `managedMcpServers.deepseek`, a `deepseekDefaults` map, and `deepseek` to each profile's `mcpServers`)
- Modify: `setup.mjs` (write `~/.claude/deepseek-defaults.json` for the active profile)
- Modify: `variants.test.mjs` (assert the server lands in all three profiles; defaults map complete)

**Interfaces:**
- Consumes: the active profile name (`VARIANT` global in `setup.mjs`), `loadVariants(REPO_ROOT)`.
- Produces: user-scope file `~/.claude/deepseek-defaults.json` = `{ "level": <profile default> }`.

- [ ] **Step 1: Implement**

In `variants.json`, add under `managedMcpServers`:

```json
"deepseek": {
  "command": "node",
  "args": ["~/.claude/mcp-servers/deepseek/server.mjs"],
  "requires": "node",
  "missingEnvNote": "LLM_KEY not set - DeepSeek tools register but return unavailable until it is set"
}
```

Add a top-level map and its `$`-doc:

```json
"$deepseekDefaults": "Default offload level written to ~/.claude/deepseek-defaults.json per installed profile; the per-project .claude/deepseek.json overrides it. See phase 25.",
"deepseekDefaults": { "full": "heavy", "base": "medium", "lite": "light" },
```

Add `"deepseek"` to `mcpServers` in `full` and `base`, and set `lite`'s `mcpServers` to `["deepseek"]` (it is currently `[]`). Remove `commands/deep-model-effort.md`/`bin/deep-model-effort.mjs` from no exclude list (they ship everywhere).

In `setup.mjs`, after the session-defaults block (near line 1490), add a pass that writes the per-profile default:

```javascript
/* ---------- deepseek offload default (per profile) ---------- */
{
  const level = (loadVariants(REPO_ROOT).deepseekDefaults || {})[VARIANT];
  if (level) {
    const p = join(CLAUDE_DIR, "deepseek-defaults.json");
    const cur = readJsonOrNull(p);
    if (!cur || cur.level !== level) {
      if (write(p, JSON.stringify({ level }, null, 2) + "\n"))
        summary.push(`updated  ${p} (deepseek default: ${level})`);
    }
  }
}
```

(Use the same `CLAUDE_DIR`, `VARIANT`, `write`, `readJsonOrNull`, `summary`, `join` already in scope in `setup.mjs`'s main flow; confirm their names at the insertion point and match them.)

- [ ] **Step 2: Reconcile** — if the field names (`deepseekDefaults`, `deepseek-defaults.json`) changed, update Task 1's `resolveLevel` path and the spec §7.
- [ ] **Step 3: Write the acceptance tests** — extend `variants.test.mjs`.

**Acceptance:**
- `variants.json` parses; `managedMcpServers.deepseek` exists with `command:"node"`. `@important`
- Every profile (`full`,`base`,`lite`) lists `deepseek` in its resolved `mcpServers`. `@important`
- `deepseekDefaults` has a key for each profile and each value is in `LEVELS` minus `off`/`full`-level-name collisions (i.e. one of light/medium/heavy). `@important`
- The variant resolver places `mcp-servers/deepseek/**` files in all three profiles (not excluded anywhere). `@critical`

- [ ] **Step 4: Run them** — `node run-tests.mjs variants.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** — `git add variants.json setup.mjs variants.test.mjs && git commit -m "feat(deepseek): install in all profiles with per-profile default level"`

---

## Task 4: Gateway client + mechanical validation (`mcp-servers/deepseek/lib/`)

**Files:**
- Create: `payload/mcp-servers/deepseek/lib/gateway.mjs`
- Create: `payload/mcp-servers/deepseek/lib/validate.mjs`
- Create: `payload/mcp-servers/deepseek/lib/gateway.test.mjs`
- Create: `payload/mcp-servers/deepseek/lib/validate.test.mjs`

**Interfaces:**
- Produces:
  - `chat({messages, maxTokens, thinking=false, timeoutMs=120000, fetchImpl=fetch}) -> Promise<{ok:true, text, usage} | {ok:false, reason, status?}>` — posts to the gateway; `reason` one of `"unavailable"|"timeout"|"http"|"bad_output"`; never throws.
  - `CAP_TOKENS = 100000`
  - `splitThink(s: string) -> {reasoning, text}` — everything before the last `</think>` is reasoning.
  - `validate(text: string, {needs?: string[], json?: boolean}) -> {ok:boolean, reason?}` — mechanical only: empty/whitespace → `bad_output`; `json:true` and not JSON-parseable → `bad_output`; any `needs` substring absent → `bad_output`.

- [ ] **Step 1: Implement** `gateway.mjs`

```javascript
// Thin client for the corporate gateway's /v1/chat/completions. Key only from env LLM_KEY.
// Never throws: every failure becomes {ok:false, reason}.
const GW = process.env.DS_GATEWAY || "http://10.81.0.13:4002";
const MODEL = process.env.DS_MODEL || "local/DeepSeek-V4.1-Flash";
export const CAP_TOKENS = 100000;

export function splitThink(s) {
  const str = String(s ?? "");
  const i = str.lastIndexOf("</think>");
  return i === -1 ? { reasoning: "", text: str } : { reasoning: str.slice(0, i), text: str.slice(i + 8) };
}

export async function chat({ messages, maxTokens, thinking = false, timeoutMs = 120000, fetchImpl = fetch }) {
  const key = process.env.LLM_KEY;
  if (!key) return { ok: false, reason: "unavailable" };
  let r;
  try {
    r = await fetchImpl(`${GW}/v1/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, chat_template_kwargs: { thinking }, messages }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    return { ok: false, reason: e.name === "TimeoutError" ? "timeout" : "unavailable" };
  }
  if (r.status !== 200) return { ok: false, reason: "http", status: r.status };
  let j;
  try { j = await r.json(); } catch { return { ok: false, reason: "bad_output" }; }
  const raw = j.choices?.[0]?.message?.content ?? "";
  const { text } = splitThink(raw);
  return { ok: true, text: text.trim() || raw, usage: j.usage ?? {} };
}
```

`validate.mjs`:

```javascript
// Mechanical output checks only. Semantic "does this answer the question" is Claude's job.
export function validate(text, { needs = [], json = false } = {}) {
  const s = String(text ?? "");
  if (!s.trim()) return { ok: false, reason: "bad_output" };
  if (json) { try { JSON.parse(s); } catch { return { ok: false, reason: "bad_output" }; } }
  for (const n of needs) if (!s.includes(n)) return { ok: false, reason: "bad_output" };
  return { ok: true };
}
```

- [ ] **Step 2: Reconcile** — record any change to the `{ok,reason}` vocabulary into the spec §5/§6 and Task 5.
- [ ] **Step 3: Write the acceptance tests** — inject a fake `fetchImpl`; never hit the network.

**Acceptance:**
- `chat` with no `LLM_KEY` → `{ok:false, reason:"unavailable"}` (set/restore `process.env.LLM_KEY` in the test). `@important`
- `chat` whose fake fetch resolves 200 with a content body → `{ok:true, text, usage}`; `</think>` prefix stripped from `text`. `@critical`
- `chat` whose fake fetch resolves status 500 → `{ok:false, reason:"http", status:500}`; a fetch that throws `TimeoutError` → `{ok:false, reason:"timeout"}`; never throws. `@critical`
- `splitThink("a</think>b")` → `{reasoning:"a", text:"b"}`; no tag → all text. `@important`
- `validate("", {})` → bad_output; `validate("{}", {json:true})` ok; `validate("x", {json:true})` bad_output; `validate("has code", {needs:["code"]})` ok; missing need → bad_output. `@important`

- [ ] **Step 4: Run them** — `node run-tests.mjs payload/mcp-servers/deepseek/lib/gateway.test.mjs payload/mcp-servers/deepseek/lib/validate.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** — `git add payload/mcp-servers/deepseek/lib && git commit -m "feat(deepseek): gateway client and output validation"`

---

## Task 5: MCP server with the `local_*` tools

**Files:**
- Create: `payload/mcp-servers/deepseek/server.mjs`
- Create: `payload/mcp-servers/deepseek/lib/tools.mjs`
- Create: `payload/mcp-servers/deepseek/lib/tools.test.mjs`

**Interfaces:**
- Consumes: `chat`, `CAP_TOKENS` (Task 4), `validate` (Task 4), `readFileSync`.
- Produces:
  - `runSummarize({path, text, maxWords}, deps) -> {ok, text?} | {ok:false, reason}`
  - `runAsk({question, paths}, deps) -> {ok, text?} | {ok:false, reason}` — code dump FIRST, question LAST (prefix cache).
  - `runCommitMsg({diff}, deps) -> {ok, text?} | {ok:false, reason}`
  - `runDraft({spec}, deps) -> {ok, text?} | {ok:false, reason}`
  - `deps = {chat, readFile}` injected for tests. Each truncates input to `CAP_TOKENS`-safe size (char proxy: 4 chars/token → cap at `CAP_TOKENS*4` chars) and returns `{ok:false, reason:"too_large"}` only if a single mandatory unit already exceeds it.

- [ ] **Step 1: Implement** `lib/tools.mjs` — pure task builders that compose a prompt, call `deps.chat`, and `validate` the result. `server.mjs` is the MCP stdio wrapper that registers the four tools and routes to these. Use the MCP SDK already used by other servers in this repo if present; otherwise implement the JSON-RPC stdio loop directly (see `references/` for the pattern). Each tool passes `thinking:false`.

```javascript
// lib/tools.mjs — prompt builders + call + mechanical validation. No MCP wiring here.
import { readFileSync } from "node:fs";
import { chat, CAP_TOKENS } from "./gateway.mjs";
import { validate } from "./validate.mjs";

const MAX_CHARS = CAP_TOKENS * 4; // ~4 chars/token, keeps a single call under the cap
const clamp = (s) => (s.length > MAX_CHARS ? s.slice(0, MAX_CHARS) : s);
const defaults = { chat, readFile: (p) => readFileSync(p, "utf8") };

export async function runSummarize({ path, text, maxWords = 200 }, deps = defaults) {
  let body = text;
  if (!body && path) { try { body = deps.readFile(path); } catch { return { ok: false, reason: "unavailable" }; } }
  if (!body) return { ok: false, reason: "bad_output" };
  const prompt = `${clamp(body)}\n\nSummarize the above in at most ${maxWords} words. Output only the summary.`;
  const r = await deps.chat({ messages: [{ role: "user", content: prompt }], maxTokens: 1500, thinking: false });
  if (!r.ok) return r;
  const v = validate(r.text, {}); return v.ok ? { ok: true, text: r.text } : v;
}

export async function runAsk({ question, paths = [] }, deps = defaults) {
  let dump = "";
  for (const p of paths) { try { dump += `// ${p}\n${deps.readFile(p)}\n\n`; } catch { return { ok: false, reason: "unavailable" }; } }
  const prompt = `${clamp(dump)}\n\nQuestion: ${question}\nAnswer concisely using only the code above.`;
  const r = await deps.chat({ messages: [{ role: "user", content: prompt }], maxTokens: 1200, thinking: false });
  if (!r.ok) return r;
  const v = validate(r.text, {}); return v.ok ? { ok: true, text: r.text } : v;
}

export async function runCommitMsg({ diff }, deps = defaults) {
  if (!diff || !String(diff).trim()) return { ok: false, reason: "bad_output" };
  const prompt = `${clamp(String(diff))}\n\nWrite a Conventional Commits message for this diff. Output only the message.`;
  const r = await deps.chat({ messages: [{ role: "user", content: prompt }], maxTokens: 300, thinking: false });
  if (!r.ok) return r;
  const v = validate(r.text, {}); return v.ok ? { ok: true, text: r.text } : v;
}

export async function runDraft({ spec }, deps = defaults) {
  if (!spec || !String(spec).trim()) return { ok: false, reason: "bad_output" };
  const prompt = `Task spec:\n${clamp(String(spec))}\n\nWrite the code/tests this spec asks for. Output only code.`;
  const r = await deps.chat({ messages: [{ role: "user", content: prompt }], maxTokens: 2000, thinking: false });
  if (!r.ok) return r;
  const v = validate(r.text, {}); return v.ok ? { ok: true, text: r.text } : v;
}
```

- [ ] **Step 2: Reconcile** — if the MCP SDK choice or tool schemas changed, write it into the spec §4.1 and this task.
- [ ] **Step 3: Write the acceptance tests** — `tools.test.mjs` with an injected `deps` (`chat` stub + `readFile` stub); never hit the network or real files.

**Acceptance:**
- `runSummarize({text:"..."}, deps)` with a stub `chat` returning `{ok:true,text:"S"}` → `{ok:true,text:"S"}`; a stub returning `{ok:false,reason:"http"}` propagates it. `@important`
- `runSummarize({path})` where `deps.readFile` throws → `{ok:false,reason:"unavailable"}`, no throw. `@critical`
- `runAsk({question,paths})` builds a prompt with the file dump BEFORE the question (assert ordering via a `chat` spy capturing `messages[0].content`). `@important`
- `runCommitMsg({diff:""})` → `{ok:false,reason:"bad_output"}` without calling `chat`.
- Every tool, given a `chat` that returns empty text, surfaces `{ok:false,reason:"bad_output"}` (validation). `@important`

- [ ] **Step 4: Run them** — `node run-tests.mjs payload/mcp-servers/deepseek/lib/tools.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** — `git add payload/mcp-servers/deepseek && git commit -m "feat(deepseek): local_* MCP tools"`

---

## Task 6: Health monitor

**Files:**
- Create: `payload/bin/deepseek-health.mjs`
- Create: `payload/bin/deepseek-health.test.mjs`

**Interfaces:**
- Consumes: `detectCisco` (`../hooks/cisco-proxy-advisor.mjs`), `resolveLevel` (Task 1).
- Produces:
  - `pickInterval({level, idleMs}) -> 600000 | 1800000` — 10 min when level≠off and idleMs<1800000; else 30 min.
  - `shouldExit({idleMs}) -> boolean` — true when idleMs ≥ 7200000 (2 h).
  - `classify({ciscoUp, reachable}) -> "green"|"red"|"blue"|"grey"` — no cisco→blue; cisco up & reachable→green; cisco up & !reachable→red; unknown (no key)→grey.
  - `checkOnce({claudeDir, fetchImpl, now}) -> Promise<{status, checkedAt, level}>` — writes `<claudeDir>/state/deepseek-health.json`; returns it.
  - `ensureMonitor(claudeDir) -> boolean` — starts the detached daemon if its pidfile is not live; returns whether it is now running.

- [ ] **Step 1: Implement** — the pure decision functions first, then `checkOnce` (one `GET /v1/models`, metadata only), then the daemon loop and `ensureMonitor` (pidfile `<claudeDir>/state/deepseek-health.pid`, stop-file, self-exit via `shouldExit`). Idle is measured from the most recent session transcript mtime under `~/.claude/projects/`. Grey when `LLM_KEY` is unset.

```javascript
export const MIN10 = 600000, MIN30 = 1800000, HR2 = 7200000;
export function pickInterval({ level, idleMs }) {
  return (level !== "off" && idleMs < MIN30) ? MIN10 : MIN30;
}
export function shouldExit({ idleMs }) { return idleMs >= HR2; }
export function classify({ ciscoUp, reachable, haveKey = true }) {
  if (!haveKey) return "grey";
  if (!ciscoUp) return "blue";
  return reachable ? "green" : "red";
}
```

- [ ] **Step 2: Reconcile** — write the final pidfile/cache paths and the idle source into the spec §4.6 and Task 7 (which reads the same cache path).
- [ ] **Step 3: Write the acceptance tests** — the pure functions directly; `checkOnce` with an injected `fetchImpl` and a temp `claudeDir`.

**Acceptance:**
- `pickInterval({level:"medium", idleMs:0})` = 600000; `({level:"medium", idleMs:2000000})` = 1800000; `({level:"off", idleMs:0})` = 1800000. `@important`
- `shouldExit({idleMs: HR2})` true; `({idleMs: HR2-1})` false. `@important`
- `classify`: no-key→grey; `{ciscoUp:false}`→blue; `{ciscoUp:true, reachable:true}`→green; `{ciscoUp:true, reachable:false}`→red. `@critical`
- `checkOnce` with a fake fetch returning 200 writes a cache file whose `status` is `green` (cisco stubbed up); with a fetch that throws, `status` is `red`. `@important`

- [ ] **Step 4: Run them** — `node run-tests.mjs payload/bin/deepseek-health.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** — `git add payload/bin/deepseek-health.* && git commit -m "feat(deepseek): machine-global health monitor"`

---

## Task 7: Statusline segment

**Files:**
- Create: `payload/hooks/lib/deepseek-segment.mjs`
- Create: `payload/hooks/lib/deepseek-segment.test.mjs`
- Modify: `payload/hooks/statusline.mjs` (add a `ds` key to `render(...)` between `context` and `project`)
- Modify: `payload/hooks/statusline.test.mjs` (segment ordering)

**Interfaces:**
- Consumes: the cache at `<claudeDir>/state/deepseek-health.json` (Task 6), `resolveLevel` (Task 1).
- Produces: `dsSegment({root, claudeDir, now}) -> string` — `""` only when the subsystem is absent (no level resolvable AND no cache); otherwise `DS <level>` painted by cache status, grey if the cache is missing or older than its interval.

- [ ] **Step 1: Implement** `deepseek-segment.mjs` (pure; mirrors `phase-segment.mjs` colour style). Then in `statusline.mjs`, import `dsSegment`, and in `render(...)` insert `ds: safe(() => dsSegment({ root, claudeDir: CLAUDE_DIR }), "") || ""` into the array between `context` and `project`; update `render`'s destructuring and the joined order.

```javascript
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveLevel } from "./deepseek-mode.mjs";

const C = { green: "32", red: "31", blue: "34", grey: "90" };
const paint = (s, c) => `\x1b[${c}m${s}\x1b[0m`;
const safe = (fn, f = null) => { try { return fn(); } catch { return f; } };
const STALE_GRACE = 300000; // 5 min beyond the poll interval before a cache reads as grey

export function dsSegment({ root, claudeDir, now = Date.now() }) {
  const level = resolveLevel(root, claudeDir);
  const cache = safe(() => JSON.parse(readFileSync(join(claudeDir, "state", "deepseek-health.json"), "utf8").replace(/^﻿/, "")));
  if (level === "off" && !cache) return ""; // nothing installed/used yet
  const interval = level === "off" ? 1800000 : 600000;
  let colour = C.grey;
  if (cache && ["green", "red", "blue", "grey"].includes(cache.status)) {
    const age = now - Date.parse(cache.checkedAt || 0);
    colour = Number.isFinite(age) && age <= interval + STALE_GRACE ? C[cache.status] : C.grey;
  }
  return paint(`DS ${level}`, colour);
}
```

- [ ] **Step 2: Reconcile** — if the segment is shown at `off` (spec says yes), confirm the `level==="off" && !cache` early-return is the only hidden case; write any change into spec §4.5.
- [ ] **Step 3: Write the acceptance tests** — `deepseek-segment.test.mjs` with a temp `claudeDir`; and a statusline ordering assertion.

**Acceptance:**
- Fresh cache `{status:"green", checkedAt: now}` with level `medium` → contains `DS medium` and the green code `\x1b[32m`. `@important`
- Cache older than interval+grace → grey (`\x1b[90m`) regardless of stored status. `@critical`
- No cache + level `off` → `""`; no cache + level `light` → grey `DS light`. `@important`
- `{status:"blue"}` (cisco down) → blue; `{status:"red"}` → red.
- In `statusline.mjs`, `render` emits `ds` between `context` and `project` (assert join order). `@important`

- [ ] **Step 4: Run them** — `node run-tests.mjs payload/hooks/lib/deepseek-segment.test.mjs payload/hooks/statusline.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** — `git add payload/hooks/lib/deepseek-segment.* payload/hooks/statusline.* && git commit -m "feat(deepseek): statusline DS segment"`

---

## Task 8: Mode-B translator (productize the spike)

**Files:**
- Create: `payload/mcp-servers/deepseek/translator.mjs`
- Create: `payload/mcp-servers/deepseek/translator.test.mjs`

**Interfaces:**
- Produces:
  - `toOpenAI(req, {model, thinking}) -> {model, messages, max_tokens, stream, chat_template_kwargs, tools?, tool_choice?}` — pure.
  - `fromOpenAI(choice, {thinking, emitThinking}) -> {content: Block[], stop_reason}` — pure; splits `</think>`, maps `tool_calls` to `tool_use`.
  - a `startServer(port)` that serves `/v1/messages` (stream + non-stream) by calling the gateway.

- [ ] **Step 1: Implement** — lift `toOpenAI`/`fromOpenAI` out of the spike `translator.mjs` (`.claude/.scratchpad/adhoc/2026-10-09-deepseek-offload-spike/scripts/translator.mjs`) as pure, exported functions; keep the HTTP server thin around them. Reuse `splitThink` from `lib/gateway.mjs`. `STOP = {stop:"end_turn", length:"max_tokens", tool_calls:"tool_use"}`.

(The spike file is the reference implementation; the conversion logic there is proven to be accepted by the gateway. Port it verbatim into exported pure functions, then wrap.)

- [ ] **Step 2: Reconcile** — note any divergence from the spike (e.g. image handling) in the spec §4.2.
- [ ] **Step 3: Write the acceptance tests** — pure-function tests; no network.

**Acceptance:**
- `toOpenAI` maps a `system` string to a leading `{role:"system"}` message. `@important`
- An assistant turn with both text and a `tool_use` block → one OpenAI assistant message with `content` and a `tool_calls` entry whose `arguments` is the JSON-stringified input. `@critical`
- A user `tool_result` block (incl. `is_error:true`) → an OpenAI `{role:"tool", tool_call_id, content}` message, error prefixed. `@critical`
- `toOpenAI` sets `chat_template_kwargs.thinking` from the `thinking` arg; `tool_choice:{type:"any"}` → `"required"`. `@important`
- `fromOpenAI` on `"reason</think>answer"` with `emitThinking:false` → a single text block `"answer"`; a `tool_calls` choice → a `tool_use` block with parsed `input`; `finish_reason:"tool_calls"` → `stop_reason:"tool_use"`. `@critical`

- [ ] **Step 4: Run them** — `node run-tests.mjs payload/mcp-servers/deepseek/translator.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** — `git add payload/mcp-servers/deepseek/translator.* && git commit -m "feat(deepseek): mode-B Anthropic->OpenAI translator"`

---

## Task 9: Mode-B launcher (`claude-deepseek.ps1`)

**Files:**
- Create: `payload/bin/claude-deepseek.ps1`

**Interfaces:**
- Consumes: `translator.mjs` (Task 8), `claude-tunnel.ps1` (existing Cisco launcher).
- Produces: a launcher that (1) requires `$env:LLM_KEY`, (2) starts the translator on a local port if not already up, (3) sets `ANTHROPIC_BASE_URL=http://127.0.0.1:<port>`, `ANTHROPIC_AUTH_TOKEN=dummy`, `ANTHROPIC_MODEL`/`ANTHROPIC_DEFAULT_HAIKU_MODEL`, and (4) invokes Claude Code (through `claude-tunnel.ps1` when Cisco is up, so the proxy and translator come up together).

- [ ] **Step 1: Implement** — a `-CheckOnly` switch prints the plan without launching (matches `claude-tunnel.ps1`'s style). Fail fast with a clear message when `LLM_KEY` is unset.
- [ ] **Step 2: Reconcile** — write the chosen port and the claude-tunnel composition into the spec §4.2.
- [ ] **Step 3: Verify** (no unit harness for `.ps1` in this repo — this task's check is a manual dry run): `pwsh -File payload/bin/claude-deepseek.ps1 -CheckOnly` prints: key present/absent, translator up/not, the env it would set, and whether it would route via `claude-tunnel.ps1`. Record the output in the commit message.
- [ ] **Step 4: (n/a — covered by Step 3 dry run)**
- [ ] **Step 5: Commit** — `git add payload/bin/claude-deepseek.ps1 && git commit -m "feat(deepseek): mode-B launcher"`

---

## Task 10: Rules fragment + end-to-end install check

**Files:**
- Create: `payload/claude-md/26-deepseek.md` (a CLAUDE.md fragment; confirm the next free number and the assembly order in `payload/claude-md/`)
- Modify: `variants.json` only if the fragment needs a profile exclude (it should ship everywhere)

**Interfaces:**
- Consumes: everything above. This fragment is what Claude reads to know when to offload.

- [ ] **Step 1: Implement** — write the fragment: the level→task-type mapping (spec §3), task-weight classification, the retry/fallback contract (spec §5, pointing at `retryBudget`), when NOT to offload (spec §4.4), and that `full` is relaunch-only. Instructions, not justifications; English.
- [ ] **Step 2: Reconcile** — reconcile the fragment's wording against the final tool names and level semantics.
- [ ] **Step 3: Verify** — deploy to a scratch `CLAUDE_CONFIG_DIR` and assert the subsystem lands: `CLAUDE_CONFIG_DIR=<tmp> node setup.mjs --variant=base --skip-all` then check `<tmp>/mcp-servers/deepseek/server.mjs`, `<tmp>/bin/deep-model-effort.mjs`, `<tmp>/deepseek-defaults.json` (`{level:"medium"}`), and that `CLAUDE.md` contains the fragment. (This is the full-suite boundary — also run `node run-tests.mjs`.)
- [ ] **Step 4: Run** — `node run-tests.mjs` (whole suite). Expected: PASS.
- [ ] **Step 5: Commit** — `git add payload/claude-md/26-deepseek.md && git commit -m "feat(deepseek): offload rules fragment"`

---

## Self-review notes (author)

- Spec coverage: §3 dial→Tasks 1,2,10; §4.1 tools→4,5; §4.2 mode B→8,9; §4.3 command→2; §4.4 rules→10; §4.5 statusline→7; §4.6 monitor→6; §5 contract→1,5,10; §6 degradation→4,5; §7 install→3,10; §8 testing→each task's Acceptance; §10 risks→Task 1 Step 2.
- Out of scope held: no router, no owners' letter, no embeddings.
- Known soft spot to validate during execution: the ESM dynamic-import of the monitor from the command (Task 2) — resolve to `await import()` once Task 6 exists; until then `ensureMonitorSafe` returns false by design.
