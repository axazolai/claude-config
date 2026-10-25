import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isHeld } from "./state-lock.mjs";

const fresh = () => join(mkdtempSync(join(tmpdir(), "lock-")), "a.lock");

// A crashed run must not wedge the sync forever, which is what the TTL is for.



test("@critical an unreadable lock reads as not held, so a broken state file never wedges the sync", () => {
  const p = fresh();
  writeFileSync(p, "x");
  assert.equal(isHeld(p, { now: NaN }), false);
});
