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


test("@critical a cache older than the interval+grace renders grey", () => {
  const s = setup({ level: "medium", cache: { status: "green", checkedAt: new Date(NOW - 1_000_000).toISOString() } });
  try { const out = dsSegment({ root: s.dir, claudeDir: s.dir, now: NOW });
    assert.ok(out.includes("\x1b[90m"), "grey code"); assert.ok(!out.includes("\x1b[32m"), "not green"); } finally { s.cleanup(); }
});







