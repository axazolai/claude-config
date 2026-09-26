import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { decide } from "./scrapling-raw-gate.mjs";

const HOOK = fileURLToPath(new URL("./scrapling-raw-gate.mjs", import.meta.url));
const runHook = (input, env = {}) => spawnSync(process.execPath, [HOOK],
  { input, encoding: "utf8", env: { ...process.env, CLAUDE_SCRAPLING_ALLOW_RAW: "", ...env } });

test("@critical main_content_only=false on a Scrapling tool is denied", () => {
  const r = runHook(JSON.stringify({ tool_name: "mcp__scrapling__fetch", tool_input: { url: "u", main_content_only: false } }));
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.permissionDecision, "deny");
  assert.match(out.permissionDecisionReason, /css_selector/);
});

test("@critical true or absent pass without a decision", () => {
  for (const input of [{ main_content_only: true }, {}])
    assert.equal(decide("mcp__scrapling__stealthy_fetch", input, {}), null);
});

test("@critical values the server may coerce to false are denied", () => {
  for (const v of ["false", 0, null, "no", "0", "off"])
    assert.match(decide("mcp__scrapling__fetch", { main_content_only: v }, {}), /sanitizer/, String(v));
});

test("@critical a non-Scrapling tool is never gated", () => {
  assert.equal(decide("mcp__other__fetch", { main_content_only: false }, {}), null);
});

test("@critical CLAUDE_SCRAPLING_ALLOW_RAW=1 lets the raw call through", () => {
  assert.equal(decide("mcp__scrapling__fetch", { main_content_only: false }, { CLAUDE_SCRAPLING_ALLOW_RAW: "1" }), null);
  assert.equal(runHook(JSON.stringify({ tool_name: "mcp__scrapling__fetch", tool_input: { main_content_only: false } }),
    { CLAUDE_SCRAPLING_ALLOW_RAW: "1" }).stdout, "");
});

test("@important unreadable input exits 0 with no output", () => {
  const r = runHook("not json");
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});
