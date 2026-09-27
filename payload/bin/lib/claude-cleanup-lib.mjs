// Pure engine for /claude-cleanup. Allowlist-based: only ever proposes paths under enumerated
// category roots, so "never touch" (memory/, config, venvs) holds by construction.
import { existsSync, readFileSync, readdirSync, statSync, lstatSync, mkdirSync, renameSync, rmSync, rmdirSync,
  writeFileSync, copyFileSync, readlinkSync, symlinkSync, unlinkSync } from "node:fs";
import { join, basename, dirname, resolve } from "node:path";
import { homedir } from "node:os";

export const DAY_MS = 86_400_000;
export const KEEP_DAYS = 7;
export const AUTO_DAYS = 14;
export const RETENTION_DAYS = 7;

export function claudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
}

export function newestMtime(path) {
  let newest = 0;
  const walk = (p) => {
    let st; try { st = lstatSync(p); } catch { return; }
    if (st.isDirectory()) {
      let ents = []; try { ents = readdirSync(p); } catch { return; }
      if (ents.length === 0) { if (st.mtimeMs > newest) newest = st.mtimeMs; return; } // empty dir: fall back to its own mtime
      for (const e of ents) walk(join(p, e));
    } else if (st.mtimeMs > newest) newest = st.mtimeMs;
  };
  walk(path);
  return newest;
}

export function dirSize(path) {
  let total = 0;
  const walk = (p) => {
    let st; try { st = lstatSync(p); } catch { return; }
    if (st.isDirectory()) { let ents = []; try { ents = readdirSync(p); } catch { return; } for (const e of ents) walk(join(p, e)); }
    else total += st.size;
  };
  walk(path);
  return total;
}

// < KEEP_DAYS → keep; [KEEP_DAYS, AUTO_DAYS] → list; > AUTO_DAYS → auto
export function ageBucket(mtimeMs, nowMs) {
  const ageDays = (nowMs - mtimeMs) / DAY_MS;
  if (ageDays < KEEP_DAYS) return "keep";
  if (ageDays <= AUTO_DAYS) return "list";
  return "auto";
}

export function activeInstallPaths(dir = claudeDir()) {
  const f = join(dir, "plugins", "installed_plugins.json");
  let parsed; try { parsed = JSON.parse(readFileSync(f, "utf8")); } catch { return null; }
  // Guard manifest shape: missing/renamed `plugins` key must never look like "no plugins" —
  // that would make pluginPruneCandidates treat every cached version as prunable.
  if (!parsed || typeof parsed.plugins !== "object" || parsed.plugins === null) return null;
  const set = new Set();
  for (const entries of Object.values(parsed.plugins)) {
    if (!Array.isArray(entries)) continue;
    for (const e of entries) if (e && e.installPath) set.add(e.installPath);
  }
  return set;
}

// Version dirs under plugins/cache/<mkt>/<plugin>/ whose full path is NOT an active installPath.
export function pluginPruneCandidates(dir = claudeDir()) {
  const active = activeInstallPaths(dir);
  if (active === null) return []; // fail-safe: never prune when we can't tell what's active
  const cacheRoot = join(dir, "plugins", "cache");
  const out = [];
  let mkts = []; try { mkts = readdirSync(cacheRoot); } catch { return out; }
  for (const mkt of mkts) {
    let plugs = []; try { plugs = readdirSync(join(cacheRoot, mkt)); } catch { continue; }
    for (const plug of plugs) {
      const plugDir = join(cacheRoot, mkt, plug);
      let vers = []; try { vers = readdirSync(plugDir); } catch { continue; }
      for (const ver of vers) {
        const verPath = join(plugDir, ver);
        let st; try { st = statSync(verPath); } catch { continue; }
        if (st.isDirectory() && !active.has(verPath)) out.push(verPath);
      }
    }
  }
  return out;
}

const EPHEMERAL = ["paste-cache", "shell-snapshots", "logs", "cache", "session-env", "daemon"];
const AGE_DIRS = ["file-history", "jobs", "tasks", "backups", "gsd-user-files-backup", "gsd-migration-journal"];
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeReaddir(p) { try { return readdirSync(p, { withFileTypes: true }); } catch { return []; } }
function statOr(p) { try { return statSync(p); } catch { return null; } }

// Slug directory names under the harness temp root are case-preserved but the filesystem (and
// whatever computed the caller's `slug`) may not agree on case on win32.
function sameSlug(a, b) {
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

export function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (err) { return err?.code === "EPERM"; }
}

