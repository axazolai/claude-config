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

test("@important bare sleep alone in background is denied", () => {
  assert.match(decide({ command: "sleep 5", run_in_background: true }), /background wait does no work/);
});

test("@important timeout /t N in background is denied", () => {
  assert.match(decide({ command: "timeout /t 30", run_in_background: true }), /background wait does no work/);
});

test("@important ; echo chain is denied same as && echo", () => {
  assert.match(decide({ command: "sleep 5; echo done", run_in_background: true }), /background wait does no work/);
});

test("case-insensitive match (SLEEP, START-SLEEP)", () => {
  assert.match(decide({ command: "SLEEP 5", run_in_background: true }), /background wait does no work/);
  assert.match(decide({ command: "START-SLEEP -Seconds 5", run_in_background: true }), /background wait does no work/);
});

test("@important foreground wait-only command passes (run_in_background absent or false)", () => {
  assert.equal(decide({ command: "sleep 590 && echo done" }), null);
  assert.equal(decide({ command: "sleep 590 && echo done", run_in_background: false }), null);
});

test("@important a real command in the background passes", () => {
  assert.equal(decide({ command: "npm test", run_in_background: true }), null);
});

test("@important a wait chained before real work in the background passes", () => {
  assert.equal(decide({ command: "sleep 5 && npm test", run_in_background: true }), null);
});

test("missing toolInput or command passes", () => {
  assert.equal(decide(null), null);
  assert.equal(decide({ run_in_background: true }), null);
});

test("@important unreadable stdin exits 0 with no output", () => {
  const r = runHook("not json");
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});

test("@critical spawned hook denies a real sleep-only background call", () => {
  const r = runHook(JSON.stringify({ tool_name: "Bash", tool_input: { command: "sleep 590 && echo done", run_in_background: true } }));
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.permissionDecision, "deny");
  assert.match(out.permissionDecisionReason, /background wait does no work/);
});

test("@important spawned hook produces no output for a real background command", () => {
  const r = runHook(JSON.stringify({ tool_name: "Bash", tool_input: { command: "npm test", run_in_background: true } }));
  assert.equal(r.stdout, "");
});
