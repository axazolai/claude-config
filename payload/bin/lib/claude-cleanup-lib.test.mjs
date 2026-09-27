import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, mkdirSync as mkd, writeFileSync, writeFileSync as wf, utimesSync, rmSync, existsSync, statSync, readFileSync, symlinkSync, lstatSync, realpathSync, readdirSync } from "node:fs";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join, dirname, sep } from "node:path";
import { DAY_MS, activeInstallPaths, pluginPruneCandidates, buildPlan, applyPlan, restoreBatch, purgeRetention, trashRoot, copyMoveNoFollow, newestMtime, dirSize, partialWarnings } from "./claude-cleanup-lib.mjs";

const tmp = () => mkdtempSync(join(tmpdir(), "cc-"));
const setMtime = (p, ms) => utimesSync(p, new Date(ms), new Date(ms));
const UUID = "05b6d095-deef-4e70-875e-8fcff99484fe";
const UUID2 = "11111111-2222-3333-4444-555555555555";

test("@important pluginPruneCandidates keeps active installPaths, trashes the rest, keeps project-scope", () => {
  const d = tmp();
  const cache = join(d, "plugins", "cache", "mkt", "sp");
  for (const v of ["6.1.1", "6.2.0"]) mkd(join(cache, v), { recursive: true });
  const projCache = join(d, "plugins", "cache", "mkt", "kotlin-lsp", "1.0.0");
  mkd(projCache, { recursive: true });
  mkd(join(d, "plugins"), { recursive: true });
  wf(join(d, "plugins", "installed_plugins.json"), JSON.stringify({ plugins: {
    "sp@mkt": [{ scope: "user", installPath: join(cache, "6.2.0") }],
    "kotlin-lsp@mkt": [{ scope: "project", installPath: projCache }],
  }}));
  const cand = pluginPruneCandidates(d);
  assert.deepEqual(cand, [join(cache, "6.1.1")]);          // only the stale version
  rmSync(d, { recursive: true, force: true });
});

test("@critical pluginPruneCandidates fail-safe: missing manifest → [] (never guess)", () => {
  const d = tmp(); mkd(join(d, "plugins", "cache", "mkt", "sp", "6.2.0"), { recursive: true });
  assert.deepEqual(pluginPruneCandidates(d), []);
  assert.equal(activeInstallPaths(d), null);
  rmSync(d, { recursive: true, force: true });
});

test("@critical activeInstallPaths fail-safe: manifest missing `plugins` key → null (not empty Set), pluginPruneCandidates → []", () => {
  const d = tmp();
  const cache = join(d, "plugins", "cache", "mkt", "sp", "6.2.0");
  mkd(cache, { recursive: true });
  mkd(join(d, "plugins"), { recursive: true });
  wf(join(d, "plugins", "installed_plugins.json"), JSON.stringify({})); // no `plugins` key
  assert.equal(activeInstallPaths(d), null);
  assert.deepEqual(pluginPruneCandidates(d), []);
  rmSync(d, { recursive: true, force: true });
});

