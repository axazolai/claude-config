import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { dirSize, newestMtime } from "./claude-cleanup-lib.mjs";

const CATEGORIES = [
  { name: "gsd-core", dir: ".", match: (n) => n === "gsd-core", reason: "gsd-core install root" },
  { name: "skills", dir: "skills", match: (n) => n.startsWith("gsd-"), reason: "gsd-core skill" },
  { name: "agents", dir: "agents", match: (n) => n.startsWith("gsd-") && n.endsWith(".md"), reason: "gsd-core agent" },
  { name: "hooks", dir: "hooks", match: (n) => n.startsWith("gsd-"), reason: "gsd-core hook" },
  { name: "hooks/lib", dir: join("hooks", "lib"), match: (n) => n.startsWith("gsd-"), reason: "gsd-core hook library" },
];

export const gsdCorePresent = (dir) => existsSync(join(dir, "gsd-core", "VERSION"));

// gsd-core's first-time baseline scan classifies any gsd-* file under its config dir that it
// cannot prove manifest-managed as "stale-gsd-looking" and blocks on a keep/remove prompt. With no
// TTY - which is how setup.mjs spawns it - that prompt has no answer and the install aborts. These
// are OUR files, so they are moved aside for the duration of the npx run and put back after.
// Matching is on the basename: that is the shape the scanner keys on, and it is the shape every
// path it actually reported carries.
export function gsdLookingRels(rels = []) {
  const norm = (r) => String(r).split("\\").join("/");
  return [...new Set(rels.map(norm).filter((r) => (r.split("/").pop() || "").startsWith("gsd-")))].sort();
}

const versionTriple = (v) => {
  const m = /^(\d+)\.(\d+)\.(\d+)(-.+)?$/.exec(String(v ?? "").trim());
  return m ? { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: !!m[4] } : null;
};

// Negative when a is older than b. A prerelease sorts below the release sharing its numbers.
function compareGsdVersions(a, b) {
  for (let i = 0; i < 3; i++) if (a.nums[i] !== b.nums[i]) return a.nums[i] - b.nums[i];
  return (a.pre ? 0 : 1) - (b.pre ? 0 : 1);
}

// The bundle pins the gsd-core it was validated against rather than floating to @latest: the
// executor fork is regenerated from one exact release, the twelve agent patches are verified
// against it, and a hook patch anchors a line in it. `@latest` would hand two machines set up on
// different days a different gsd-core, and silently invalidate all of that on one of them.
// Bumping the pin in variants.json is the moment to re-verify the fork and the patches.
const installCommand = (version, configDir, defaultConfigDir) => {
  const base = `npx -y @opengsd/gsd-core@${version} --global --claude`;
  return configDir && defaultConfigDir && configDir !== defaultConfigDir
    ? `${base} --config-dir "${configDir}"`
    : base;
};

export function gsdCoreInstallPlan({
  variant, present, interactive, configDir, defaultConfigDir, pinnedVersion,
} = {}) {
  // base and lite exclude the GSD machinery outright, and detectForeignGsdCore offers to REMOVE
  // the tool there. Offering to install it in the same run would be the bundle arguing with itself.
  if (variant !== "full" || present) return { action: "none", command: null };
  if (!versionTriple(pinnedVersion)) return { action: "none", command: null, reason: "unknown-version" };
  // Installed without a TTY on purpose: on `full` this is a bundle dependency, not a third-party
  // plugin - half the profile's files are inert without it. Plugin install/uninstall stays
  // print-only under BULK because those are somebody else's software; this is ours to require.
  return {
    action: interactive ? "ask" : "install",
    command: installCommand(pinnedVersion, configDir, defaultConfigDir),
    to: pinnedVersion,
  };
}

