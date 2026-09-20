import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DAY_MS } from "./claude-cleanup-lib.mjs";
import { scanScratchpad } from "./scratch-prune-lib.mjs";

const NOW = Date.UTC(2026, 8, 20);
const daysAgo = (n) => NOW - n * DAY_MS;
const touch = (p, ms, bytes) => { writeFileSync(p, "x".repeat(bytes)); utimesSync(p, new Date(ms), new Date(ms)); };

function fixture() {
  const d = mkdtempSync(join(tmpdir(), "sp-"));
  const scratchpad = join(d, ".scratchpad"), tmp = join(scratchpad, "tmp");
  mkdirSync(join(tmp, "pylib"), { recursive: true });
  touch(join(tmp, "old.py"), daysAgo(8), 10);
  touch(join(tmp, "new.json"), daysAgo(2), 20);
  touch(join(tmp, "pylib", "a.py"), daysAgo(20), 100);
  touch(join(tmp, "pylib", "b.py"), daysAgo(2), 100);
  touch(join(scratchpad, "archive_cutoffs.json"), daysAgo(30), 500);
  return { d, scratchpad };
}

test("@important scan: a tmp/ entry is aged by its newest file, the root is summarised and never proposed, aged rows come first", () => {
  const { d, scratchpad } = fixture();
  const res = scanScratchpad({ scratchpad, nowMs: NOW });
  assert.deepEqual(res.items.map((i) => [i.name, i.kind, i.aged, i.ageDays, i.size, i.reason]), [
    ["old.py", "py", true, 8, 10, "scratch:tmp/old.py"],
    ["pylib", "dir", false, 2, 200, "scratch:tmp/pylib"],
    ["new.json", "json", false, 2, 20, "scratch:tmp/new.json"],
  ]);
  assert.deepEqual(res.rootSummary, { entries: 1, bytes: 500, largest: [{ name: "archive_cutoffs.json", size: 500 }] });
  assert.deepEqual(res.totals, { entries: 3, bytes: 230, aged: { entries: 1, bytes: 10 } });
  rmSync(d, { recursive: true, force: true });
});

test("@important scan: a scratchpad without tmp/ is an error, not an empty list", () => {
  const d = mkdtempSync(join(tmpdir(), "sp-"));
  const scratchpad = join(d, ".scratchpad");
  mkdirSync(scratchpad);
  assert.deepEqual(scanScratchpad({ scratchpad, nowMs: NOW }), { error: `no tmp/ under ${scratchpad}` });
  rmSync(d, { recursive: true, force: true });
});
