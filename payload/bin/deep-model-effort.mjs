#!/usr/bin/env node
// Usage: node deep-model-effort.mjs [off|light|medium|heavy|full] [--root <dir>]
// No argument prints the current offload level of the project containing the working directory.
import { realpathSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findRoot } from "../hooks/lib/leanmode-rules.mjs";
import { resolveLevel, setLevel } from "../hooks/lib/deepseek-mode.mjs";

const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");

export async function main(argv = process.argv.slice(2), cwd = process.cwd()) {
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
  if (r.level !== "off" && (await ensureMonitorSafe(CLAUDE_DIR))) note = "; monitor started";
  if (r.level === "full") note += "; mode B needs a relaunch: run bin/claude-deepseek.ps1";
  console.log(`DeepSeek offload: ${r.level} (${r.file})${note}`);
  return 0;
}

// Best-effort: the health monitor (bin/deepseek-health.mjs) may not be present yet, and starting it
// must never break setting the level. A missing module or a throwing ensureMonitor both yield false.
async function ensureMonitorSafe(claudeDir) {
  try {
    const mod = await import("./deepseek-health.mjs");
    return typeof mod.ensureMonitor === "function" ? Boolean(mod.ensureMonitor(claudeDir)) : false;
  } catch { return false; }
}

function isMain() {
  const a = process.argv[1]; if (!a) return false;
  if (import.meta.url === pathToFileURL(a).href) return true;
  try { return import.meta.url === pathToFileURL(realpathSync(a)).href; } catch { return false; }
}
if (isMain()) main().then((code) => { process.exitCode = code; });
