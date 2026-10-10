// The statusline DS segment. Reads only the health cache the monitor writes — never a network
// call (the statusline renders on every frame). Shown whenever the subsystem is in use, including
// at level off, so the operator can see the model is alive.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { resolveLevel } from "./deepseek-mode.mjs";

const C = { green: "32", red: "31", blue: "34", grey: "90", cyan: "36" };
const paint = (s, c) => `\x1b[${c}m${s}\x1b[0m`;
const safe = (fn, f = null) => { try { return fn(); } catch { return f; } };
const STALE_GRACE = 300000; // 5 min beyond the poll interval before a cache reads as grey

const SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const ACTIVE_MAX = 300000;  // an in-flight record older than this is a crashed server's leftover
const RESULT_SHOW = 15000;  // how long ✓/✗ stays after a call ends
const shortName = (tool) => String(tool).replace(/^local_/, "");

function alive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } }

// Calls in flight and the latest finished call across every running deepseek server.
function readActivity(claudeDir, now) {
  const dir = join(claudeDir, "state", "deepseek-activity");
  const active = []; let last = null;
  for (const f of safe(() => readdirSync(dir), [])) {
    const rec = safe(() => JSON.parse(readFileSync(join(dir, f), "utf8")));
    if (!rec || !alive(rec.pid)) continue;
    for (const a of Object.values(rec.active || {})) if (now - a.startedAt <= ACTIVE_MAX) active.push(a);
    if (rec.last && (!last || rec.last.endedAt > last.endedAt)) last = rec.last;
  }
  return { active, last };
}

function activitySegment(claudeDir, now) {
  const { active, last } = readActivity(claudeDir, now);
  if (active.length) {
    const oldest = Math.min(...active.map((a) => a.startedAt));
    const label = active.length > 1 ? `×${active.length}` : shortName(active[0].tool);
    const secs = Math.max(0, Math.floor((now - oldest) / 1000));
    return paint(`${SPIN[Math.floor(now / 200) % SPIN.length]} DS ${label} ${secs}s`, C.cyan);
  }
  if (last && now - last.endedAt <= RESULT_SHOW) {
    return last.ok ? paint(`✓ DS ${shortName(last.tool)}`, C.green) : paint(`✗ DS ${shortName(last.tool)}`, C.red);
  }
  return "";
}

export function dsSegment({ root, claudeDir, now = Date.now() }) {
  const busy = activitySegment(claudeDir, now);
  if (busy) return busy;
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
