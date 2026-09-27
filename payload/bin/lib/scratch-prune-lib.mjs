// Scanner for /scratch-prune over the .scratchpad layout: phase-<NN>/, adhoc/, proc/, test-tmp/.
import { readdirSync, statSync, lstatSync, existsSync, mkdirSync, renameSync, readFileSync, writeFileSync, unlinkSync, realpathSync } from "node:fs";
import { join, extname, basename, dirname, relative, sep, isAbsolute } from "node:path";
import { newestMtime, dirSize } from "./claude-cleanup-lib.mjs";

const HOUR_MS = 3_600_000;
// NTFS can report a fresh file's mtime ~1.3ms ahead of the following Date.now().
export const CLOCK_SKEW_MS = 5;
const SCRIPT_EXTS = new Set([".mjs", ".js", ".cjs", ".ts", ".py", ".ps1", ".psm1", ".sh", ".bat", ".cmd"]);
const PHASE_SUBDIRS = new Set(["scripts", "data", "logs"]);
const PHASE_RE = /^phase-\d{2,}$/;
const LAYOUT = new Set(["adhoc", "proc", "test-tmp"]);
const MARKERS = new Set([".cleanup-done"]);

function statOr(p) { try { return statSync(p); } catch { return null; } }
function safeReaddir(p) { try { return readdirSync(p, { withFileTypes: true }); } catch { return []; } }
const trunc1 = (n) => Math.floor(n * 10) / 10;

function holdsScript(p) {
  let st; try { st = lstatSync(p); } catch { return false; }
  if (!st.isDirectory()) return SCRIPT_EXTS.has(extname(p).toLowerCase());
  return safeReaddir(p).some((e) => holdsScript(join(p, e.name)));
}

function item(scratchpad, absPath, nowMs) {
  const st = statOr(absPath); if (!st) return null;
  const mtimeMs = st.isDirectory() ? newestMtime(absPath) : st.mtimeMs;
  const name = absPath.slice(scratchpad.length + 1).split(/[\\/]/).join("/");
  return { absPath, name, kind: holdsScript(absPath) ? "script" : "data",
           size: st.isDirectory() ? dirSize(absPath) : st.size, mtimeMs,
           ageHours: trunc1((nowMs - mtimeMs) / HOUR_MS), category: "scratch", reason: `scratch:${name}` };
}

const children = (dir) => safeReaddir(dir).map((e) => ({ e, p: join(dir, e.name) }));

function candidates(scratchpad, mode, phase) {
  if (mode === "phase") {
    const dir = join(scratchpad, `phase-${String(phase).padStart(2, "0")}`);
    return children(dir).flatMap(({ e, p }) => (e.isDirectory() && PHASE_SUBDIRS.has(e.name)) ? children(p).map((c) => c.p) : [p]);
  }
  if (mode === "adhoc" || mode === "proc") return children(join(scratchpad, mode)).map((c) => c.p);
  if (mode === "legacy") {
    return children(scratchpad).flatMap(({ e, p }) => {
      if (!e.isDirectory()) return MARKERS.has(e.name) ? [] : [p];
      if (e.name === "tmp") return children(p).map((c) => c.p);
      return (LAYOUT.has(e.name) || PHASE_RE.test(e.name)) ? [] : [p];
    });
  }
  throw new Error(`unknown scan mode: ${mode}`);
}

export function scanLayout({ scratchpad, mode, phase, olderHours = 0, nowMs = Date.now() }) {
  if (!statOr(scratchpad)?.isDirectory()) return { error: `no scratchpad at ${scratchpad}` };
  if (mode === "phase" && !/^\d+$/.test(String(phase ?? ""))) return { error: "phase mode needs a numeric phase" };
  const minAge = (mode === "adhoc" || mode === "proc") ? olderHours * HOUR_MS : 0;
  const items = candidates(scratchpad, mode, phase).map((p) => item(scratchpad, p, nowMs))
    .filter((i) => i && nowMs - i.mtimeMs >= minAge - CLOCK_SKEW_MS)
    .sort((a, b) => b.size - a.size);
  return { scratchpad, mode, items, totals: { entries: items.length, bytes: items.reduce((a, i) => a + i.size, 0) } };
}

const cell = (s) => String(s).replace(/\r?\n/g, " ").replace(/\|/g, "\\|");

function real(p) { try { return realpathSync(p); } catch { return null; } }

// True only when src's realpath sits strictly inside the project's scratchpad realpath
// (resolves through symlinks/junctions, so an escape via a link is caught too).
function insideScratchpad(project, src) {
  const scratchpad = real(join(project, ".claude", ".scratchpad"));
  const target = real(src);
  const parent = real(dirname(src));
  if (!scratchpad || !target || !parent) return false;
  const within = (p) => { const rel = relative(scratchpad, p); return rel !== "" && rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel); };
  return within(target) && within(join(parent, basename(src)));
}

function localDate(nowMs) {
  const d = new Date(nowMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function promote({ project, src, name, purpose, usage, origin, nowMs = Date.now() }) {
  if (!name || name !== basename(name) || name === "." || name === ".." || name.toLowerCase() === "index.md") {
    throw new Error(`invalid tool name: ${name}`);
  }
  if (!statOr(src)) throw new Error(`no such source: ${src}`);
  if (!insideScratchpad(project, src)) throw new Error(`refusing to promote from outside the scratchpad: ${src}`);
  const tools = join(project, ".claude", "tools");
  const dest = join(tools, name);
  mkdirSync(tools, { recursive: true });
  const index = join(tools, "INDEX.md");
  const prev = existsSync(index) ? readFileSync(index, "utf8") : null;
  const head = !prev ? "| tool | purpose | usage | origin |\n|---|---|---|---|\n" : (prev.endsWith("\n") ? "" : "\n");
  const row = `${head}| ${cell(name)} | ${cell(purpose)} | ${cell(usage)} | ${cell(origin)}, ${localDate(nowMs)} |\n`;
  const tmp = join(tools, `.INDEX.md.tmp-${process.pid}-${Date.now()}`);
  writeFileSync(tmp, `${prev ?? ""}${row}`, "utf8");
  try {
    if (existsSync(dest)) throw new Error(`refusing to overwrite ${dest}`);
    renameSync(src, dest);
  } catch (err) {
    try { unlinkSync(tmp); } catch { /* best effort */ }
    throw err;
  }
  try {
    renameSync(tmp, index);
  } catch (err) {
    try { renameSync(dest, src); } catch { /* best effort */ }
    try { unlinkSync(tmp); } catch { /* best effort */ }
    throw err;
  }
  return { dest };
}
