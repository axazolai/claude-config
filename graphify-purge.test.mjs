import test from "node:test";
import assert from "node:assert/strict";
import { companionMcpNames, stripGraphifySettings, stripPostCommit, stripGraphifyClaudeSection } from "./graphify-purge.mjs";




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



test("@critical a malformed settings shape is survived, not thrown on", () => {
  for (const hooks of ["x", { Notification: [null] }, { Notification: {} }, null]) {
    const { removed } = stripGraphifySettings({ hooks });
    assert.deepEqual(removed, []);
  }
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


test("@critical a `## graphify` heading that is not graphify's install is left alone", () => {
  const text = "## graphify\n\nWhy we stopped using it: the global graph outgrew its budget.\n";
  assert.equal(stripGraphifyClaudeSection(text), null);
  assert.equal(stripGraphifyClaudeSection("## other\n\nnothing here\n"), null);
});
