import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync, readFileSync, readdirSync, existsSync, symlinkSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { promote } from "./scratch-prune-lib.mjs";

// Fixed regardless of the host machine's timezone: promote()'s INDEX.md date is a local-getter
// date, and NOW below is UTC midnight, so a non-UTC host would otherwise compute a different day.
process.env.TZ = "UTC";
const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 8, 20);
const put = (p, hoursAgo, body = "x") => {
  mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, body);
  const t = new Date(NOW - hoursAgo * HOUR); utimesSync(p, t, t);
};






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



