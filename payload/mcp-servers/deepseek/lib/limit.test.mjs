import { test } from "node:test";
import assert from "node:assert/strict";
import { createLimiter } from "./limit.mjs";

const defer = (ms) => new Promise((r) => setTimeout(r, ms));

test("@important createLimiter: never runs more than max concurrently", async () => {
  const run = createLimiter(2, 1000);
  let active = 0, peak = 0;
  const job = async () => { active++; peak = Math.max(peak, active); await defer(20); active--; return true; };
  await Promise.all(Array.from({ length: 6 }, () => run(job)));
  assert.equal(peak, 2);
});

test("@important createLimiter: a job waiting past queueTimeoutMs is refused", async () => {
  const run = createLimiter(1, 30);
  const slow = run(() => defer(100).then(() => "done")); // holds the one slot
  await assert.rejects(run(() => defer(1)), /queue timeout/);
  assert.equal(await slow, "done");
});
