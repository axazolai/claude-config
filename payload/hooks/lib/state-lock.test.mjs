import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isHeld, take, release, STALE_LOCK_MS } from "./state-lock.mjs";

const fresh = () => join(mkdtempSync(join(tmpdir(), "lock-")), "a.lock");

// A crashed run must not wedge the sync forever, which is what the TTL is for.
test("@important a lock older than the TTL is not held", () => {
  const p = fresh();
  take(p);
  const now = statSync(p).mtimeMs + STALE_LOCK_MS + 1;
  assert.equal(isHeld(p, { now }), false);
});

test("@important release removes the lock and is safe to repeat", () => {
  const p = fresh();
  take(p);
  release(p);
  assert.equal(existsSync(p), false);
  release(p);
});

test("@important taking a lock in a directory that does not exist yet still works", () => {
  const p = join(mkdtempSync(join(tmpdir(), "lock-")), "nested", "b.lock");
  take(p);
  assert.ok(existsSync(p));
});

test("@critical an unreadable lock reads as not held, so a broken state file never wedges the sync", () => {
  const p = fresh();
  writeFileSync(p, "x");
  assert.equal(isHeld(p, { now: NaN }), false);
});
