import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { classify } from "./web-block-nudge.mjs";

const HOOK = fileURLToPath(new URL("./web-block-nudge.mjs", import.meta.url));
const runHook = (payload) => spawnSync(process.execPath, [HOOK], { input: JSON.stringify(payload), encoding: "utf8" });
const context = (r) => JSON.parse(r.stdout).hookSpecificOutput;

test("@important challenge pages and refused fetches classify as blocked", () => {
  assert.equal(classify("<title>Just a moment...</title>"), "blocked");
  assert.equal(classify("The server returned HTTP 403 Forbidden."), "blocked");
  assert.equal(classify("fetch failed: 429 Too Many Requests", { failure: true }), "blocked");
});

test("@important an SPA shell classifies as js-shell", () => {
  assert.equal(classify("<noscript>You need to enable JavaScript to run this app.</noscript>"), "js-shell");
});

test("@important ordinary pages and prose about 403 or captcha are not blocks", () => {
  assert.equal(classify("# React docs\nuseEffect runs after render"), null);
  assert.equal(classify("A 403 status means the server understood the request."), null);
  assert.equal(classify("This page explains how captcha works"), null);
  assert.equal(classify("The HTTP 403 Forbidden response status code indicates a refusal"), null);
  assert.equal(classify("| 429 | Too Many Requests |"), null);
});

test("@important a page body split over lines is not read as one status line", () => {
  const r = spawnSync(process.execPath, [HOOK], { encoding: "utf8", input: JSON.stringify({
    hook_event_name: "PostToolUse", tool_name: "WebFetch", tool_response: { result: "HTTP 403\nForbidden is a status" } }) });
  assert.equal(r.stdout, "");
});

test("@important a blocked WebFetch result gets the stealthy_fetch nudge", () => {
  const out = context(runHook({ hook_event_name: "PostToolUse", tool_name: "WebFetch",
    tool_response: { result: "<title>Just a moment...</title>" } }));
  assert.equal(out.hookEventName, "PostToolUse");
  assert.match(out.additionalContext, /stealthy_fetch/);
});

test("@important a JS shell gets the fetch nudge", () => {
  const out = context(runHook({ hook_event_name: "PostToolUse", tool_name: "WebFetch",
    tool_response: "You need to enable JavaScript to run this app" }));
  assert.match(out.additionalContext, /Scrapling `fetch`/);
});

test("@important a failed fetch is read from error, not tool_response", () => {
  const out = context(runHook({ hook_event_name: "PostToolUseFailure", tool_name: "WebFetch",
    error: "The server returned HTTP 403 Forbidden." }));
  assert.equal(out.hookEventName, "PostToolUseFailure");
  assert.match(out.additionalContext, /stealthy_fetch/);
});

test("@important an ordinary page and unreadable input produce no output", () => {
  assert.equal(runHook({ hook_event_name: "PostToolUse", tool_name: "WebFetch", tool_response: "# Docs" }).stdout, "");
  const r = spawnSync(process.execPath, [HOOK], { input: "not json", encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});
