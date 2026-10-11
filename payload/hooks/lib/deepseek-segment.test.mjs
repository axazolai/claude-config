import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dsSegment } from "./deepseek-segment.mjs";

function setup({ level, cache } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ds-seg-"));
  if (level !== undefined) { mkdirSync(join(dir, ".claude"), { recursive: true }); writeFileSync(join(dir, ".claude", "deepseek.json"), JSON.stringify({ level })); }
  if (cache) { mkdirSync(join(dir, "state"), { recursive: true }); writeFileSync(join(dir, "state", "deepseek-health.json"), JSON.stringify(cache)); }
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
const NOW = 1_000_000_000;

test("@important fresh green cache renders DS <level> in green", () => {
  const s = setup({ level: "medium", cache: { status: "green", checkedAt: new Date(NOW).toISOString() } });
  try { const out = dsSegment({ root: s.dir, claudeDir: s.dir, now: NOW });
    assert.match(out, /DS medium/); assert.ok(out.includes("\x1b[32m"), "green code"); } finally { s.cleanup(); }
});

test("@critical a cache older than the interval+grace renders grey", () => {
  const s = setup({ level: "medium", cache: { status: "green", checkedAt: new Date(NOW - 1_000_000).toISOString() } });
  try { const out = dsSegment({ root: s.dir, claudeDir: s.dir, now: NOW });
    assert.ok(out.includes("\x1b[90m"), "grey code"); assert.ok(!out.includes("\x1b[32m"), "not green"); } finally { s.cleanup(); }
});

test("@important no cache + level off renders nothing; no cache + light renders grey", () => {
  const off = setup({ level: "off" });
  try { assert.equal(dsSegment({ root: off.dir, claudeDir: off.dir, now: NOW }), ""); } finally { off.cleanup(); }
  const light = setup({ level: "light" });
  try { const out = dsSegment({ root: light.dir, claudeDir: light.dir, now: NOW });
    assert.match(out, /DS light/); assert.ok(out.includes("\x1b[90m"), "grey"); } finally { light.cleanup(); }
});

test("@important off with a fresh cache is still shown (so the operator sees the model is alive)", () => {
  const s = setup({ level: "off", cache: { status: "green", checkedAt: new Date(NOW).toISOString() } });
  try { assert.match(dsSegment({ root: s.dir, claudeDir: s.dir, now: NOW }), /DS off/); } finally { s.cleanup(); }
});

function withActivity(s, rec) {
  const d = join(s.dir, "state", "deepseek-activity"); mkdirSync(d, { recursive: true });
  writeFileSync(join(d, `${rec.pid}.json`), JSON.stringify(rec));
}

test("@important a call in flight shows tool and elapsed seconds in cyan, replacing the level", () => {
  const s = setup({ level: "medium" });
  try { withActivity(s, { pid: process.pid, active: { 1: { tool: "local_ask", startedAt: NOW - 7000 } }, last: null });
    const out = dsSegment({ root: s.dir, claudeDir: s.dir, now: NOW });
    assert.match(out, /DS ask 7s/); assert.ok(out.includes("\x1b[36m"), "cyan"); assert.ok(!out.includes("medium")); } finally { s.cleanup(); }
});

test("@important a record from a dead pid or older than 5 min is ignored", () => {
  const s = setup({ level: "medium" });
  try { withActivity(s, { pid: 2 ** 22 + 12345, active: { 1: { tool: "local_ask", startedAt: NOW - 1000 } } });
    withActivity(s, { pid: process.pid, active: { 1: { tool: "local_ask", startedAt: NOW - 400000 } } });
    assert.match(dsSegment({ root: s.dir, claudeDir: s.dir, now: NOW }), /DS medium/); } finally { s.cleanup(); }
});

test("@important the idle segment ends with the finished-call total of live servers; off shows none", () => {
  const s = setup({ level: "medium" });
  try { assert.match(dsSegment({ root: s.dir, claudeDir: s.dir, now: NOW }), /DS medium 0/);
    withActivity(s, { pid: process.pid, active: {}, last: null, calls: 3 });
    assert.match(dsSegment({ root: s.dir, claudeDir: s.dir, now: NOW }), /DS medium 3/); } finally { s.cleanup(); }
  const off = setup({ level: "off", cache: { status: "green", checkedAt: new Date(NOW).toISOString() } });
  try { assert.match(dsSegment({ root: off.dir, claudeDir: off.dir, now: NOW }), /DS off\x1b/); } finally { off.cleanup(); }
});

test("@important a finished call shows ✓ or ✗ for 15s, then the level returns", () => {
  const s = setup({ level: "medium" });
  try { withActivity(s, { pid: process.pid, active: {}, last: { tool: "local_draft", endedAt: NOW - 5000, ok: true } });
    assert.match(dsSegment({ root: s.dir, claudeDir: s.dir, now: NOW }), /✓ DS draft/);
    withActivity(s, { pid: process.pid, active: {}, last: { tool: "local_draft", endedAt: NOW - 5000, ok: false } });
    const bad = dsSegment({ root: s.dir, claudeDir: s.dir, now: NOW });
    assert.match(bad, /✗ DS draft/); assert.ok(bad.includes("\x1b[31m"), "red");
    assert.match(dsSegment({ root: s.dir, claudeDir: s.dir, now: NOW + 20000 }), /DS medium/); } finally { s.cleanup(); }
});
