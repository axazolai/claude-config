import { fileURLToPath } from "node:url";
import { realpathSync, readFileSync, statSync, lstatSync, rmSync } from "node:fs";
import { resolve, join, basename, relative, isAbsolute, sep } from "node:path";
import { claudeDir, applyPlan, partialWarnings, purgeRetention, restoreBatch, newestMtime, UUID_RE } from "./lib/claude-cleanup-lib.mjs";
import { scanLayout, promote } from "./lib/scratch-prune-lib.mjs";
import { harnessTempRoot, harnessSessionDirs, activeSessionIds } from "./lib/harness-temp.mjs";

const HOUR_MS = 3_600_000;
const HARNESS_HOURS = 24;
const VALUE_FLAGS = { "--scratchpad": "scratchpad", "--ts": "ts", "--plan": "plan", "--phase": "phase",
  "--older-hours": "olderHours", "--src": "src", "--name": "name",
  "--purpose": "purpose", "--usage": "usage", "--origin": "origin", "--project": "project" };
const BOOL_FLAGS = { "--adhoc": "adhoc", "--proc": "proc", "--legacy": "legacy", "--harness-all": "harnessAll", "--purge-now": "purgeNow" };

export function parseArgs(argv) {
  const opts = { current: [] };
  const cmd = (argv[0] && !argv[0].startsWith("--")) ? argv[0] : "scan";
  for (let i = (cmd === argv[0] ? 1 : 0); i < argv.length; i++) {
    const a = argv[i];
    if (a === "--current") opts.current.push(argv[++i]);
    else if (a.startsWith("--harness=")) opts.harness = a.slice("--harness=".length);
    else if (a === "--harness") opts.harness = (argv[i + 1] === undefined || argv[i + 1].startsWith("--")) ? "" : argv[++i];
    else if (VALUE_FLAGS[a]) opts[VALUE_FLAGS[a]] = argv[++i];
    else if (BOOL_FLAGS[a]) opts[BOOL_FLAGS[a]] = true;
  }
  return { cmd, opts };
}

function isMain() {
  const a = process.argv[1]; if (!a) return false;
  const self = fileURLToPath(import.meta.url);
  if (resolve(a) === self) return true;
  try { return realpathSync(a) === self; } catch { return false; }
}

function stamp(nowMs) { return new Date(nowMs).toISOString().replace(/[:.]/g, "").replace(/-/g, ""); }
function real(p) { try { return realpathSync(p); } catch { return resolve(p); } }

// First item whose real path is not strictly inside root (depth: exact levels below root; leafRe: last segment), else null.
export function outsideRoot(items, root, depth, leafRe) {
  if (!Array.isArray(items)) return "items is not an array";
  const r = real(root);
  for (const i of items) {
    const p = typeof i?.absPath === "string" ? i.absPath : "";
    if (!p) return "(missing absPath)";
    const rel = relative(r, real(p));
    if (!rel || rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel)) return p;
    const parts = rel.split(sep);
    if (depth && parts.length !== depth) return p;
    if (leafRe && !leafRe.test(parts[parts.length - 1])) return p;
  }
  return null;
}

function fail(msg, code) { process.stderr.write(msg + "\n"); process.exitCode = code; }

const SCAN_MODE_FLAGS = [
  ["--phase", (opts) => opts.phase !== undefined],
  ["--adhoc", (opts) => !!opts.adhoc],
  ["--proc", (opts) => !!opts.proc],
  ["--legacy", (opts) => !!opts.legacy],
  ["--harness", (opts) => opts.harness !== undefined],
  ["--harness-all", (opts) => !!opts.harnessAll],
];

function scan(opts, nowMs) {
  const hours = (d) => (opts.olderHours === undefined ? d : Number(opts.olderHours));
  const modeFlags = SCAN_MODE_FLAGS.filter(([, present]) => present(opts)).map(([flag]) => flag);
  if (modeFlags.length > 1) return fail(`conflicting scan modes: ${modeFlags.join(", ")}`, 1);
  if (opts.harness !== undefined && !opts.harness.trim()) return fail("--harness requires a non-empty project slug", 1);
  if (opts.harness || opts.harnessAll) {
    if (opts.harness && opts.harness !== basename(opts.harness)) return fail(`invalid slug: ${opts.harness}`, 1);
    if (!Number.isFinite(hours(HARNESS_HOURS))) return fail("--older-hours must be a number", 1);
    const tempRoot = harnessTempRoot(), active = activeSessionIds();
    const items = harnessSessionDirs({ tempRoot, slug: opts.harnessAll ? undefined : opts.harness,
      excludeUuids: opts.current, olderThanMs: hours(HARNESS_HOURS) * HOUR_MS, nowMs, active })
      .map((t) => ({ absPath: t.absPath, name: `${t.slug}/${t.uuid}`, slug: t.slug, uuid: t.uuid, kind: "data",
        size: t.size, mtimeMs: t.mtimeMs, ageHours: Math.floor((nowMs - t.mtimeMs) / HOUR_MS * 10) / 10,
        category: "temp", reason: `temp:${t.slug}/${t.uuid}` }))
      .sort((a, b) => b.size - a.size);
    return process.stdout.write(JSON.stringify({ tempRoot, registry: active.available ? "ok" : "unavailable", items,
      totals: { entries: items.length, bytes: items.reduce((a, i) => a + i.size, 0) } }, null, 2));
  }
  if (!opts.scratchpad) return fail("scan requires --scratchpad <abs path> or --harness <slug> | --harness-all", 1);
  const mode = opts.phase !== undefined ? "phase" : opts.adhoc ? "adhoc" : opts.proc ? "proc" : opts.legacy ? "legacy" : null;
  if (!mode) return fail("scan --scratchpad requires one of --phase <NN>, --adhoc, --proc, --legacy", 1);
  const olderHours = hours(mode === "adhoc" ? 24 : 2);
  if (!Number.isFinite(olderHours)) return fail("--older-hours must be a number", 1);
  const res = scanLayout({ scratchpad: resolve(opts.scratchpad), mode, phase: opts.phase, olderHours, nowMs });
  if (res.error) return fail(res.error, 3);
  process.stdout.write(JSON.stringify(res, null, 2));
}

