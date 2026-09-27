import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync, existsSync, symlinkSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "scratch-prune.mjs");
const HOUR = 3_600_000;
const U = (n) => `0000000${n}-0000-4000-8000-000000000000`;
const put = (p, hoursAgo = 0) => {
  mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, "abc");
  const t = new Date(Date.now() - hoursAgo * HOUR); utimesSync(p, t, t);
};

function sandbox() {
  const d = mkdtempSync(join(tmpdir(), "spc-"));
  const harness = join(d, "harness", "claude"), config = join(d, "config");
  mkdirSync(harness, { recursive: true }); mkdirSync(join(config, "sessions"), { recursive: true });
  const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8",
    env: { ...process.env, CLAUDE_CODE_TMPDIR: harness, CLAUDE_CONFIG_DIR: config } });
  const plan = (items, extra = {}) => { const f = join(d, "plan.json"); writeFileSync(f, JSON.stringify({ items, ...extra })); return f; };
  const register = (pid, uuid) => writeFileSync(join(config, "sessions", `${pid}.json`), JSON.stringify({ pid, sessionId: uuid }));
  return { d, harness, config, run, plan, register };
}
const itemOf = (absPath) => ({ absPath, size: 3, mtimeMs: statSync(absPath).isDirectory() ? undefined : statSync(absPath).mtimeMs, category: "scratch", reason: "t" });

test("@important scan --harness: this slug's sessions minus --current and fresh; --harness-all spans slugs", () => {
  const { d, harness, run } = sandbox();
  put(join(harness, "proj-a", U(1), "out.txt"), 5);
  put(join(harness, "proj-a", U(2), "out.txt"), 5);
  put(join(harness, "proj-a", U(3), "out.txt"), 0);
  put(join(harness, "proj-b", U(4), "out.txt"), 5);
  put(join(harness, "proj-a", "scratch", "out.txt"), 5);
  const names = (r) => { assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout).items.map((i) => i.name).sort(); };
  assert.deepEqual(names(run("scan", "--harness", "proj-a", "--current", U(2), "--older-hours", "2")), [`proj-a/${U(1)}`]);
  assert.deepEqual(names(run("scan", "--harness-all", "--current", U(2), "--older-hours", "2")), [`proj-a/${U(1)}`, `proj-b/${U(4)}`]);
  rmSync(d, { recursive: true, force: true });
});

test("@critical apply: trash mode moves scratchpad items and refuses any item outside <scratchpad>, junction included", () => {
  const { d, config, run, plan } = sandbox();
  const sp = join(d, "p", ".claude", ".scratchpad");
  const inside = join(sp, "adhoc", "x.txt"); put(inside, 30);
  const outside = join(d, "p", "src.txt"); put(outside, 30);
  const target = join(d, "p", "keep"); put(join(target, "k.txt"), 30);
  const link = join(sp, "adhoc", "link"); symlinkSync(target, link, "junction");

  let r = run("apply", "--plan", plan([itemOf(inside), itemOf(outside)], { scratchpad: sp }));
  assert.equal(r.status, 2); assert.match(r.stderr, /outside/);
  r = run("apply", "--plan", plan([{ absPath: link, size: 3, category: "scratch", reason: "t" }]), "--scratchpad", sp);
  assert.equal(r.status, 2);
  r = run("apply", "--plan", plan([itemOf(inside)]), "--scratchpad", join(d, "p"));
  assert.equal(r.status, 1);
  const sibling = join(d, "p", ".claude", ".scratchpad2", "x.txt"); put(sibling, 30);
  r = run("apply", "--plan", plan([itemOf(inside), itemOf(sibling)], { scratchpad: sp }));
  assert.equal(r.status, 2); assert.match(r.stderr, /outside/);
  assert.ok(existsSync(inside) && existsSync(outside) && existsSync(join(target, "k.txt")) && existsSync(sibling));

  r = run("apply", "--plan", plan([itemOf(inside)], { scratchpad: sp }));
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /Moved 1 items/);
  assert.equal(existsSync(inside), false);
  assert.ok(existsSync(join(config, ".cleanup-trash")));
  rmSync(d, { recursive: true, force: true });
});

test("@important apply: --scratchpad reached through an ancestor junction is recognized", () => {
  const { d, config, run, plan } = sandbox();
  const realProject = join(d, "real-project", ".claude", ".scratchpad");
  const inside = join(realProject, "adhoc", "x.txt"); put(inside, 30);
  const junctionParent = join(d, "via-junction");
  symlinkSync(join(d, "real-project"), junctionParent, "junction");
  const viaJunction = join(junctionParent, ".claude", ".scratchpad");
  const r = run("apply", "--plan", plan([itemOf(inside)], { scratchpad: viaJunction }));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(existsSync(inside), false);
  assert.ok(existsSync(join(config, ".cleanup-trash")));
  rmSync(d, { recursive: true, force: true });
});

