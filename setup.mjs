#!/usr/bin/env node
/*
 * Cross-platform installer for the curated ~/.claude config.
 * Principle: unpack the archive anywhere, then run `node setup.mjs`. All copying into your
 * home ~/.claude is done here, on Linux / macOS / Windows alike.
 *
 * Two tiers of bundle files, handled differently on purpose:
 *   - MANAGED content (.mjs scripts, and any .md/text file that does NOT carry a
 *     `<!-- CURATED:NOEDIT -->` line) - this is config-as-code: the bundle is the source of
 *     truth, so it is always refreshed to the bundled version on every run, no prompt. This is
 *     what makes "drop in a fresh package, run setup, old files get the new data" actually true
 *     for rules-src/, skills/, README.md, etc. - not just for scripts.
 *   - CURATED content (any file carrying a `<!-- CURATED:NOEDIT -->` line, anywhere in the
 *     file, whitespace-tolerant - in practice your `~/.claude/CLAUDE.md`) - never silently
 *     touched. Shows a unified diff and asks per file:
 *       (m)erge   - default. Curated text can't be auto-merged - the diff shown IS the merge
 *                   output. Nothing is written: your file stays exactly as-is.
 *       (r)eplace - overwrites your file with the bundle version. NO backup is made - the diff
 *                   shown above is your only record of what was there; recover via git/your own
 *                   backups if you need the old content back.
 *       (s)kip    - same as merge here (your file stays as-is); kept as a distinct choice for
 *                   clarity/scripting (--skip-all).
 *   - JSON files (settings.json, setting-templates/*.json) are a third case: real additive deep
 *     merge (your values kept, missing keys/array items added) - conflict-checked like curated
 *     files since they routinely hold real per-machine values (marketplace ids, your model
 *     choice, etc.) that must never be silently clobbered. Same no-backup rule on (r)eplace.
 *
 * Flags (non-interactive / CI): --merge-all | --replace-all | --skip-all | --dry-run
 * In a non-TTY without a bulk flag, curated/JSON conflicts default to MERGE (additive for JSON;
 * a no-op that leaves your file untouched for curated text - see above). This installer never
 * writes `.new` or `.bak` side files anywhere under ~/.claude - a diff is either shown for you
 * to act on, or the change is applied directly with no backup.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync, readdirSync, rmSync, realpathSync, copyFileSync, rmdirSync } from "node:fs";
import { homedir, platform } from "node:os";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "./payload/hooks/lib/spawn-hidden.mjs";
import { createInterface } from "node:readline";
import { validateConfigDir } from "./payload/bin/lib/config-dir-validate.mjs";
import { assembleClaudeMd } from "./payload/bin/lib/assemble-claude-md.mjs";
import { migrateSettingsModel } from "./payload/bin/lib/model-migration.mjs";
import { planGsdPurge, isEmptyPlan, formatGsdPurge, RETIRED_HOOK_FILES as GSD_RETIRED_HOOK_FILES } from "./gsd-purge.mjs";
import { applyPlan, purgeRetention, trashRoot } from "./payload/bin/lib/claude-cleanup-lib.mjs";
import { resolveVariant, filterPartialHooks, loadVariants, profilesOf, globToRe } from "./variants.mjs";
import { buildPluginPlan, formatPlan, selectActions, describeAction } from "./plugin-reconcile.mjs";
import { buildMcpPlan, formatMcpPlan, describeMcpAction, mcpAddArgs, mcpRemoveArgs, redactValues, postAddArgv,
  describePostAdd, quoteForCmd } from "./mcp-reconcile.mjs";
import { buildSessionDefaultsPlan, describeSessionChange, fmt } from "./session-defaults.mjs";
import { BUNDLE_RELS as GRAPHIFY_BUNDLE_RELS, PROJECT_RELS as GRAPHIFY_PROJECT_RELS, discoverRoots,
  companionMcpNames, findStashedGraphify, stripGraphifySettings, stripGraphifyMcp,
  stripProjectInitGraphify, stripPostCommit, stripGraphifyClaudeSection, formatPurge } from "./graphify-purge.mjs";
import { parsePwshMajor, powerShellToolPlan, MIN_PWSH_MAJOR, ENV_KEY as PWSH_ENV_KEY } from "./powershell-tool.mjs";
import { knownMarketplaces } from "./payload/bin/init-stack.mjs";
import { normalizeGateway, DEFAULT_PORT } from "./payload/mcp-servers/deepseek/lib/config.mjs";
import { reconcileBundleInstall } from "./payload/hooks/lib/config-update-check-run.mjs";

// REPO_ROOT = where setup.mjs itself lives (installer meta: setup.mjs, README.md,
// settings.partial.json, RISK_REGISTER*.md, bootstrap.sh/ps1, .gitignore - never mirrored).
// SRC = REPO_ROOT/payload - everything that actually gets installed into ~/.claude
// (hooks/, skills/, rules-src/, commands/, setting-templates/, bin/).
// Kept as two separate constants (not one) because
// settings.partial.json below is read from REPO_ROOT, not SRC - it configures the installer,
// it isn't itself installed. NOTE: payload/claude-md/ is a build input, not a copied rel -
// ~/.claude/CLAUDE.md is assembled per-profile from those fragments (assemble-claude-md.mjs),
// not mirrored 1:1 like the rest of SRC - see the assemble+write step after the placeFile loop.
const REPO_ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(REPO_ROOT, "payload");
const HOME = homedir();
// Config dir honors CLAUDE_CONFIG_DIR (the official Claude Code relocation env var); falls back
// to ~/.claude. This lets the whole bundle be installed into a relocated config dir without a
// symlink. Runtime scripts/hooks below use the same fallback.
const CDIR = process.env.CLAUDE_CONFIG_DIR || join(HOME, ".claude");
const HOOKS = join(CDIR, "hooks");
const SETTINGS = join(CDIR, "settings.json");
const MANIFEST = join(CDIR, "state", "bundle-manifest.json");
const RETIRED_HOOK_FILES = ["token-usage-log.mjs", ...GSD_RETIRED_HOOK_FILES];
// Removed on purpose: pruned even when their basename still appears elsewhere in the bundle.
const RETIRED_RELS = new Set([
  "hooks/token-usage-log.mjs",
  "hooks/lib/token-usage-prune.mjs",
  "hooks/lib/token-usage-pricing-refresh.mjs",
  "hooks/lib/token-usage-shared.mjs",
  "skills/token-usage/SKILL.md",
  "skills/token-usage/scripts/report.mjs",
]);
// Files that OLDER bundles shipped and this one no longer does - seeded so a user upgrading from a
// pre-manifest bundle still gets them pruned. ONLY list files this package exclusively owns (never
// a path another tool manages).
const SEED_REMOVED = GRAPHIFY_BUNDLE_RELS;
const sha = (s) => createHash("sha256").update(String(s)).digest("hex");

const argv = new Set(process.argv.slice(2));
const BULK = argv.has("--replace-all") ? "replace"
          : argv.has("--merge-all")   ? "merge"
          : argv.has("--skip-all")    ? "skip" : null;
const DRY = argv.has("--dry-run");
const VARIANT_ARG = (() => {
  const a = [...argv].find((x) => x.startsWith("--variant="));
  return a ? a.slice("--variant=".length) : null;
})();
const ENABLE_UPDATE_CHECK_FLAG = argv.has("--enable-update-check");
const ENABLE_POWERSHELL_TOOL_FLAG = argv.has("--enable-powershell-tool");
const INTERACTIVE = !BULK && process.stdin.isTTY;
const MD = argv.has("--md");
const COLOR = !MD && !argv.has("--no-color") && !process.env.NO_COLOR && process.stdout.isTTY;
// Resolved variant, hoisted to module scope so pruneStale()/settings-merge (later tasks) can see
// them without threading through function args. Assigned (not re-declared) inside main().
let VARIANT = null, V = null;

const log = (s = "") => process.stdout.write(s + "\n");
const safe = (fn) => { try { return fn(); } catch { return undefined; } };
// An npm-installed Claude Code on Windows is a claude.cmd shim, which only runs through a shell.
function spawnClaude(args, opts = {}) {
  const r = spawnSync("claude", args, opts);
  if (process.platform !== "win32" || r.error?.code !== "ENOENT") return r;
  return spawnSync("claude.cmd", args.map(quoteForCmd), { ...opts, shell: true });
}

const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
// {} when the file is absent, null when it exists but is not a JSON object - callers skip, never overwrite.
function readJsonOrNull(p) {
  if (!existsSync(p)) return {};
  try {
    const text = readFileSync(p, "utf8");
    const v = JSON.parse(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text);
    return isObj(v) ? v : null;
  } catch { return null; }
}

/* ---------- doctor: validate registered hook script paths ---------- */
if (argv.has("--doctor")) {
  log(`Doctor: checking hooks registered in ${SETTINGS}`);
  const s = existsSync(SETTINGS) ? readJsonOrNull(SETTINGS) : null;
  if (!s) { log("  settings.json missing or invalid JSON."); process.exit(1); }
  let bad = 0;
  for (const ev of Object.keys(s.hooks || {})) {
    for (const grp of s.hooks[ev]) {
      for (const h of (grp.hooks || [])) {
        const p = (h.args && h.args[0]) || null;
        if (!p) { log(`  ${ev}: shell-form (${h.command}) - cannot validate a path`); continue; }
        if (!existsSync(p)) { bad++; log(`  ${ev}: MISSING -> ${p}   <-- this triggers the loader error; re-run setup.mjs`); continue; }
        const chk = spawnSync(process.execPath, ["--check", p], { encoding: "utf8" });
        log(`  ${ev}: ${chk.status === 0 ? "OK     " : "BROKEN "} ${p}`);
        if (chk.status !== 0) bad++;
      }
    }
  }
  log(bad ? `\n${bad} problem(s). Run: node setup.mjs   (it now removes stale entries and rewrites correct paths).`
          : "\nAll registered hook scripts resolve and parse.");
  process.exit(bad ? 1 : 0);
}
const read = (p) => safe(() => readFileSync(p, "utf8"));
const MARKER = "CURATED:NOEDIT";
const MARKER_LINE = `<!-- ${MARKER} -->`;
// Whole-line match only (never a substring inside a longer line, so prose that just NAMES the
// marker can't self-trigger "curated" handling) - but lenient on whitespace: any line, any
// amount of spaces/tabs around the line and between the `<!--`/`-->` brackets and the marker
// text itself. Mirrors deny-curated-claude-md.mjs's own detection exactly - keep both in sync.
const MARKER_RE = /^<!--\s*CURATED:NOEDIT\s*-->$/;
const isCurated = (content) =>
  typeof content === "string" && content.split(/\r?\n/).some((line) => MARKER_RE.test(line.trim()));
