import { test } from "node:test";
import assert from "node:assert/strict";
import { handle } from "./server.mjs";


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

