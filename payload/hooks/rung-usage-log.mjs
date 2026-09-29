#!/usr/bin/env node
// SubagentStop: one usage record per finished subagent -> <config dir>/state/token-usage.jsonl.
// Any failure exits 0; a hook must never block a turn.
import { readFileSync, appendFileSync, mkdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { safe, readJSONLRecords } from "./lib/jsonl-io.mjs";

const EFFORT = /^rung-(?:sonnet|opus)-(medium|high)$/;

export function buildRecord(d, entries, now = new Date()) {
  const usage = entries.filter((e) => e && e.type === "assistant" && e.message && e.message.usage);
  if (!usage.length) return null;
  // One API response is written as several assistant entries sharing a message id and repeating the
  // same usage: count each id once (the last entry wins); an entry without an id counts by itself.
  const responses = new Map();
  usage.forEach((e, i) => responses.set(e.message.id ?? `#${i}`, e));
  const t = { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0 };
  let model = null;
  for (const e of responses.values()) {
    const u = e.message.usage;
    t.input_tokens += u.input_tokens || 0;
    t.output_tokens += u.output_tokens || 0;
    t.cache_read_tokens += u.cache_read_input_tokens || 0;
    t.cache_creation_tokens += u.cache_creation_input_tokens || 0;
    if (typeof e.message.model === "string") model = e.message.model.replace(/-\d{8}$/, "");
  }
  const agent = typeof d.agent_type === "string" ? d.agent_type : null;
  const m = agent && EFFORT.exec(agent);
  return { date: now.toISOString(), session_id: d.session_id ?? null, agent, model, effort: m ? m[1] : null, ...t };
}

function main() {
  let d;
  try { d = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { process.exit(0); }
  d = (d && typeof d === "object") ? d : {};
  if (d.hook_event_name !== "SubagentStop" || !d.agent_transcript_path) process.exit(0);
  const rec = buildRecord(d, readJSONLRecords(d.agent_transcript_path));
  if (!rec) process.exit(0);
  const log = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "state", "token-usage.jsonl");
  safe(() => { mkdirSync(dirname(log), { recursive: true }); appendFileSync(log, JSON.stringify(rec) + "\n"); });
  process.exit(0);
}

// Symlink-robust entry-point check: Node realpaths import.meta.url but process.argv[1] keeps the
// invocation path, so a linked ~/.claude makes a naive equality false and main() never runs.
function isMainModule() {
  const a = process.argv[1];
  if (!a) return false;
  if (import.meta.url === pathToFileURL(a).href) return true;
  try { return import.meta.url === pathToFileURL(realpathSync(a)).href; } catch { return false; }
}

if (isMainModule()) {
  try { main(); } catch { /* fail-open */ }
  process.exit(0);
}
