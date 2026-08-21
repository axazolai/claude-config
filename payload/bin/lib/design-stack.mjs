import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "../../hooks/lib/spawn-hidden.mjs";

const skipInstall = (skip) => skip || process.env.CLAUDE_DESIGN_STACK_SKIP_INSTALL === "1";

// Isolated installer invocation — fresh HOME so Impeccable's "install into all harnesses" default
// finds nothing but the scratch dir; cwd=root + --scope=project confines writes to <root>/.claude.
export function runInstaller(cmd, args, { root, skip = false } = {}) {
  if (skipInstall(skip)) return { ok: true, skipped: true, stdout: "", stderr: "" };
  const scratch = mkdtempSync(join(tmpdir(), "design-stack-home-"));
  const env = { ...process.env, HOME: scratch, USERPROFILE: scratch };
  // shell: true is required for Windows .cmd shims (npx/uipro); args come from trusted static
  // template config (setting-templates/*.json), never from user input.
  const r = spawnSync(cmd, args, { cwd: root, env, encoding: "utf8", timeout: 180000, shell: true });
  rmSync(scratch, { recursive: true, force: true });
  return { ok: !r.error && r.status === 0, skipped: false, stdout: r.stdout || "", stderr: r.stderr || "" };
}

// Delete every skill dir under skillsDir that isn't kept, isn't impeccable, and isn't a pre-existing
// unrelated skill (protect). Only touches direct child dirs (uipro installs flat).
export function pruneProMaxSkills(skillsDir, keepSkills, { protect = [] } = {}) {
  const keep = new Set([...keepSkills, "impeccable", ...protect]);
  const removed = [];
  if (!existsSync(skillsDir)) return removed;
  for (const e of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!e.isDirectory() || keep.has(e.name)) continue;
    rmSync(join(skillsDir, e.name), { recursive: true, force: true });
    removed.push(e.name);
  }
  return removed;
}

export function pythonAvailable() {
  for (const py of ["python3", "python"]) {
    const r = spawnSync(py, ["--version"], { encoding: "utf8" });
    if (!r.error && r.status === 0) return true;
  }
  return false;
}

const MATCHER = "Edit|Write|MultiEdit";
// Recognise the hook by the tail of its path, never by the whole command string: the same
// registration is spelled `node .claude/skills/...` by us and
// `node "$CLAUDE_PROJECT_DIR/.claude/skills/..."` by Impeccable's own installer. Equality on the
// full string called the second one absent and appended a duplicate, so the hook fired twice per
// Edit/Write and twice per Stop.
const IMPECCABLE_HOOK = /impeccable[\\/]scripts[\\/]hook\.mjs/;
const isImpeccable = (h) => IMPECCABLE_HOOK.test((h && h.command) || "");

// Keep the first impeccable hook among `entries`, drop every later one. Filtering at the HOOK
// level, not the entry level, so an entry that also carries unrelated commands keeps them; an
// entry left with no hooks disappears.
function collapseImpeccable(entries, matches) {
  let seen = false, removed = 0;
  const kept = [];
  for (const e of entries) {
    if (!matches(e)) { kept.push(e); continue; }
    const hooks = [];
    for (const h of (e.hooks || [])) {
      if (!isImpeccable(h)) { hooks.push(h); continue; }
      if (seen) { removed++; continue; }
      seen = true; hooks.push(h);
    }
    if (hooks.length) kept.push({ ...e, hooks });
  }
  return { kept, removed, present: seen };
}

export function registerDesignHook(settingsFile, { scriptPath }) {
  const cmd = `node ${scriptPath}`;
  let s = {};
  if (existsSync(settingsFile)) { try { s = JSON.parse(readFileSync(settingsFile, "utf8")) || {}; } catch { s = {}; } }
  s.hooks = s.hooks || {};
  s.hooks.PostToolUse = s.hooks.PostToolUse || [];
  s.hooks.Stop = s.hooks.Stop || [];
  const post = collapseImpeccable(s.hooks.PostToolUse, (e) => e.matcher === MATCHER);
  const stop = collapseImpeccable(s.hooks.Stop, () => true);
  s.hooks.PostToolUse = post.kept;
  s.hooks.Stop = stop.kept;
  if (!post.present) s.hooks.PostToolUse.push({ matcher: MATCHER, hooks: [{ type: "command", command: cmd }] });
  if (!stop.present) s.hooks.Stop.push({ hooks: [{ type: "command", command: cmd }] });
  const added = !post.present || !stop.present;
  const removed = post.removed + stop.removed;
  if (!added && !removed) return { added: false, removed: 0 };
  mkdirSync(dirname(settingsFile), { recursive: true });
  writeFileSync(settingsFile, JSON.stringify(s, null, 2) + "\n", "utf8");
  return { added, removed };
}

export function readDesignStackConfig({ templatesDir } = {}) {
  // Prefer the resolved frontend template shipped in ~/.claude; fall back to null (orchestrator
  // then uses built-in defaults). templatesDir defaults to <configDir>/setting-templates.
  const base = templatesDir || join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "setting-templates");
  const p = join(base, "frontend", "_base.json");
  if (!existsSync(p)) return null;
  try { return (JSON.parse(readFileSync(p, "utf8")) || {}).designStack || null; } catch { return null; }
}

// Writes PROJECT-scoped <root>/.claude/state/component-updates.json. The worker/statusline
// currently read the GLOBAL state file instead — this baseline is a forward-looking record
// tied to the deferred project-scope-statusline follow-up (keyed by bare name; assumes a
// single primary project), not a bug.
export function recordBaselineVersions(root, versions) {
  const file = join(root, ".claude", "state", "component-updates.json");
  let state = {};
  if (existsSync(file)) { try { state = JSON.parse(readFileSync(file, "utf8")) || {}; } catch { state = {}; } }
  for (const [name, installed] of Object.entries(versions))
    state[name] = { ...(state[name] || {}), installed, class: "safe", updateAvailable: false, lastCheckedAt: new Date().toISOString() };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(state, null, 2) + "\n", "utf8");
}