const write = (p, c) => {
  if (DRY) return true;
  try { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); return true; }
  catch (e) { log(`  WARNING: could not write ${p} (${e.code || e.message})`); return false; }
};

/* ---------- deep additive JSON merge (existing values win; arrays unioned) ---------- */
const skipInvalidSettings = (block) => log(`\n  ${SETTINGS}: not valid JSON — skipped (${block})`);
function deepMerge(base, add) {
  if (Array.isArray(base) && Array.isArray(add)) {
    const seen = new Set(base.map((v) => JSON.stringify(v)));
    const out = base.slice();
    for (const v of add) { const k = JSON.stringify(v); if (!seen.has(k)) { out.push(v); seen.add(k); } }
    return out;
  }
  if (isObj(base) && isObj(add)) {
    const out = { ...base };
    for (const k of Object.keys(add)) out[k] = k in base ? deepMerge(base[k], add[k]) : add[k];
    return out;
  }
  return base; // scalar (or type) conflict: keep existing
}

/* ---------- unified diff (no external tools): hunks + line numbers + color/markdown ---------- */
function diffOps(a, b) {
  const n = a.length, m = b.length;
  if (n * m > 4_000_000) return null; // too large to diff cheaply
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = []; let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push([" ", a[i]]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) ops.push(["-", a[i++]]);
    else ops.push(["+", b[j++]]);
  }
  while (i < n) ops.push(["-", a[i++]]);
  while (j < m) ops.push(["+", b[j++]]);
  return ops;
}
function buildHunks(aStr, bStr, ctx = 3) {
  const ops = diffOps(aStr.split("\n"), bStr.split("\n"));
  if (ops === null) return null;
  const meta = []; let oldNo = 1, newNo = 1;
  for (const [t, line] of ops) {
    meta.push({ t, line, oldNo, newNo });
    if (t === " ") { oldNo++; newNo++; } else if (t === "-") oldNo++; else newNo++;
  }
  const keep = new Array(ops.length).fill(false);
  for (let k = 0; k < ops.length; k++) if (ops[k][0] !== " ") for (let c = -ctx; c <= ctx; c++) if (meta[k + c]) keep[k + c] = true;
  const hunks = []; let k = 0;
  while (k < ops.length) {
    if (!keep[k]) { k++; continue; }
    const s = k; while (k < ops.length && keep[k]) k++;
    const seg = meta.slice(s, k);
    const oldStart = (seg.find(x => x.t !== "+") || seg[0]).oldNo;
    const newStart = (seg.find(x => x.t !== "-") || seg[0]).newNo;
    const oldCount = seg.filter(x => x.t !== "+").length;
    const newCount = seg.filter(x => x.t !== "-").length;
    hunks.push({ header: `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`, rows: seg });
  }
  return hunks;
}
const ANSI = { add: "\x1b[32m", del: "\x1b[31m", hdr: "\x1b[36m", num: "\x1b[2m", off: "\x1b[0m" };
function renderDiff(aStr, bStr, ctx = 3) {
  const hunks = buildHunks(aStr, bStr, ctx);
  if (hunks === null) return "    (files differ; too large to render a diff)";
  if (hunks.length === 0) return "    (no textual differences)";
  // Markdown mode: a fenced ```diff block (renderers colorize +/-/@@). No line-number gutter so
  // the diff syntax highlighter keeps working.
  if (MD) {
    const body = hunks.flatMap(h => [h.header, ...h.rows.map(r => r.t + r.line)]).join("\n");
    return "```diff\n" + body + "\n```";
  }
  // Terminal mode: line numbers in a dim gutter + optional ANSI colors.
  const c = COLOR ? ANSI : { add: "", del: "", hdr: "", num: "", off: "" };
  const out = [];
  for (const h of hunks) {
    out.push("    " + c.hdr + h.header + c.off);
    for (const r of h.rows) {
      const oldN = r.t === "+" ? "    " : String(r.oldNo).padStart(4);
      const newN = r.t === "-" ? "    " : String(r.newNo).padStart(4);
      const gutter = c.num + oldN + " " + newN + c.off + " ";
      const col = r.t === "+" ? c.add : r.t === "-" ? c.del : "";
      out.push("    " + gutter + col + r.t + " " + r.line + (col ? c.off : ""));
    }
  }
  return out.join("\n");
}

/* ---------- interactive prompt ---------- */
function ask(q) {
  return new Promise((res) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (a) => { rl.close(); res((a || "").trim().toLowerCase()); });
  });
}
async function choose(label, fallback = "skip") {
  if (BULK) return BULK;
  if (!INTERACTIVE) { log(`    non-interactive -> ${fallback} (${label})`); return fallback; }
  let a = "";
  while (!["m", "r", "s"].includes(a[0])) a = await ask(`    choose (m)erge / (r)eplace / (s)kip > `);
  return a[0] === "m" ? "merge" : a[0] === "r" ? "replace" : "skip";
}

/* ---------- offer to relocate the config dir via CLAUDE_CONFIG_DIR ---------- */
// Case-preserving prompt — ask() lowercases its answer, which would corrupt a filesystem path.
function askRaw(q) {
  return new Promise((res) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (a) => { rl.close(); res((a || "").trim()); });
  });
}

// CLAUDE_CONFIG_DIR is the (undocumented, CLI-only) env var that relocates the user config dir.
// We only READ it elsewhere; this step lets the user SET/change it. Default offered = the target
// of an existing ~/.claude symlink, if any. The symlink is deliberately NOT removed (a
// filesystem-level fallback that also covers the VS Code extension, which ignores the env var,
// and any tool that still hardcodes ~/.claude).
async function proposeConfigDir() {
  const current = process.env.CLAUDE_CONFIG_DIR || "";
  const home = join(HOME, ".claude");
  let symlinkTarget = "";
  try { const rp = realpathSync(home); if (rp !== home) symlinkTarget = rp; } catch { /* absent */ }

  log("");
  log("Config dir relocation (CLAUDE_CONFIG_DIR):");
  log(`  current : ${current || "(unset - using ~/.claude)"}`);
  if (symlinkTarget) log(`  ~/.claude is a symlink -> ${symlinkTarget}`);

  if (!INTERACTIVE) {
    if (!current) log(`  To relocate (CLI): setx CLAUDE_CONFIG_DIR "<dir>" (Windows), then restart + re-run.`);
    return;
  }

  // Enter = do NOT set/change (safe default). Setting is always an explicit action: type a path,
  // or 'y' to accept the suggested path. This avoids silently writing the symlink target on Enter.
  const suggestion = current || symlinkTarget || "";
  if (suggestion) log(`  suggested path: ${suggestion}`);
  log(`  Enter a path to set CLAUDE_CONFIG_DIR${suggestion ? ", or 'y' to use the suggested path" : ""},`);
  log(`  or press Enter to NOT set it (leave unchanged).`);
  let target = "";
  for (;;) {
    const ans = await askRaw("  > ");
    if (!ans) { log("  left unchanged (CLAUDE_CONFIG_DIR not set)."); return; }
    const cand = (suggestion && (ans === "y" || ans === "Y")) ? suggestion : ans;
    const v = validateConfigDir(cand);
    if (v.ok) { target = v.norm; break; }               // v.norm has normalized (fixed) slashes
    log(`  ! ${v.error} - try again, or press Enter to skip.`);
  }
  if (target === current) { log(`  already set to ${target} (no change).`); return; }

  if (platform() === "win32") {
    const r = spawnSync("setx", ["CLAUDE_CONFIG_DIR", target], { encoding: "utf8" });
    if (r.status === 0) log(`  set (persistent, user scope): CLAUDE_CONFIG_DIR=${target}`);
    else { log(`  could not run setx (${((r.stderr || (r.error && r.error.message)) || "").trim()}). Set it manually:`); log(`    setx CLAUDE_CONFIG_DIR "${target}"`); }
  } else {
    log(`  add to your shell profile (~/.bashrc, ~/.zshenv, ...):`);
    log(`    export CLAUDE_CONFIG_DIR="${target}"`);
  }

  if (symlinkTarget) {
    log(`  Keeping the ~/.claude symlink - a filesystem-level fallback that also covers the VS Code`);
    log(`  extension (which ignores CLAUDE_CONFIG_DIR) and any tool that hardcodes ~/.claude.`);
  }
  log(`  NOTE: the env var is read at launch - restart your terminal AND re-run 'node setup.mjs' to`);
  log(`  deploy into ${target}. This run still deploys into ${CDIR}. Marketplace plugins may need`);
  log(`  reinstalling under the new dir (their registry stores absolute paths).`);
}

/* ---------- copy any bundle file into ~/.claude with conflict resolution ---------- */
// Bundle-meta that must NOT be copied into ~/.claude (only matched at the archive root):
const META = new Set(["setup.mjs", "README.md", "settings.partial.json", "RISK_REGISTER.md", "settings.json", "bootstrap.sh", "bootstrap.ps1"]);
const copiedScripts = [];
function* walkBundle(dir, rel = "") {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;             // skip .git, .DS_Store, etc. at any level
    if (e.name === "__pycache__" || e.name.endsWith(".pyc")) continue;  // never ship Python build artifacts
    if (rel === "" && META.has(e.name)) continue;     // skip installer-meta at the archive root
    const childRel = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) yield* walkBundle(join(dir, e.name), childRel);
    else yield childRel;
  }
}

