// The statusline DS segment. Reads only the health cache the monitor writes — never a network
// call (the statusline renders on every frame). Shown whenever the subsystem is in use, including
// at level off, so the operator can see the model is alive.
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
