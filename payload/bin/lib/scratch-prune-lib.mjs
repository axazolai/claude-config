// Scanner for /scratch-prune: only the immediate children of <scratchpad>/tmp/ are candidates;
// the scratchpad root is summarised and never proposed.
import { readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { newestMtime, dirSize, DAY_MS, KEEP_DAYS } from "./claude-cleanup-lib.mjs";

function statOr(p) { try { return statSync(p); } catch { return null; } }
function safeReaddir(p) { try { return readdirSync(p, { withFileTypes: true }); } catch { return []; } }
const trunc1 = (n) => Math.floor(n * 10) / 10;
const sum = (rows) => rows.reduce((acc, r) => acc + r.size, 0);

function summariseRoot(scratchpad, tmp) {
  const rows = [];
  for (const e of safeReaddir(scratchpad)) {
    const absPath = join(scratchpad, e.name);
    if (absPath === tmp) continue;
    const st = statOr(absPath); if (!st) continue;
    rows.push({ name: e.name, size: st.isDirectory() ? dirSize(absPath) : st.size });
  }
  rows.sort((a, b) => b.size - a.size);
  return { entries: rows.length, bytes: sum(rows), largest: rows.slice(0, 3) };
}

export function scanScratchpad({ scratchpad, nowMs = Date.now() }) {
  const tmp = join(scratchpad, "tmp");
  if (!statOr(tmp)?.isDirectory()) return { error: `no tmp/ under ${scratchpad}` };
  const items = [];
  for (const e of safeReaddir(tmp)) {
    const absPath = join(tmp, e.name);
    const st = statOr(absPath); if (!st) continue;
    const mtimeMs = st.isDirectory() ? newestMtime(absPath) : st.mtimeMs;
    const size = st.isDirectory() ? dirSize(absPath) : st.size;
    const ageDays = (nowMs - mtimeMs) / DAY_MS;
    const kind = st.isDirectory() ? "dir" : (extname(e.name).slice(1).toLowerCase() || "file");
    items.push({ absPath, name: e.name, kind, size, mtimeMs, ageDays: trunc1(ageDays),
                 aged: ageDays >= KEEP_DAYS, category: "scratch", reason: `scratch:tmp/${e.name}` });
  }
  items.sort((a, b) => (b.aged - a.aged) || (b.size - a.size));
  const aged = items.filter((i) => i.aged);
  return { scratchpad, tmp, items, rootSummary: summariseRoot(scratchpad, tmp),
           totals: { entries: items.length, bytes: sum(items), aged: { entries: aged.length, bytes: sum(aged) } } };
}
