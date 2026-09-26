import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMcpPlan, mcpAddArgs, describeMcpAction, formatMcpPlan, redactValues, postAddArgv, quoteForCmd } from "./mcp-reconcile.mjs";

const MANAGED = {
  scrapling: { command: "uvx", args: ["--from", "scrapling[ai]", "scrapling-mcp"], requires: "uvx",
    postAdd: { command: "uvx", args: ["--from", "scrapling[ai]", "scrapling", "install"] } },
  context7: { type: "http", url: "https://mcp.context7.com/mcp",
    headerFromEnv: { CONTEXT7_API_KEY: "CONTEXT7_API_KEY" }, missingEnvNote: "no key" },
};
const plan = (over = {}) => buildMcpPlan({ required: ["scrapling", "context7"], managed: MANAGED,
  configured: [], env: {}, hasCommand: () => true, ...over });
const kinds = (actions) => actions.map((a) => `${a.type}:${a.name}`);

test("@important required and absent servers are added", () => {
  assert.deepEqual(kinds(plan().actions), ["add:scrapling", "add:context7"]);
});

test("@important a configured server gets no action", () => {
  assert.deepEqual(kinds(plan({ configured: ["scrapling"] }).actions), ["add:context7"]);
});

test("@important a managed server outside the profile is removed only when configured", () => {
  assert.deepEqual(kinds(plan({ required: [], configured: ["context7"] }).actions), ["remove:context7"]);
  assert.deepEqual(plan({ required: [], configured: [] }).actions, []);
});

test("@critical a configured context7 is never re-added, whatever the key in env", () => {
  const { actions } = plan({ required: ["context7"], configured: ["context7"], env: { CONTEXT7_API_KEY: "NEW" } });
  assert.deepEqual(actions, []);
});

test("@critical the key reaches the CLI argv but never the printed plan", () => {
  const { actions, notes } = plan({ env: { CONTEXT7_API_KEY: "SECRETX" } });
  const c7 = actions.find((a) => a.name === "context7");
  assert.ok(mcpAddArgs(c7).includes("CONTEXT7_API_KEY: SECRETX"));
  assert.doesNotMatch(describeMcpAction(c7), /SECRETX/);
  assert.doesNotMatch(formatMcpPlan(actions, notes), /SECRETX/);
  assert.match(describeMcpAction(c7), /"CONTEXT7_API_KEY: \*\*\*"/);
});

test("@important missing uvx turns scrapling into a note, not an action", () => {
  const { actions, notes } = plan({ hasCommand: () => false });
  assert.deepEqual(kinds(actions), ["add:context7"]);
  assert.ok(notes.some((n) => n.startsWith("scrapling:") && n.includes("uvx")));
});

test("@important context7 without a key is added without a header, with a note", () => {
  const { actions, notes } = plan({ required: ["context7"] });
  assert.ok(!mcpAddArgs(actions[0]).includes("--header"));
  assert.ok(notes.includes("context7: no key"));
});

test("@important stdio servers pass their command after the -- separator", () => {
  assert.deepEqual(mcpAddArgs(plan({ required: ["scrapling"] }).actions[0]),
    ["mcp", "add", "--scope", "user", "scrapling", "--", "uvx", "--from", "scrapling[ai]", "scrapling-mcp"]);
});

test("@important redactValues masks every listed value and ignores empties", () => {
  assert.equal(redactValues("x SECRETX y SECRETX", ["SECRETX", ""]), "x *** y ***");
  assert.equal(redactValues("plain", []), "plain");
});

test("@important an added server with postAdd plans its follow-up command, a removal never does", () => {
  const { actions, notes } = plan({ required: ["scrapling"] });
  assert.deepEqual(postAddArgv(actions[0]), ["uvx", "--from", "scrapling[ai]", "scrapling", "install"]);
  assert.match(formatMcpPlan(actions, notes), /then\s+uvx --from "scrapling\[ai\]" scrapling install/);
  assert.equal(postAddArgv(plan({ required: [], configured: ["scrapling"] }).actions[0]), null);
});

test("@important quoteForCmd leaves plain tokens and quotes the rest for cmd.exe", () => {
  assert.equal(quoteForCmd("--scope"), "--scope");
  assert.equal(quoteForCmd("https://mcp.context7.com/mcp"), "https://mcp.context7.com/mcp");
  assert.equal(quoteForCmd("CONTEXT7_API_KEY: k"), '"CONTEXT7_API_KEY: k"');
  assert.equal(quoteForCmd('a"b'), '"a""b"');
  assert.equal(quoteForCmd("scrapling[ai]"), '"scrapling[ai]"');
});
