#!/usr/bin/env node
// DeepSeek offload MCP server (mode A). Dependency-free MCP stdio transport: newline-delimited
// JSON-RPC 2.0. Offers the local_* tools; which to call at which level is Claude's job (see the
// deepseek rules fragment), so every tool is offered here unconditionally.
import { runSummarize, runAsk, runCommitMsg, runDraft } from "./lib/tools.mjs";

const TOOLS = [
  { name: "local_summarize", description: "Summarize a file or text with the local DeepSeek model. Give path OR text.",
    inputSchema: { type: "object", properties: { path: { type: "string" }, text: { type: "string" }, maxWords: { type: "number" } } },
    run: runSummarize },
  { name: "local_ask", description: "Ask a question about code; dumps the given files first, then the question.",
    inputSchema: { type: "object", properties: { question: { type: "string" }, paths: { type: "array", items: { type: "string" } } }, required: ["question"] },
    run: runAsk },
  { name: "local_commit_msg", description: "Draft a Conventional Commits message from a diff.",
    inputSchema: { type: "object", properties: { diff: { type: "string" } }, required: ["diff"] },
    run: runCommitMsg },
  { name: "local_draft", description: "Draft boilerplate code or tests from a short spec.",
    inputSchema: { type: "object", properties: { spec: { type: "string" } }, required: ["spec"] },
    run: runDraft },
];

export function listTools() {
  return TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
}

export async function callTool(name, args = {}, deps) {
  const t = TOOLS.find((x) => x.name === name);
  if (!t) return { content: [{ type: "text", text: `unknown tool: ${name}` }], isError: true };
  const res = await t.run(args, deps);
  if (res.ok) return { content: [{ type: "text", text: res.text }] };
  return { content: [{ type: "text", text: `DeepSeek unavailable (${res.reason})` }], isError: true };
}

const ok = (id, result) => ({ jsonrpc: "2.0", id, result });
const err = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });

// Returns a JSON-RPC response object, or null for notifications (no id / initialized).
export async function handle(msg, deps) {
  if (!msg || msg.jsonrpc !== "2.0") return null;
  const { id, method, params } = msg;
  if (id === undefined || id === null) return null; // notification
  switch (method) {
    case "initialize":
      return ok(id, {
        protocolVersion: params?.protocolVersion || "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "deepseek", version: "1.0.0" },
      });
    case "ping": return ok(id, {});
    case "tools/list": return ok(id, { tools: listTools() });
    case "tools/call": {
      const res = await callTool(params?.name, params?.arguments || {}, deps);
      return ok(id, res);
    }
    default: return err(id, -32601, `method not found: ${method}`);
  }
}

function main() {
  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      handle(msg).then((resp) => { if (resp) process.stdout.write(JSON.stringify(resp) + "\n"); })
        .catch(() => { /* a handler must never crash the server */ });
    }
  });
}

import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
function isMain() {
  const a = process.argv[1]; if (!a) return false;
  const self = fileURLToPath(import.meta.url);
  try { return a === self || realpathSync(a) === self; } catch { return a === self; }
}
if (isMain()) main();