const summary = [];
const manifestNow = [];   // {rel, hash} for every file THIS bundle ships - persisted for next run's prune
async function placeFile(rel, srcPath) {
  const parts = rel.split("/");
  const src = srcPath || join(SRC, ...parts);
  const dst = join(CDIR, ...parts);
  const srcContent = read(src);
  if (srcContent === undefined) { summary.push(`MISSING in bundle: ${rel}`); return; }
  manifestNow.push({ rel, hash: sha(srcContent) });

  // setting-templates/**: per its own README, this tree is pure bundle content (stack template
  // definitions authored by this repo) - never hand-edited by an end user, unlike settings.json
  // which legitimately holds per-machine values. So it skips the JSON-merge tier entirely and is
  // always refreshed to the bundled version, same as a script - a template fix (e.g. a marketplace
  // URL) always takes effect on the next run instead of being kept-as-is by additive merge.
  if (rel.startsWith("setting-templates/")) {
    if (!existsSync(dst)) { if (write(dst, srcContent)) summary.push(`created  ${dst}`); return; }
    const cur = read(dst);
    if (cur === srcContent) { summary.push(`unchanged ${dst}`); return; }
    if (write(dst, srcContent)) summary.push(`updated  ${dst}`);
    return;
  }

  if (!existsSync(dst)) {
    if (write(dst, srcContent)) { summary.push(`created  ${dst}`); if (dst.endsWith(".mjs")) copiedScripts.push(dst); }
    return;
  }
  const cur = read(dst);
  if (cur === srcContent) { summary.push(`unchanged ${dst}`); return; }

  // Scripts (.mjs) are managed code: always refreshed to the bundled version, no prompt.
  if (dst.toLowerCase().endsWith(".mjs")) {
    if (write(dst, srcContent)) { summary.push(`updated  ${dst}`); copiedScripts.push(dst); }
    return;
  }

  // JSON files: real deep additive merge (your values kept, missing keys/array items added).
  if (dst.toLowerCase().endsWith(".json")) {
    const baseObj = safe(() => JSON.parse(cur));
    const addObj = safe(() => JSON.parse(srcContent));
    if (baseObj !== undefined && addObj !== undefined) {
      const mergedStr = JSON.stringify(deepMerge(baseObj, addObj), null, 2);
      const curStr = JSON.stringify(baseObj, null, 2);
      if (curStr === mergedStr) { summary.push(`unchanged ${dst} (already a superset)`); return; }
      log(`\n~ conflict (json): ${dst}`);
      log("    (merge = deep additive: your values kept, missing keys/array items added)");
      log(renderDiff(curStr, mergedStr));
      const act = await choose(dst, "merge");
      if (act === "skip") { summary.push(`skipped  ${dst}`); return; }
      if (act === "replace") {
        if (write(dst, srcContent)) summary.push(`replaced ${dst} (no backup - see diff above if you need the old content)`);
        return;
      }
      if (write(dst, mergedStr + "\n")) summary.push(`merged   ${dst} (deep additive)`);
      return;
    }
    // not valid JSON on one side -> fall through to text handling
  }

  // Other non-script files (.md, text): two tiers.
  //   - NOT curated -> managed content, same as scripts: always refresh, no prompt. This is what
  //     makes rules/, skills/, README.md etc. actually pick up bundle updates on a plain re-run.
  if (!isCurated(cur)) {
    if (write(dst, srcContent)) { summary.push(`updated  ${dst}`); }
    return;
  }
  //   - Curated (marker present in the CURRENT file) -> never silently touched. Show diff, ask.
  log(`\n~ conflict (curated): ${dst}`);
  log(renderDiff(cur, srcContent));
  const act = await choose(dst, "merge");
  if (act === "replace") {
    if (write(dst, srcContent)) summary.push(`replaced ${dst} (no backup - see diff above if you need the old content)`);
    return;
  }
  // "skip" AND the default "merge" both land here: curated text can't be auto-merged, and no
  // side file is ever written for it (no `<name>.new`) - the diff printed above IS the merge
  // output. `dst` is left byte-for-byte untouched; apply it by hand, or re-run with
  // --replace-all to accept the bundle version outright (see "replace" above for the backup).
  summary.push(`${act === "skip" ? "skipped" : "kept (see diff above)"} ${dst}`);
}

/* ---------- prune: remove files an OLDER bundle installed that this one no longer ships ----------
 * Safe-gated per the "delete only if guaranteed unused" rule: a candidate is removed only if it is
 * (a) not curated, (b) not referenced by any name in the CURRENT bundle, and (c) unchanged since we
 * installed it (its hash still matches the previous manifest). Anything failing a gate is kept and
 * reported. Default: list + confirm (non-TTY lists only; --skip-all skips; --replace/--merge-all
 * imply cleanup). */
function bundleAllText() {
  let t = "";
  for (const rel of V.rels) t += "\n" + (read(V.srcFor(rel)) || "");
  return t;
}
/* ---------- setting-templates/: full folder overwrite (delete anything not in the bundle) ----------
 * This directory is pure bundle content (see payload/setting-templates/README.md) - no per-machine
 * values, never hand-edited - so unlike pruneStale() below it needs none of that function's safety
 * gates (curated? still referenced by name in the bundle? modified since install?). Those gates
 * actively misfire here anyway: every README.md under setting-templates/ mentions "_base.json" in
 * prose, so the generic "still referenced in bundle" text-search would forever protect a stale
 * _base.json from ever being pruned. Mirror semantics instead: destination becomes an exact copy. */
function walkDir(dir, rel = "") {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const childRel = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walkDir(join(dir, e.name), childRel));
    else out.push(childRel);
  }
  return out;
}
function overwriteTemplatesDir() {
  const bundleRels = new Set(walkDir(join(SRC, "setting-templates")));
  const destDir = join(CDIR, "setting-templates");
  const staleRels = walkDir(destDir).filter((r) => !bundleRels.has(r));
  if (!staleRels.length) return;
  log("\n--- setting-templates/: stale files removed (full overwrite; pure bundle content, no gating) ---");
  for (const r of staleRels) {
    const dst = join(destDir, ...r.split("/"));
    log("  " + dst);
    if (DRY) { summary.push(`would-prune ${dst}`); continue; }
    try { rmSync(dst, { force: true }); summary.push(`pruned   ${dst}`); }
    catch { summary.push(`prune-failed ${dst}`); }
  }
}

/* ---------- one-time migration: ~/.claude/rules -> ~/.claude/rules-src ---------- */
// Rules moved out of ~/.claude/rules/ (auto-loaded by Claude Code with no off switch) into
// rules-src/ (compiled into per-project .claude/stack-rules.md - see payload/rules-src/README.md).
// Old bundle-owned copies left in ~/.claude/rules/ would keep auto-loading and double every
// rule, so remove each file whose relative path exists in the bundle's rules-src/, keep
// user-authored files, and drop directories that end up empty. pruneStale() can't cover this:
// its "still referenced in bundle" name gate misfires here (the rules-src README lists every
// rule filename in prose).
function migrateRulesDir() {
  const oldDir = join(CDIR, "rules");
  if (!existsSync(oldDir)) return;
  const bundleRels = new Set(walkDir(join(SRC, "rules-src")));
  for (const rel of walkDir(oldDir)) {
    if (!bundleRels.has(rel)) continue; // user-authored: keep (it still auto-loads)
    const dst = join(oldDir, ...rel.split("/"));
    if (DRY) { summary.push(`would-prune ${dst} (moved to rules-src)`); continue; }
    try { rmSync(dst, { force: true }); summary.push(`pruned   ${dst} (moved to rules-src)`); }
    catch { summary.push(`prune-failed ${dst}`); }
  }
  if (DRY) return;
  // Remove now-empty directories bottom-up (raw readdir, so hidden leftovers block deletion
  // rather than being silently destroyed), then report anything user-authored that remains.
  const rmEmptyDirs = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true }))
      if (e.isDirectory()) rmEmptyDirs(join(dir, e.name));
    if (!readdirSync(dir).length) { rmSync(dir, { recursive: true, force: true }); return true; }
    return false;
  };
  if (safe(() => rmEmptyDirs(oldDir))) summary.push(`pruned   ${oldDir} (empty after migration)`);
  else if (existsSync(oldDir))
    log(`\nNOTE: ~/.claude/rules still holds user files not from this bundle - they keep ` +
      `auto-loading path-scoped; move them into ~/.claude/rules-src by hand if that's not intended.`);
}

async function pruneStale() {
  const oldManifest = safe(() => JSON.parse(readFileSync(MANIFEST, "utf8"))) || { files: [] };
  const currentRels = new Set(manifestNow.map((f) => f.rel));
  const oldByRel = new Map((oldManifest.files || []).map((f) => [f.rel, f.hash]));
  const candidates = new Set();
  for (const rel of oldByRel.keys()) if (!currentRels.has(rel)) candidates.add(rel);
  for (const rel of SEED_REMOVED) if (!currentRels.has(rel)) candidates.add(rel);
  for (const rel of RETIRED_RELS) if (!currentRels.has(rel)) candidates.add(rel);
  if (!candidates.size) return [];

  const allText = bundleAllText();
  const del = [], kept = [];
  for (const rel of candidates) {
    const dst = join(CDIR, ...rel.split("/"));
    if (!existsSync(dst)) continue;                                  // already gone
    const cur = read(dst);
    if (typeof cur === "string" && isCurated(cur)) { kept.push([rel, "curated"]); continue; }
    const variantExcluded = V.excludedSet.has(rel);
    if (!variantExcluded && !RETIRED_RELS.has(rel) && allText.includes(rel.split("/").pop())) { kept.push([rel, "still referenced in bundle"]); continue; }
    const oldHash = oldByRel.get(rel);
    if (oldHash && cur !== undefined && sha(cur) !== oldHash) { kept.push([rel, "modified since install"]); continue; }
    del.push({ rel, dst });
  }
  // Every rel this function took responsibility for, removed or not.
  const considered = [...del.map((d) => d.rel), ...kept.map(([rel]) => rel)];
  if (kept.length) { log("\n--- stale but KEPT (not safe to auto-remove) ---"); for (const [rel, why] of kept) log(`  ${rel} (${why})`); }
  if (!del.length) return considered;

  log("\n--- stale files no longer in the bundle ---");
  for (const d of del) log("  " + d.dst);
  let go = false;
  if (DRY) log("  (dry-run: not removed)");
  else if (BULK === "skip") log("  (--skip-all: not removed)");
  else if (BULK) go = true;                                          // --merge-all / --replace-all imply cleanup
  else if (INTERACTIVE) { const a = await ask("    remove these stale files? (y/N) > "); go = a[0] === "y"; }
  else log("  (non-interactive: not removed - re-run in a terminal, or pass --replace-all, to prune)");
  if (go) for (const d of del) {
    try { rmSync(d.dst, { recursive: true, force: true }); summary.push(`pruned   ${d.dst}`); }
    catch { summary.push(`prune-failed ${d.dst}`); }
  }
  if (go) for (const d of del) {
    if (!RETIRED_RELS.has(d.rel)) continue;
    for (let dir = dirname(d.dst); dir.length > CDIR.length; dir = dirname(dir)) {
      try { rmdirSync(dir); } catch { break; }
    }
  }
  return considered;
}

