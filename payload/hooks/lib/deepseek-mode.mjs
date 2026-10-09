// The project's DeepSeek offload level and the retry budget derived from it.
// /deep-model-effort writes the level; the MCP tools, the health monitor and the statusline read it.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export const LEVELS = ["off", "light", "medium", "heavy", "full"];

// Extra attempts (reworks beyond the first try), by [level][task weight]. off/full are not
// governed by the matrix, so they yield 0.
const BUDGET = {
  light:  { light: 1, medium: 1, heavy: 0 },
  medium: { light: 3, medium: 2, heavy: 1 },
  heavy:  { light: 5, medium: 3, heavy: 2 },
};

const readJSON = (p) => JSON.parse(readFileSync(p, "utf8").replace(/^﻿/, ""));
const writeJSON = (p, obj) => writeFileSync(p, JSON.stringify(obj, null, 2) + "\n");
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const validLevel = (v) => (LEVELS.includes(v) ? v : null);

function levelFrom(path) {
  try { return validLevel(readJSON(path).level); } catch { return null; }
}

export function resolveLevel(root, claudeDir) {
  return levelFrom(join(root, ".claude", "deepseek.json"))
    || levelFrom(join(claudeDir, "deepseek-defaults.json"))
    || "off";
}

export function setLevel(root, level) {
  if (!LEVELS.includes(level)) throw new Error(`invalid level "${level}"; expected one of ${LEVELS.join(", ")}`);
  const file = join(root, ".claude", "deepseek.json");
  let cfg = {};
  if (existsSync(file)) {
    try { cfg = readJSON(file); } catch { throw new Error(`${file} is not valid JSON; nothing was changed`); }
    if (!isObject(cfg)) throw new Error(`${file} is not a JSON object; nothing was changed`);
  }
  cfg.level = level;
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeJSON(file, cfg);
  return { level, file };
}

export function retryBudget(level, weight) {
  return BUDGET[level]?.[weight] ?? 0;
}
