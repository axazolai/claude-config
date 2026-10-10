import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chat, splitThink } from "./gateway.mjs";

// Hermetic: an empty config dir so no real ~/.claude/deepseek.config.json leaks in; gateway via env.
let savedKey, savedGw, savedDir, tmp;
beforeEach(() => {
  savedKey = process.env.LLM_KEY; savedGw = process.env.DS_GATEWAY; savedDir = process.env.CLAUDE_CONFIG_DIR;
  tmp = mkdtempSync(join(tmpdir(), "ds-gw-"));
  process.env.CLAUDE_CONFIG_DIR = tmp;
  process.env.LLM_KEY = "sk-test";
  process.env.DS_GATEWAY = "http://gw.test";
});
afterEach(() => {
  const restore = (k, v) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; };
  restore("LLM_KEY", savedKey); restore("DS_GATEWAY", savedGw); restore("CLAUDE_CONFIG_DIR", savedDir);
  rmSync(tmp, { recursive: true, force: true });
});

const okResp = (content, usage = { prompt_tokens: 3 }) => ({ status: 200, json: async () => ({ choices: [{ message: { content } }], usage }) });

test("@important chat: no LLM_KEY -> unavailable, no fetch", async () => {
  delete process.env.LLM_KEY;
  let called = false;
  const r = await chat({ messages: [], maxTokens: 1, fetchImpl: async () => { called = true; } });
  assert.deepEqual(r, { ok: false, reason: "unavailable" });
  assert.equal(called, false);
});

test("@critical chat: 200 -> ok with text (think stripped) and usage", async () => {
  const r = await chat({ messages: [{ role: "user", content: "hi" }], maxTokens: 5,
    fetchImpl: async () => okResp("reasoning</think>the answer", { prompt_tokens: 9 }) });
  assert.equal(r.ok, true);
  assert.equal(r.text, "the answer");
  assert.deepEqual(r.usage, { prompt_tokens: 9 });
});

test("@critical chat: non-200 -> http with status; thrown TimeoutError -> timeout; never throws", async () => {
  const h = await chat({ messages: [], maxTokens: 1, fetchImpl: async () => ({ status: 500, json: async () => ({}) }) });
  assert.deepEqual(h, { ok: false, reason: "http", status: 500 });
  const t = await chat({ messages: [], maxTokens: 1, fetchImpl: async () => { const e = new Error("t"); e.name = "TimeoutError"; throw e; } });
  assert.deepEqual(t, { ok: false, reason: "timeout" });
  const c = await chat({ messages: [], maxTokens: 1, fetchImpl: async () => { throw new Error("socket"); } });
  assert.deepEqual(c, { ok: false, reason: "unavailable" });
});

test("@important splitThink: splits at the last </think>, else all text", () => {
  assert.deepEqual(splitThink("a</think>b"), { reasoning: "a", text: "b" });
  assert.deepEqual(splitThink("x</think>y</think>z"), { reasoning: "x</think>y", text: "z" });
  assert.deepEqual(splitThink("plain"), { reasoning: "", text: "plain" });
});
