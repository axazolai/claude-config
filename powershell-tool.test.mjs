// powershell-tool.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePwshMajor, powerShellToolPlan, MIN_PWSH_MAJOR } from "./powershell-tool.mjs";

test("parsePwshMajor reads the major from what pwsh actually prints", () => {
  assert.equal(parsePwshMajor("7.6.4\n"), 7);
  assert.equal(parsePwshMajor("  7.4.6  "), 7);
  assert.equal(parsePwshMajor("8.0.0-preview.3"), 8);
  assert.equal(parsePwshMajor("5.1.26100.4061"), 5);
});

test("parsePwshMajor refuses to guess", () => {
  for (const junk of ["", "   ", "not a version", "v7.6.4", undefined, null])
    assert.equal(parsePwshMajor(junk), null, `should be null for ${JSON.stringify(junk)}`);
});

test("a non-Windows machine is never touched", () => {
  for (const os of ["linux", "darwin"])
    assert.deepEqual(powerShellToolPlan({ os, interactive: true, pwshMajor: 7 }),
      { action: "skip", reason: "not-windows" });
});

test("a recorded decision is never re-asked, in either direction", () => {
  for (const value of ["1", "0"]) {
    const plan = powerShellToolPlan({
      os: "win32", env: { CLAUDE_CODE_USE_POWERSHELL_TOOL: value },
      interactive: true, pwshMajor: 7,
    });
    assert.deepEqual(plan, { action: "skip", reason: "already-decided" });
  }
});

test("a recorded decision outranks the flag", () => {
  const plan = powerShellToolPlan({
    os: "win32", env: { CLAUDE_CODE_USE_POWERSHELL_TOOL: "0" },
    flag: true, interactive: false, pwshMajor: 7,
  });
  assert.deepEqual(plan, { action: "skip", reason: "already-decided" });
});

test("the flag writes without asking when PowerShell 7+ is there", () => {
  assert.deepEqual(powerShellToolPlan({ os: "win32", flag: true, interactive: false, pwshMajor: 7 }),
    { action: "write", value: "1" });
  assert.deepEqual(powerShellToolPlan({ os: "win32", flag: true, interactive: false, pwshMajor: 9 }),
    { action: "write", value: "1" });
});

test("the flag never installs anything on its own", () => {
  for (const pwshMajor of [null, 5, MIN_PWSH_MAJOR - 1])
    assert.deepEqual(powerShellToolPlan({ os: "win32", flag: true, interactive: false, pwshMajor }),
      { action: "blocked", reason: "no-pwsh" });
});

test("Windows PowerShell 5.1 does not count as PowerShell 7+", () => {
  assert.deepEqual(powerShellToolPlan({ os: "win32", interactive: true, pwshMajor: 5 }),
    { action: "offer-install" });
});

test("an interactive run offers the install first, the tool second", () => {
  assert.deepEqual(powerShellToolPlan({ os: "win32", interactive: true, pwshMajor: null }),
    { action: "offer-install" });
  assert.deepEqual(powerShellToolPlan({ os: "win32", interactive: true, pwshMajor: 7 }),
    { action: "offer-enable" });
});

test("a non-interactive run with no flag decides nothing and records nothing", () => {
  assert.deepEqual(powerShellToolPlan({ os: "win32", interactive: false, pwshMajor: 7 }),
    { action: "skip", reason: "non-interactive" });
  assert.deepEqual(powerShellToolPlan({ os: "win32", interactive: false, pwshMajor: null }),
    { action: "skip", reason: "non-interactive" });
});

test("an env object without the key is undecided, not decided-false", () => {
  const plan = powerShellToolPlan({ os: "win32", env: { CLAUDE_CONFIG_UPDATE_CHECK: "0" }, interactive: true, pwshMajor: 7 });
  assert.deepEqual(plan, { action: "offer-enable" });
});
