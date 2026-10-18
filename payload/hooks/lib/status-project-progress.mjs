// User-wide switch for the statusline's progress segment (ultrapowers phase
// counter). /status-project-progress writes it; the statusline reads it. Default on.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const file = (claudeDir) => join(claudeDir, "state", "status-project-progress.json");

export function progressEnabled(claudeDir) {
  try { return JSON.parse(readFileSync(file(claudeDir), "utf8").replace(/^﻿/, "")).enabled !== false; }
  catch { return true; }
}

export function setProgressEnabled(claudeDir, enabled) {
  mkdirSync(join(claudeDir, "state"), { recursive: true });
  writeFileSync(file(claudeDir), JSON.stringify({ enabled: Boolean(enabled) }));
  return file(claudeDir);
}
