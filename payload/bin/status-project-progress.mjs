#!/usr/bin/env node
// Usage: node status-project-progress.mjs [on|off]
// No argument prints the current state of the statusline progress segments.
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import { progressEnabled, setProgressEnabled } from "../hooks/lib/status-project-progress.mjs";

const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");

export function main(argv = process.argv.slice(2), claudeDir = CLAUDE_DIR) {
  const arg = argv[0];
  if (arg === undefined) { console.log(`status-project-progress: ${progressEnabled(claudeDir) ? "on" : "off"}`); return 0; }
  if (arg !== "on" && arg !== "off") { console.error(`status-project-progress: invalid argument "${arg}" (use on|off)`); return 2; }
  setProgressEnabled(claudeDir, arg === "on");
  console.log(`status-project-progress: ${arg}`);
  return 0;
}

function isMain() {
  const a = process.argv[1]; if (!a) return false;
  if (import.meta.url === pathToFileURL(a).href) return true;
  try { return import.meta.url === pathToFileURL(realpathSync(a)).href; } catch { return false; }
}
if (isMain()) process.exitCode = main();
