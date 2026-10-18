// Pure purge plan for GSD: gsd-core and the files this bundle used to install around it. No fs or
// process access here - setup.mjs lists directories, checks existence and executes the plan.
import { join } from "node:path";

export const BUNDLE_RELS = [
  "apply-gsd-agent-patches.mjs", "sync-gsd-context-mode-tool.mjs", "gsd-defaults-sync.mjs",
  "add-risk.mjs", "hooks/gsd-config-patch.mjs", "hooks/lib/context-mode-gsd-agents.mjs",
  "hooks/db-live-access-gate.mjs", "bin/lib/gsd-core-detect.mjs", "rules-src/gsd.md",
  "references/gsd-claude-orchestration-pilot.md", "commands/init-session.md",
  "skills/using-git-worktrees",
];
const EMPTIED_DIRS = ["references"];
export const RETIRED_HOOK_FILES = ["gsd-config-patch.mjs", "db-live-access-gate.mjs"];
export const STATE_KEYS = ["gsdModelConfigPatched", "gsdWorkflowConfigPatched", "gsdInitStackGapLastCheck"];
const PATTERNS = [ // [dir under claudeDir ("" = claudeDir), entry-name test]
  ["", (n) => n.startsWith("gsd-") || n === "get-shit-done"],
  ["agents", (n) => n.startsWith("gsd-") && n.endsWith(".md")],
  ["skills", (n) => n.startsWith("gsd-")],
  ["commands", (n) => n === "gsd"],
  ["hooks", (n) => n.startsWith("gsd-")],
  ["hooks/lib", (n) => n.startsWith("gsd-")],
];
// gsd-core registers `"…/node" "…/hooks/gsd-x.js"` as one command; this bundle uses command + args.
const GSD_HOOK_REF = /(^|[\s\\/"'])hooks[\\/]gsd-[^\\/"'\s]+/;
const RETIRED_REF = new RegExp(`(^|[\\s\\\\/"'])(${RETIRED_HOOK_FILES.map((f) => f.replace(/\./g, "\\.")).join("|")})($|[\\s"'])`);
const GSD_STATUSLINE = /gsd-statusline\.js|gsd-context-meter/;
const GSD_PATH = /gsd-core|get-shit-done|(^|[\\/])\.gsd([\\/]|$)|hooks[\\/]gsd-/;
const strs = (o) => [o?.command, ...(Array.isArray(o?.args) ? o.args : [])].map((s) => String(s ?? ""));
const namesGsdHook = (h) => strs(h).some((s) => GSD_HOOK_REF.test(s) || RETIRED_REF.test(s));

export function stripGsdSettings(settings) {
  const out = JSON.parse(JSON.stringify(settings || {}));
  const removed = [];
  for (const [event, entries] of Object.entries(out.hooks && typeof out.hooks === "object" ? out.hooks : {})) {
    if (!Array.isArray(entries)) continue;
    let dropped = 0;
    const kept = [];
    for (const e of entries) {
      const hooks = Array.isArray(e?.hooks) ? e.hooks : [];
      const left = hooks.filter((h) => !namesGsdHook(h));
      dropped += hooks.length - left.length;
      if (left.length === hooks.length) kept.push(e);
      else if (left.length) kept.push({ ...e, hooks: left });
    }
    if (!dropped) continue;
    removed.push(`${event}: ${dropped} hook(s)`);
    if (kept.length) out.hooks[event] = kept; else delete out.hooks[event];
  }
  if (out.statusLine && strs(out.statusLine).some((s) => GSD_STATUSLINE.test(s))) {
    delete out.statusLine;
    removed.push("statusLine");
  }
  for (const kind of ["allow", "deny", "ask"]) {
    const list = out.permissions?.[kind];
    if (!Array.isArray(list)) continue;
    const kept = list.filter((p) => !GSD_PATH.test(String(p)));
    if (kept.length === list.length) continue;
    removed.push(`permissions.${kind}: ${list.length - kept.length}`);
    out.permissions[kind] = kept;
  }
  for (const [k, v] of Object.entries(out.env && typeof out.env === "object" ? out.env : {}))
    if (GSD_PATH.test(String(v))) { delete out.env[k]; removed.push(`env.${k}`); }
  return { settings: out, removed };
}

export function stripProjectInitGsd(state) {
  const out = JSON.parse(JSON.stringify(state || {}));
  const removedKeys = [];
  for (const [project, entry] of Object.entries(out)) {
    if (!entry || typeof entry !== "object") continue;
    for (const key of STATE_KEYS) if (key in entry) { delete entry[key]; removedKeys.push(`${project}:${key}`); }
  }
  return { state: out, removedKeys };
}

export function planGsdPurge({ claudeDir, homeDir, list, exists, settings = null, projectInit = null }) {
  const at = (rel) => join(claudeDir, ...rel.split("/").filter(Boolean));
  const rels = new Set();
  for (const [dir, match] of PATTERNS) for (const n of list(at(dir))) if (match(n)) rels.add(dir ? `${dir}/${n}` : n);
  for (const rel of BUNDLE_RELS) if (exists(at(rel))) rels.add(rel);
  for (const dir of EMPTIED_DIRS)
    if (exists(at(dir)) && list(at(dir)).every((n) => rels.has(`${dir}/${n}`))) rels.add(dir);
  const paths = [...rels].sort().map(at);
  if (exists(join(homeDir, ".gsd"))) paths.push(join(homeDir, ".gsd"));
  const s = settings ? stripGsdSettings(settings) : { settings, removed: [] };
  const st = projectInit ? stripProjectInitGsd(projectInit) : { state: projectInit, removedKeys: [] };
  return {
    paths,
    settings: { next: s.settings, changed: s.removed.length > 0, removed: s.removed },
    state: { next: st.state, changed: st.removedKeys.length > 0, removedKeys: st.removedKeys },
  };
}

export const isEmptyPlan = (p) => !p.paths.length && !p.settings.changed && !p.state.changed;

export function formatGsdPurge(plan, dry) {
  const lines = ["\n--- GSD: removing every trace (no longer part of this bundle) ---"];
  for (const p of plan.paths) lines.push(`  ${dry ? "would remove" : "removing"} ${p}`);
  if (plan.settings.changed) lines.push(`  ${dry ? "would clean" : "cleaning"} settings.json: ${plan.settings.removed.join(", ")}`);
  if (plan.state.changed) lines.push(`  ${dry ? "would clean" : "cleaning"} state/project-init.json: ${plan.state.removedKeys.join(", ")}`);
  return lines.join("\n");
}