/* The settings.json diff and the stale prune are two independent decisions, so answering (s) to the
 * diff and yes to the prune repoints nothing and deletes the file the old command named - a blank
 * statusline with no visible cause. Report it: silently rewriting settings the user chose to skip
 * would be the worse answer, and naming the re-run that repairs it is the whole fix. */
function warnStatuslineNamesMissingFile() {
  const cmd = safe(() => JSON.parse(readFileSync(SETTINGS, "utf8")).statusLine.command);
  if (typeof cmd !== "string") return;
  const fwd = cmd.replace(/\\/g, "/");
  const under = CDIR.replace(/\\/g, "/").replace(/\/+$/, "") + "/";
  // Quoted first (the shape every generated command uses, and the only one safe for a path with a
  // space in it), bare whitespace-split as a fallback for a hand-written unquoted command.
  const tokens = [...[...fwd.matchAll(/"([^"]+)"/g)].map((m) => m[1]), ...fwd.split(/\s+/)];
  const missing = tokens.find((t) => t.startsWith(under) && !existsSync(t));
  if (!missing) return;
  log(`\nWARNING: settings.json statusLine.command names a file that is not on disk:`);
  log(`  ${missing}`);
  log(`  The statusline will render an empty line until the command is repointed. Re-run`);
  log(`  'node setup.mjs' and answer (r) or (m) at the settings.json diff - or pass --replace-all /`);
  log(`  --merge-all - to point it at hooks/statusline.mjs.`);
}

// Best-effort: resolve the commit we just installed, for the update-check hook's baseline.
// Prefers a local git checkout (REPO_ROOT has .git -> exact, no network); falls back to asking
// GitHub what master currently points at (covers the bootstrap-tarball install path, where
// GitHub's archive endpoint strips .git entirely). Any failure (offline, rate-limited, blocked)
// just leaves installedSha unset - the update-check hook has no baseline yet and stays silent
// until a later run succeeds. Never throws, never blocks the install on network access.
async function resolveInstalledSha() {
  const g = spawnSync("git", ["-C", REPO_ROOT, "rev-parse", "HEAD"], { encoding: "utf8" });
  if (!g.error && g.status === 0) {
    const sha = (g.stdout || "").trim();
    if (/^[0-9a-f]{40}$/.test(sha)) return sha;
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch("https://api.github.com/repos/axazolai/claude-config/commits/master",
      { signal: ctrl.signal, headers: { "User-Agent": "claude-config-setup" } });
    clearTimeout(t);
    if (res.ok) {
      const j = await res.json();
      if (j && typeof j.sha === "string") return j.sha;
    }
  } catch { /* offline / rate-limited / blocked - fine, resolved on a later run instead */ }
  return undefined;
}

// The component checker throttles itself to one remote check per 24h, so the verdict it recorded
// BEFORE this install would keep telling the user to re-run an installer that just ran. Nothing
// is created here: with no prior verdict there is no stale banner to correct.
function reconcileUpdateState(installedSha) {
  const p = join(CDIR, "state", "component-updates.json");
  const state = safe(() => JSON.parse(readFileSync(p, "utf8")));
  if (!state) return;
  const next = reconcileBundleInstall(state, installedSha);
  if (next !== state) write(p, JSON.stringify(next, null, 2) + "\n");
}

async function main() {
  await proposeConfigDir();

  // ---------- variant selection (spec § 9) ----------
  const known = Object.keys(profilesOf(loadVariants(REPO_ROOT)));
  const resolveProfile = (name, source) => {
    if (!name) return null;
    if (name === "full") { log(`profile "full" was removed; using "base"`); return "base"; }
    if (known.includes(name)) return name;
    if (source === "arg") { log(`Unknown --variant=${name}. Known: ${known.join(", ")}`); process.exit(1); }
    log(`profile "${name}" is unknown; using "base"`);
    return "base";
  };
  const oldManifestEarly = safe(() => JSON.parse(readFileSync(MANIFEST, "utf8")));
  const installedVariant = oldManifestEarly ? (oldManifestEarly.profile || oldManifestEarly.variant || null) : null;
  VARIANT = resolveProfile(VARIANT_ARG, "arg");
  if (!VARIANT && INTERACTIVE) {
    const def = resolveProfile(installedVariant, "manifest") || "base";
    const a = (await ask(`  bundle profile [${known.join("/")}] (Enter = ${def}) > `)).trim().toLowerCase();
    VARIANT = a === "full" || known.includes(a) ? resolveProfile(a, "prompt") : def;
  }
  if (!VARIANT) VARIANT = resolveProfile(installedVariant, "manifest") || "base";

  const profileDef = profilesOf(loadVariants(REPO_ROOT))[VARIANT] || {};
  V = resolveVariant({ repoRoot: REPO_ROOT, variant: VARIANT });
  const installedResolved = installedVariant === "full" ? "base" : installedVariant;
  if (installedResolved && installedResolved !== VARIANT)
    log(`Switching variant: ${installedResolved} -> ${VARIANT} (surplus files listed for removal below)`);
  log(`Variant: ${VARIANT} (${V.rels.length} files)`);

  log(`Installing into ${CDIR}${DRY ? "  [DRY RUN]" : ""}`);
  mkdirSync(CDIR, { recursive: true });

  // Mirror the resolved variant's file set into ~/.claude (minus installer-meta). This means any
  // files or folders the variant covers are copied too: new ones are created, existing .mjs are
  // refreshed, other existing files are conflict-checked via diff.
  for (const rel of V.rels) await placeFile(rel, V.srcFor(rel));

  // best-effort exec bits on POSIX for every script we copied (ignored on Windows)
  if (platform() !== "win32" && !DRY)
    for (const p of copiedScripts) safe(() => chmodSync(p, 0o755));

  /* ---------- assemble + write ~/.claude/CLAUDE.md from per-profile fragments ----------
   * Replaces the old per-variant CLAUDE.md monoliths (payload/CLAUDE.md, payload-lite/CLAUDE.md):
   * the assembled text is built fresh every run from payload/claude-md/ fragments for VARIANT
   * (assemble-claude-md.mjs), which already starts with the CURATED:NOEDIT marker + a GENERATED
   * header - so this single step both installs the file AND guarantees the marker, no separate
   * "ensure marker" pass needed anymore. CLAUDE.md is deliberately NOT part of V.rels (payload/
   * claude-md/** is in alwaysExclude - it's a build input, never copied 1:1), so it is placed
   * here instead of through the placeFile() loop above - but it still goes through the same
   * curated-conflict tiering as any other curated file (unchanged -> no-op; new -> create; changed
   * -> diff + merge/replace/skip) so a hand-edited ~/.claude/CLAUDE.md is never silently clobbered.
   */
  {
    const assembled = assembleClaudeMd(join(SRC, "claude-md"), VARIANT);
    manifestNow.push({ rel: "CLAUDE.md", hash: sha(assembled) });
    const globalClaudeMd = join(CDIR, "CLAUDE.md");
    const curGlobal = read(globalClaudeMd);
    if (curGlobal === undefined) {
      if (write(globalClaudeMd, assembled)) summary.push(`created  ${globalClaudeMd}`);
    } else if (curGlobal === assembled) {
      summary.push(`unchanged ${globalClaudeMd}`);
    } else {
      log(`\n~ conflict (curated): ${globalClaudeMd}`);
      log(renderDiff(curGlobal, assembled));
      const act = await choose(globalClaudeMd, "merge");
      if (act === "replace") {
        if (write(globalClaudeMd, assembled))
          summary.push(`replaced ${globalClaudeMd} (no backup - see diff above if you need the old content)`);
      } else {
        summary.push(`${act === "skip" ? "skipped" : "kept (see diff above)"} ${globalClaudeMd}`);
      }
    }
  }

  /* ---------- graphify: remove every trace ---------- */
  // Unconditional, not profile-gated: no profile ships graphify any more, so a machine still
  // carrying it carries an orphan. Runs before the settings merge and before pruneStale() so both
  // see an already-clean machine. Two sides wrote this state and both are covered: this bundle
  // (bin/graph-*, the sync hooks, the native post-commit hook, ~/.graphify) and graphify's own
  // `graphify claude install` (a CLAUDE.md section, hook-guard entries in a project's
  // .claude/settings.json). Evidence is collected before anything is deleted: the state that proves
  // which MCP server was graphify's backend is state this same pass removes.
  //
  // CLAUDE_SETUP_SKIP_PURGE=1 is the test escape hatch, and it is not optional there: the removals
  // below are the only ones in this installer anchored to HOME rather than CDIR, so a harness that
  // sandboxes CLAUDE_CONFIG_DIR alone would purge the real machine.
  if (process.env.CLAUDE_SETUP_SKIP_PURGE !== "1") {
    const purged = [];
    const rmPath = (target, label = target) => {
      if (!existsSync(target)) return;
      if (DRY) { purged.push(`would remove ${label}`); return; }
      safe(() => rmSync(target, { recursive: true, force: true }));
      purged.push(existsSync(target) ? `FAILED to remove ${label}` : `removed ${label}`);
    };
    const rewriteJson = (target, next, what) => {
      if (DRY) { purged.push(`would clean ${target} (${what})`); return; }
      if (write(target, JSON.stringify(next, null, 2) + "\n")) purged.push(`cleaned ${target} (${what})`);
    };

    const graphifyHome = join(HOME, ".graphify");
    const stateDir = join(CDIR, "state");
    const projectInitPath = join(stateDir, "project-init.json");
    const claudeJsonPath = [join(CDIR, ".claude.json"), join(HOME, ".claude.json")].find((x) => existsSync(x));

    // --- evidence, gathered while it still exists ---
    const gm = safe(() => JSON.parse(readFileSync(join(graphifyHome, "global-manifest.json"), "utf8")));
    const projectInit = safe(() => JSON.parse(readFileSync(projectInitPath, "utf8")));
    const claudeJson = claudeJsonPath && safe(() => JSON.parse(readFileSync(claudeJsonPath, "utf8")));
    const userSettings = safe(() => JSON.parse(readFileSync(SETTINGS, "utf8")));
    const stateNames = safe(() => readdirSync(stateDir)) || [];
    const listDirs = (at) => (safe(() => readdirSync(at, { withFileTypes: true })) || [])
      .filter((e) => e.isDirectory()).map((e) => e.name);
    const stashes = findStashedGraphify(CDIR, listDirs);
    const graphifyFiles = [graphifyHome, ...stashes].flatMap((d) => safe(() => readdirSync(d)) || []);
    const companions = companionMcpNames({ settings: userSettings, stateNames, graphifyFiles, claudeJson });

    const roots = discoverRoots({ manifest: gm, projectInit, claudeJson });
    const here = REPO_ROOT.replace(/\\/g, "/");
    if (!roots.includes(here)) roots.push(here);

    for (const rel of GRAPHIFY_BUNDLE_RELS) rmPath(join(CDIR, ...rel.split("/")));
    rmPath(join(CDIR, "settings.json.graphify-bak"));
    for (const name of stateNames) if (/^graphify-/.test(name)) rmPath(join(stateDir, name));
    for (const stash of stashes) rmPath(stash, `${stash} (stashed copy)`);

    for (const root of roots) {
      // A recorded path that no longer names a repo is a path this installer has no business
      // walking: these lists outlive the directories they were written for.
      if (!existsSync(join(root, ".git")) && !existsSync(join(root, "graphify-out"))) continue;
      for (const rel of GRAPHIFY_PROJECT_RELS) rmPath(join(root, ...rel.split("/")));

      const postCommit = join(root, ".git", "hooks", "post-commit");
      const pcText = read(postCommit);
      if (pcText !== undefined && /graphify/i.test(pcText)) {
        const next = stripPostCommit(pcText);
        if (next === null) rmPath(postCommit, `${postCommit} (graphify-only hook)`);
        else if (DRY) purged.push(`would clean ${postCommit}`);
        else if (write(postCommit, next)) purged.push(`cleaned ${postCommit}`);
      }

      const rootClaudeMd = join(root, "CLAUDE.md");
      const mdText = read(rootClaudeMd);
      const mdNext = mdText === undefined ? null : stripGraphifyClaudeSection(mdText);
      if (mdNext !== null) {
        if (DRY) purged.push(`would clean ${rootClaudeMd}`);
        else if (write(rootClaudeMd, mdNext)) purged.push(`cleaned ${rootClaudeMd} (graphify's own section)`);
      }

      const projSettings = join(root, ".claude", "settings.json");
      const projJson = safe(() => JSON.parse(readFileSync(projSettings, "utf8")));
      if (projJson) {
        const { settings: cleaned, removed } = stripGraphifySettings(projJson);
        if (removed.length) rewriteJson(projSettings, cleaned, removed.join(", "));
      }
    }

    rmPath(graphifyHome, `${graphifyHome} (global graph)`);

    if (userSettings) {
      const { settings: cleaned, removed } = stripGraphifySettings(userSettings);
      if (removed.length) rewriteJson(SETTINGS, cleaned, removed.join(", "));
    }

    const componentState = join(stateDir, "component-updates.json");
    const components = safe(() => JSON.parse(readFileSync(componentState, "utf8")));
    if (components && components.graphify) {
      delete components.graphify;
      rewriteJson(componentState, components, "graphify entry");
    }

    if (projectInit) {
      const { state: cleaned, touched } = stripProjectInitGraphify(projectInit);
      if (touched) rewriteJson(projectInitPath, cleaned, `${touched} graphify flag(s)/note(s)`);
    }

    if (claudeJson) {
      const { claudeJson: cleaned, removed } = stripGraphifyMcp(claudeJson, companions);
      if (removed.length) rewriteJson(claudeJsonPath, cleaned, `MCP ${removed.join(", ")}`);
    }

    const uvTools = safe(() => spawnSync("uv", ["tool", "list"], { encoding: "utf8" }));
    const uvReady = uvTools && !uvTools.error;
    if (uvReady && /graphifyy/.test(uvTools.stdout || "")) {
      if (DRY) purged.push("would run: uv tool uninstall graphifyy");
      else {
        const r = safe(() => spawnSync("uv", ["tool", "uninstall", "graphifyy"], { encoding: "utf8" }));
        purged.push(r && r.status === 0 ? "uninstalled the graphifyy uv tool"
          : "uv tool uninstall graphifyy FAILED - run it by hand");
      }
    }
    // uvx never installs the companion, it runs it from the cache - so the cache entry is the
    // install. Scoped to the package: `uv cache prune` would evict every unrelated tool too.
    for (const name of companions) {
      const pkg = ((claudeJson.mcpServers || {})[name].args || [])
        .map(String).find((a) => /^mcp-.*(neo4j|cypher)/i.test(a));
      if (!uvReady || !pkg) continue;
      const bare = pkg.split("@")[0];
      if (DRY) { purged.push(`would run: uv cache clean ${bare}`); continue; }
      const r = safe(() => spawnSync("uv", ["cache", "clean", bare], { encoding: "utf8" }));
      purged.push(r && r.status === 0 ? `cleared the uv cache for ${bare}`
        : `uv cache clean ${bare} FAILED - run it by hand`);
    }

    if (purged.length) {
      log(formatPurge(purged));
      summary.push(`graphify ${DRY ? "purge (dry run)" : "purged"}: ${purged.length} item(s) - listed above`);
    }
  }

  /* ---------- GSD: remove every trace ---------- */
  // Unconditional: no profile ships GSD. Automatic and permanent by design (RISK-GSDPURGE-001).
  {
    const projectInitPath = join(CDIR, "state", "project-init.json");
    const settingsText = read(SETTINGS);
    const settingsJson = settingsText === undefined ? null : safe(() => JSON.parse(settingsText)) ?? null;
    const plan = planGsdPurge({
      claudeDir: CDIR, homeDir: HOME, exists: existsSync,
      list: (p) => safe(() => readdirSync(p)) || [],
      settings: settingsJson,
      projectInit: safe(() => JSON.parse(readFileSync(projectInitPath, "utf8"))) ?? null,
    });
    if (!isEmptyPlan(plan)) {
      log(formatGsdPurge(plan, DRY));
      if (!DRY) {
        for (const p of plan.paths) {
          safe(() => rmSync(p, { recursive: true, force: true }));
          if (existsSync(p)) log(`  FAILED to remove ${p}`);
        }
        if (plan.settings.changed) {
          copyFileSync(SETTINGS, `${SETTINGS}.pre-gsd-purge`);
          if (!write(SETTINGS, JSON.stringify(plan.settings.next, null, 2) + "\n")) log(`  FAILED to clean ${SETTINGS}`);
        }
        if (plan.state.changed) write(projectInitPath, JSON.stringify(plan.state.next, null, 2) + "\n");
      }
      summary.push(`GSD ${DRY ? "purge (dry run)" : "purged"}: ${plan.paths.length} path(s) - listed above`);
    }
  }

  /* ---------- settings.json: structured additive merge ---------- */
  // Source of truth for "what hooks/permissions we want" is settings.partial.json itself - NOT a
  // second hardcoded copy in here. That duplication is exactly how this used to drift (a hook
  // added to settings.partial.json without a matching edit here would silently never get wired
  // into a real ~/.claude/settings.json, even though its .mjs file was correctly copied).
  const cur = readJsonOrNull(SETTINGS);
  if (cur === null) summary.push("settings.json: INVALID JSON - left untouched");
  const partialRaw = read(join(REPO_ROOT, "settings.partial.json"));
  const partial = partialRaw === undefined ? null
    : safe(() => JSON.parse(partialRaw
        .split("<HOME>/.claude").join(JSON.stringify(CDIR).slice(1, -1))
        .split("<HOME>").join(JSON.stringify(HOME).slice(1, -1))));
  if (partialRaw !== undefined && partial === null) summary.push("settings.partial.json: failed to parse - settings.json hooks left untouched");

  if (cur !== null && partial !== null) {
    const merged = JSON.parse(JSON.stringify(cur));
    merged.hooks = merged.hooks || {};

    // "Ours" = every hook script filename declared anywhere in settings.partial.json, collected
    // dynamically - so adding/renaming/moving a hook there (e.g. a hook moving
    // from SessionStart to PreToolUse) is automatically picked up here with no hand-sync needed.
    const ourFiles = new Set();
    for (const entries of Object.values(partial.hooks || {}))
      for (const e of entries) for (const h of (e.hooks || []))
        for (const a of (h.args || [])) ourFiles.add(String(a).split(/[\\/]/).pop());
    // Hooks this bundle no longer ships: still ours, so their stale entries are stripped.
    for (const f of RETIRED_HOOK_FILES) ourFiles.add(f);
    const mentionsOurs = (e) => (e.hooks || []).some(h => (h.args || []).some(a => ourFiles.has(String(a).split(/[\\/]/).pop())));

    // Re-add side is variant-filtered: a lite install must not re-add base-only hook entries even
    // though they're still present in the FULL partial used above to strip stale entries.
    const variantBasenames = new Set(V.rels.map((r) => r.split("/").pop()));
    const partialHooksForVariant = filterPartialHooks(partial.hooks, variantBasenames);

    for (const [ev, entries] of Object.entries(partialHooksForVariant)) {
      // claim our slots: drop any prior entry that references one of our hook files (stale paths,
      // old .sh, wrong home, or an event type it used to live under) - this both repairs the
      // "cannot find module" loader error on re-run and prevents duplicates when a hook's event
      // changes - then add back the correct, current entries from the partial.
      const arr = (merged.hooks[ev] || []).filter(e => !mentionsOurs(e));
      for (const w of entries) arr.push(w);
      merged.hooks[ev] = arr;
    }
    // Also strip our entries from any event the partial no longer declares them under (handles a
    // hook moving OUT of an event entirely, not just being re-added to a different one above).
    for (const ev of Object.keys(merged.hooks)) {
      if (ev in partialHooksForVariant) continue;
      merged.hooks[ev] = (merged.hooks[ev] || []).filter(e => !mentionsOurs(e));
      // NOTE: deliberately NOT deleting now-empty event arrays here - delete+later-readd
      // moves the key to the object tail and breaks the byte-identical full->lite->full
      // settings.json round trip. An empty `TaskCreated: []` on lite is harmless residue.
    }

    merged.permissions = merged.permissions || {};
    for (const [k, v] of Object.entries(partial.permissions || {})) {
      if (Array.isArray(v)) {
        const s = new Set(merged.permissions[k] || []);
        v.forEach((x) => s.add(x));
        merged.permissions[k] = [...s];
      } else if (!(k in merged.permissions)) {
        merged.permissions[k] = v;
      }
    }
    // Normalize file-permission rules: Claude Code now matches ALL file-editing tools via the
    // Edit(path) form, so Write(x)/MultiEdit(x) path rules are ignored ("not matched by file
    // permission checks") and MultiEdit is no longer a known tool. Rewrite those to Edit(x) and
    // dedup, migrating stale rules (from older bundles or hand-added settings) that would
    // otherwise keep emitting startup warnings. Non-file rules (Bash(...), mcp__*, …) untouched.
    for (const k of Object.keys(merged.permissions)) {
      if (!Array.isArray(merged.permissions[k])) continue;
      const seen = new Set();
      merged.permissions[k] = merged.permissions[k].reduce((acc, r) => {
        const nr = typeof r === "string" ? r.replace(/^(?:Write|MultiEdit)\(/, "Edit(") : r;
        const key = typeof nr === "string" ? nr : JSON.stringify(nr);
        if (!seen.has(key)) { seen.add(key); acc.push(nr); }
        return acc;
      }, []);
    }

    // Either historical renderer counts as ours, in both directions: a profile switch prunes the
    // file the old entry pointed at, so a takeover that recognised only one would leave statusLine
    // aimed at nothing and render an empty line on every prompt.
    const ourStatusLine = (cmd) => typeof cmd === "string"
      && cmd.includes("hooks/statusline.mjs");
    if (partial.statusLine) {
      const curCmd = merged.statusLine && merged.statusLine.command;
      if (!curCmd || ourStatusLine(curCmd)) {
        const scriptPath = join(CDIR, "hooks", "statusline.mjs").replace(/\\/g, "/");
        merged.statusLine = { type: "command", ...partial.statusLine, command: `node "${scriptPath}"` };
      }
    }

    // §6.3 Part B: a superseded session model (e.g. claude-opus-4-8) migrates to the current
    // tier-preserving id. Aliases (opus/sonnet/...) and current ids are left as-is. Interactive:
    // prompt, and on yes the new value rides the unified settings diff+choose below. BULK/non-TTY:
    // report only - never rewrite the user's chosen session model unattended.
    // Skipped whenever the session-defaults block below will already cover `model` - one
    // question/report per key, not a migrate prompt immediately followed by a bundle-default
    // one. Unconditional today: no superseded id can equal the bundle-managed default (the
    // comparison is against the user's CURRENT value, not the migration target - reshaping the
    // default, e.g. to a full id, does not disable this). The only way to disable it is removing
    // `sessionDefaults.model` from variants.json entirely.
    if (typeof merged.model === "string") {
      const mm = migrateSettingsModel(merged.model);
      const managedModel = (loadVariants(REPO_ROOT).sessionDefaults || {}).model;
      const coveredBySessionDefaults = managedModel !== undefined && managedModel !== merged.model;
      if (mm.changed && !coveredBySessionDefaults) {
        if (INTERACTIVE) {
          const yes = await ask(`\n    model "${mm.from}" looks superseded - migrate to "${mm.value}"? (y/N) > `);
          if (yes.startsWith("y")) { merged.model = mm.value; summary.push(`model    ${mm.from} -> ${mm.value}`); }
          else summary.push(`model    kept ${mm.from} (superseded; set ${mm.value} by hand to migrate)`);
        } else {
          summary.push(`model    ${mm.from} looks superseded - re-run interactively or set ${mm.value} by hand`);
        }
      }
    }

    const curStr = JSON.stringify(cur, null, 2);
    const mergedStr = JSON.stringify(merged, null, 2);
    // settings.json IS conflict-checked (it is not a script). The computed result is the additive
    // merge: it preserves your model / enabledPlugins / language and any unrelated keys, removes
    // stale/duplicate entries that reference our hooks, and adds the correct ones. Re-running is
    // therefore idempotent (no duplicates). On a real diff you choose how to apply it.
    if (curStr === mergedStr) {
      summary.push(`unchanged ${SETTINGS}`);
    } else if (!existsSync(SETTINGS)) {
      if (write(SETTINGS, mergedStr + "\n")) summary.push(`created  ${SETTINGS}`);
    } else {
      log(`\n~ conflict: ${SETTINGS}`);
      log("    (merge = additive: your keys kept, stale hook entries removed, correct ones added)");
      log(renderDiff(curStr, mergedStr));
      const act = await choose(SETTINGS, "merge"); // non-interactive default: apply the safe merge
      if (act === "skip") { summary.push(`skipped  ${SETTINGS}`); }
      else {
        if (write(SETTINGS, mergedStr + "\n"))
          summary.push(`${act === "replace" ? "replaced" : "merged"} ${SETTINGS}${act === "replace" ? " (no backup - see diff above)" : " (additive; your keys preserved)"}`);
      }
    }
  }

  /* ---------- plugin reconciliation (spec § 4): only managedPlugins are ever touched ---------- */
  const curSettings = readJsonOrNull(SETTINGS);
  if (curSettings === null) skipInvalidSettings("plugin reconciliation");
  else {
    const variantsFile = loadVariants(REPO_ROOT);
    const managed = variantsFile.managedPlugins;
    const keepInstalled = variantsFile.keepInstalled || [];
    const cliProbe = process.env.CLAUDE_SETUP_SKIP_PLUGINS === "1"
      ? undefined   // hermetic mode (tests): no shell-out; falls to the notes path below
      : safe(() => spawnClaude(["plugin", "list", "--json"], { encoding: "utf8" }));
    const parsedList = cliProbe && cliProbe.status === 0 ? safe(() => JSON.parse(cliProbe.stdout)) : undefined;
    const installedIds = Array.isArray(parsedList)
      ? parsedList.map((p) => p.id || p.name).filter(Boolean)
      : null;   // CLI unavailable, errored, or emitted non-array/invalid JSON -> fallback notes
    const { actions, notes } = buildPluginPlan({
      required: V.plugins, managed, enabledPlugins: curSettings.enabledPlugins, installedIds, keepInstalled,
      forbidden: variantsFile.forbiddenPlugins || [],
      marketplaces: variantsFile.marketplaces,
      knownMarketplaces: safe(() => [...knownMarketplaces(CDIR)]) });
    if (actions.length || notes.length) {
      log("\n--- plugin reconciliation ---");
      log(formatPlan(actions, notes));
      // `go` = apply the enable/disable (enabledPlugins JSON) side. `execInstall` = ALSO actually
      // run `claude plugin install/uninstall`. These are split on purpose (spec § 4): under BULK
      // (non-interactive, e.g. the documented --replace-all bootstrap path) install/uninstall must
      // never auto-execute - only the local, reversible enabledPlugins edit does. Interactive
      // aggregate y/N still executes everything, unchanged.
      let go = false, execInstall = false;
      let chosen = actions;
      if (DRY) log("  (dry-run: no plugin changes)");
      else if (process.env.CLAUDE_SETUP_SKIP_PLUGINS === "1") log("  (skipped: CLAUDE_SETUP_SKIP_PLUGINS=1)");
      else if (BULK === "skip") log("  (--skip-all: no plugin changes)");
      else if (BULK) go = true;   // enabledPlugins edits only; install/uninstall printed as manual commands below
      else if (INTERACTIVE) {
        const a = await ask(`    apply ${actions.length} plugin action(s)? (y = all / n = none / s = choose) > `);
        if (a[0] === "y") { go = execInstall = true; }
        else if (a[0] === "s") {
          const yes = new Set();
          for (const act of actions) {
            const r = await ask(`      ${describeAction(act)}? (y/N) > `);
            if (r[0] === "y") yes.add(act);
          }
          const { selected, dropped } = selectActions(actions, (act) => yes.has(act));
          for (const d of dropped) if (d.reason !== "declined") log(`      skipped ${d.action.id}: ${d.reason}`);
          chosen = selected;
          go = execInstall = chosen.length > 0;
          if (!chosen.length) log("  (nothing selected)");
        }
      }
      else log("  (non-interactive: printed only - re-run in a terminal or with --replace-all)");
      if (go) {
        const fresh = readJsonOrNull(SETTINGS);
        const s = fresh || {};
        s.enabledPlugins = s.enabledPlugins || {};
        for (const a of chosen) {
          // Registering a marketplace fetches and trusts remote code, so it gets the SAME gate as
          // install - never a weaker one just because it is a prerequisite.
          if (a.type === "marketplace_add") {
            if (execInstall) {
              const r = spawnClaude(["plugin", "marketplace", "add", a.source], { encoding: "utf8", stdio: "inherit" });
              summary.push(`${r.status === 0 ? "marketplace-add" : "marketplace-add-FAILED"} ${a.source}`);
            } else {
              log(`  run manually: claude plugin marketplace add ${a.source}`);
              summary.push(`marketplace-add-manual ${a.source}`);
            }
            continue;
          }
          if (a.type === "install" || a.type === "uninstall") {
            if (execInstall) {
              const r = spawnClaude(["plugin", a.type, a.id], { encoding: "utf8", stdio: "inherit" });
              summary.push(`${r.status === 0 ? "plugin-" + a.type : "plugin-" + a.type + "-FAILED"} ${a.id}`);
            } else {
              log(`  run manually: claude plugin ${a.type} ${a.id}`);
              summary.push(`plugin-${a.type}-manual ${a.id}`);
            }
            continue;
          }
          if (a.type === "enable") s.enabledPlugins[a.id] = true;
          if (a.type === "disable") delete s.enabledPlugins[a.id];
        }
        if (fresh === null) skipInvalidSettings("plugin reconciliation");
        else if (write(SETTINGS, JSON.stringify(s, null, 2) + "\n")) summary.push(`updated  ${SETTINGS} (enabledPlugins reconciled)`);
        log("  NOTE: restart Claude Code - enabledPlugins does not hot-reload.");
      }
    }
  }

  /* ---------- MCP reconciliation: only managedMcpServers are ever touched ---------- */
  // Claude Code keeps .claude.json inside a relocated config dir and never falls back to HOME.
  const cjPath = (process.env.CLAUDE_CONFIG_DIR ? [join(CDIR, ".claude.json")]
    : [join(CDIR, ".claude.json"), join(HOME, ".claude.json")]).find((x) => existsSync(x));
  const cj = cjPath ? readJsonOrNull(cjPath) : {};
  if (cj === null) log("\n--- mcp reconciliation ---\n  cannot read .claude.json — MCP step skipped");
  else {
    const rawManaged = loadVariants(REPO_ROOT).managedMcpServers || {};
    // {{CLAUDE_DIR}} in a managed server's args resolves to the installed config dir: Claude Code
    // spawns the server command with no shell, so "~" would never expand.
    const managed = Object.fromEntries(Object.entries(rawManaged).map(([n, d]) =>
      [n, Array.isArray(d.args) ? { ...d, args: d.args.map((x) => x.split("{{CLAUDE_DIR}}").join(CDIR)) } : d]));
    const skip = process.env.CLAUDE_SETUP_SKIP_MCP === "1";
    const hasCommand = (c) => skip || safe(() => (process.platform === "win32"
      ? spawnSync("where", [c], { encoding: "utf8" })
      : spawnSync("sh", ["-c", 'command -v "$1"', "sh", c], { encoding: "utf8" })).status === 0) === true;
    const { actions, notes } = buildMcpPlan({ required: V.mcpServers, managed,
      configured: Object.keys(cj.mcpServers || {}), env: process.env, hasCommand });
    const secrets = actions.flatMap((a) => Object.values(a.headers || {}));
    if (actions.length || notes.length) {
      log("\n--- mcp reconciliation ---");
      log(formatMcpPlan(actions, notes));
      let chosen = [], execRemove = false;
      if (DRY) log("  (dry-run: no MCP changes)");
      else if (skip) log("  (skipped: CLAUDE_SETUP_SKIP_MCP=1)");
      else if (BULK === "skip") log("  (--skip-all: no MCP changes)");
      else if (BULK) chosen = actions;
      else if (INTERACTIVE && actions.length) {
        const a = await ask(`    apply ${actions.length} MCP action(s)? (y = all / n = none / s = choose) > `);
        if (a[0] === "y") chosen = actions;
        else if (a[0] === "s") for (const act of actions)
          if ((await ask(`      ${describeMcpAction(act)}? (y/N) > `))[0] === "y") chosen.push(act);
        execRemove = true;
      }
      else if (actions.length) log("  (non-interactive: printed only - re-run in a terminal or with --replace-all)");
      let ran = false;
      for (const a of chosen) {
        if (a.type === "remove" && !execRemove) {
          log(`  run manually: ${describeMcpAction(a)}`);
          summary.push(`mcp-remove-manual ${a.name}`);
          continue;
        }
        // stdout is captured, never printed: `claude mcp add` can echo the header back.
        const r = spawnClaude(a.type === "add" ? mcpAddArgs(a) : mcpRemoveArgs(a), { encoding: "utf8" });
        ran = true;
        if (r.status !== 0) log(redactValues(r.stderr || r.error?.message || "", secrets));
        summary.push(`mcp-${a.type}${r.status === 0 ? "" : "-FAILED"} ${a.name}`);
        const post = r.status === 0 && postAddArgv(a);
        if (!post) continue;
        log(`  running: ${describePostAdd(a)}`);
        const p = spawnSync(post[0], post.slice(1), { stdio: "inherit" });
        summary.push(`mcp-postadd${p.status === 0 ? "" : "-FAILED"} ${a.name}`);
        if (p.status !== 0) log(`  run manually: ${describePostAdd(a)}`);
      }
      if (ran) log("  NOTE: restart Claude Code - MCP servers load at startup.");
    }
  }

  /* ---------- session defaults: model and effortLevel are bundle-managed ---------- */
  if (cur === null) log("\n--- session defaults ---\n  settings.json: INVALID JSON - left untouched");
  else {
    const managedDefaults = loadVariants(REPO_ROOT).sessionDefaults || {};
    const current = readJsonOrNull(SETTINGS) || {};
    const changes = buildSessionDefaultsPlan(current, managedDefaults);
    // The model-migration prompt above is skipped whenever this block covers `model`, so a
    // superseded id's tier-preserving alternative (--replace-all only offers the bundle
    // default) has to surface here instead - in every mode that reports or keeps a `model`
    // conflict, not only the interactive one.
    const migrationHint = (c) => {
      if (c.key !== "model") return "";
      const mm = migrateSettingsModel(c.from);
      return mm.changed ? ` (superseded - ${mm.value} is the tier-preserving id; set it by hand to stay on your own tier)` : "";
    };
    if (changes.length) {
      log("\n--- session defaults ---");
      for (const c of changes) log(`  ${describeSessionChange(c)}${migrationHint(c)}`);
      const conflicts = changes.filter((c) => c.conflict);
      let apply = changes.filter((c) => !c.conflict);
      if (DRY) { apply = []; log("  (dry-run: settings unchanged)"); }
      else if (BULK === "skip") { apply = []; log("  (--skip-all: settings unchanged)"); }
      else if (BULK === "replace") apply = changes;
      else if (INTERACTIVE && conflicts.length &&
        (await ask(`    replace ${conflicts.length} session default(s)? (y/N) > `))[0] === "y") apply = changes;
      for (const c of conflicts) if (!apply.includes(c) && !DRY && BULK !== "skip")
        log(`  kept ${c.key}: ${fmt(c.from)} (re-run with --replace-all to set ${fmt(c.to)})${migrationHint(c)}`);
      if (apply.length) {
        const s = readJsonOrNull(SETTINGS);
        if (s === null) skipInvalidSettings("session defaults");
        else {
          for (const c of apply) s[c.key] = c.to;
          if (write(SETTINGS, JSON.stringify(s, null, 2) + "\n"))
            summary.push(`updated  ${SETTINGS} (session defaults: ${apply.map((c) => c.key).join(", ")})`);
        }
      }
    }
  }

  /* ---------- deepseek offload default (per profile) ---------- */
  // Fallback level read by the per-project resolver when a project has no .claude/deepseek.json.
  {
    const level = (loadVariants(REPO_ROOT).deepseekDefaults || {})[VARIANT];
    if (level) {
      const p = join(CDIR, "deepseek-defaults.json");
      const cur = DRY ? null : readJsonOrNull(p);
      if (!cur || cur.level !== level) {
        if (DRY) log(`\n--- deepseek default ---\n  (dry-run) would set ${p} level=${level}`);
        else if (write(p, JSON.stringify({ level }, null, 2) + "\n"))
          summary.push(`updated  ${p} (deepseek default: ${level})`);
      }
    }
  }

  /* ---------- deepseek connection (gateway + key), machine-local, never in the repo ---------- */
  {
    const p = join(CDIR, "deepseek.config.json");
    // An existing config is re-prompted interactively: blank keeps the stored value, so only the
    // IP needs typing again and the saved key carries over.
    const prev = existsSync(p) ? safe(() => JSON.parse(readFileSync(p, "utf8").replace(/^﻿/, ""))) || {} : null;
    if (DRY) { /* dry-run never writes */ }
    else if (INTERACTIVE) {
      const cur = prev && prev.gateway ? normalizeGateway(prev.gateway) : null;
      const gw = (await askRaw(`\n  DeepSeek gateway IP (port ${DEFAULT_PORT} is assumed; enter IP:port to override; blank to ${cur ? `keep ${cur}` : "skip"}) > `)).trim();
      if (gw || cur) {
        const key = (await askRaw(`  DeepSeek API key (stored locally in deepseek.config.json, never in the repo${prev && prev.key ? "; blank keeps the stored key" : ""}) > `)).trim();
        const cfg = { ...(prev || {}), gateway: normalizeGateway(gw) || cur };
        if (key) cfg.key = key;
        // Health uses the gateway by default; set DS_BACKEND to probe the model backend precisely.
        if (write(p, JSON.stringify(cfg, null, 2) + "\n")) {
          safe(() => chmodSync(p, 0o600)); // best-effort: key at rest, POSIX only
          summary.push(`wrote    ${p} (deepseek gateway${cfg.key ? " + key" : ""})`); // key value never logged
        }
      } else log(`  deepseek: no gateway set (configure later by editing ${p})`);
    } else if (!prev) {
      log(`\n--- deepseek connection ---\n  not configured - re-run interactively to set the gateway + key, or create ${p}`);
    }
  }

  /* ---------- opt-in: daily background check for new claude-config releases ---------- */
  // Deliberately NOT part of settings.partial.json's additive merge above (that would silently
  // flip a background network check on for everyone) - this is a one-time y/N decision, written
  // straight into `env`, exactly like the PowerShell-tool opt-in further down.
  // Once decided either way (yes -> "1", no -> "0") this never asks again on this machine, no
  // matter how many times setup.mjs re-runs - an explicit "no" is recorded, not re-nagged
  // (the same "decide once, don't re-ask" pattern used elsewhere for one-time opt-ins). This
  // offer itself is machine-wide only (setup.mjs) - init-stack.md has no per-project equivalent of it.
  const curEnvSettings = DRY ? {} : readJsonOrNull(SETTINGS);
  if (curEnvSettings === null) skipInvalidSettings("update-check opt-in");
  else if (!DRY) {
    const updateCheckDecided = curEnvSettings.env && "CLAUDE_CONFIG_UPDATE_CHECK" in curEnvSettings.env;
    if (!updateCheckDecided) {
      let enable = ENABLE_UPDATE_CHECK_FLAG;
      if (!enable && INTERACTIVE) {
        const a = await ask("\nEnable a daily background check for new claude-config releases? " +
          "Read-only GitHub API call (no auth, no data sent); if master has moved, you'll get " +
          "step-by-step update instructions in a future Claude Code session - never applies " +
          "anything itself. [y/N] > ");
        enable = a[0] === "y";
      }
      if (enable) {
        curEnvSettings.env = curEnvSettings.env || {};
        curEnvSettings.env.CLAUDE_CONFIG_UPDATE_CHECK = "1";
        if (write(SETTINGS, JSON.stringify(curEnvSettings, null, 2) + "\n"))
          summary.push(`updated  ${SETTINGS} (update-check: enabled)`);
      } else if (INTERACTIVE) {
        curEnvSettings.env = curEnvSettings.env || {};
        curEnvSettings.env.CLAUDE_CONFIG_UPDATE_CHECK = "0";
        if (write(SETTINGS, JSON.stringify(curEnvSettings, null, 2) + "\n"))
          summary.push(`updated  ${SETTINGS} (update-check: declined - won't ask again here)`);
      } else {
        log("\n(update-check opt-in left undecided - non-interactive run. Enable explicitly with " +
          "'node setup.mjs --enable-update-check', or accept the offer next time /init-stack runs)");
      }
    }
  }

  /* ---------- opt-in (Windows): the PowerShell tool ---------- */
  // Recorded once and never re-decided, exactly like the update check above - see
  // powershell-tool.mjs for why "0" has to be as final an answer as "1". PowerShell 7+ is a
  // precondition rather than a consequence: writing the key on a machine without pwsh hands
  // Claude Code a tool it cannot start.
  const psSettings = DRY ? {} : readJsonOrNull(SETTINGS);
  if (psSettings === null) skipInvalidSettings("PowerShell-tool opt-in");
  else if (!DRY) {
    const detectPwsh = () => {
      const r = spawnSync("pwsh", ["-NoProfile", "-NoLogo", "-Command", "$PSVersionTable.PSVersion.ToString()"], { encoding: "utf8" });
      return r.error ? null : parsePwshMajor(r.stdout);
    };
    const planFor = (major, flag) => powerShellToolPlan({
      os: platform(), env: psSettings.env || {}, flag, interactive: INTERACTIVE, pwshMajor: major,
    });
    let pwshMajor = platform() === "win32" ? detectPwsh() : null;
    let plan = planFor(pwshMajor, ENABLE_POWERSHELL_TOOL_FLAG);

    if (plan.action === "offer-install") {
      log(`\nThe PowerShell tool needs PowerShell ${MIN_PWSH_MAJOR}+ (pwsh), which was not found here.`);
      log(`  Windows PowerShell 5.1 (powershell.exe) is a different product and does not count.`);
      const a = await ask("Install PowerShell 7+ now via winget? [y/N] > ");
      if (a[0] === "y") {
        const r = spawnSync("winget", ["install", "--id", "Microsoft.PowerShell", "--source", "winget",
          "--accept-package-agreements", "--accept-source-agreements"], { stdio: "inherit" });
        if (r.error) log("  winget is not available here - install by hand: https://aka.ms/powershell");
        pwshMajor = detectPwsh();
        if (pwshMajor === null)
          log("  pwsh still not on PATH - a new terminal usually fixes that. Re-run setup.mjs afterwards.");
      }
      plan = planFor(pwshMajor, false);
      if (plan.action === "offer-install") {
        summary.push(`skipped  ${PWSH_ENV_KEY} (PowerShell ${MIN_PWSH_MAJOR}+ absent - nothing recorded, will offer again)`);
        plan = { action: "skip", reason: "no-pwsh" };
      }
    }

    if (plan.action === "offer-enable") {
      const a = await ask(`\nEnable the PowerShell tool (pwsh ${pwshMajor}.x found)? It is a PREVIEW feature: ` +
        "its commands are confirmed by hand even in an auto-approved session, $PROFILE is not loaded, " +
        "there is no sandboxing, and the pipeline returns objects rather than text. This package's own " +
        "hooks are unaffected - they are Node in exec form and need no shell. [y/N] > ");
      plan = { action: "write", value: a[0] === "y" ? "1" : "0" };
    }

    if (plan.action === "write") {
      psSettings.env = psSettings.env || {};
      psSettings.env[PWSH_ENV_KEY] = plan.value;
      if (write(SETTINGS, JSON.stringify(psSettings, null, 2) + "\n"))
        summary.push(`updated  ${SETTINGS} (PowerShell tool: ${plan.value === "1" ? "enabled" : "declined - won't ask again here"})`);
    } else if (plan.action === "blocked") {
      log(`\n(--enable-powershell-tool ignored: PowerShell ${MIN_PWSH_MAJOR}+ (pwsh) not found. Install it, then re-run.)`);
    } else if (plan.action === "skip" && plan.reason === "non-interactive") {
      log("\n(PowerShell-tool opt-in left undecided - non-interactive run. Enable explicitly with " +
        "'node setup.mjs --enable-powershell-tool')");
    }
  }

  /* ---------- Claude Code auto-update ---------- */
  // The state file moves into CLAUDE_CONFIG_DIR when that var is set, so probe both and take
  // whichever exists; writing a fresh one would create a file Claude Code never reads.
  if (!DRY) {
    const stateFile = [join(CDIR, ".claude.json"), join(HOME, ".claude.json")].find((p) => existsSync(p));
    if (!stateFile) {
      summary.push("autoUpdates: no Claude Code state file found - left untouched");
    } else {
      const st = readJsonOrNull(stateFile);
      if (st === null) summary.push("autoUpdates: state file is not valid JSON - left untouched");
      else if (st.autoUpdates !== true) {
        st.autoUpdates = true;
        if (write(stateFile, JSON.stringify(st, null, 2) + "\n")) summary.push("autoUpdates: enabled");
      }
      const envSettings = readJsonOrNull(SETTINGS) || {};
      if (envSettings.env && envSettings.env.DISABLE_AUTOUPDATER) {
        summary.push("autoUpdates: settings.json env sets DISABLE_AUTOUPDATER - remove it by hand to let updates run");
      }
    }
  }

  /* ---------- prune stale files + persist manifest ---------- */
  migrateRulesDir();
  overwriteTemplatesDir();
  // After pruneStale, never before it, and the data dependency now says so rather than a comment:
  // a file an earlier bundle installed and this one no longer ships is pruneStale's
  // to remove, under pruneStale's own gates, so the detector is handed what it already claimed.
  await pruneStale();
  // After the prune, which is what can delete the file the command names.
  warnStatuslineNamesMissingFile();
  if (!DRY) {
    const installedSha = await resolveInstalledSha();
    const maxPluginTier = profilesOf(loadVariants(REPO_ROOT))[VARIANT]?.maxPluginTier;
    const manifestPayload = { files: manifestNow, profile: VARIANT, variant: VARIANT };
    if (maxPluginTier !== undefined) manifestPayload.maxPluginTier = maxPluginTier;
    if (installedSha) {
      manifestPayload.installedSha = installedSha;
      manifestPayload.installedAt = new Date().toISOString();
      manifestPayload.repoRoot = existsSync(join(REPO_ROOT, ".git")) ? REPO_ROOT : null;
    }
    write(MANIFEST, JSON.stringify(manifestPayload, null, 2) + "\n");
    if (installedSha) reconcileUpdateState(installedSha);
  }

  /* ---------- summary ---------- */
  log("\n--- summary ---");
  for (const s of summary) log("  " + s);

  // Categorized digest - the detailed list above is easy to lose track of on a large bundle
  // ("did rules/ actually update, or just plugins?" was the whole reason this exists).
  const digest = {};
  for (const s of summary) {
    const verb = s.split(/\s+/)[0];
    const pathMatch = s.match(/^\S+\s+(.+?)(?:\s\(|$)/);
    const p = pathMatch ? pathMatch[1] : "";
    const rel = p.startsWith(CDIR) ? p.slice(CDIR.length + 1) : p;
    const top = rel.split(/[\\/]/)[0] || "(root)";
    digest[top] = digest[top] || {};
    digest[top][verb] = (digest[top][verb] || 0) + 1;
  }
  log("\n--- by category ---");
  for (const [top, verbs] of Object.entries(digest)) {
    log(`  ${top}: ` + Object.entries(verbs).map(([v, n]) => `${n} ${v}`).join(", "));
  }
  log("  (this installer only touches ~/.claude - stack plugins are separate, see /init-stack)");

  /* ---------- tool checks ---------- */
  const has = (bin, a = ["--version"]) => { const r = spawnSync(bin, a, { encoding: "utf8" }); return !r.error && (r.status === 0 || (r.stdout || r.stderr || "").length > 0); };
  const os = platform();
  const hint = (l, w, m) => os === "win32" ? w : os === "darwin" ? m : l;
  log("\n--- tools ---");
  log("node: present (required; Claude Code guarantees it)");
  if (has("git")) log("git:  present");
  else {
    log("git:  MISSING (needed by secrets-gate.mjs)");
    log("  install: " + hint("sudo apt install git | sudo dnf install git", "winget install Git.Git | choco install git | scoop install git", "brew install git"));
    log("  fallback: without git, secrets-gate is a no-op (a git commit can't run anyway); other hooks unaffected.");
  }
  if (has("gitleaks")) log("gitleaks: present (authoritative scanner)");
  else {
    log("gitleaks: not found (OPTIONAL; built-in regex baseline still runs)");
    log("  install: " + hint("release binary or brew", "winget install gitleaks | choco install gitleaks", "brew install gitleaks"));
  }

  log(`\n${DRY ? "DRY RUN complete (no files written)." : "Done."} Restart Claude Code (hooks load at startup).`);
  log(`Variant: ${VARIANT}`);
  const hookCounts = partial && partial.hooks
    ? Object.entries(partial.hooks).map(([ev, entries]) => `${ev} x${entries.length}`).join(", ")
    : "see settings.partial.json";
  log(`Verify with /hooks (expect: ${hookCounts}).`);

  log("\n=== Project setup: what to run, and when ===");
  log("");
  log("Step 1 - RESTART Claude Code now. Machine-level setup (hooks, rules, skills,");
  log("         CLAUDE.md, settings.json) only loads at startup.");
  log("");
  log("Step 2 - Open a Claude Code session in the project. On its FIRST session there,");
  log("         a SessionStart hook configures it AUTOMATICALLY - nothing to run:");
  log("           - marks an unmarked root CLAUDE.md as curated");
  log("           - checks whether the compiled rules snapshot (.claude/stack-rules.md)");
  log("             exists; if not, suggests running /init-stack to generate it (no");
  log("             automatic staleness check - opt out: CLAUDE_STACK_RULES=0)");
  if (VARIANT !== "lite") {
    log("           - if the git remote is GitHub/GitLab or a DB dependency is detected");
    log("             with no matching MCP wired: suggests /init-mcp (suggestion only,");
    log("             installs nothing, rechecked every session)");
  }
  log("         Toggles: CLAUDE_CURATED_AUTOINIT=0 (disables all of the above),");
  log("         CLAUDE_CURATED_AUTOMARK_ROOT=0, CLAUDE_MCP_SUGGEST=0.");
  log("");
  if (VARIANT !== "lite") {
    log("Step 3 - ONLY if the project needs stack-specific plugins (React, FastAPI, ...) -");
    log("         this does NOT happen automatically. Run /init-stack in that project's");
    log("         Claude Code session. It detects the stack, then asks you to run");
    log("         'node ~/.claude/bin/init-stack.mjs -i' yourself in a real terminal");
    log("         (interactive checklist) to install and enable the matching plugins.");
    log("");
    log("Step 4 - RESTART Claude Code again after /init-stack writes settings.json -");
    log("         enabledPlugins resolves at startup too, same as step 1.");
  } else {
    log("Step 3 - For per-project stack rules run /init-stack in that project's session");
    log("         (compiles .claude/stack-rules.md; no plugin machinery in lite).");
  }
  log("");
  log("Full reference (including the reconfigure/update table): README.md, section");
  log("'Order of operations'.");
}

main();
