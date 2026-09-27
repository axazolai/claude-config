import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync, readFileSync, readdirSync, existsSync, symlinkSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { scanLayout, promote, CLOCK_SKEW_MS } from "./scratch-prune-lib.mjs";

// Fixed regardless of the host machine's timezone: promote()'s INDEX.md date is a local-getter
// date, and NOW below is UTC midnight, so a non-UTC host would otherwise compute a different day.
process.env.TZ = "UTC";
const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 8, 20);
const put = (p, hoursAgo, body = "x") => {
  mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, body);
  const t = new Date(NOW - hoursAgo * HOUR); utimesSync(p, t, t);
};

function layout() {
  const d = mkdtempSync(join(tmpdir(), "sp-"));
  const sp = join(d, ".claude", ".scratchpad");
  put(join(sp, "phase-22", "scripts", "probe.mjs"), 1);
  put(join(sp, "phase-22", "data", "dump.json"), 1);
  put(join(sp, "phase-22", "logs", "run.txt"), 1);
  put(join(sp, "phase-22", "loose.txt"), 1);
  put(join(sp, "phase-21", "data", "old.json"), 500);
  put(join(sp, "adhoc", "2026-09-18-probe", "a.py"), 48);
  put(join(sp, "adhoc", "2026-09-19-notes", "n.txt"), 30);
  put(join(sp, "adhoc", "2026-09-19-fresh", "old.txt"), 40);
  put(join(sp, "adhoc", "2026-09-19-fresh", "new.txt"), 3);
  put(join(sp, "proc", "tmp-old"), 5);
  put(join(sp, "proc", "tmp-new"), 1);
  put(join(sp, "test-tmp", "run-1", "f.txt"), 900);
  put(join(sp, ".cleanup-done"), 900, "21\n");
  put(join(sp, "run1.txt"), 900);
  put(join(sp, "pass2.mjs"), 900);
  put(join(sp, "tmp", "agg.py"), 900);
  put(join(sp, "tmp", "pylib", "notes.md"), 900);
  put(join(sp, "old-dump", "x.json"), 900);
  return { d, sp };
}

const listed = (res) => res.items.map((i) => [i.name, i.kind]).sort((a, b) => a[0].localeCompare(b[0]));

test("@important scanLayout: each mode lists exactly its set, never test-tmp/ or .cleanup-done, kind classified", () => {
  const { d, sp } = layout();
  assert.deepEqual(listed(scanLayout({ scratchpad: sp, mode: "phase", phase: "22", nowMs: NOW })), [
    ["phase-22/data/dump.json", "data"], ["phase-22/logs/run.txt", "data"],
    ["phase-22/loose.txt", "data"], ["phase-22/scripts/probe.mjs", "script"]]);
  assert.deepEqual(listed(scanLayout({ scratchpad: sp, mode: "adhoc", olderHours: 24, nowMs: NOW })), [
    ["adhoc/2026-09-18-probe", "script"], ["adhoc/2026-09-19-notes", "data"]]);
  assert.deepEqual(listed(scanLayout({ scratchpad: sp, mode: "proc", olderHours: 2, nowMs: NOW })), [
    ["proc/tmp-old", "data"]]);
  assert.deepEqual(listed(scanLayout({ scratchpad: sp, mode: "legacy", nowMs: NOW })), [
    ["old-dump", "data"], ["pass2.mjs", "script"], ["run1.txt", "data"],
    ["tmp/agg.py", "script"], ["tmp/pylib", "data"]]);
  rmSync(d, { recursive: true, force: true });
});

test("@important scanLayout: items carry the apply shape and a missing scratchpad is an error", () => {
  const { d, sp } = layout();
  const [it] = scanLayout({ scratchpad: sp, mode: "proc", olderHours: 2, nowMs: NOW }).items;
  assert.equal(it.absPath, join(sp, "proc", "tmp-old"));
  assert.deepEqual([it.size, it.mtimeMs, it.ageHours, it.category, it.reason], [1, NOW - 5 * HOUR, 5, "scratch", "scratch:proc/tmp-old"]);
  assert.deepEqual(scanLayout({ scratchpad: join(d, "nope"), mode: "legacy", nowMs: NOW }), { error: `no scratchpad at ${join(d, "nope")}` });
  rmSync(d, { recursive: true, force: true });
});

test("@important scanLayout: a folder whose only script sits behind a junction is data, sized without the target", () => {
  const { d, sp } = layout();
  const store = join(d, "store");
  put(join(store, "pkg", "index.mjs"), 100, "x".repeat(5000));
  const probe = join(sp, "adhoc", "2026-09-10-linked");
  put(join(probe, "notes.txt"), 100, "abc");
  symlinkSync(join(store, "pkg"), join(probe, "pkg"), "junction");
  const it = scanLayout({ scratchpad: sp, mode: "adhoc", olderHours: 0, nowMs: NOW + 10000 * HOUR }).items
    .find((i) => i.name === "adhoc/2026-09-10-linked");
  assert.equal(it.kind, "data");
  assert.ok(it.size < 5000, "target bytes not counted");
  rmSync(d, { recursive: true, force: true });
});

