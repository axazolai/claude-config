import { test } from "node:test";
import assert from "node:assert/strict";
import { handle, listTools } from "./server.mjs";

test("@important listTools offers the four local_* tools with schemas", () => {
  const names = listTools().map((t) => t.name).sort();
  assert.deepEqual(names, ["local_ask", "local_commit_msg", "local_draft", "local_summarize"]);
  for (const t of listTools()) assert.equal(t.inputSchema.type, "object");
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

test("@important a tool call records start and outcome, and clears the in-flight entry even when run throws", async () => {
  const { callTool } = await import("./server.mjs");
  const events = [];
  const activity = { start: (t) => { events.push(["start", t]); return "1"; }, end: (id, t, ok) => events.push(["end", t, ok]) };
  await callTool("local_commit_msg", { diff: "d" }, { chat: async () => ({ ok: true, text: "m" }), readFile: () => "x" }, activity);
  assert.deepEqual(events.at(-1), ["end", "local_commit_msg", true]);
  await assert.rejects(callTool("local_commit_msg", { diff: "d" }, { chat: async () => { throw new Error("boom"); } }, activity).then((r) => { if (r.isError) throw new Error("x"); }));
  assert.equal(events.at(-1)[0], "end");
});
