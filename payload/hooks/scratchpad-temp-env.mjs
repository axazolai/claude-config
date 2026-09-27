#!/usr/bin/env node
// SessionStart hook (all profiles). Redirects TEMP/TMP/TMPDIR into the project's own
// .claude/.scratchpad/proc/ via CLAUDE_ENV_FILE, and hints /scratch-prune when this project's
// scratchpad needs it (.ultrapowers/22-SPEC.md §3.2). Side effects (env-file append, proc/
// creation, .gitignore coverage) are reliable and run whether or not additionalContext survives.
import { readFileSync, appendFileSync, mkdirSync, existsSync, writeFileSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { harnessTempRoot, harnessSessionDirs } from "../bin/lib/harness-temp.mjs";
import { scanLayout } from "../bin/lib/scratch-prune-lib.mjs";

const MAX_PATH = 200;
const HUNDRED_MB = 100 * 1024 * 1024;
const HOUR_MS = 3_600_000;
const mb = (n) => (n / (1024 * 1024)).toFixed(1);

export function slugify(p) {
  return p.replace(/[^A-Za-z0-9-]/g, "-");
}

function foldPath(p) {
  const n = resolve(p).replace(/\\/g, "/");
  return process.platform === "win32" ? n.toLowerCase() : n;
}

function shQuote(s) {
  return `'${String(s).replace(/'/g, "'\\''")}'`;
}

export function envLines(procDir) {
  const q = shQuote(procDir.replace(/\\/g, "/"));
  return `export TEMP=${q}\nexport TMP=${q}\nexport TMPDIR=${q}\n`;
}

// A later Bash/PowerShell call sourcing CLAUDE_ENV_FILE would otherwise resolve
// harnessTempRoot() against the redirected TEMP/TMP/TMPDIR above instead of the real harness
// root, since CLAUDE_CODE_TMPDIR is normally unset and harnessTempRoot() falls back to
// os.tmpdir(). Pin it explicitly to the base dir this hook's own (still real, unredirected) env
// resolves right now — the base, without the "claude"/"claude-<uid>" leaf harnessTempRoot()
// itself appends, so a later harnessTempRoot() call (this session's or a nested one's) appends
// exactly one leaf instead of doubling it.
export function harnessRootLine(baseTempDir) {
  return `export CLAUDE_CODE_TMPDIR=${shQuote(baseTempDir.replace(/\\/g, "/"))}\n`;
}

function hasAllLines(path, block) {
  if (!existsSync(path)) return false;
  const have = new Set(readFileSync(path, "utf8").split(/\r?\n/).map((l) => l.trim()));
  return block.split("\n").filter(Boolean).every((l) => have.has(l.trim()));
}

function hasAnyLine(path, patterns) {
  if (!existsSync(path)) return false;
  const lines = readFileSync(path, "utf8").split(/\r?\n/).map((l) => l.trim());
  return patterns.some((p) => lines.includes(p));
}

const ROOT_GITIGNORE_PATTERNS = [".claude/", "/.claude/", ".claude/*", "/.claude/*", ".claude/.scratchpad/", "/.claude/.scratchpad/"];
const CLAUDE_GITIGNORE_PATTERNS = [".scratchpad/", "/.scratchpad/", ".scratchpad/*", "/.scratchpad/*"];

function ensureGitignoreCoverage(root) {
  if (hasAnyLine(join(root, ".gitignore"), ROOT_GITIGNORE_PATTERNS)) return;
  const gitignore = join(root, ".claude", ".gitignore");
  if (hasAnyLine(gitignore, CLAUDE_GITIGNORE_PATTERNS)) return;
  mkdirSync(dirname(gitignore), { recursive: true });
  const cur = existsSync(gitignore) ? readFileSync(gitignore, "utf8") : "";
  writeFileSync(gitignore, cur && !cur.endsWith("\n") ? cur + "\n.scratchpad/\n" : cur + ".scratchpad/\n");
}

// Does I/O: scanLayout() walks the scratchpad on disk to size legacy content.
export function hints({ scratchpad, harnessBytes }) {
  const out = [];
  const legacy = scanLayout({ scratchpad, mode: "legacy" });
  if (!legacy.error && legacy.totals.entries > 0)
    out.push(`Run /scratch-prune: legacy scratchpad content (${legacy.totals.entries} item(s), ${mb(legacy.totals.bytes)} MB) outside the layout.`);
  if ((harnessBytes || 0) > HUNDRED_MB)
    out.push(`Run /scratch-prune: this project's harness session dirs total ${mb(harnessBytes)} MB.`);
  return out;
}

function main() {
  let d;
  try { d = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { return; }
  d = (d && typeof d === "object" && !Array.isArray(d)) ? d : {};
  const root = resolve(process.env.CLAUDE_PROJECT_DIR || d.cwd || process.cwd());
  const notes = [];

  const envFile = process.env.CLAUDE_ENV_FILE;
  const isHome = foldPath(root) === foldPath(homedir());
  if (envFile && !isHome) {
    try {
      const procDir = join(root, ".claude", ".scratchpad", "proc").replace(/\\/g, "/");
      if (procDir.length > MAX_PATH) {
        notes.push(`scratchpad-temp-env: proc path is ${procDir.length} chars (over ${MAX_PATH}) — skipping the TEMP/TMP/TMPDIR redirect.`);
      } else {
        mkdirSync(procDir, { recursive: true });
        let out = envLines(procDir);
        if (!process.env.CLAUDE_CODE_TMPDIR) out += harnessRootLine(tmpdir());
        if (!hasAllLines(envFile, out)) appendFileSync(envFile, out);
        ensureGitignoreCoverage(root);
      }
    } catch { /* redirect is best-effort: a failure here must never drop the hints below */ }
  }

  let harnessBytes = 0;
  try {
    const tempRoot = harnessTempRoot(process.env);
    const excludeUuids = d.session_id ? [d.session_id] : [];
    harnessBytes = harnessSessionDirs({ tempRoot, slug: slugify(root), excludeUuids, olderThanMs: 24 * HOUR_MS, nowMs: Date.now() })
      .reduce((a, t) => a + t.size, 0);
  } catch { /* best-effort */ }

  notes.push(...hints({ scratchpad: join(root, ".claude", ".scratchpad"), harnessBytes }));

  if (notes.length) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: notes.join(" ") }
    }));
  }
}

function isMainModule() {
  const a = process.argv[1];
  if (!a) return false;
  if (import.meta.url === pathToFileURL(a).href) return true;
  try { return import.meta.url === pathToFileURL(realpathSync(a)).href; } catch { return false; }
}

if (isMainModule()) {
  try { main(); } catch { /* fail-open */ }
  process.exit(0);
}
