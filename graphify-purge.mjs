// Pure purge plan for the graphify CLI this bundle used to install. No fs/process access here -
// setup.mjs executes. Two sides wrote graphify state and both are covered: this bundle
// (bin/graph-*.mjs, the sync hooks, the native post-commit hook, ~/.graphify) and graphify's own
// `graphify claude install` (a CLAUDE.md section plus hook-guard entries in a project's
// .claude/settings.json).
//
// Scope limit: only names this bundle or graphify itself owns. A `neo4j` MCP server is a plain
// database connection someone may keep for unrelated work - graphify pushing into it does not make
// it graphify's, so it is reported and never removed.

// Files this bundle shipped under ~/.claude for as long as graphify was part of it. Manifest-driven
// pruning already covers a machine whose manifest is current; this list covers the rest.
export const BUNDLE_RELS = [
  "bin/graph-docs.mjs",
  "bin/graph-find.mjs",
  "bin/graph-semantic.mjs",
  "bin/graph-semantic.py",
  "bin/graphify-freshness.mjs",
  "bin/graphify-setup.mjs",
  "bin/lib/doc-corpus.mjs",
  "bin/lib/global-index.mjs",
  "bin/lib/graphify-python.mjs",
  "commands/graphify-build-docs.md",
  "graphify-sync-all.mjs",
  "graphify-sync-all.ps1",
  "hooks/graphify-global-sync.mjs",
  "hooks/graphify-grep-nudge.mjs",
  "hooks/lib/graphify-global-sync-run.mjs",
  "hooks/lib/graphify-sync-command.mjs",
];

// Per-project directories and files, relative to a repo root.
export const PROJECT_RELS = ["graphify-out", ".planning/graphs", "graphify-sync.log"];

// A `.graphify` copied under the config dir by some earlier backup or trash step. These carry the
// same content as the live one, credentials for its Neo4j backend included, so a purge that leaves
// them has not purged anything.
export function findStashedGraphify(dir, listDirs, depth = 5) {
  const found = [];
  const walk = (at, left) => {
    for (const name of listDirs(at) || []) {
      const child = `${at}/${name}`;
      if (name === ".graphify") { found.push(child); continue; }
      if (left > 0) walk(child, left - 1);
    }
  };
  walk(dir.replace(/\\/g, "/").replace(/\/+$/, ""), depth);
  return found;
}

const mentionsGraphify = (v) => /graphify/i.test(String(v));

// `<root>/graphify-out/graph.json` -> `<root>`. Windows paths arrive with backslashes.
export function repoRootsFromManifest(manifest) {
  const repos = (manifest && manifest.repos) || {};
  const roots = [];
  for (const entry of Object.values(repos)) {
    const p = entry && entry.source_path;
    if (!p) continue;
    const parts = String(p).split(/[\\/]/);
    const i = parts.lastIndexOf("graphify-out");
    const root = (i > 0 ? parts.slice(0, i) : parts.slice(0, -1)).join("/");
    if (root && !roots.includes(root)) roots.push(root);
  }
  return roots;
}

// Drops hook entries that invoke graphify (ours or its own hook-guard), GRAPHIFY_* env keys, and
// permission rules naming it. Empty event arrays are left in place: deleting a key moves it to the
// object tail on the next merge and breaks settings.json round-tripping.
export function stripGraphifySettings(settings) {
  const out = JSON.parse(JSON.stringify(settings || {}));
  const removed = [];
  for (const [ev, entries] of Object.entries((out.hooks && typeof out.hooks === "object") ? out.hooks : {})) {
    if (!Array.isArray(entries)) continue;
    const kept = entries.filter((e) => !(e && Array.isArray(e.hooks) ? e.hooks : []).some((h) =>
      h && (mentionsGraphify(h.command) || (Array.isArray(h.args) ? h.args : []).some(mentionsGraphify))));
    if (kept.length !== entries.length) removed.push(`${ev} hook x${entries.length - kept.length}`);
    out.hooks[ev] = kept;
  }
  for (const k of Object.keys((out.env && typeof out.env === "object") ? out.env : {})) {
    if (/^(CLAUDE_)?GRAPHIFY(_|$)/.test(k)) { delete out.env[k]; removed.push(`env ${k}`); }
  }
  for (const [k, v] of Object.entries((out.permissions && typeof out.permissions === "object") ? out.permissions : {})) {
    if (!Array.isArray(v)) continue;
    const kept = v.filter((r) => !mentionsGraphify(r));
    if (kept.length !== v.length) removed.push(`permissions.${k} x${v.length - kept.length}`);
    out.permissions[k] = kept;
  }
  return { settings: out, removed };
}

// Every project root any of the three sources knows about. The graphify manifest is the precise
// list and the first thing the purge deletes, so on a machine already half-cleaned the other two
// are what is left to sweep - project-init.json in particular records which roots session-init
// registered with graphify at all.
export function discoverRoots({ manifest, projectInit, claudeJson } = {}) {
  const roots = [];
  const add = (p) => {
    const norm = String(p || "").replace(/\\/g, "/").replace(/\/+$/, "");
    if (norm && !roots.includes(norm)) roots.push(norm);
  };
  repoRootsFromManifest(manifest).forEach(add);
  Object.keys((projectInit && typeof projectInit === "object") ? projectInit : {}).forEach(add);
  Object.keys((claudeJson && claudeJson.projects) || {}).forEach(add);
  return roots;
}

