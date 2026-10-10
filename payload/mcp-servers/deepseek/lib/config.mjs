// DeepSeek connection config. The gateway address and key are machine-local, entered at
// `node setup.mjs` and stored in <CLAUDE_CONFIG_DIR>/deepseek.config.json — never in this repo,
// so nothing internal is published. Env vars override the file (DS_GATEWAY/DS_BACKEND/DS_MODEL,
// LLM_KEY for the key). Absent gateway or key -> callers return "unavailable".
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function readFile() {
  const dir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
  try { return JSON.parse(readFileSync(join(dir, "deepseek.config.json"), "utf8").replace(/^﻿/, "")); }
  catch { return {}; }
}

export function dsConfig() {
  const c = readFile();
  return {
    gateway: process.env.DS_GATEWAY || c.gateway || null,
    backend: process.env.DS_BACKEND || c.backend || null,
    model: process.env.DS_MODEL || c.model || "local/DeepSeek-V4.1-Flash",
    key: process.env.LLM_KEY || c.key || null,
  };
}