// Session ids of live sessions in <configDir>/sessions/<pid>.json (22-SPEC.md §4.2). A missing dir or
// any unparsable registry file → { available: false }: callers then treat every other session as active.
// Defined here, beside harnessSessionDirs, and re-exported from harness-temp.mjs rather than
// defined there: harness-temp.mjs already imports harnessSessionDirs from this file, so defining
// activeSessionIds there and importing it back here (harnessSessionDirs needs it as a default)
// would create a cycle between the two modules.
export function activeSessionIds({ configDir = claudeDir(), isAlive = pidAlive } = {}) {
  let names; try { names = readdirSync(join(configDir, "sessions")); } catch { return { available: false, ids: new Set() }; }
  const ids = new Set();
  for (const n of names) {
    if (!n.endsWith(".json")) continue;
    let rec; try { rec = JSON.parse(readFileSync(join(configDir, "sessions", n), "utf8")); } catch { return { available: false, ids: new Set() }; }
    if (!Number.isInteger(rec?.pid) || rec.pid <= 0 || typeof rec.sessionId !== "string") return { available: false, ids: new Set() };
    if (isAlive(rec.pid)) ids.add(rec.sessionId);
  }
  return { available: true, ids };
}

// <tempRoot>/<slug>/<uuid>/ session dirs, newest file at least olderThanMs old; slug limits it to one project.
// Active sessions (per `active`, read from the registry by default) are never returned, whatever their age.
export function harnessSessionDirs({ tempRoot, slug, excludeUuids = [], olderThanMs = 0, nowMs, active = activeSessionIds() }) {
  if (!active.available) return [];
  const excl = new Set([...excludeUuids, ...active.ids]), out = [];
  for (const slugEnt of safeReaddir(tempRoot)) {
    if (!slugEnt.isDirectory() || (slug !== undefined && !sameSlug(slugEnt.name, slug))) continue;
    const slugDir = join(tempRoot, slugEnt.name);
    for (const e of safeReaddir(slugDir)) {
      if (!e.isDirectory() || !UUID_RE.test(e.name) || excl.has(e.name)) continue;
      const absPath = join(slugDir, e.name); const mtimeMs = newestMtime(absPath);
      if (nowMs - mtimeMs < olderThanMs) continue;
      out.push({ absPath, slug: slugEnt.name, uuid: e.name, size: dirSize(absPath), mtimeMs });
    }
  }
  return out;
}

export function buildPlan({ dir = claudeDir(), tempRoot, nowMs, excludeUuids = [] }) {
  const items = [], listCheck = [];
  const excl = new Set(excludeUuids);
  const push = (arr, absPath, category, reason, mtimeMs) =>
    arr.push({ absPath, size: statOr(absPath)?.isDirectory() ? dirSize(absPath) : (statOr(absPath)?.size ?? 0), category, reason, mtimeMs, bucket: ageBucket(mtimeMs, nowMs) });

  // Ephemeral: each immediate child of the dir (dir itself stays), guarded by age — a <7d
  // ("keep") child is skipped, which protects the currently-running session's own transient
  // files (logs/session-env/daemon/shell-snapshots/cache/paste-cache). No list-checker here:
  // both "list" and "auto" age buckets are swept straight into items.
  for (const name of EPHEMERAL) {
    const root = join(dir, name);
    for (const e of safeReaddir(root)) {
      const p = join(root, e.name);
      const m = e.isDirectory() ? newestMtime(p) : (statOr(p)?.mtimeMs ?? 0);
      if (ageBucket(m, nowMs) === "keep") continue;
      push(items, p, "ephemeral", `ephemeral:${name}`, m);
    }
  }
  // Age dirs: each immediate child, only if > AUTO_DAYS.
  for (const name of AGE_DIRS) {
    const root = join(dir, name);
    for (const e of safeReaddir(root)) {
      const p = join(root, e.name); const m = e.isDirectory() ? newestMtime(p) : (statOr(p)?.mtimeMs ?? 0);
      if (ageBucket(m, nowMs) === "auto") push(items, p, "age", `age:${name}`, m);
    }
  }
  // Sessions: projects/<slug>/{<uuid>.jsonl,<uuid>/}; skip literal "memory".
  const projects = join(dir, "projects");
  for (const slugEnt of safeReaddir(projects)) {
    if (!slugEnt.isDirectory()) continue;
    const slugDir = join(projects, slugEnt.name);
    // group uuids
    const uuids = new Map(); // uuid -> {jsonl?, dir?}
    for (const e of safeReaddir(slugDir)) {
      if (e.name === "memory") continue; // NEVER
      const m = e.name.match(/^([0-9a-f-]{36})(\.jsonl)?$/i);
      if (!m || !UUID_RE.test(m[1])) continue;
      const rec = uuids.get(m[1]) || {}; rec[m[2] ? "jsonl" : "dir"] = join(slugDir, e.name); uuids.set(m[1], rec);
    }
    for (const [uuid, rec] of uuids) {
      if (excl.has(uuid)) continue;
      const paths = [rec.jsonl, rec.dir].filter(Boolean);
      const m = Math.max(...paths.map((p) => (statOr(p)?.isDirectory() ? newestMtime(p) : (statOr(p)?.mtimeMs ?? 0))));
      const bucket = ageBucket(m, nowMs);
      if (bucket === "keep") continue;
      for (const p of paths) push(bucket === "auto" ? items : listCheck, p, "session", `session:${slugEnt.name}/${uuid}`, m);
    }
  }
  // Temp: the "keep" bucket is exactly age < KEEP_DAYS, so the walker skips it without sizing it.
  const active = activeSessionIds({ configDir: dir });
  for (const t of harnessSessionDirs({ tempRoot, excludeUuids, olderThanMs: KEEP_DAYS * DAY_MS, nowMs, active })) {
    const bucket = ageBucket(t.mtimeMs, nowMs);
    (bucket === "auto" ? items : listCheck).push({ absPath: t.absPath, size: t.size, category: "temp",
      reason: `temp:${t.slug}/${t.uuid}`, mtimeMs: t.mtimeMs, bucket });
  }
  // Plugins: stale cache versions (always trash).
  for (const p of pluginPruneCandidates(dir)) push(items, p, "plugin", "plugin:stale-version", newestMtime(p));

  const totals = { count: items.length, bytes: items.reduce((a, i) => a + i.size, 0) };
  return { registry: active.available ? "ok" : "unavailable", items, listCheck, totals };
}

