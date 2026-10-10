#!/usr/bin/env node
// Machine-global DeepSeek health monitor. Writes a cache the statusline reads; never generates.
// Pure decision functions (pickInterval/shouldExit/classify) are unit-tested; the daemon loop and
// ensureMonitor are integration glue. The monitor cannot enumerate every project's level, so its
// poll cadence is driven by session idle time (the per-project `off` still disables the tools).
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { detectCisco } from "../hooks/cisco-proxy-advisor.mjs";
import { dsConfig } from "../mcp-servers/deepseek/lib/config.mjs";

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

const statePath = (claudeDir) => join(claudeDir, "state", "deepseek-health.json");
const pidPath = (claudeDir) => join(claudeDir, "state", "deepseek-health.pid");
const stopPath = (claudeDir) => join(claudeDir, "state", "deepseek-health.stop");

// Milliseconds since the most recent Claude session transcript was written, across all projects.
export function newestActivityMs(claudeDir, now = Date.now()) {
  const root = join(claudeDir, "projects");
  let newest = 0;
  try {
    for (const proj of readdirSync(root)) {
      const dir = join(root, proj);
      try {
        for (const f of readdirSync(dir)) {
          if (!f.endsWith(".jsonl")) continue;
          const m = statSync(join(dir, f)).mtimeMs;
          if (m > newest) newest = m;
        }
      } catch { /* skip unreadable project dir */ }
    }
  } catch { return Infinity; }
  return newest === 0 ? Infinity : Math.max(0, now - newest);
}

export async function checkOnce({ claudeDir, fetchImpl = fetch, now = Date.now(), detect = detectCisco, backend = dsConfig().backend, level = "medium" }) {
  const haveKey = Boolean(dsConfig().key);
  const cisco = detect();
  let status;
  if (!haveKey) status = "grey";
  else if (!cisco.up) status = "blue";
  else {
    let reachable = false;
    try { reachable = (await fetchImpl(`${backend}/v1/models`, { signal: AbortSignal.timeout(6000) })).status === 200; }
    catch { reachable = false; }
    status = classify({ ciscoUp: true, reachable, haveKey: true });
  }
  const cache = { status, checkedAt: new Date(now).toISOString(), level };
  try { mkdirSync(join(claudeDir, "state"), { recursive: true }); writeFileSync(statePath(claudeDir), JSON.stringify(cache, null, 2) + "\n"); } catch { /* best effort */ }
  return cache;
}

function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }

// Starts the detached daemon if its pidfile is not live. Returns whether a monitor is now running.
export function ensureMonitor(claudeDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude")) {
  if (process.env.DS_NO_MONITOR === "1") return false;
  try {
    const pf = pidPath(claudeDir);
    if (existsSync(pf)) { const pid = Number(readFileSync(pf, "utf8").trim()); if (pid && alive(pid)) return true; }
    const self = fileURLToPath(import.meta.url);
    const child = spawn(process.execPath, [self, "--daemon", "--claude-dir", claudeDir], { detached: true, stdio: "ignore" });
    child.unref();
    mkdirSync(join(claudeDir, "state"), { recursive: true });
    writeFileSync(pf, String(child.pid));
    return true;
  } catch { return false; }
}

async function daemon(claudeDir) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try { mkdirSync(join(claudeDir, "state"), { recursive: true }); writeFileSync(pidPath(claudeDir), String(process.pid)); } catch { /* ignore */ }
  for (;;) {
    if (existsSync(stopPath(claudeDir))) break;
    const idleMs = newestActivityMs(claudeDir);
    if (shouldExit({ idleMs })) break;
    // While the monitor runs, offload is in use (it was started by a non-off command); use a
    // non-off level so an active session polls on the 10-minute cadence.
    await checkOnce({ claudeDir, level: "medium" });
    await sleep(pickInterval({ level: "medium", idleMs }));
  }
}

function isMain() {
  const a = process.argv[1]; if (!a) return false;
  const self = fileURLToPath(import.meta.url);
  try { return a === self || realpathSync(a) === self; } catch { return a === self; }
}
if (isMain() && process.argv.includes("--daemon")) {
  const i = process.argv.indexOf("--claude-dir");
  const dir = i !== -1 ? process.argv[i + 1] : (process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"));
  daemon(dir);
}
