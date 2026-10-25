import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { decide } from "./background-sleep-guard.mjs";

const HOOK = fileURLToPath(new URL("./background-sleep-guard.mjs", import.meta.url));
const runHook = (input) => spawnSync(process.execPath, [HOOK], { input, encoding: "utf8" });

test("@critical sleep N && echo in background is denied", () => {
  const reason = decide({ command: "sleep 590 && echo done", run_in_background: true });
  assert.match(reason, /background wait does no work/);
});

test("@critical Start-Sleep in background is denied", () => {
  assert.match(decide({ command: "Start-Sleep -Seconds 60", run_in_background: true }), /background wait does no work/);
});

test("@critical timeout N in background is denied", () => {
  assert.match(decide({ command: "timeout 30", run_in_background: true }), /background wait does no work/);
});








test("@critical spawned hook denies a real sleep-only background call", () => {
  const r = runHook(JSON.stringify({ tool_name: "Bash", tool_input: { command: "sleep 590 && echo done", run_in_background: true } }));
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.permissionDecision, "deny");
  assert.match(out.permissionDecisionReason, /background wait does no work/);
});

