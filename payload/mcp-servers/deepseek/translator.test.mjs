import { test } from "node:test";
import assert from "node:assert/strict";
import { toOpenAI, fromOpenAI, createThinkSplitter } from "./translator.mjs";

const drain = (sp, deltas) => { const ev = []; for (const d of deltas) ev.push(...sp.push(d)); ev.push(...sp.end()); return ev; };

test("@critical createThinkSplitter: no </think> ever seen -> whole stream is the ANSWER (text), not thinking", () => {
  // The exact mode-B bug: thinking on, model emits no closing tag. Must not strand the answer.
  const ev = drain(createThinkSplitter({ thinking: true }), ["Hello ", "world"]);
  assert.deepEqual(ev, [{ type: "text", text: "Hello world" }]);
});

test("@critical createThinkSplitter: splits reasoning before </think> from the answer after", () => {
  const ev = drain(createThinkSplitter({ thinking: true }), ["reason", " here</think>the ", "answer"]);
  assert.deepEqual(ev, [{ type: "thinking", text: "reason here" }, { type: "text", text: "the " }, { type: "text", text: "answer" }]);
});



test("@critical toOpenAI: assistant text + tool_use -> content + tool_calls (args stringified)", () => {
  const req = { max_tokens: 5, messages: [{ role: "assistant", content: [
    { type: "text", text: "let me look" },
    { type: "tool_use", id: "tu_1", name: "grep", input: { pattern: "x" } },
  ] }] };
  const b = toOpenAI(req, { model: "M" });
  const a = b.messages[0];
  assert.equal(a.role, "assistant");
  assert.equal(a.content, "let me look");
  assert.equal(a.tool_calls.length, 1);
  assert.equal(a.tool_calls[0].function.name, "grep");
  assert.equal(a.tool_calls[0].function.arguments, JSON.stringify({ pattern: "x" }));
  assert.equal(a.tool_calls[0].id, "tu_1");
});

test("@critical toOpenAI: user tool_result (error) -> role:tool message, error-prefixed", () => {
  const req = { max_tokens: 5, messages: [{ role: "user", content: [
    { type: "tool_result", tool_use_id: "tu_1", content: "boom", is_error: true },
  ] }] };
  const b = toOpenAI(req, { model: "M" });
  assert.deepEqual(b.messages[0], { role: "tool", tool_call_id: "tu_1", content: "ERROR: boom" });
});


test("@critical fromOpenAI: splits </think>, maps tool_calls, maps finish_reason", () => {
  const out = fromOpenAI({ finish_reason: "tool_calls", message: {
    content: "reasoning here</think>the answer",
    tool_calls: [{ id: "tc_1", function: { name: "grep", arguments: '{"pattern":"y"}' } }],
  } }, { emitThinking: false });
  assert.equal(out.stop_reason, "tool_use");
  const text = out.content.find((b) => b.type === "text");
  const tool = out.content.find((b) => b.type === "tool_use");
  assert.equal(text.text, "the answer");
  assert.ok(!out.content.some((b) => b.type === "thinking"), "emitThinking false -> no thinking block");
  assert.deepEqual(tool.input, { pattern: "y" });
  assert.equal(tool.name, "grep");
});

