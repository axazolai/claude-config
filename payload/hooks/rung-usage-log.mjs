#!/usr/bin/env node
// SubagentStop: one usage record per finished subagent -> <config dir>/state/token-usage.jsonl.
// Any failure exits 0; a hook must never block a turn.
import { readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { safe, readJSONLRecords } from "./lib/jsonl-io.mjs";

const EFFORT = /^rung-(?:sonnet|opus)-(medium|high)$/;

export function buildRecord(d, entries, now = new Date()) {
  const usage = entries.filter((e) => e && e.type === "assistant" && e.message && e.message.usage);
  if (!usage.length) return null;
  const t = { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0 };
  let model = null;
  for (const e of usage) {
    const u = e.message.usage;
    t.input_tokens += u.input_tokens || 0;
    t.output_tokens += u.output_tokens || 0;
    t.cache_read_tokens += u.cache_read_input_tokens || 0;
    t.cache_creation_tokens += u.cache_creation_input_tokens || 0;
    if (e.message.model) model = e.message.model.replace(/-\d{8}$/, "");
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

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
