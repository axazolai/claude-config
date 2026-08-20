import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { hidden, spawnSync, execFileSync } from "./spawn-hidden.mjs";

const PAYLOAD = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("hidden() turns Node's windowsHide default around", () => {
  assert.equal(hidden().windowsHide, true);
  assert.equal(hidden({}).windowsHide, true);
  assert.equal(hidden(undefined).windowsHide, true);
});

test("hidden() keeps every option the caller passed", () => {
  const o = hidden({ cwd: "/x", encoding: "utf8", detached: true, stdio: "ignore" });
  assert.equal(o.cwd, "/x");
  assert.equal(o.encoding, "utf8");
  assert.equal(o.detached, true);
  assert.equal(o.stdio, "ignore");
  assert.equal(o.windowsHide, true);
});

test("an explicit windowsHide:false still wins - this is a default, not a policy", () => {
  assert.equal(hidden({ windowsHide: false }).windowsHide, false);
});

test("spawnSync still runs the child and returns its output", () => {
  const r = spawnSync(process.execPath, ["-e", "process.stdout.write('ok')"], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "ok");
});

test("spawnSync accepts the two-argument form, where args is really options", () => {
  const r = spawnSync(process.execPath, { encoding: "utf8", input: "" });
  assert.ok(r && !r.error, "expected a result object, not a throw");
});

test("execFileSync still runs the child and returns its output", () => {
  const out = execFileSync(process.execPath, ["-e", "process.stdout.write('ok')"], { encoding: "utf8" });
  assert.equal(out, "ok");
});

// The point of the wrapper is that nothing bypasses it. A direct child_process import is how the
// four detached spawns that put a console window on screen got there in the first place.
test("nothing shipped in payload/ imports node:child_process directly", () => {
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!name.endsWith(".mjs") || name.endsWith(".test.mjs")) continue;
      const rel = relative(PAYLOAD, full).split("\\").join("/");
      if (rel === "hooks/lib/spawn-hidden.mjs") continue;
      if (/from\s+[\'"]node:child_process/.test(readFileSync(full, "utf8"))) offenders.push(rel);
    }
  };
  walk(PAYLOAD);
  assert.deepEqual(offenders, [],
    `these import node:child_process instead of hooks/lib/spawn-hidden.mjs, so their children get a console window on Windows:\n  ${offenders.join("\n  ")}`);
});
