import { test } from "node:test";
import assert from "node:assert/strict";
import { toOpenAI, fromOpenAI } from "./translator.mjs";

test("@important toOpenAI: system string becomes a leading system message", () => {
  const b = toOpenAI({ system: "be terse", messages: [{ role: "user", content: "hi" }], max_tokens: 10 }, { model: "M", thinking: false });
  assert.deepEqual(b.messages[0], { role: "system", content: "be terse" });
  assert.equal(b.model, "M");
  assert.equal(b.max_tokens, 10);
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

test("@important toOpenAI: thinking flag and tool_choice mapping", () => {
  const b = toOpenAI({ max_tokens: 5, messages: [], tools: [{ name: "t", input_schema: { type: "object" } }], tool_choice: { type: "any" } }, { model: "M", thinking: true });
  assert.deepEqual(b.chat_template_kwargs, { thinking: true });
  assert.equal(b.tool_choice, "required");
  assert.equal(b.tools[0].type, "function");
  assert.equal(b.tools[0].function.name, "t");
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

test("fromOpenAI: emitThinking true keeps the reasoning as a thinking block; plain stop maps to end_turn", () => {
  const out = fromOpenAI({ finish_reason: "stop", message: { content: "why</think>ans" } }, { emitThinking: true });
  assert.equal(out.stop_reason, "end_turn");
  assert.equal(out.content[0].type, "thinking");
  assert.equal(out.content[0].thinking, "why");
  assert.equal(out.content[1].text, "ans");
});

test("fromOpenAI: malformed tool arguments degrade to an empty object, never throw", () => {
  const out = fromOpenAI({ finish_reason: "tool_calls", message: { content: "", tool_calls: [{ id: "t", function: { name: "f", arguments: "{bad" } }] } }, {});
  assert.deepEqual(out.content.find((b) => b.type === "tool_use").input, {});
});