export function trashRoot(dir = claudeDir()) { return join(dir, ".cleanup-trash"); }

// Returns { partial: true } when the source could not be fully removed and the recorded copy
// coexists with a source remnant (22-SPEC.md §4.1).
function moveInto(src, destDir) {
  mkdirSync(destDir, { recursive: true });
  const dest = join(destDir, basename(src));
  try { renameSync(src, dest); }
  catch (err) {
    if (err?.code !== "EXDEV") throw err; // only fall back for cross-device; anything else propagates
    return { partial: copyMoveNoFollow(src, dest).partial };
  }
  return { partial: false };
}

// Links are recreated as links, never followed, so a link target (e.g. a shared pnpm store) is
// never copied or deleted.
function copyTreeNoFollow(src, dest) {
  const st = lstatSync(src);
  if (st.isSymbolicLink()) {
    const raw = readlinkSync(src);
    const abs = resolve(dirname(src), raw);
    const targetIsFile = statOr(abs)?.isFile() ?? false;
    // Node resolves a junction target against cwd, so a junction needs the absolute path.
    if (process.platform === "win32" && !targetIsFile) symlinkSync(abs, dest, "junction");
    else symlinkSync(raw, dest, targetIsFile ? "file" : "dir");
  } else if (st.isDirectory()) {
    mkdirSync(dest, { recursive: true });
    for (const e of readdirSync(src)) copyTreeNoFollow(join(src, e), join(dest, e));
  } else copyFileSync(src, dest);
}

function removeTreeNoFollow(p) {
  let st; try { st = lstatSync(p); } catch (err) { if (err?.code === "ENOENT") return; throw err; }
  if (st.isDirectory() && !st.isSymbolicLink()) {
    for (const e of readdirSync(p)) removeTreeNoFollow(join(p, e));
    rmdirSync(p);
  } else unlinkSync(p);
}

function tally(p) {
  const st = lstatSync(p);
  if (st.isSymbolicLink()) return { entries: 1, bytes: 0 };
  if (!st.isDirectory()) return { entries: 1, bytes: st.size };
  const t = { entries: 0, bytes: 0 };
  for (const e of readdirSync(p)) { const c = tally(join(p, e)); t.entries += c.entries; t.bytes += c.bytes; }
  return t;
}

function restoreMissing(from, to) {
  let st; try { st = lstatSync(to); } catch (err) { if (err?.code !== "ENOENT") throw err; copyTreeNoFollow(from, to); return; }
  if (st.isDirectory() && !st.isSymbolicLink()) for (const e of readdirSync(from)) restoreMissing(join(from, e), join(to, e));
}

