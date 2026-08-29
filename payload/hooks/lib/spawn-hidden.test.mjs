import { test } from "node:test";
import assert from "node:assert/strict";

import { hidden, spawnSync, execFileSync } from "./spawn-hidden.mjs";

test("@important hidden() turns Node's windowsHide default around", () => {
  assert.equal(hidden().windowsHide, true);
  assert.equal(hidden({}).windowsHide, true);
  assert.equal(hidden(undefined).windowsHide, true);
});

test("@important hidden() keeps every option the caller passed", () => {
  const o = hidden({ cwd: "/x", encoding: "utf8", detached: true, stdio: "ignore" });
  assert.equal(o.cwd, "/x");
  assert.equal(o.encoding, "utf8");
  assert.equal(o.detached, true);
  assert.equal(o.stdio, "ignore");
  assert.equal(o.windowsHide, true);
});

test("@important an explicit windowsHide:false still wins - this is a default, not a policy", () => {
  assert.equal(hidden({ windowsHide: false }).windowsHide, false);
});

test("@important spawnSync still runs the child and returns its output", () => {
  const r = spawnSync(process.execPath, ["-e", "process.stdout.write('ok')"], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "ok");
});

test("@important spawnSync accepts the two-argument form, where args is really options", () => {
  const r = spawnSync(process.execPath, { encoding: "utf8", input: "" });
  assert.ok(r && !r.error, "expected a result object, not a throw");
});

test("@important execFileSync still runs the child and returns its output", () => {
  const out = execFileSync(process.execPath, ["-e", "process.stdout.write('ok')"], { encoding: "utf8" });
  assert.equal(out, "ok");
});

// The point of the wrapper is that nothing bypasses it. A direct child_process import is how the
// four detached spawns that put a console window on screen got there in the first place.