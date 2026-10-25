import { test } from "node:test";
import assert from "node:assert/strict";
import { runSummarize } from "./tools.mjs";

const chatOK = (text) => async () => ({ ok: true, text });


test("@critical runSummarize: unreadable path -> unavailable, never throws", async () => {
  const deps = { chat: chatOK("S"), readFile: () => { throw new Error("ENOENT"); } };
  const r = await runSummarize({ path: "/nope" }, deps);
  assert.deepEqual(r, { ok: false, reason: "unavailable" });
});


