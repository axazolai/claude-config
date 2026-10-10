import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "./status-project-progress.mjs";
import { progressEnabled } from "../hooks/lib/status-project-progress.mjs";

test("@important on|off persists the switch, no state means on, other arguments are rejected", () => {
  const d = mkdtempSync(join(tmpdir(), "sp-"));
  const log = console.log, err = console.error; console.log = () => {}; console.error = () => {};
  try {
    assert.equal(progressEnabled(d), true);
    assert.equal(main(["off"], d), 0); assert.equal(progressEnabled(d), false);
    assert.equal(main(["on"], d), 0); assert.equal(progressEnabled(d), true);
    assert.equal(main(["maybe"], d), 2); assert.equal(progressEnabled(d), true);
  } finally { console.log = log; console.error = err; rmSync(d, { recursive: true, force: true }); }
});
