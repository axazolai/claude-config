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
// Settings strings are matched on path segments: a boundary is a separator, quote, parenthesis,
// whitespace or string start, and `/` and `\` both separate. Product names and the `.gsd` directory
// match anywhere. Bundle and gsd-* names match only directly under the config dir: a `.claude`
// segment or the configured claudeDir.
const BOUND = String.raw`(?:^|[\s"'(\\/])`;
const SEP = String.raw`[\\/]`;
const NAME_END = String.raw`(?![\w.-])`;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const segsRe = (p) => p.replace(/\\/g, "/").split("/").filter(Boolean).map(esc).join(SEP);
const PRODUCT_RE = new RegExp(`${BOUND}(?:gsd-core|get-shit-done|@opengsd)|${BOUND}\\.gsd${NAME_END}`, "i");
const PATH_NAMES = [
  ...BUNDLE_RELS.map((r) => segsRe(r) + NAME_END),
  ...RETIRED_HOOK_FILES.map((f) => segsRe(`hooks/${f}`) + NAME_END),
  ...["gsd-", "agents/gsd-", "skills/gsd-", "hooks/gsd-", "hooks/lib/gsd-"].map(segsRe),
  segsRe("commands/gsd") + NAME_END,
];
const purgedMatcher = (claudeDir) => {
  const cfg = [`${BOUND}\\.claude`];
  if (claudeDir) cfg.push(String.raw`(?:^|[\s"'(])[\\/]*` + segsRe(String(claudeDir)));
  const pathRe = new RegExp(`(?:${cfg.join("|")})${SEP}(?:${PATH_NAMES.join("|")})`, "i");
  return (s) => PRODUCT_RE.test(s) || pathRe.test(s);
};
const GSD_STATUSLINE = /gsd-statusline\.js|gsd-context-meter/;
const strs = (o) => [o?.command, ...(Array.isArray(o?.args) ? o.args : [])].map((s) => String(s ?? ""));

export function stripGsdSettings(settings, claudeDir) {
  const named = purgedMatcher(claudeDir);
  const namesGsdHook = (h) => strs(h).some((s) => named(s));
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
    const kept = list.filter((p) => !named(String(p)));
    if (kept.length === list.length) continue;
    removed.push(`permissions.${kind}: ${list.length - kept.length}`);
    out.permissions[kind] = kept;
  }
  for (const [k, v] of Object.entries(out.env && typeof out.env === "object" ? out.env : {}))
    if (named(String(v))) { delete out.env[k]; removed.push(`env.${k}`); }
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
  for (const dir of EMPTIED_DIRS) {
    const names = list(at(dir));
    if (names.length && names.every((n) => rels.has(`${dir}/${n}`))) rels.add(dir);
  }
  const paths = [...rels].sort().map(at);
  if (exists(join(homeDir, ".gsd"))) paths.push(join(homeDir, ".gsd"));
  const s = settings ? stripGsdSettings(settings, claudeDir) : { settings, removed: [] };
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