// session-init.mjs stamped its graphify steps as done per project, and left their wording in the
// per-root action/note log. Both go, or a reinstall of the CLI would find the work "already done".
export function stripProjectInitGraphify(state) {
  const out = JSON.parse(JSON.stringify(state || {}));
  let touched = 0;
  for (const entry of Object.values(out)) {
    if (!entry || typeof entry !== "object") continue;
    for (const key of ["graphifySynced", "graphifyClaudeInstalled"])
      if (key in entry) { delete entry[key]; touched++; }
    for (const key of ["actions", "notes"]) {
      if (!Array.isArray(entry[key])) continue;
      // "global (knowledge) graph" catches the note session-init wrote whose first sentence never
      // names the tool. Only that deleted block ever produced the phrase.
      const kept = entry[key].filter((x) => !mentionsGraphify(x) && !/global (knowledge )?graph/i.test(String(x)));
      if (kept.length !== entry[key].length) touched++;
      entry[key] = kept;
    }
  }
  return { state: out, touched };
}

// Removes every graphify server from a ~/.claude.json, user scope and per project. `companions` are
// servers graphify was configured to talk to (its Neo4j backend): named explicitly by the caller,
// which decides from the machine's own evidence whether they were graphify's at all.
export function stripGraphifyMcp(claudeJson, companions = []) {
  const out = JSON.parse(JSON.stringify(claudeJson || {}));
  const removed = [];
  const alsoDrop = new Set(companions);
  const sweep = (servers, where) => {
    for (const name of Object.keys(servers || {})) {
      const srv = servers[name] || {};
      if (!alsoDrop.has(name) && !/^graphify/i.test(name) && !mentionsGraphify(srv.command)
          && !(Array.isArray(srv.args) ? srv.args : []).some(mentionsGraphify)) continue;
      delete servers[name];
      removed.push(`${where}: ${name}`);
    }
  };
  sweep(out.mcpServers, "user");
  for (const [root, proj] of Object.entries(out.projects || {})) sweep(proj.mcpServers, root);
  return { claudeJson: out, removed };
}

// Drops the block session-init.mjs appended and any other graphify invocation. Returns null when
// nothing but a shebang survives - the caller deletes the file rather than leaving a stub.
export function stripPostCommit(text) {
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(nl).filter((l) => !mentionsGraphify(l));
  const meaningful = lines.filter((l) => l.trim() && !l.startsWith("#!"));
  if (!meaningful.length) return null;
  return lines.join(nl).replace(new RegExp(`(?:${nl}){3,}`, "g"), nl + nl);
}

// Removes the `## graphify` section `graphify claude install` writes, up to the next heading of the
// same level. The body check keeps an unrelated heading of that name intact.
export function stripGraphifyClaudeSection(text) {
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(nl);
  const start = lines.findIndex((l) => /^##\s+graphify\s*$/i.test(l));
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) if (/^##\s/.test(lines[i])) { end = i; break; }
  const body = lines.slice(start, end).join(nl);
  if (!/graphify-out|graphify query/i.test(body)) return null;
  const kept = [...lines.slice(0, start), ...lines.slice(end)];
  return kept.join(nl).replace(new RegExp(`(?:${nl}){3,}`, "g"), nl + nl).replace(/\s+$/, "") + nl;
}

// A server is graphify's companion only where the machine still proves the pairing: the CLI was
// pointed at that backend (a GRAPHIFY_*NEO4J* setting), it left push state behind, or its own
// directory holds that backend's config. Without that proof a `neo4j` entry is somebody's plain
// database connection and stays. `graphifyFiles` are filenames from a .graphify directory (live or
// stashed), where a neo4j name can only have come from graphify.
export function companionMcpNames({ settings, stateNames = [], graphifyFiles = [], claudeJson } = {}) {
  const envKeys = Object.keys((settings && settings.env) || {});
  const pushedToNeo4j = envKeys.some((k) => /GRAPHIFY/i.test(k) && /NEO4J/i.test(k))
    || stateNames.some((n) => /^graphify-.*neo4j/i.test(n))
    || graphifyFiles.some((n) => /neo4j|cypher/i.test(n));
  if (!pushedToNeo4j) return [];
  const servers = (claudeJson && claudeJson.mcpServers) || {};
  return Object.keys(servers).filter((name) => /neo4j|cypher/i.test(name)
    || (Array.isArray(servers[name].args) ? servers[name].args : []).some((a) => /neo4j|cypher/i.test(String(a))));
}

export function formatPurge(plan) {
  if (!plan.length) return "";
  const lines = ["\n--- graphify: removing every trace (no longer part of this bundle) ---"];
  for (const item of plan) lines.push(`  ${item}`);
  return lines.join("\n");
}
