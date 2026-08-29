import { test } from "node:test";
import assert from "node:assert/strict";

import { hidden, spawnSync } from "./spawn-hidden.mjs";

test("@important hidden() turns Node's windowsHide default around", () => {
  assert.equal(hidden().windowsHide, true);
  assert.equal(hidden({}).windowsHide, true);
  assert.equal(hidden(undefined).windowsHide, true);
});

test("@important an explicit windowsHide:false still wins - this is a default, not a policy", () => {
  assert.equal(hidden({ windowsHide: false }).windowsHide, false);
});

test("@important spawnSync accepts the two-argument form, where args is really options", () => {
  const r = spawnSync(process.execPath, { encoding: "utf8", input: "" });
  assert.ok(r && !r.error, "expected a result object, not a throw");
});

// The point of the wrapper is that nothing bypasses it. A direct child_process import is how the
// four detached spawns that put a console window on screen got there in the first place.