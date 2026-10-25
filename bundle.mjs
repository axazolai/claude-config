// Bundle resolver for setup.mjs and the test suite. Pure logic + fs reads; no side effects.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

export function loadBundle(repoRoot) {
  return JSON.parse(readFileSync(join(repoRoot, "bundle.json"), "utf8"));
}

// Glob → anchored RegExp. Supports ** (any chars incl. /), * (any chars except /), literal rest.
export function globToRe(glob) {
  const esc = glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\x00")   // placeholder so single-* rule doesn't eat it
    .replace(/\*/g, "[^/]*")
    .replace(/\x00/g, ".*");
  return new RegExp(`^${esc}$`);
}

const matchAny = (rel, res) => res.some((re) => re.test(rel));

function walkRels(dir, rel = "") {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    if (e.name === "__pycache__" || e.name.endsWith(".pyc")) continue; // mirror walkBundle()
    const childRel = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walkRels(join(dir, e.name), childRel));
    else out.push(childRel);
  }
  return out;
}

// The one bundle: every payload/ file except alwaysExclude matches.
export function resolveBundle({ repoRoot, cfg = null }) {
  cfg = cfg || loadBundle(repoRoot);
  const payloadDir = join(repoRoot, "payload");
  const alwaysRes = (cfg.alwaysExclude || []).map(globToRe);
  const rels = [], excluded = [];
  for (const rel of walkRels(payloadDir)) (matchAny(rel, alwaysRes) ? excluded : rels).push(rel);
  return {
    rels,
    srcFor: (rel) => join(payloadDir, ...rel.split("/")),
    excludedSet: new Set(excluded),
    plugins: cfg.plugins || [],
    mcpServers: cfg.mcpServers || [],
  };
}

// Drop hook entries whose script basenames are not all inside the bundle set; drop empty events.
export function filterPartialHooks(partialHooks, bundleBasenames) {
  const out = {};
  for (const [ev, entries] of Object.entries(partialHooks || {})) {
    const kept = entries.filter((e) => (e.hooks || []).every((h) =>
      (h.args || []).every((a) => bundleBasenames.has(String(a).split(/[\\/]/).pop()))));
    if (kept.length) out[ev] = kept;
  }
  return out;
}
