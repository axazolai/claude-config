#!/usr/bin/env node
// SessionStart hook (cross-platform).
// - Auto-mark of the root CLAUDE.md runs EVERY session (see the "timing bug" note further down
//   for why - it used to be gated on `firstTime` and that was wrong).
// Reliable side effects (do NOT depend on additionalContext, which can be dropped on fresh
// sessions):
//   - unmarked root CLAUDE.md -> auto-mark as curated (every session, idempotent - opt out:
//     CLAUDE_CURATED_AUTOMARK_ROOT=0)
// Hint (additionalContext, best-effort, re-checked EACH session until the MCP is wired):
//   - a GitHub/GitLab remote or database usage, with no matching MCP wired -> suggest /init-mcp
//     (git/DB can appear later, so this is not one-time; opt out: CLAUDE_MCP_SUGGEST=0).
//     Never runs anything - just surfaces the command.
// Master switch: CLAUDE_CURATED_AUTOINIT=0 disables everything. Never blocks the session.
//
// CONVENTION for anyone adding a new step here (the timing bug this file already hit once -
// see below - and must not hit again): gating a file/settings MUTATION on `firstTime` is only
// safe when the thing you're checking is GUARANTEED to already exist by session 1. If what
// you're fixing is "some file/state that might not exist yet, might appear on session 5, 50,
// or never" - like a generated CLAUDE.md, a tool getting installed later, a config key someone
// adds by hand - `firstTime` will consume itself on session 1 (state[root] gets created
// unconditionally a few lines up) whether or not your condition was even checkable yet, and
// your step then NEVER RUNS AGAIN for that project. The fix is always the same shape: make the
// step re-check EVERY session and be naturally idempotent (it only WRITES when its own
// on-disk check says the fix isn't applied yet, so a no-op re-check costs one file read). See
// the root-CLAUDE.md auto-mark below for the pattern - it does not use `firstTime`, on purpose.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "./lib/spawn-hidden.mjs";
import { resolveDial } from "./lib/leanmode-rules.mjs";
import { resolveTddMode } from "./lib/tdd-mode.mjs";
import { updateJsonFile } from "./lib/atomic-json.mjs";
import { formatUpdateNotes } from "./lib/component-registry.mjs";
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");

const MARKER = "CURATED:NOEDIT";
// Whole-line match only (never a substring inside a longer line, so prose that just NAMES the
// marker can't self-trigger "already marked") - but lenient on whitespace: any line, any amount
// of spaces/tabs around the line and between the `<!--`/`-->` brackets and the marker text
// itself. Mirrors deny-curated-claude-md.mjs's own detection exactly - keep both in sync.
const MARKER_RE = /^<!--\s*CURATED:NOEDIT\s*-->$/;
const AUTOMARK = process.env.CLAUDE_CURATED_AUTOMARK_ROOT !== "0"; // default ON
const ENABLED  = process.env.CLAUDE_CURATED_AUTOINIT      !== "0"; // default ON

const safe = (fn) => { try { return fn(); } catch { return undefined; } };
const writeFile = (p, content) => { try { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); return true; } catch { return false; } };
// Strips a leading UTF-8 BOM before parsing - project-init.json can pick one up from an external tool (e.g. PowerShell's
// `Set-Content -Encoding utf8`) or a manual save; a raw JSON.parse throws on it, which the
// `safe()` wrapper silently swallows into `{}`, making every one-time gate in this file
// "forget" it ever ran. Cheap and always correct even when there's no BOM.
const readJSON = (p) => JSON.parse(readFileSync(p, "utf8").replace(/^﻿/, ""));
function emit(ctx) {
  try {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: ctx || "" }
    }));
  } catch { /* ignore */ }
  process.exit(0);
}

let d = {};
try { d = JSON.parse(safe(() => readFileSync(0, "utf8")) || "{}"); } catch { /* ignore */ }
if (!ENABLED) emit("");

const startDir = d.cwd || process.cwd();

function findRoot(start) {
  let cur = resolve(start);
  for (let i = 0; i < 40; i++) {
    for (const m of [".git", ".planning", "package.json", "pyproject.toml", "go.mod", "build.gradle.kts"])
      if (existsSync(join(cur, m))) return cur;
    const up = dirname(cur);
    if (up === cur) break;
    cur = up;
  }
  return resolve(start);
}
const root = findRoot(startDir);

// per-user state registry - keeps project trees clean; "unknown on THIS machine"
const stateFile = join(CLAUDE_DIR, "state", "project-init.json");
let state = existsSync(stateFile) ? (safe(() => readJSON(stateFile)) || {}) : {};
const firstTime = !state[root]; // do not early-exit: later steps re-check every session
if (!state[root]) state[root] = {}; // ensure the record exists so later independent one-time flags can attach

