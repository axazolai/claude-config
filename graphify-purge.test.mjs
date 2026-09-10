import test from "node:test";
import assert from "node:assert/strict";
import { repoRootsFromManifest, discoverRoots, companionMcpNames, findStashedGraphify,
  stripGraphifySettings, stripGraphifyMcp, stripProjectInitGraphify, stripPostCommit,
  stripGraphifyClaudeSection } from "./graphify-purge.mjs";

test("@important a manifest entry resolves to the repo root above graphify-out/", () => {
  const roots = repoRootsFromManifest({ repos: {
    a: { source_path: "D:\\work\\repo-a\\graphify-out\\graph.json" },
    b: { source_path: "/home/x/repo-b/graphify-out/graph.json" },
    dup: { source_path: "D:\\work\\repo-a\\graphify-out\\graph.json" },
    broken: {},
  } });
  assert.deepEqual(roots, ["D:/work/repo-a", "/home/x/repo-b"]);
});

test("@important the three project sources are unioned and normalised to one form", () => {
  const roots = discoverRoots({
    manifest: { repos: { a: { source_path: "D:\\work\\repo-a\\graphify-out\\graph.json" } } },
    projectInit: { "D:\\work\\repo-a": {}, "D:\\work\\repo-b\\": {} },
    claudeJson: { projects: { "D:/work/repo-c": {} } },
  });
  assert.deepEqual(roots, ["D:/work/repo-a", "D:/work/repo-b", "D:/work/repo-c"]);
  assert.deepEqual(discoverRoots(), []);
});

test("@important a project's done-flags and graphify-worded log lines both go", () => {
  const { state, touched } = stripProjectInitGraphify({
    "D:/a": { graphifySynced: true, graphifyClaudeInstalled: true, initialized: "x",
      actions: ["queued graphify global registration as 'a'", "marked CLAUDE.md curated"],
      notes: ["Global knowledge graph already has other repos", "MCP suggestion: wire git"] },
    "D:/b": { initialized: "y", actions: [] },
  });
  assert.deepEqual(state["D:/a"], { initialized: "x", actions: ["marked CLAUDE.md curated"],
    notes: ["MCP suggestion: wire git"] });
  assert.deepEqual(state["D:/b"], { initialized: "y", actions: [] });
  assert.equal(touched, 4);
});

test("@critical a Neo4j MCP is only graphify's where the machine still proves the pairing", () => {
  const claudeJson = { mcpServers: { neo4j: { command: "uvx", args: ["mcp-neo4j-cypher@0.6.0"] },
    postgres: { command: "uvx", args: ["postgres-mcp"] } } };
  assert.deepEqual(companionMcpNames({ settings: { env: { GRAPHIFY_NEO4J: "1" } }, claudeJson }), ["neo4j"]);
  assert.deepEqual(companionMcpNames({ settings: {}, stateNames: ["graphify-neo4j-push.log"], claudeJson }), ["neo4j"]);
  assert.deepEqual(companionMcpNames({ settings: {}, graphifyFiles: ["global-graph.json", "neo4j.env"], claudeJson }), ["neo4j"]);
  assert.deepEqual(companionMcpNames({ settings: { env: { EDITOR: "vim" } }, stateNames: ["token-usage.jsonl"],
    graphifyFiles: ["global-graph.json"], claudeJson }), []);
  assert.deepEqual(companionMcpNames(), []);
});

test("@important a stashed .graphify copy is found at any depth and not descended into", () => {
  const tree = {
    "C:/cd": ["remove-backup", "state"],
    "C:/cd/remove-backup": ["c"],
    "C:/cd/remove-backup/c": ["Users"],
    "C:/cd/remove-backup/c/Users": ["Axa"],
    "C:/cd/remove-backup/c/Users/Axa": [".graphify"],
    "C:/cd/remove-backup/c/Users/Axa/.graphify": ["cache"],
    "C:/cd/state": [],
  };
  assert.deepEqual(findStashedGraphify("C:\\cd\\", (at) => tree[at]),
    ["C:/cd/remove-backup/c/Users/Axa/.graphify"]);
});