function relocatedScratchpad(t) {
  const s = sandbox();
  const target = join(s.d, "relocated-elsewhere");
  mkdirSync(target, { recursive: true });
  const sp = join(s.d, "proj", ".claude", ".scratchpad");
  mkdirSync(dirname(sp), { recursive: true });
  try { symlinkSync(target, sp, "junction"); } catch (err) { rmSync(s.d, { recursive: true, force: true }); t.skip(`cannot create a directory link: ${err.code}`); return null; }
  return { ...s, sp, target };
}

test("@critical apply: a .scratchpad that is itself a link to another directory has its items accepted", (t) => {
  const s = relocatedScratchpad(t); if (!s) return;
  const viaLink = join(s.sp, "adhoc", "x.txt"); put(viaLink, 30);
  const r = s.run("apply", "--plan", s.plan([itemOf(viaLink)], { scratchpad: s.sp }));
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /Moved 1 items/);
  assert.equal(existsSync(join(s.target, "adhoc", "x.txt")), false);
  assert.ok(existsSync(join(s.config, ".cleanup-trash")));
  rmSync(s.d, { recursive: true, force: true });
});

test("@important apply: in a relocated .scratchpad, a missing item is skipped and a present one still moves", (t) => {
  const s = relocatedScratchpad(t); if (!s) return;
  const present = join(s.sp, "adhoc", "x.txt"); put(present, 30);
  const gone = join(s.sp, "adhoc", "gone.txt");
  const r = s.run("apply", "--plan", s.plan([itemOf(present), { absPath: gone, size: 3, mtimeMs: 0, category: "scratch", reason: "t" }], { scratchpad: s.sp }));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Moved 1 items/); assert.match(r.stdout, /skipped 1\./);
  assert.equal(existsSync(join(s.target, "adhoc", "x.txt")), false);
  rmSync(s.d, { recursive: true, force: true });
});

test("@critical apply: in a relocated .scratchpad, an item that is a link pointing outside it is refused", (t) => {
  const s = relocatedScratchpad(t); if (!s) return;
  const victim = join(s.d, "victim"); put(join(victim, "v.txt"), 30);
  const link = join(s.sp, "adhoc", "link");
  mkdirSync(dirname(link), { recursive: true }); symlinkSync(victim, link, "junction");
  const r = s.run("apply", "--plan", s.plan([{ absPath: link, size: 3, category: "scratch", reason: "t" }], { scratchpad: s.sp }));
  assert.equal(r.status, 2); assert.match(r.stderr, /outside/);
  assert.ok(existsSync(join(victim, "v.txt")) && existsSync(link));
  assert.equal(existsSync(join(s.config, ".cleanup-trash")), false);
  rmSync(s.d, { recursive: true, force: true });
});

test("@critical apply --purge-now: deletes harness session dirs and refuses anything else, junction included", () => {
  const { d, harness, run, plan } = sandbox();
  const s1 = join(harness, "proj-a", U(1)); put(join(s1, "out.txt"), 30);
  const victim = join(d, "victim"); put(join(victim, "v.txt"), 5);
  const link = join(harness, "proj-a", U(2)); symlinkSync(victim, link, "junction");
  const slugDir = join(harness, "proj-a");
  const nonSession = join(harness, "proj-a", "scratch"); put(join(nonSession, "n.txt"), 5);
  const dirItem = (absPath) => ({ absPath, size: 3, category: "temp", reason: "t" });

  for (const bad of [victim, link, slugDir, nonSession]) {
    const r = run("apply", "--purge-now", "--plan", plan([dirItem(s1), dirItem(bad)]));
    assert.equal(r.status, 2, bad); assert.match(r.stderr, /harness temp root/);
  }
  assert.ok(existsSync(join(s1, "out.txt")) && existsSync(join(victim, "v.txt")) && existsSync(join(nonSession, "n.txt")));

  const r = run("apply", "--purge-now", "--plan", plan([dirItem(s1)]));
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /Deleted 1 items/);
  assert.equal(existsSync(s1), false);
  rmSync(d, { recursive: true, force: true });
});

