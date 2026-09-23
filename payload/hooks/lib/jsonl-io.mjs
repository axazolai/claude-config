import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const safe = (fn) => { try { return fn(); } catch { return undefined; } };
export const writeFile = (p, content) => { try { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); return true; } catch { return false; } };
export const readJSON = (p) => JSON.parse(readFileSync(p, "utf8").replace(/^﻿/, ""));

export function readJSONLRecords(path) {
  if (!existsSync(path)) return [];
  const text = safe(() => readFileSync(path, "utf8")) || "";
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const rec = safe(() => JSON.parse(line));
    if (rec) out.push(rec);
  }
  return out;
}