test("@important settings keep every hook that is not graphify's, from either side", () => {
  const { settings, removed } = stripGraphifySettings({
    env: { GRAPHIFY_NEO4J: "1", CLAUDE_GRAPHIFY_AUTOSYNC: "0", EDITOR: "vim" },
    hooks: {
      PreToolUse: [
        { matcher: "Grep|Glob", hooks: [{ command: "node", args: ["~/.claude/hooks/graphify-grep-nudge.mjs"] }] },
        { matcher: "Read", hooks: [{ command: "C:/Users/x/.local/bin/graphify.EXE hook-guard read" }] },
        { matcher: "Bash", hooks: [{ command: "node", args: ["~/.claude/hooks/secrets-gate.mjs"] }] },
      ],
      Stop: [{ hooks: [{ command: "node", args: ["~/.claude/hooks/token-usage-log.mjs"] }] }],
    },
    permissions: { deny: ["Edit(~/.claude/CLAUDE.md)", "Bash(graphify extract:*)"] },
  });
  assert.deepEqual(settings.hooks.PreToolUse.map((e) => e.matcher), ["Bash"]);
  assert.equal(settings.hooks.Stop.length, 1);
  assert.deepEqual(settings.env, { EDITOR: "vim" });
  assert.deepEqual(settings.permissions.deny, ["Edit(~/.claude/CLAUDE.md)"]);
  assert.deepEqual(removed, ["PreToolUse hook x2", "env GRAPHIFY_NEO4J", "env CLAUDE_GRAPHIFY_AUTOSYNC",
    "permissions.deny x1"]);
});

test("@critical a malformed settings shape is survived, not thrown on", () => {
  for (const hooks of ["x", { Notification: [null] }, { Notification: {} }, null]) {
    const { removed } = stripGraphifySettings({ hooks });
    assert.deepEqual(removed, []);
  }
});

test("@important an event emptied by the purge keeps its key as an empty array", () => {
  const { settings } = stripGraphifySettings({
    hooks: { PostToolUse: [{ matcher: "Bash", hooks: [{ command: "node", args: ["hooks/graphify-global-sync.mjs"] }] }] },
  });
  assert.deepEqual(settings.hooks, { PostToolUse: [] });
});

test("@important MCP servers go by name or by command, user scope and per project", () => {
  const { claudeJson, removed } = stripGraphifyMcp({
    mcpServers: { "graphify-mcp": { command: "uvx" }, neo4j: { command: "uvx", args: ["mcp-neo4j-cypher"] },
      context7: { command: "npx" } },
    projects: { "D:/repo": { mcpServers: { local: { command: "graphify", args: ["mcp"] }, ide: { command: "node" } } } },
  });
  assert.deepEqual(Object.keys(claudeJson.mcpServers), ["neo4j", "context7"]);
  assert.deepEqual(Object.keys(claudeJson.projects["D:/repo"].mcpServers), ["ide"]);
  assert.deepEqual(removed, ["user: graphify-mcp", "D:/repo: local"]);
});

test("@critical a post-commit hook that had other work keeps it", () => {
  const text = "#!/bin/sh\nnpm run docs\n\n# graphify-global-sync (added by ~/.claude/hooks/session-init.mjs)\n" +
    'node "C:\\Users\\x\\.claude\\hooks\\lib\\graphify-global-sync-run.mjs" >/dev/null 2>&1 &\n';
  assert.equal(stripPostCommit(text), "#!/bin/sh\nnpm run docs\n\n");
});

test("@critical a post-commit hook that was only graphify's is reported as deletable", () => {
  const text = "#!/bin/sh\n# graphify-global-sync (added by ~/.claude/hooks/session-init.mjs)\n" +
    'node "graphify-global-sync-run.mjs" >/dev/null 2>&1 &\n';
  assert.equal(stripPostCommit(text), null);
});

test("@important the graphify CLAUDE.md section is removed and its neighbours survive", () => {
  const text = "<!-- CURATED:NOEDIT -->\n\n## graphify\n\nThis project has a knowledge graph at graphify-out/.\n\n" +
    "- run `graphify update .`\n\n## Risk register location\n\nSee .ultrapowers/RISK_REGISTER.md.\n";
  assert.equal(stripGraphifyClaudeSection(text),
    "<!-- CURATED:NOEDIT -->\n\n## Risk register location\n\nSee .ultrapowers/RISK_REGISTER.md.\n");
});

test("@critical a `## graphify` heading that is not graphify's install is left alone", () => {
  const text = "## graphify\n\nWhy we stopped using it: the global graph outgrew its budget.\n";
  assert.equal(stripGraphifyClaudeSection(text), null);
  assert.equal(stripGraphifyClaudeSection("## other\n\nnothing here\n"), null);
});