const isMarked = (p) => {
  const t = safe(() => readFileSync(p, "utf8"));
  return !!t && t.split(/\r?\n/).some((line) => MARKER_RE.test(line.trim()));
};

const actions = [], notes = [];

// 2) root CLAUDE.md: auto-mark
const rootClaude = join(root, "CLAUDE.md");
if (existsSync(rootClaude) && !isMarked(rootClaude)) {
  if (AUTOMARK) {
    const t = safe(() => readFileSync(rootClaude, "utf8"));
    if (t !== undefined && writeFile(rootClaude, `<!-- ${MARKER} -->\n` + t))
      actions.push("marked root CLAUDE.md as curated");
  } else {
    notes.push(`Unmarked CLAUDE.md at ${rootClaude}. If it's yours, add '<!-- ${MARKER} -->' as the first line.`);
  }
}

// 3) .claude/.gitignore carries the scratchpad, so the first temp file written into the project
// cannot reach a commit. Additive: an existing file keeps every line it already has.
const gitignore = join(root, ".claude", ".gitignore");
if (existsSync(join(root, ".git"))) {
  const cur = existsSync(gitignore) ? (safe(() => readFileSync(gitignore, "utf8")) ?? "") : "";
  if (!cur.split(/\r?\n/).some((l) => l.trim() === ".scratchpad/")) {
    const next = cur && !cur.endsWith("\n") ? cur + "\n.scratchpad/\n" : cur + ".scratchpad/\n";
    if (writeFile(gitignore, next)) actions.push("added .scratchpad/ to .claude/.gitignore");
  }
}

// ---- centralized component-update checker (registry-driven; supersedes the old KNOWN_TOOLS
// block). Detached + unref'd so it never blocks; the worker self-throttles per component (24h)
// and is best-effort. Notes are emitted from the state a PRIOR run wrote, below. The legacy
// CLAUDE_TOOL_AUTOUPGRADE[_<NAME>]=0 opt-out is still honored for the migrated tools
// (context-mode) INSIDE the worker via autoUpdateEnabled - a legacy-only opt-out still
// spawns the worker (cheap) but suppresses those upgrades there; the claude-config bundle check
// still runs, which is intended. Master off-switch: CLAUDE_COMPONENT_AUTOUPDATE=0. ----
if (process.env.CLAUDE_COMPONENT_AUTOUPDATE !== "0") {
  const worker = join(dirname(fileURLToPath(import.meta.url)), "lib", "component-update-check-run.mjs");
  if (existsSync(worker))
    safe(() => spawn(process.execPath, [worker, "--root", root], { detached: true, stdio: "ignore" }).unref());
}

// ---- stack-rules snapshot check ----
// Rules live in ~/.claude/rules-src/ (NOT auto-loaded) and reach the session as a compiled
// per-project snapshot .claude/stack-rules.md, @imported from .claude/CLAUDE.md. Existence-only
// check, no automatic staleness/drift detection (simplified 2026-07-13 - the prior sourceHash/
// stackFingerprint desync check via hooks/lib/stack-rules-check.mjs was too eager to fire a
// rebuild instruction every session; that lib is still used by the compiler subagent itself,
// just no longer imported here). When the snapshot is missing, point at /init-stack, which now
// owns generating it (rules-src/README.md § "Building stack-rules"). Once a snapshot exists it
// stays as-is until the next explicit /init-stack run or rebuild request. Opt out:
// CLAUDE_STACK_RULES=0.
if (process.env.CLAUDE_STACK_RULES !== "0") {
  const snapshotPath = join(root, ".claude", "stack-rules.md");
  if (!existsSync(snapshotPath)) {
    notes.push(`stack-rules: .claude/stack-rules.md does not exist for this project. Run ` +
      `/init-stack to generate it (it detects the stack and builds the snapshot as part of ` +
      `its own steps).`);
  }
}

