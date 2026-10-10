import { test } from "node:test";
import assert from "node:assert/strict";
import { startMonitorIfUsed } from "./deepseek-monitor-start.mjs";

test("@important the monitor is started when offload is on and left alone at level off", async () => {
  const calls = [];
  const ensure = (dir) => { calls.push(dir); return true; };
  assert.equal(await startMonitorIfUsed({ root: "r", claudeDir: "c", resolve: () => "medium", ensure }), true);
  assert.deepEqual(calls, ["c"]);
  assert.equal(await startMonitorIfUsed({ root: "r", claudeDir: "c", resolve: () => "off", ensure }), false);
  assert.equal(calls.length, 1);
});