const deadPid = () => spawnSync(process.execPath, ["-e", ""]).pid;
const scanJson = (r) => { assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
const names = (r) => scanJson(r).items.map((i) => i.name).sort();

test("@critical scan --harness / --harness-all: a session live in the registry is never listed, whatever its age", () => {
  const { d, harness, run, register } = sandbox();
  put(join(harness, "proj-a", U(1), "out.txt"), 1000);
  put(join(harness, "proj-a", U(2), "out.txt"), 1000);
  put(join(harness, "proj-b", U(3), "out.txt"), 1000);
  register(process.pid, U(1)); register(process.ppid, U(3)); register(deadPid(), U(2));
  assert.deepEqual(names(run("scan", "--harness", "proj-a", "--current", U(9))), [`proj-a/${U(2)}`]);
  assert.deepEqual(names(run("scan", "--harness-all", "--current", U(9), "--older-hours", "0")), [`proj-a/${U(2)}`]);
  rmSync(d, { recursive: true, force: true });
});

test("@important scan --harness: inactive sessions listed only past 24 h by default; the current one never; registry reported ok", () => {
  const { d, harness, run } = sandbox();
  put(join(harness, "proj-a", U(1), "out.txt"), 25);
  put(join(harness, "proj-a", U(2), "out.txt"), 23);
  put(join(harness, "proj-a", U(3), "out.txt"), 100);
  const j = scanJson(run("scan", "--harness", "proj-a", "--current", U(3)));
  assert.equal(j.registry, "ok");
  assert.deepEqual(j.items.map((i) => i.name), [`proj-a/${U(1)}`]);
  rmSync(d, { recursive: true, force: true });
});

test("@important scan --harness: a missing or unparsable registry lists no session and reports registry unavailable", () => {
  const { d, harness, config, run } = sandbox();
  put(join(harness, "proj-a", U(1), "out.txt"), 100);
  writeFileSync(join(config, "sessions", "1.json"), "{ truncated");
  let j = scanJson(run("scan", "--harness-all", "--current", U(9)));
  assert.deepEqual([j.registry, j.items], ["unavailable", []]);
  rmSync(join(config, "sessions"), { recursive: true, force: true });
  j = scanJson(run("scan", "--harness", "proj-a", "--current", U(9)));
  assert.deepEqual([j.registry, j.items], ["unavailable", []]);
  rmSync(d, { recursive: true, force: true });
});

test("@important scan: more than one scan-mode flag is refused, naming the conflicting flags", () => {
  const { d, run } = sandbox();
  const sp = join(d, "p", ".claude", ".scratchpad");
  let r = run("scan", "--scratchpad", sp, "--adhoc", "--proc");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /conflicting scan modes:.*--adhoc.*--proc/);
  r = run("scan", "--harness", "proj-a", "--harness-all");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /conflicting scan modes:.*--harness.*--harness-all/);
  rmSync(d, { recursive: true, force: true });
});

test("@important promote: --origin must match \"phase <NN>\", \"adhoc\", or \"legacy\"", () => {
  const { d, run } = sandbox();
  const project = join(d, "p");
  const src = join(project, ".claude", ".scratchpad", "adhoc", "check.mjs");
  put(src);
  let r = run("promote", "--project", project, "--src", src, "--name", "check.mjs",
    "--purpose", "p", "--usage", "u", "--origin", "bogus");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--origin/);
  assert.equal(existsSync(src), true);

  r = run("promote", "--project", project, "--src", src, "--name", "check.mjs",
    "--purpose", "p", "--usage", "u", "--origin", "phase 22");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(existsSync(join(project, ".claude", "tools", "check.mjs")), true);
  rmSync(d, { recursive: true, force: true });
});

test("@important an empty --current is rejected with exit 1", () => {
  const { d, run } = sandbox();
  for (const v of ["", "  "]) {
    const r = run("scan", "--harness", "proj-a", "--current", v);
    assert.equal(r.status, 1); assert.match(r.stderr, /--current/);
  }
  rmSync(d, { recursive: true, force: true });
});

test("@critical apply --purge-now: skips an item that became active or fresh since the scan", () => {
  const { d, harness, run, plan, register } = sandbox();
  const dirs = [1, 2, 3].map((n) => join(harness, "proj-a", U(n)));
  for (const s of dirs) put(join(s, "out.txt"), 30);
  const scanned = scanJson(run("scan", "--harness", "proj-a", "--current", U(9))).items;
  assert.equal(scanned.length, 3);
  register(process.pid, U(1));
  put(join(dirs[1], "out.txt"), 1);
  const stale = scanned.map((i) => (i.uuid === U(2) ? { ...i, mtimeMs: statSync(join(dirs[1], "out.txt")).mtimeMs } : i));
  const r = run("apply", "--purge-now", "--plan", plan(stale));
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /Deleted 1 items.*skipped 2/);
  assert.deepEqual(dirs.map(existsSync), [true, true, false]);
  rmSync(d, { recursive: true, force: true });
});

test("@important scan --harness with an empty, bare or `=`-empty slug is rejected with exit 1", () => {
  const { d, harness, run } = sandbox();
  put(join(harness, "proj-a", U(1), "out.txt"), 30);
  for (const args of [["--harness", ""], ["--harness", "  "], ["--harness=", "--current", U(2)], ["--current", U(2), "--harness"]]) {
    const r = run("scan", ...args, ...(args.includes("--current") ? [] : ["--current", U(2)]));
    assert.equal(r.status, 1, args.join(" ")); assert.match(r.stderr, /--harness requires a non-empty project slug/);
    assert.equal(r.stdout, "");
  }
  rmSync(d, { recursive: true, force: true });
});
