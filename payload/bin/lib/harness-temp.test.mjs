import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { harnessSessionDirs } from "./harness-temp.mjs";

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 8, 20);
const U = (n) => `0000000${n}-0000-4000-8000-000000000000`;
const session = (root, slug, uuid, hoursAgo) => {
  const f = join(root, slug, uuid, "tasks", "out.txt");
  mkdirSync(join(f, ".."), { recursive: true }); writeFileSync(f, "abc");
  const t = new Date(NOW - hoursAgo * HOUR); utimesSync(f, t, t);
};






test("@critical harnessSessionDirs: an active session's dir is never returned, whatever its age, with or without a slug", () => {
  const root = mkdtempSync(join(tmpdir(), "ht-"));
  session(root, "proj-a", U(1), 1000);
  session(root, "proj-a", U(2), 1000);
  session(root, "proj-b", U(3), 1000);
  const active = { available: true, ids: new Set([U(1), U(3)]) };
  const pick = (slug) => harnessSessionDirs({ tempRoot: root, slug, olderThanMs: 24 * HOUR, nowMs: NOW, active }).map((i) => i.uuid).sort();
  assert.deepEqual(pick("proj-a"), [U(2)]);
  assert.deepEqual(pick(undefined), [U(2)]);
  rmSync(root, { recursive: true, force: true });
});

