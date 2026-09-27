#!/usr/bin/env node
// PreToolUse gate (matcher: Bash|PowerShell). Denies a background call whose command does
// nothing but wait (sleep/Start-Sleep/timeout, optionally chained with && echo / ; echo) —
// dispatched subagents and background tasks re-invoke the model with a completion
// notification, so a background wait-only wrapper is pure waste. Fail-open: any error or
// unparsable stdin => exit 0, no output.
import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

const WAIT_ONLY = /^\s*(sleep\s+\d+[smhd]?|start-sleep\b[^;&|]*|timeout(\s+\/t)?\s+\d+)(\s*(&&|;)\s*echo\b[^;&|]*)?\s*$/i;
export function decide(toolInput) {
  if (!toolInput || toolInput.run_in_background !== true) return null;
  return WAIT_ONLY.test(String(toolInput.command || "")) ? "background-sleep-guard: a background wait does no work: dispatched subagents and background tasks re-invoke you with a completion notification. End the turn instead." : null;
}

function main() {
  let d;
  try { d = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { return; }
  const reason = decide(d.tool_input);
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
