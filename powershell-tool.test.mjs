// powershell-tool.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { powerShellToolPlan, MIN_PWSH_MAJOR } from "./powershell-tool.mjs";




test("@critical a recorded decision is never re-asked, in either direction", () => {
  for (const value of ["1", "0"]) {
    const plan = powerShellToolPlan({
      os: "win32", env: { CLAUDE_CODE_USE_POWERSHELL_TOOL: value },
      interactive: true, pwshMajor: 7,
    });
    assert.deepEqual(plan, { action: "skip", reason: "already-decided" });
  }
});

test("@critical a recorded decision outranks the flag", () => {
  const plan = powerShellToolPlan({
    os: "win32", env: { CLAUDE_CODE_USE_POWERSHELL_TOOL: "0" },
    flag: true, interactive: false, pwshMajor: 7,
  });
  assert.deepEqual(plan, { action: "skip", reason: "already-decided" });
});


test("@critical the flag never installs anything on its own", () => {
  for (const pwshMajor of [null, 5, MIN_PWSH_MAJOR - 1])
    assert.deepEqual(powerShellToolPlan({ os: "win32", flag: true, interactive: false, pwshMajor }),
      { action: "blocked", reason: "no-pwsh" });
});



test("@critical a non-interactive run with no flag decides nothing and records nothing", () => {
  assert.deepEqual(powerShellToolPlan({ os: "win32", interactive: false, pwshMajor: 7 }),
    { action: "skip", reason: "non-interactive" });
  assert.deepEqual(powerShellToolPlan({ os: "win32", interactive: false, pwshMajor: null }),
    { action: "skip", reason: "non-interactive" });
});
