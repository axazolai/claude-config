import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { harnessTempRoot, harnessSessionDirs, activeSessionIds } from "./harness-temp.mjs";

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 8, 20);
const U = (n) => `0000000${n}-0000-4000-8000-000000000000`;
const NONE_ACTIVE = { available: true, ids: new Set() };
const registry = (entries) => {
  const dir = mkdtempSync(join(tmpdir(), "htr-"));
  mkdirSync(join(dir, "sessions"));
  for (const [name, body] of Object.entries(entries)) writeFileSync(join(dir, "sessions", name), body);
  return dir;
};
const session = (root, slug, uuid, hoursAgo) => {
  const f = join(root, slug, uuid, "tasks", "out.txt");
  mkdirSync(join(f, ".."), { recursive: true }); writeFileSync(f, "abc");
  const t = new Date(NOW - hoursAgo * HOUR); utimesSync(f, t, t);
};

test("@important harnessTempRoot: CLAUDE_CODE_TMPDIR wins, the claude leaf is appended once, per-uid off Windows", () => {
  assert.equal(harnessTempRoot({}, "win32", join("C:", "_Temp")), join("C:", "_Temp", "claude"));
  assert.equal(harnessTempRoot({ CLAUDE_CODE_TMPDIR: join("D:", "t", "Claude") }, "win32", "ignored"), join("D:", "t", "Claude"));
  assert.equal(harnessTempRoot({}, "linux", "/tmp", 1000), join("/tmp", "claude-1000"));
});

test("@important harnessTempRoot: an override without a trailing claude leaf still gets it appended, same as the default tmpdir path", () => {
  assert.equal(harnessTempRoot({ CLAUDE_CODE_TMPDIR: join("D:", "custom-tmp") }, "win32", "ignored"), join("D:", "custom-tmp", "claude"));
  assert.equal(harnessTempRoot({ CLAUDE_CODE_TMPDIR: "/custom-tmp" }, "linux", "ignored", 1000), join("/custom-tmp", "claude-1000"));
});

test("@important harnessSessionDirs: this slug's session dirs minus current and fresh; no slug spans all; never a non-UUID dir", () => {
  const root = mkdtempSync(join(tmpdir(), "ht-"));
  session(root, "proj-a", U(1), 30);
  session(root, "proj-a", U(2), 30);
  session(root, "proj-a", U(3), 1);
  session(root, "proj-b", U(4), 30);
  session(root, "proj-a", "not-a-uuid", 30);
  writeFileSync(join(root, "proj-a", U(5)), "file, not dir");
  const pick = (opts) => harnessSessionDirs({ tempRoot: root, olderThanMs: 2 * HOUR, nowMs: NOW, active: NONE_ACTIVE, ...opts }).map((i) => `${i.slug}/${i.uuid}`).sort();
  assert.deepEqual(pick({ slug: "proj-a", excludeUuids: [U(2)] }), [`proj-a/${U(1)}`]);
  assert.deepEqual(pick({ excludeUuids: [U(2)] }), [`proj-a/${U(1)}`, `proj-b/${U(4)}`]);
  const [it] = harnessSessionDirs({ tempRoot: root, slug: "proj-b", olderThanMs: 0, nowMs: NOW, active: NONE_ACTIVE });
  assert.deepEqual([it.absPath, it.size, it.mtimeMs], [join(root, "proj-b", U(4)), 3, NOW - 30 * HOUR]);
  rmSync(root, { recursive: true, force: true });
});

test("@important harnessSessionDirs: slug matching is case-insensitive on win32, case-sensitive elsewhere", () => {
  const root = mkdtempSync(join(tmpdir(), "ht-"));
  session(root, "Proj-Mixed", U(1), 30);
  const found = harnessSessionDirs({ tempRoot: root, slug: "proj-mixed", olderThanMs: 0, nowMs: NOW, active: NONE_ACTIVE }).map((i) => i.uuid);
  assert.deepEqual(found, process.platform === "win32" ? [U(1)] : []);
  rmSync(root, { recursive: true, force: true });
});

test("@important activeSessionIds: ids of live pids only, non-JSON siblings skipped; missing or unparsable registry is unavailable", () => {
  const rec = (pid, n) => JSON.stringify({ pid, sessionId: U(n), cwd: "x" });
  const alive = (pid) => pid === 11;
  const ok = registry({ "11.json": rec(11, 1), "12.json": rec(12, 2), "11.abc.key": "not json" });
  assert.deepEqual(activeSessionIds({ configDir: ok, isAlive: alive }), { available: true, ids: new Set([U(1)]) });
  assert.equal(activeSessionIds({ configDir: join(ok, "nope"), isAlive: alive }).available, false);
  const broken = registry({ "11.json": rec(11, 1), "13.json": "{ truncated" });
  assert.equal(activeSessionIds({ configDir: broken, isAlive: alive }).available, false);
  const noPid = registry({ "14.json": JSON.stringify({ sessionId: U(4) }) });
  assert.equal(activeSessionIds({ configDir: noPid, isAlive: () => true }).available, false);
  for (const d of [ok, broken, noPid]) rmSync(d, { recursive: true, force: true });
});

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

test("@important harnessSessionDirs: an unavailable registry returns no session dir at all", () => {
  const root = mkdtempSync(join(tmpdir(), "ht-"));
  session(root, "proj-a", U(1), 1000);
  assert.deepEqual(harnessSessionDirs({ tempRoot: root, olderThanMs: 0, nowMs: NOW, active: { available: false, ids: new Set() } }), []);
  rmSync(root, { recursive: true, force: true });
});