// Cross-device move: copy, verify, then delete the source. A failure never leaves the source short
// of data that is not also recorded; the contract is 22-SPEC.md §4.1.
export function copyMoveNoFollow(src, dest) {
  try {
    copyTreeNoFollow(src, dest);
    const a = tally(src), b = tally(dest);
    if (a.entries !== b.entries || a.bytes !== b.bytes)
      throw new Error(`copy verify failed for ${src}: ${a.entries}/${a.bytes} vs ${b.entries}/${b.bytes}`);
  } catch (err) {
    try { removeTreeNoFollow(dest); } catch {}
    throw err;
  }
  try { removeTreeNoFollow(src); return { partial: false }; }
  catch (err) {
    try { restoreMissing(dest, src); } catch { return { partial: true }; }
    try { removeTreeNoFollow(dest); } catch {}
    throw err;
  }
}

export function applyPlan({ dir = claudeDir(), items, nowMs, ts }) {
  const batchDir = join(trashRoot(dir), ts);
  mkdirSync(batchDir, { recursive: true });
  const entries = [], partials = []; let moved = 0, bytes = 0, skipped = 0;
  let idx = 0;
  try {
    for (const it of items) {
      try {
        const st = statOr(it.absPath);
        if (!st) { skipped++; continue; }
        // TOCTOU: became active since scan → leave alone (allow tiny fs rounding)
        const liveM = st.isDirectory() ? newestMtime(it.absPath) : st.mtimeMs;
        if (Math.abs(liveM - it.mtimeMs) > 1) { skipped++; continue; }
        const slot = join(batchDir, String(idx++)); // unique slot avoids basename collisions
        const { partial } = moveInto(it.absPath, slot);
        entries.push({ originalAbsPath: it.absPath, size: it.size, category: it.category, reason: it.reason, movedAt: nowMs, slot: basename(slot), ...(partial && { partial: true }) });
        if (partial) partials.push({ originalAbsPath: it.absPath, copyPath: join(slot, basename(it.absPath)) });
        moved++; bytes += it.size;
      } catch { skipped++; } // never let one bad item orphan already-moved siblings; original stays in place
    }
  } finally {
    // Unconditional: whatever actually moved must always be recorded/restorable, even on an
    // unexpected throw from something above the per-item try (e.g. batchDir became unwritable).
    writeFileSync(join(batchDir, "manifest.json"), JSON.stringify({ ts, entries }, null, 2), "utf8");
  }
  return { batchDir, moved, bytes, skipped, partials };
}

export function partialWarnings({ partials = [] }, retentionDays = RETENTION_DAYS) {
  return partials.map((p) => `WARNING: ${p.originalAbsPath} could not be fully removed after it was copied; `
    + `a remnant stays in place and the verified full copy is at ${p.copyPath}. Recover it by hand before the trash purges it in ${retentionDays} days.`);
}

export function listTrashBatches(dir = claudeDir()) {
  const root = trashRoot(dir); const out = [];
  for (const e of safeReaddir(root)) {
    if (!e.isDirectory()) continue;
    const p = join(root, e.name); out.push({ ts: e.name, dir: p, mtimeMs: statOr(p)?.mtimeMs ?? 0 });
  }
  return out;
}

export function purgeRetention({ dir = claudeDir(), nowMs, retentionDays = RETENTION_DAYS }) {
  const removed = [];
  for (const b of listTrashBatches(dir)) {
    if ((nowMs - b.mtimeMs) / DAY_MS > retentionDays) { rmSync(b.dir, { recursive: true, force: true }); removed.push(b.ts); }
  }
  return removed;
}

export function restoreBatch({ dir = claudeDir(), ts }) {
  const batchDir = join(trashRoot(dir), ts);
  let manifest; try { manifest = JSON.parse(readFileSync(join(batchDir, "manifest.json"), "utf8")); } catch { return { restored: 0, skipped: 0 }; }
  let restored = 0, skipped = 0;
  for (const e of manifest.entries || []) {
    const stored = join(batchDir, e.slot, basename(e.originalAbsPath));
    if (existsSync(e.originalAbsPath) || !existsSync(stored)) { skipped++; continue; } // never clobber
    mkdirSync(dirname(e.originalAbsPath), { recursive: true });
    moveInto(join(batchDir, e.slot, basename(e.originalAbsPath)), dirname(e.originalAbsPath));
    restored++;
  }
  if (skipped === 0) rmSync(batchDir, { recursive: true, force: true });
  return { restored, skipped };
}
