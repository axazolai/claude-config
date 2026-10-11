// In-flight record of local_* calls, one file per server process:
// <claudeDir>/state/deepseek-activity/<pid>.json = { pid, active: { <id>: { tool, startedAt } }, last, calls }.
// The statusline reads these files; a missing or unwritable state dir never affects a call.
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

export function activityDir(claudeDir) { return join(claudeDir, "state", "deepseek-activity"); }

export function createActivity({ claudeDir, pid = process.pid, now = Date.now }) {
  const file = join(activityDir(claudeDir), `${pid}.json`);
  const active = {};
  let last = null;
  let seq = 0;
  let calls = 0;
  const flush = () => {
    try {
      mkdirSync(activityDir(claudeDir), { recursive: true });
      writeFileSync(file, JSON.stringify({ pid, active, last, calls }));
    } catch { /* indicator only */ }
  };
  return {
    start(tool) { const id = String(++seq); active[id] = { tool, startedAt: now() }; flush(); return id; },
    end(id, tool, ok) { delete active[id]; calls++; last = { tool, endedAt: now(), ok }; flush(); },
    close() { try { rmSync(file, { force: true }); } catch { /* ignore */ } },
  };
}