function fakeTree() {
  const d = tmp(); const now = 1000 * DAY_MS;
  const mk = (p) => (mkdirSync(dirname(p), { recursive: true }), writeFileSync(p, "x"), p);
  const age = (p, days) => setMtime(p, now - days * DAY_MS);
  // ephemeral: old one is swept, a fresh (<7d) one is guarded (protects the running session)
  age(mk(join(d, "paste-cache", "p1")), 30);
  age(mk(join(d, "paste-cache", "p-recent")), 1);
  // memory MUST be preserved
  mk(join(d, "projects", "slug", "memory", "MEMORY.md"));
  // sessions: one old (auto), one mid (list), one fresh (keep)
  age(mk(join(d, "projects", "slug", `${UUID}.jsonl`)), 30);       // auto
  age(mk(join(d, "projects", "slug", UUID, "data")), 30);          // its dir
  age(mk(join(d, "projects", "slug", `${UUID2}.jsonl`)), 10);      // list
  age(mk(join(d, "projects", "slug", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl")), 2); // keep
  return { d, now };
}

test("@critical buildPlan: auto sessions trashed, mid listed, fresh kept, memory never touched, ephemeral trashed", () => {
  const { d, now } = fakeTree();
  const plan = buildPlan({ dir: d, tempRoot: join(d, "__notemp"), nowMs: now, excludeUuids: [] });
  const paths = plan.items.map((i) => i.absPath);
  assert.ok(paths.some((p) => p.endsWith(join("paste-cache", "p1"))), "old ephemeral trashed");
  assert.ok(!paths.some((p) => p.endsWith(join("paste-cache", "p-recent"))), "recent (<7d) ephemeral guarded — protects running session");
  assert.ok(paths.some((p) => p.endsWith(`${UUID}.jsonl`)), "auto session .jsonl trashed");
  assert.ok(paths.some((p) => p.endsWith(join("slug", UUID))), "auto session dir trashed");
  assert.ok(!paths.some((p) => p.includes(`${sep}memory${sep}`) || p.endsWith("memory")), "memory NEVER in plan");
  assert.ok(!plan.items.concat(plan.listCheck).some((i) => i.absPath.includes("aaaaaaaa-bbbb")), "fresh session kept");
  assert.ok(plan.listCheck.some((i) => i.absPath.includes(UUID2)), "mid session in listCheck");
  rmSync(d, { recursive: true, force: true });
});

test("@critical buildPlan: excludeUuids keeps a matching session even if old", () => {
  const { d, now } = fakeTree();
  const plan = buildPlan({ dir: d, tempRoot: join(d, "__notemp"), nowMs: now, excludeUuids: [UUID] });
  assert.ok(!plan.items.some((i) => i.absPath.includes(UUID) && !i.absPath.includes("memory")), "excluded uuid not trashed");
  rmSync(d, { recursive: true, force: true });
});

test("@critical buildPlan: temp dir respects excludeUuids", () => {
  const d = tmp(); const now = 1000 * DAY_MS;
  const tempRoot = join(d, "__temp");
  const tempDir = join(tempRoot, "slug", UUID, "scratchpad");
  mkdirSync(tempDir, { recursive: true });
  const f = join(tempDir, "file.txt"); writeFileSync(f, "x"); setMtime(f, now - 30 * DAY_MS);
  mkdirSync(join(d, "sessions"));

  const withoutExclude = buildPlan({ dir: d, tempRoot, nowMs: now, excludeUuids: [] });
  const allWithout = withoutExclude.items.concat(withoutExclude.listCheck);
  assert.ok(allWithout.some((i) => i.category === "temp" && i.absPath.includes(UUID)), "old temp dir proposed without excludes");
  assert.ok(withoutExclude.items.some((i) => i.category === "temp" && i.absPath.includes(UUID)), "old temp dir lands in items (auto bucket)");

  const withExclude = buildPlan({ dir: d, tempRoot, nowMs: now, excludeUuids: [UUID] });
  const allWith = withExclude.items.concat(withExclude.listCheck);
  assert.ok(!allWith.some((i) => i.absPath.includes(UUID)), "excluded temp uuid absent from the whole plan");
  rmSync(d, { recursive: true, force: true });
});

test("@critical buildPlan: an active session's temp dir is never proposed; an unavailable registry proposes no temp dir", () => {
  const d = tmp(); const now = 1000 * DAY_MS;
  const tempRoot = join(d, "__temp");
  for (const u of [UUID, UUID2]) {
    const f = join(tempRoot, "slug", u, "file.txt"); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, "x"); setMtime(f, now - 30 * DAY_MS);
  }
  const temps = () => { const p = buildPlan({ dir: d, tempRoot, nowMs: now }); return p.items.concat(p.listCheck).filter((i) => i.category === "temp").map((i) => i.absPath); };
  assert.deepEqual(temps(), []);
  mkdirSync(join(d, "sessions"));
  writeFileSync(join(d, "sessions", `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: UUID }));
  assert.deepEqual(temps(), [join(tempRoot, "slug", UUID2)]);
  rmSync(d, { recursive: true, force: true });
});

test("@critical applyPlan moves items to a batch + manifest; restore puts them back", () => {
  const d = tmp(); const now = 1000 * DAY_MS;
  const victim = join(d, "logs", "old.log"); mkdirSync(dirname(victim), { recursive: true }); writeFileSync(victim, "data");
  const items = [{ absPath: victim, size: 4, category: "ephemeral", reason: "ephemeral:logs", mtimeMs: statSync(victim).mtimeMs, bucket: "auto" }];
  const res = applyPlan({ dir: d, items, nowMs: now, ts: "20260727T000000Z" });
  assert.equal(res.moved, 1); assert.ok(!existsSync(victim), "moved out of place");
  assert.ok(existsSync(join(res.batchDir, "manifest.json")));
  const rr = restoreBatch({ dir: d, ts: "20260727T000000Z" });
  assert.equal(rr.restored, 1); assert.ok(existsSync(victim), "restored to original path");
  rmSync(d, { recursive: true, force: true });
});

test("@critical applyPlan TOCTOU: item whose mtime changed since scan is skipped", () => {
  const d = tmp(); const now = 1000 * DAY_MS;
  const v = join(d, "logs", "x"); mkdirSync(dirname(v), { recursive: true }); writeFileSync(v, "d");
  const items = [{ absPath: v, size: 1, category: "ephemeral", reason: "r", mtimeMs: statSync(v).mtimeMs - 999, bucket: "auto" }]; // stale recorded mtime
  const res = applyPlan({ dir: d, items, nowMs: now, ts: "T1" });
  assert.equal(res.skipped, 1); assert.equal(res.moved, 0); assert.ok(existsSync(v), "left in place");
  rmSync(d, { recursive: true, force: true });
});

test("@critical applyPlan writes manifest unconditionally and never orphans moved siblings when one item's move throws", () => {
  const d = tmp(); const now = 1000 * DAY_MS;
  const ts = "T-orphan";
  const batchDir = join(trashRoot(d), ts);
  mkdirSync(batchDir, { recursive: true });
  writeFileSync(join(batchDir, "0"), "blocker"); // pre-occupy slot 0 as a file so moveInto's mkdirSync throws for the first item
  const bad = join(d, "logs", "bad"); mkdirSync(dirname(bad), { recursive: true }); writeFileSync(bad, "b");
  const good = join(d, "logs", "good"); writeFileSync(good, "g");
  const items = [
    { absPath: bad, size: 1, category: "ephemeral", reason: "r", mtimeMs: statSync(bad).mtimeMs, bucket: "auto" },
    { absPath: good, size: 1, category: "ephemeral", reason: "r", mtimeMs: statSync(good).mtimeMs, bucket: "auto" },
  ];
  const res = applyPlan({ dir: d, items, nowMs: now, ts });
  assert.equal(res.moved, 1); assert.equal(res.skipped, 1);
  assert.ok(existsSync(bad), "item whose move threw is left in place, not orphaned");
  assert.ok(!existsSync(good), "sibling item still moved despite the earlier throw");
  const manifestPath = join(res.batchDir, "manifest.json");
  assert.ok(existsSync(manifestPath), "manifest always written, even though one item threw");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.entries.length, 1);
  assert.equal(manifest.entries[0].originalAbsPath, good);
  rmSync(d, { recursive: true, force: true });
});

test("@critical purgeRetention removes only batches older than retentionDays", () => {
  const d = tmp(); const now = 1000 * DAY_MS;
  const root = trashRoot(d); mkdirSync(join(root, "old"), { recursive: true }); mkdirSync(join(root, "new"), { recursive: true });
  writeFileSync(join(root, "old", "manifest.json"), JSON.stringify({ ts: "old", entries: [] }));
  writeFileSync(join(root, "new", "manifest.json"), JSON.stringify({ ts: "new", entries: [] }));
  setMtime(join(root, "old"), now - 10 * DAY_MS); setMtime(join(root, "old", "manifest.json"), now - 10 * DAY_MS);
  setMtime(join(root, "new"), now - 1 * DAY_MS); setMtime(join(root, "new", "manifest.json"), now - 1 * DAY_MS);
  const removed = purgeRetention({ dir: d, nowMs: now, retentionDays: 7 });
  assert.deepEqual(removed, ["old"]); assert.ok(!existsSync(join(root, "old")) && existsSync(join(root, "new")));
  rmSync(d, { recursive: true, force: true });
});

test("@critical cross-device fallback moves a nested or top-level junction as a link and never touches its target", () => {
  const d = tmp();
  const store = join(d, "store"); mkdirSync(join(store, "pkg"), { recursive: true });
  writeFileSync(join(store, "pkg", "index.js"), "shared");
  const src = join(d, "proc", "probe"); mkdirSync(join(src, "node_modules"), { recursive: true });
  writeFileSync(join(src, "own.txt"), "own");
  symlinkSync(join(store, "pkg"), join(src, "node_modules", "pkg"), "junction");
  const topLink = join(d, "proc", "top-link"); symlinkSync(store, topLink, "junction");
  const dest = join(d, "trash", "0", "probe"); mkdirSync(dirname(dest), { recursive: true });
  copyMoveNoFollow(src, dest);
  const topDest = join(d, "trash", "1", "top-link"); mkdirSync(dirname(topDest), { recursive: true });
  copyMoveNoFollow(topLink, topDest);
  assert.ok(!existsSync(src) && !existsSync(topLink));
  assert.equal(readFileSync(join(dest, "own.txt"), "utf8"), "own");
  const movedLink = join(dest, "node_modules", "pkg");
  assert.ok(lstatSync(movedLink).isSymbolicLink() && lstatSync(topDest).isSymbolicLink());
  assert.equal(realpathSync(movedLink), realpathSync(join(store, "pkg")));
  assert.equal(realpathSync(topDest), realpathSync(store));
  assert.deepEqual(readdirSync(store), ["pkg"]);
  assert.deepEqual(readdirSync(join(store, "pkg")), ["index.js"]);
  assert.equal(readFileSync(join(store, "pkg", "index.js"), "utf8"), "shared");
  rmSync(d, { recursive: true, force: true });
});

function patchFs(name, make) {
  const orig = fs[name]; fs[name] = make(orig); syncBuiltinESMExports();
  return () => { fs[name] = orig; syncBuiltinESMExports(); };
}
const errno = (code) => Object.assign(new Error(code), { code });
function trashTree(d, extra = () => {}) {
  const src = join(d, "logs", "item");
  mkdirSync(join(src, "sub"), { recursive: true });
  extra(src);
  writeFileSync(join(src, "a.txt"), "aaaa"); writeFileSync(join(src, "b.txt"), "bb");
  writeFileSync(join(src, "sub", "c.txt"), "cccccc"); writeFileSync(join(src, "sub", "d.txt"), "d");
  const items = [{ absPath: src, size: 13, category: "ephemeral", reason: "r", mtimeMs: newestMtime(src), bucket: "auto" }];
  return { src, items };
}
const snapshot = (root) => {
  const out = {};
  const walk = (p, rel) => { for (const e of readdirSync(p)) { const q = join(p, e), r = rel ? `${rel}/${e}` : e; const st = lstatSync(q); if (st.isSymbolicLink()) continue; if (st.isDirectory()) walk(q, r); else out[r] = readFileSync(q, "utf8"); } };
  walk(root, ""); return out;
};
const ORIGINAL = { "a.txt": "aaaa", "b.txt": "bb", "sub/c.txt": "cccccc", "sub/d.txt": "d" };
const manifestOf = (res) => JSON.parse(readFileSync(join(res.batchDir, "manifest.json"), "utf8"));

test("@critical same-device trash is a plain rename: no copy happens, item moved and restorable", () => {
  const d = tmp(); const { src, items } = trashTree(d);
  const unpatch = patchFs("copyFileSync", () => () => { throw errno("EPERM"); });
  let res; try { res = applyPlan({ dir: d, items, nowMs: 1, ts: "T-same" }); } finally { unpatch(); }
  assert.equal(res.moved, 1); assert.ok(!existsSync(src));
  assert.deepEqual(snapshot(join(res.batchDir, "0", "item")), ORIGINAL);
  assert.equal(restoreBatch({ dir: d, ts: "T-same" }).restored, 1);
  assert.deepEqual(snapshot(src), ORIGINAL);
  rmSync(d, { recursive: true, force: true });
});

test("@critical cross-device trash copies the whole item, removes the source, records it, and restores it", () => {
  const d = tmp();
  const store = join(d, "store"); mkdirSync(store); writeFileSync(join(store, "shared.js"), "shared");
  const { src, items } = trashTree(d, (s) => symlinkSync(store, join(s, "link"), "junction"));
  const unpatch = patchFs("renameSync", () => () => { throw errno("EXDEV"); });
  let res, rr;
  let recorded;
  try {
    res = applyPlan({ dir: d, items, nowMs: 1, ts: "T-xdev" });
    assert.ok(!existsSync(src), "source removed");
    recorded = manifestOf(res).entries.map((e) => e.originalAbsPath);
    rr = restoreBatch({ dir: d, ts: "T-xdev" });
  } finally { unpatch(); }
  assert.equal(res.moved, 1); assert.equal(res.skipped, 0);
  assert.deepEqual(recorded, [src]);
  assert.equal(rr.restored, 1);
  assert.deepEqual(snapshot(src), ORIGINAL);
  assert.ok(lstatSync(join(src, "link")).isSymbolicLink());
  assert.deepEqual(readdirSync(store), ["shared.js"]);
  rmSync(d, { recursive: true, force: true });
});

test("@critical cross-device copy that fails verification leaves the source intact and records nothing", () => {
  const d = tmp(); const { src, items } = trashTree(d);
  const unRename = patchFs("renameSync", () => () => { throw errno("EXDEV"); });
  const unCopy = patchFs("copyFileSync", (orig) => (a, b) => { orig(a, b); if (a.endsWith("c.txt")) fs.writeFileSync(b, "c"); });
  let res; try { res = applyPlan({ dir: d, items, nowMs: 1, ts: "T-verify" }); } finally { unCopy(); unRename(); }
  assert.equal(res.moved, 0); assert.equal(res.skipped, 1);
  assert.deepEqual(snapshot(src), ORIGINAL);
  assert.deepEqual(manifestOf(res).entries, []);
  assert.ok(!existsSync(join(res.batchDir, "0", "item")), "partial destination removed");
  rmSync(d, { recursive: true, force: true });
});

test("@critical cross-device copy failing on the Nth child: source intact, partial dest gone, skipped, restore/purge unaffected", () => {
  const d = tmp(); const { src, items } = trashTree(d);
  const unRename = patchFs("renameSync", () => () => { throw errno("EXDEV"); });
  let n = 0;
  const unCopy = patchFs("copyFileSync", (orig) => (a, b) => { if (++n === 3) throw errno("EPERM"); orig(a, b); });
  let res; try { res = applyPlan({ dir: d, items, nowMs: 1, ts: "T-eperm" }); } finally { unCopy(); unRename(); }
  assert.equal(n, 3);
  assert.equal(res.moved, 0); assert.equal(res.skipped, 1);
  assert.deepEqual(snapshot(src), ORIGINAL);
  assert.deepEqual(manifestOf(res).entries, []);
  assert.ok(!existsSync(join(res.batchDir, "0", "item")), "partial destination removed");
  assert.deepEqual(restoreBatch({ dir: d, ts: "T-eperm" }), { restored: 0, skipped: 0 });
  purgeRetention({ dir: d, nowMs: Date.now() + 30 * DAY_MS, retentionDays: 7 });
  assert.deepEqual(snapshot(src), ORIGINAL);
  rmSync(d, { recursive: true, force: true });
});

test("@critical cross-device source delete failing part-way heals the source from the verified copy and skips the item", () => {
  const d = tmp(); const { src, items } = trashTree(d);
  const unRename = patchFs("renameSync", () => () => { throw errno("EXDEV"); });
  const unUnlink = patchFs("unlinkSync", (orig) => (p) => { if (String(p).endsWith("c.txt") && String(p).startsWith(src)) throw errno("EBUSY"); orig(p); });
  let res; try { res = applyPlan({ dir: d, items, nowMs: 1, ts: "T-del" }); } finally { unUnlink(); unRename(); }
  assert.equal(res.moved, 0); assert.equal(res.skipped, 1);
  assert.deepEqual(snapshot(src), ORIGINAL);
  assert.deepEqual(manifestOf(res).entries, []);
  assert.ok(!existsSync(join(res.batchDir, "0", "item")));
  rmSync(d, { recursive: true, force: true });
});

test("@critical cross-device source delete and heal both failing keeps, records and warns about the verified copy", () => {
  const d = tmp(); const { src, items } = trashTree(d);
  const unRename = patchFs("renameSync", () => () => { throw errno("EXDEV"); });
  let deleting = false;
  const unUnlink = patchFs("unlinkSync", (orig) => (p) => { deleting = true; if (String(p).endsWith("c.txt") && String(p).startsWith(src)) throw errno("EBUSY"); orig(p); });
  const unCopy = patchFs("copyFileSync", (orig) => (a, b) => { if (deleting) throw errno("ENOSPC"); orig(a, b); });
  let res; try { res = applyPlan({ dir: d, items, nowMs: 1, ts: "T-heal" }); } finally { unCopy(); unUnlink(); unRename(); }
  assert.equal(res.moved, 1);
  const copy = join(res.batchDir, "0", "item");
  assert.deepEqual(manifestOf(res).entries.map((e) => [e.originalAbsPath, e.partial]), [[src, true]]);
  assert.deepEqual(res.partials, [{ originalAbsPath: src, copyPath: copy }]);
  const [warning] = partialWarnings(res);
  assert.ok(warning.startsWith("WARNING:") && warning.includes(src) && warning.includes(copy));
  assert.deepEqual(snapshot(copy), ORIGINAL);
  assert.deepEqual(snapshot(src), { "sub/c.txt": "cccccc", "sub/d.txt": "d" }, "source remnant stays in place");
  assert.deepEqual(restoreBatch({ dir: d, ts: "T-heal" }), { restored: 0, skipped: 1 });
  assert.deepEqual(snapshot(copy), ORIGINAL, "batch kept after the skipped restore");
  rmSync(d, { recursive: true, force: true });
});

test("@important newestMtime and dirSize treat a junction as a leaf and never read its target", () => {
  const d = tmp(); const now = Date.now() + 100 * DAY_MS;
  const store = join(d, "store"); mkdirSync(store); writeFileSync(join(store, "big.bin"), "x".repeat(5000));
  setMtime(join(store, "big.bin"), now);
  const item = join(d, "item"); mkdirSync(item); writeFileSync(join(item, "own.txt"), "own");
  setMtime(join(item, "own.txt"), now - 20 * DAY_MS);
  symlinkSync(store, join(item, "link"), "junction");
  assert.ok(dirSize(item) < 5000, "target bytes not counted");
  assert.ok(newestMtime(item) < now - DAY_MS, "target mtime not used");
  rmSync(d, { recursive: true, force: true });
});
