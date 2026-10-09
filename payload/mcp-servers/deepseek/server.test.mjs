import { test } from "node:test";
import assert from "node:assert/strict";
import { handle, listTools } from "./server.mjs";

test("@important listTools offers the four local_* tools with schemas", () => {
  const names = listTools().map((t) => t.name).sort();
  assert.deepEqual(names, ["local_ask", "local_commit_msg", "local_draft", "local_summarize"]);
  for (const t of listTools()) assert.equal(t.inputSchema.type, "object");
});

test("initialize echoes the client protocol version and advertises tools", async () => {
  const r = await handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
  assert.equal(r.result.protocolVersion, "2025-06-18");
  assert.deepEqual(r.result.capabilities, { tools: {} });
});

test("a notification (no id) yields no response", async () => {
  assert.equal(await handle({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
});

test("tools/list returns four tools", async () => {
  const r = await handle({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.equal(r.result.tools.length, 4);
});

test("@critical tools/call maps an ok tool result to text content", async () => {
  const deps = { chat: async () => ({ ok: true, text: "done" }), readFile: () => "x" };
  const r = await handle({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "local_commit_msg", arguments: { diff: "d" } } }, deps);
  assert.deepEqual(r.result, { content: [{ type: "text", text: "done" }] });
});

test("@critical tools/call maps a failed tool result to isError", async () => {
  const deps = { chat: async () => ({ ok: false, reason: "unavailable" }), readFile: () => "x" };
  const r = await handle({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "local_summarize", arguments: { text: "b" } } }, deps);
  assert.equal(r.result.isError, true);
  assert.match(r.result.content[0].text, /unavailable/);
});

test("an unknown method returns a JSON-RPC method-not-found error", async () => {
  const r = await handle({ jsonrpc: "2.0", id: 5, method: "nope/nope" });
  assert.equal(r.error.code, -32601);
});