function project() {
  const d = mkdtempSync(join(tmpdir(), "pr-"));
  const src = join(d, ".claude", ".scratchpad", "phase-22", "scripts", "check.mjs");
  put(src, 1, "console.log(1)");
  return { d, src };
}
const args = (d, src, name = "check.mjs") => ({ project: d, src, name, purpose: "checks | things", usage: "node check.mjs", origin: "phase 22", nowMs: NOW });

test("@critical promote: moves the script and creates INDEX.md with its header and one row", () => {
  const { d, src } = project();
  const { dest } = promote(args(d, src));
  assert.equal(dest, join(d, ".claude", "tools", "check.mjs"));
  assert.equal(existsSync(src), false);
  assert.equal(readFileSync(dest, "utf8"), "console.log(1)");
  assert.equal(readFileSync(join(d, ".claude", "tools", "INDEX.md"), "utf8"),
    "| tool | purpose | usage | origin |\n|---|---|---|---|\n| check.mjs | checks \\| things | node check.mjs | phase 22, 2026-09-20 |\n");
  rmSync(d, { recursive: true, force: true });
});

test("@critical promote: never overwrites an existing tool and leaves the source in place", () => {
  const { d, src } = project();
  put(join(d, ".claude", "tools", "check.mjs"), 1, "original");
  assert.throws(() => promote(args(d, src)), /refusing to overwrite/);
  assert.equal(readFileSync(join(d, ".claude", "tools", "check.mjs"), "utf8"), "original");
  assert.equal(existsSync(src), true);
  assert.equal(existsSync(join(d, ".claude", "tools", "INDEX.md")), false);
  rmSync(d, { recursive: true, force: true });
});

test("@critical promote: appends the row on its own line to an index without a trailing newline", () => {
  const { d, src } = project();
  const index = join(d, ".claude", "tools", "INDEX.md");
  put(index, 1, "| tool | purpose | usage | origin |\n|---|---|---|---|\n| a.mjs | a | node a.mjs | adhoc, 2026-09-01 |");
  promote(args(d, src));
  assert.deepEqual(readFileSync(index, "utf8").split("\n").slice(2), [
    "| a.mjs | a | node a.mjs | adhoc, 2026-09-01 |", "| check.mjs | checks \\| things | node check.mjs | phase 22, 2026-09-20 |", ""]);
  rmSync(d, { recursive: true, force: true });
});

test("@critical promote: a name with a path separator is refused", () => {
  const { d, src } = project();
  assert.throws(() => promote(args(d, src, join("..", "evil.mjs"))), /invalid tool name/);
  assert.equal(existsSync(src), true);
  rmSync(d, { recursive: true, force: true });
});

test("@critical promote: a --src outside the project scratchpad is refused, nothing moved", () => {
  const { d } = project();
  const outside = join(d, "elsewhere.mjs");
  put(outside, 1, "console.log('outside')");
  assert.throws(() => promote(args(d, outside)), /outside the scratchpad/);
  assert.equal(existsSync(outside), true);
  assert.equal(existsSync(join(d, ".claude", "tools")), false);
  rmSync(d, { recursive: true, force: true });
});

test("@critical promote: a --src reached through a junction resolving outside the scratchpad is refused", () => {
  const { d } = project();
  const sp = join(d, ".claude", ".scratchpad");
  const outsideDir = join(d, "outside-store");
  put(join(outsideDir, "script.mjs"), 1, "console.log('linked')");
  mkdirSync(join(sp, "adhoc"), { recursive: true });
  const link = join(sp, "adhoc", "linked-dir");
  symlinkSync(outsideDir, link, "junction");
  const src = join(link, "script.mjs");
  assert.throws(() => promote(args(d, src)), /outside the scratchpad/);
  assert.equal(existsSync(src), true);
  assert.equal(existsSync(join(d, ".claude", "tools")), false);
  rmSync(d, { recursive: true, force: true });
});

test("@critical promote: a link sitting outside the scratchpad whose target resolves inside it is refused", () => {
  const { d, src } = project();
  const link = join(d, "foo.mjs");
  try { symlinkSync(src, link, "file"); } catch {
    symlinkSync(dirname(src), link, "junction");
  }
  assert.throws(() => promote(args(d, link)), /outside the scratchpad/);
  assert.equal(existsSync(link), true);
  assert.equal(existsSync(src), true);
  assert.equal(existsSync(join(d, ".claude", "tools")), false);
  rmSync(d, { recursive: true, force: true });
});

