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

test("blue (cisco down) and red (backend down) colours", () => {
  for (const [status, code] of [["blue", "\x1b[34m"], ["red", "\x1b[31m"]]) {
    const s = setup({ level: "heavy", cache: { status, checkedAt: new Date(NOW).toISOString() } });
    try { assert.ok(dsSegment({ root: s.dir, claudeDir: s.dir, now: NOW }).includes(code), `${status} -> ${code}`); } finally { s.cleanup(); }
  }
});

test("off with a fresh cache is still shown (so the operator sees the model is alive)", () => {
  const s = setup({ level: "off", cache: { status: "green", checkedAt: new Date(NOW).toISOString() } });
  try { assert.match(dsSegment({ root: s.dir, claudeDir: s.dir, now: NOW }), /DS off/); } finally { s.cleanup(); }
});