// Re-checks each item at apply time: still inactive, unchanged since the scan, and older than olderThanMs.
function purgeNow(items, { active, excludeUuids, olderThanMs, nowMs }) {
  let deleted = 0, bytes = 0, skipped = 0;
  const excl = new Set([...excludeUuids, ...active.ids]);
  for (const it of items) {
    if (!active.available || excl.has(basename(it.absPath))) { skipped++; continue; }
    let st; try { st = statSync(it.absPath); } catch { skipped++; continue; }
    const liveM = st.isDirectory() ? newestMtime(it.absPath) : st.mtimeMs;
    if (typeof it.mtimeMs === "number" && Math.abs(liveM - it.mtimeMs) > 1) { skipped++; continue; }
    if (nowMs - liveM < olderThanMs) { skipped++; continue; }
    try { rmSync(it.absPath, { recursive: true, force: true }); deleted++; bytes += it.size ?? 0; } catch { skipped++; }
  }
  return { deleted, bytes, skipped };
}

function apply(opts, dir, nowMs) {
  if (!opts.plan) return fail("apply requires --plan <file>", 1);
  const finalized = JSON.parse(readFileSync(opts.plan, "utf8"));
  if (opts.purgeNow) {
    const root = harnessTempRoot();
    const bad = outsideRoot(finalized.items, root, 2, UUID_RE);
    if (bad) return fail(`plan lists a path that is not a session dir under the harness temp root ${root}: ${bad}`, 2);
    const olderHours = opts.olderHours === undefined ? HARNESS_HOURS : Number(opts.olderHours);
    if (!Number.isFinite(olderHours)) return fail("--older-hours must be a number", 1);
    const res = purgeNow(finalized.items, { active: activeSessionIds(), excludeUuids: opts.current, olderThanMs: olderHours * HOUR_MS, nowMs });
    return process.stdout.write(`Deleted ${res.deleted} items (${res.bytes} bytes); skipped ${res.skipped}.\n`);
  }
  const scratchpad = opts.scratchpad || finalized.scratchpad;
  if (!scratchpad || basename(resolve(scratchpad)) !== ".scratchpad")
    return fail("apply requires --scratchpad <path to .scratchpad> (or a plan naming it)", 1);
  const present = Array.isArray(finalized.items) ? finalized.items.filter((i) => {
    if (typeof i?.absPath !== "string" || !i.absPath) return true;
    try { lstatSync(i.absPath); return true; } catch { return false; }
  }) : finalized.items;
  const bad = outsideRoot(present, scratchpad);
  if (bad) return fail(`plan lists a path outside ${scratchpad}: ${bad}`, 2);
  const res = applyPlan({ dir, items: finalized.items, nowMs, ts: finalized.ts || stamp(nowMs) });
  process.stdout.write(`Moved ${res.moved} items (${res.bytes} bytes) to ${res.batchDir}; skipped ${res.skipped}.\n`);
  for (const w of partialWarnings(res)) process.stdout.write(`${w}\n`);
  if (res.skipped) {
    const moved = new Set(JSON.parse(readFileSync(join(res.batchDir, "manifest.json"), "utf8")).entries.map((e) => e.originalAbsPath));
    process.stdout.write(`skipped: ${finalized.items.filter((i) => !moved.has(i.absPath)).map((i) => i.name ?? i.absPath).join(", ")}\n`);
  }
}

export function main(argv = process.argv.slice(2), nowMs = Date.now()) {
  const dir = claudeDir();
  const { cmd, opts } = parseArgs(argv);
  if (opts.current.some((c) => typeof c !== "string" || !c.trim())) return fail("--current requires a non-empty session id", 1);
  if (cmd === "scan") scan(opts, nowMs);
  else if (cmd === "apply") apply(opts, dir, nowMs);
  else if (cmd === "promote") {
    for (const k of ["src", "name", "purpose", "usage", "origin"]) if (!opts[k]) return fail(`promote requires --${k}`, 1);
    if (!/^(phase \d+|adhoc|legacy)$/.test(opts.origin)) return fail(`--origin must match "phase <NN>", "adhoc", or "legacy": ${opts.origin}`, 1);
    try {
      const res = promote({ project: resolve(opts.project || process.cwd()), src: resolve(opts.src), name: opts.name,
        purpose: opts.purpose, usage: opts.usage, origin: opts.origin, nowMs });
      process.stdout.write(JSON.stringify(res) + "\n");
    } catch (err) { fail(err.message, 2); }
  } else if (cmd === "purge-retention") {
    const removed = purgeRetention({ dir, nowMs });
    process.stdout.write(`Purged ${removed.length} trash batch(es): ${removed.join(", ") || "none"}.\n`);
  } else if (cmd === "restore") {
    if (!opts.ts) return fail("restore requires --ts <ts>", 1);
    const res = restoreBatch({ dir, ts: opts.ts });
    process.stdout.write(`Restored ${res.restored}; skipped ${res.skipped}.\n`);
  } else fail(`unknown command: ${cmd}`, 1);
}

if (isMain()) main();
