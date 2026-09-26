#!/usr/bin/env node
// PreToolUse gate (matcher: ^mcp__scrapling__.*). main_content_only other than true switches off Scrapling's
// hidden-content sanitizer, its defense against prompt injection in scraped pages.
// Override: CLAUDE_SCRAPLING_ALLOW_RAW=1. Fail-open on unreadable input.
import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function decide(toolName, toolInput, env) {
  if (!/^mcp__scrapling__/.test(toolName || "")) return null;
  // The server may coerce "false", 0 or "no" to false, so only true and absence pass.
  if (!toolInput || !("main_content_only" in toolInput) || toolInput.main_content_only === true) return null;
  if (env.CLAUDE_SCRAPLING_ALLOW_RAW === "1") return null;
  return "scrapling-raw-gate: main_content_only=false turns off Scrapling's hidden-content " +
    "sanitizer (prompt-injection defense). Keep it true and narrow the page with css_selector.";
}

function main() {
  let d;
  try { d = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { return; }
  const reason = decide(d.tool_name, d.tool_input, process.env);
  if (!reason) return;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: {
    hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } }));
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