// ---- proactive MCP suggestion (git host / database) -> /init-mcp ----
// A HINT only - never auto-runs anything. Surfaces /init-mcp when the repo shows a signal it helps
// with (a GitHub/GitLab remote, or database usage), unless that MCP is already wired. Re-checked
// EVERY session on purpose: git init / a DB dependency can appear later, and a one-time flag would
// miss it - instead it stops on its own once the matching MCP is configured. Web search is
// on-demand (no passive signal) - mentioned as an option. Opt out: CLAUDE_MCP_SUGGEST=0.
if (process.env.CLAUDE_MCP_SUGGEST !== "0" && existsSync(join(CLAUDE_DIR, "commands", "init-mcp.md"))) {
  const rd = (p) => safe(() => readFileSync(join(root, p), "utf8")) || "";
  const cfg = (rd(".claude/settings.json") + "\n" + rd(".mcp.json")).toLowerCase();  // already-wired MCPs
  const has = (k) => cfg.includes(`"${k}"`);
  const suggestions = [];

  const gitCfg = rd(".git/config").toLowerCase();
  const isGithub = /github\.com/.test(gitCfg), isGitlab = /gitlab/.test(gitCfg);
  if ((isGithub || isGitlab) && !has("github") && !has("gitlab"))
    suggestions.push(`the git remote is ${isGithub ? "GitHub" : "GitLab"} and no git-host MCP is configured`);

  const dbHay = (rd("package.json") + rd("pyproject.toml") + rd("requirements.txt") + rd(".env")
    + rd(".env.local") + rd("docker-compose.yml") + rd("docker-compose.yaml")).toLowerCase();
  if (/postgres|postgresql:\/\/|database_url|psycopg|asyncpg|sqlalchemy|"pg"|prisma|typeorm/.test(dbHay) && !has("postgres"))
    suggestions.push("the project touches a database (a local read-only Postgres MCP is available)");

  if (suggestions.length)
    notes.push(`MCP suggestion: ${suggestions.join("; ")}. Run /init-mcp to wire it (also offers a self-hosted SearXNG web-search MCP); it asks before changing anything and is re-runnable to switch/remove.`);
}

// ---- leanmode announcement convention reminder ----
// Not a mutation, not gated on firstTime - a standing behavioral instruction for the assistant
// itself, re-surfaced every session (additionalContext isn't guaranteed to survive across a
// long conversation - see the file header). Only worth showing when leanmode actually does
// something for this project (dial != "off"); a project with the dial off gets no reminder,
// same silence the SubagentStart hook itself already applies at "off".
// The banner a subagent launch prints (`agent_type(description) Model`) is drawn by the harness
// before any hook runs, so inject-axes.mjs's own SubagentStart-emitted systemMessage
// cannot appear on it or as a separate line - confirmed empirically (2026-07-11, debug-log
// instrumentation + three real subagent launches): the hook fires and emits correctly, but
// systemMessage from SubagentStart never renders anywhere. The only way to surface the level
// BEFORE that banner is the assistant announcing it as plain prose.
if (process.env.CLAUDE_LEANMODE !== "0" && resolveDial(root) !== "off") {
  notes.push("leanmode is active for this project - before dispatching any subagent via the " +
    "Agent tool, resolve its effective level (resolveEffectiveLevel(subagentType, root) from " +
    "~/.claude/hooks/lib/leanmode-rules.mjs) and fold '(leanmode=<level>)' into the line that " +
    "already narrates that dispatch; a standalone one-line announcement only when nothing " +
    "else narrates the launch. Skip entirely when the resolved level is off.");
}

notes.push(`Testing mode: ${resolveTddMode(root)} (.claude/ultrapowers.json; /ultrapowers-tdd enable|disable).`);

// ---- surface component updates the worker recorded on an earlier session (decoupled
// trigger/notify, same pattern as the bundle check). Best-effort; never blocks. ----
if (process.env.CLAUDE_COMPONENT_AUTOUPDATE !== "0") {
  const statePath = join(CLAUDE_DIR, "state", "component-updates.json");
  if (existsSync(statePath)) {
    const st = safe(() => JSON.parse(readFileSync(statePath, "utf8")));
    if (st) for (const line of formatUpdateNotes(st)) notes.push(`Component update: ${line}`);
  }
}

// ---- DeepSeek health monitor: keep it running while offload is in use (the statusline DS colour
// reads its cache). Best-effort; never blocks. ----
try { await (await import("./lib/deepseek-monitor-start.mjs")).startMonitorIfUsed({ root, claudeDir: CLAUDE_DIR }); } catch { /* never block the session */ }

// record/update state
if (firstTime) { state[root].initialized = new Date().toISOString(); state[root].actions = actions.slice(); state[root].notes = notes.slice(); }
// Merge THIS project's subtree onto the fresh on-disk copy under a lock, rather than writing the
// whole stale `state`. In-memory state[root] only ever gains keys during a run and each flag has
// a single owning writer, so spreading it over the fresh value keeps what another session added meanwhile.
updateJsonFile(stateFile, (st) => { st[root] = { ...(st[root] || {}), ...(state[root] || {}) }; });

emit([
  actions.length ? `Project auto-init (${root}): ${actions.join("; ")}.` : "",
  notes.join(" ")
].filter(Boolean).join(" "));