// The other half: present, but not at the pin. Never downgrades - an install ahead of the pin is
// reported so the human can decide, because the fork and the patches were verified against the
// pin and may already be stale against whatever is actually installed.
export function gsdCoreUpdatePlan({
  variant, present, installedVersion, pinnedVersion, interactive, flag = false,
  configDir, defaultConfigDir,
} = {}) {
  if (variant !== "full" || !present) return { action: "none" };
  const have = versionTriple(installedVersion);
  const want = versionTriple(pinnedVersion);
  if (!have || !want) return { action: "none", reason: "unknown-version" };
  const delta = compareGsdVersions(have, want);
  if (delta === 0) return { action: "none", reason: "at-pin" };
  if (delta > 0) return { action: "ahead", from: installedVersion, to: pinnedVersion };
  return {
    action: flag || !interactive ? "update" : "ask",
    command: installCommand(pinnedVersion, configDir, defaultConfigDir),
    from: installedVersion,
    to: pinnedVersion,
  };
}

const safeReaddir = (p) => { try { return readdirSync(p); } catch { return []; } };
const statOr = (p) => { try { return statSync(p); } catch { return null; } };

export function buildGsdInventory({ dir, manifestRels = [] }) {
  const owned = [...new Set(manifestRels.map((r) => r.replace(/\\/g, "/")))];
  // owned entries are always files (manifest ships one per shipped file); a directory-shaped
  // category's rel (e.g. "skills/gsd-x") never appears verbatim, only nested under it — so
  // subtraction must also match by prefix, not just exact equality.
  const isOwned = (rel) => owned.some((o) => o === rel || o.startsWith(rel + "/"));
  const items = [];
  const categories = [];
  for (const cat of CATEGORIES) {
    const base = cat.dir === "." ? dir : join(dir, cat.dir);
    let count = 0;
    let bytes = 0;
    for (const name of safeReaddir(base)) {
      if (!cat.match(name)) continue;
      const rel = (cat.dir === "." ? name : `${cat.dir.replace(/\\/g, "/")}/${name}`);
      if (isOwned(rel)) continue;
      const absPath = join(base, name);
      const st = statOr(absPath);
      if (!st) continue;
      const size = st.isDirectory() ? dirSize(absPath) : st.size;
      const mtimeMs = st.isDirectory() ? newestMtime(absPath) : st.mtimeMs;
      items.push({ absPath, size, category: `gsd-core:${cat.name}`, reason: cat.reason, mtimeMs });
      count += 1;
      bytes += size;
    }
    if (count) categories.push({ name: cat.name, count, bytes });
  }
  return { items, categories, totalBytes: items.reduce((n, i) => n + i.size, 0) };
}

// Both registration shapes, because gsd-core uses the one this bundle does not: every real
// gsd-core hook is a single quoted command line with no args array at all
// (`"…/node.exe" "…/hooks/gsd-check-update.js"`), while this bundle registers command+args.
// Matching args alone left every real registration behind after its file had been moved, so the
// hook fired and failed at every session. Unanchored and stopping at a quote or space, so it holds
// through quoting, either slash, and trailing arguments.
// `hooks/lib/gsd-*` stays unmatched: nothing registers a lib file as a hook, and a broader pattern
// would be a second place this code can reach outside its own files.
// A leading space counts as a boundary for the same reason `^` does: `node hooks/gsd-x.js` and a
// bare `hooks/gsd-x.js` are the same reference, and treating only one of them as one was an
// inconsistency, not a policy. `my-hooks/`, `xhooks/` and `.hooks/` still miss - `-`, `x` and `.`
// are not boundaries.
const GSD_HOOK_REF = /(^|[\s\\/"'])hooks[\\/]gsd-[^\\/"'\s]+/;
const REFERENCES_GSD_HOOK = (entry) =>
  (entry.hooks || []).some((h) =>
    GSD_HOOK_REF.test(String(h.command ?? "")) || (h.args || []).some((a) => GSD_HOOK_REF.test(String(a))));

export function filterGsdHooks(settings) {
  if (!settings || !settings.hooks) return { settings: { ...settings }, removed: [] };
  const hooks = {};
  const removed = [];
  for (const [event, entries] of Object.entries(settings.hooks)) {
    hooks[event] = (entries || []).filter((e) => {
      if (!REFERENCES_GSD_HOOK(e)) return true;
      removed.push({ event, entry: e });
      return false;
    });
  }
  return { settings: { ...settings, hooks }, removed };
}