test("@critical promote atomicity: dest already exists leaves source, dest and any temp file untouched", () => {
  const { d, src } = project();
  const tools = join(d, ".claude", "tools");
  put(join(tools, "check.mjs"), 1, "original");
  assert.throws(() => promote(args(d, src)), /refusing to overwrite/);
  assert.equal(readFileSync(join(tools, "check.mjs"), "utf8"), "original");
  assert.equal(existsSync(src), true);
  assert.equal(existsSync(join(tools, "INDEX.md")), false);
  assert.deepEqual(readdirSync(tools).filter((f) => f.startsWith(".INDEX.md.tmp-")), []);
  rmSync(d, { recursive: true, force: true });
});

test("@critical promote atomicity: unable to create the tools directory leaves the source and nothing else touched", () => {
  const { d, src } = project();
  const tools = join(d, ".claude", "tools");
  put(tools, 1, "not a directory");
  assert.throws(() => promote(args(d, src)));
  assert.equal(existsSync(src), true);
  assert.equal(readFileSync(tools, "utf8"), "not a directory");
  rmSync(d, { recursive: true, force: true });
});

test("@critical promote atomicity: the final INDEX.md replace failing rolls the move back and leaves no dangling row", () => {
  const { d, src } = project();
  const tools = join(d, ".claude", "tools");
  const index = join(tools, "INDEX.md");
  const priorIndex = "| tool | purpose | usage | origin |\n|---|---|---|---|\n| a.mjs | a | node a.mjs | adhoc, 2026-09-01 |\n";
  put(index, 1, priorIndex);
  // Read-only makes the replacing renameSync fail with EPERM on Windows while the earlier read
  // of its content still succeeds — the deterministic stand-in for an editor/AV/indexer lock.
  chmodSync(index, 0o444);
  try {
    assert.throws(() => promote(args(d, src)));
    assert.equal(existsSync(src), true);
    assert.equal(readFileSync(src, "utf8"), "console.log(1)");
    assert.equal(existsSync(join(tools, "check.mjs")), false);
    assert.equal(readFileSync(index, "utf8"), priorIndex);
    assert.deepEqual(readdirSync(tools).filter((f) => f.startsWith(".INDEX.md.tmp-")), []);
  } finally { chmodSync(index, 0o666); }
  rmSync(d, { recursive: true, force: true });
});

test("@important promote: INDEX.md date is the local date, not the UTC date", () => {
  const { d, src } = project();
  const prevTz = process.env.TZ;
  process.env.TZ = "Pacific/Kiritimati"; // UTC+14: 23:00 UTC on the 19th is already the 20th locally
  try {
    promote({ ...args(d, src), nowMs: Date.UTC(2026, 8, 19, 23, 0, 0) });
  } finally { process.env.TZ = prevTz; }
  const index = readFileSync(join(d, ".claude", "tools", "INDEX.md"), "utf8");
  assert.match(index, /phase 22, 2026-09-20 \|\n$/);
  rmSync(d, { recursive: true, force: true });
});

test("@important scanLayout: a file whose mtime is within CLOCK_SKEW_MS ahead of nowMs is still listed, past that boundary it is not (BUG-003)", () => {
  const d = mkdtempSync(join(tmpdir(), "sp-"));
  const sp = join(d, ".scratchpad");
  const ahead = (p, ms) => { put(p, 0); utimesSync(p, (NOW + ms) / 1000, (NOW + ms) / 1000); };
  ahead(join(sp, "just-under.txt"), CLOCK_SKEW_MS - 1);
  ahead(join(sp, "at-boundary.txt"), CLOCK_SKEW_MS);
  ahead(join(sp, "past-boundary.txt"), CLOCK_SKEW_MS + 1);
  ahead(join(sp, "phase-22", "data", "fresh.json"), CLOCK_SKEW_MS);
  assert.deepEqual(listed(scanLayout({ scratchpad: sp, mode: "legacy", nowMs: NOW })),
    [["at-boundary.txt", "data"], ["just-under.txt", "data"]]);
  assert.deepEqual(listed(scanLayout({ scratchpad: sp, mode: "phase", phase: "22", nowMs: NOW })), [["phase-22/data/fresh.json", "data"]]);
  rmSync(d, { recursive: true, force: true });
});

test("@important scanLayout: the skew tolerance does not widen the adhoc/proc age threshold", () => {
  const d = mkdtempSync(join(tmpdir(), "sp-"));
  const sp = join(d, ".scratchpad");
  put(join(sp, "proc", "one-hour"), 1);
  put(join(sp, "proc", "just-under"), 2 - 1 / 3600);
  put(join(sp, "proc", "at-threshold"), 2);
  put(join(sp, "adhoc", "2026-09-19-x", "n.txt"), 23);
  assert.deepEqual(listed(scanLayout({ scratchpad: sp, mode: "proc", olderHours: 2, nowMs: NOW })), [["proc/at-threshold", "data"]]);
  assert.deepEqual(listed(scanLayout({ scratchpad: sp, mode: "adhoc", olderHours: 24, nowMs: NOW })), []);
  rmSync(d, { recursive: true, force: true });
});
