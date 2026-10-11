#!/usr/bin/env node
// PreToolUse advisory (matcher: Read|Bash). When the project's DeepSeek level is light/medium/heavy
// and the gateway is green, points at `local_summarize` before a whole-file Read of a long file or
// a Bash command that typically prints a lot. Once per session per kind. Never blocks and never
// sets permissionDecision. Fail-open.
import { readFileSync, writeFileSync, mkdirSync, statSync, readdirSync, rmSync, realpathSync } from "node:fs";
import { join, extname } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import { findRoot } from "./lib/leanmode-rules.mjs";
import { resolveLevel } from "./lib/deepseek-mode.mjs";

const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
const MIN_LINES = 300;
const MAX_SCAN = 2 * 1024 * 1024;
const SKIP_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf", ".ipynb", ".svg", ".ico", ".zip", ".woff", ".woff2"]);
const LONG_OUTPUT = /\bgit\s+(log|diff|show)\b|\b(npm|pnpm|yarn)\s+(run\s+)?(test|build)\b|\bnode\s+(--test|run-tests)|\bpytest\b|\bcargo\s+(test|build)\b|\bgo\s+(test|build)\b|\bdotnet\s+(test|build)\b|\b(mvn|gradle)\b/;
const BOUNDED = /\|\s*(head|tail|wc|grep|rg|sort\s+\|\s*uniq)\b|>\s*\S|--(stat|shortstat|name-only|name-status|oneline)\b|\s-n\s*\d|\s-\d+\b/;

export function readNudge(input) {
  const p = input.file_path;
  if (!p || input.offset !== undefined || input.limit !== undefined || SKIP_EXT.has(extname(p).toLowerCase())) return null;
  let st; try { st = statSync(p); } catch { return null; }
  if (!st.isFile()) return null;
  let lines = Infinity;
  if (st.size <= MAX_SCAN) { try { lines = readFileSync(p, "utf8").split("\n").length; } catch { return null; } }
  return lines > MIN_LINES ? "read" : null;
}

export function bashNudge(input) {
  const c = String(input.command || "");
  return LONG_OUTPUT.test(c) && !BOUNDED.test(c) ? "bash" : null;
}

const MESSAGES = {
  read: "deepseek-offload: this Read is a whole long file. To learn what it holds, `local_summarize` (path) costs no context here; " +
    "for counts, filters or aggregates use context-mode `ctx_execute_file` instead — one tool per question. " +
    "Ignore this when you are about to Edit the file.",
  bash: "deepseek-offload: this command usually prints a lot. Write its output to a file and call `local_summarize` on the file " +
    "(or context-mode `ctx_execute` when you need counts or filters) instead of reading the raw output. " +
    "Ignore this when the output is short.",
};

function greenGateway() {
  try { return JSON.parse(readFileSync(join(CLAUDE_DIR, "state", "deepseek-health.json"), "utf8").replace(/^﻿/, "")).status === "green"; }
  catch { return false; }
}

// Returns true the first time a (session, kind) pair is seen.
function firstTime(sessionId, kind) {
  const dir = join(CLAUDE_DIR, "state", "deepseek-nudge");
  const file = join(dir, `${String(sessionId || "nosession").replace(/[^\w-]/g, "_")}.json`);
  let seen = {}; try { seen = JSON.parse(readFileSync(file, "utf8")); } catch { /* new session */ }
  if (seen[kind]) return false;
  seen[kind] = true;
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(seen));
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (Date.now() - statSync(p).mtimeMs > 3 * 86400000) rmSync(p, { force: true });
    }
  } catch { /* best effort */ }
  return true;
}

function main() {
  let d = {};
  try { d = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { return; }
  const input = d.tool_input || {};
  const kind = d.tool_name === "Read" ? readNudge(input) : d.tool_name === "Bash" ? bashNudge(input) : null;
  if (!kind) return;
  const level = resolveLevel(findRoot(d.cwd || process.cwd()), CLAUDE_DIR);
  if (level === "off" || level === "full" || !greenGateway() || !firstTime(d.session_id, kind)) return;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: MESSAGES[kind] } }));
}

function isMainModule() {
  const a = process.argv[1];
  if (!a) return false;
  if (import.meta.url === pathToFileURL(a).href) return true;
  try { return import.meta.url === pathToFileURL(realpathSync(a)).href; } catch { return false; }
}

if (isMainModule()) {
  try { main(); } catch { /* fail-open */ }
  process.exit(0);
}
