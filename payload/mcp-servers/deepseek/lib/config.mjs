// DeepSeek connection config. The gateway address and key are machine-local, entered at
// `node setup.mjs` and stored in <CLAUDE_CONFIG_DIR>/deepseek.config.json — never in this repo,
// so nothing internal is published. Env vars override the file (DS_GATEWAY/DS_BACKEND/DS_MODEL,
// LLM_KEY for the key). Absent gateway or key -> callers return "unavailable".
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_PORT = 4002;

// "10.81.0.13" -> http://10.81.0.13:4002; "10.81.0.13:5000" -> http://10.81.0.13:5000; a value with a
// scheme is kept (trailing slash dropped). Blank -> null.
export function normalizeGateway(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return s.replace(/\/+$/, "");
  const host = s.replace(/\/+$/, "");
  return `http://${/:\d+$/.test(host) ? host : `${host}:${DEFAULT_PORT}`}`;
}

function readFile() {
  const dir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
  try { return JSON.parse(readFileSync(join(dir, "deepseek.config.json"), "utf8").replace(/^﻿/, "")); }
  catch { return {}; }
}

export function dsConfig() {
  const c = readFile();
  return {
    gateway: normalizeGateway(process.env.DS_GATEWAY || c.gateway),
    backend: normalizeGateway(process.env.DS_BACKEND || c.backend),
    model: process.env.DS_MODEL || c.model || "local/DeepSeek-V4.1-Flash",
    key: process.env.LLM_KEY || c.key || null,
  };
}
