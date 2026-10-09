import { test } from "node:test";
import assert from "node:assert/strict";
import { runSummarize, runAsk, runCommitMsg, runDraft } from "./tools.mjs";

const chatOK = (text) => async () => ({ ok: true, text });
const chatFail = (reason) => async () => ({ ok: false, reason });

test("@important runSummarize: propagates chat ok and chat failure", async () => {
  const good = await runSummarize({ text: "some body" }, { chat: chatOK("S"), readFile: () => "" });
  assert.deepEqual(good, { ok: true, text: "S" });
  const bad = await runSummarize({ text: "some body" }, { chat: chatFail("http"), readFile: () => "" });
  assert.deepEqual(bad, { ok: false, reason: "http" });
});

test("@critical runSummarize: unreadable path -> unavailable, never throws", async () => {
  const deps = { chat: chatOK("S"), readFile: () => { throw new Error("ENOENT"); } };
  const r = await runSummarize({ path: "/nope" }, deps);
  assert.deepEqual(r, { ok: false, reason: "unavailable" });
});

test("@important runAsk: dumps files BEFORE the question (prefix-cache order)", async () => {
  let seen = "";
  const deps = { chat: async ({ messages }) => { seen = messages[0].content; return { ok: true, text: "A" }; },
    readFile: (p) => `CODE_OF_${p}` };
  await runAsk({ question: "WHERE_IS_X", paths: ["a.mjs"] }, deps);
  assert.ok(seen.indexOf("CODE_OF_a.mjs") < seen.indexOf("WHERE_IS_X"), "code dump must precede the question");
});

test("runCommitMsg: empty diff -> bad_output without calling chat", async () => {
  let called = false;
  const r = await runCommitMsg({ diff: "   " }, { chat: async () => { called = true; return { ok: true, text: "x" }; } });
  assert.deepEqual(r, { ok: false, reason: "bad_output" });
  assert.equal(called, false);
});

test("@important every tool: empty model text -> bad_output (validation)", async () => {
  const deps = { chat: chatOK("   "), readFile: () => "body" };
  assert.equal((await runSummarize({ text: "b" }, deps)).ok, false);
  assert.equal((await runAsk({ question: "q", paths: [] }, deps)).ok, false);
  assert.equal((await runCommitMsg({ diff: "d" }, deps)).ok, false);
  assert.equal((await runDraft({ spec: "s" }, deps)).ok, false);
});
