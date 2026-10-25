import { test } from "node:test";
import assert from "node:assert/strict";

import { globToRe, resolveBundle, loadBundle, filterPartialHooks } from "./bundle.mjs";

const REPO = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

test("@important globToRe: * does not cross /, ** does", () => {
  assert.ok(globToRe("hooks/lib/leanmode-*").test("hooks/lib/leanmode-rules.mjs"));
  assert.ok(!globToRe("hooks/*").test("hooks/lib/leanmode-rules.mjs"));
  assert.ok(globToRe("rules-src/**").test("rules-src/templates/next.AGENTS.md"));
  assert.ok(!globToRe("CLAUDE.md").test("payload/CLAUDE.md"));
  // literal space stays literal, does not become wildcard
  assert.ok(!globToRe("a b*").test("aXb.mjs"));
  assert.ok(globToRe("a b*").test("a bc.mjs"));
});

test("@important resolveBundle ships every payload file except alwaysExclude, and excludedSet holds exactly those", () => {
  const cfg = loadBundle(REPO);
  const b = resolveBundle({ repoRoot: REPO, cfg });
  const res = cfg.alwaysExclude.map(globToRe);
  for (const rel of b.rels) assert.ok(!res.some((re) => re.test(rel)), `${rel} shipped despite alwaysExclude`);
  for (const rel of b.excludedSet) assert.ok(res.some((re) => re.test(rel)), `${rel} excluded by nothing`);
  assert.ok(b.rels.includes("hooks/scrapling-raw-gate.mjs"));
  assert.ok(b.rels.includes("skills/publish/SKILL.md"));
  assert.ok(b.rels.includes("mcp-servers/deepseek/server.mjs"));
  assert.ok(b.excludedSet.has("hooks/task-lifecycle-probe.mjs"));
  assert.ok(!b.rels.includes("skills/publish/publish-skill.test.mjs"));
  assert.ok(!b.rels.some((r) => r.startsWith("claude-md/")));
  assert.equal(b.srcFor("hooks/statusline.mjs").replace(/\\/g, "/"), `${REPO}payload/hooks/statusline.mjs`);
});

test("@important plugins and mcpServers come from the top-level keys and are all managed; no forbidden plugin is required", () => {
  const cfg = loadBundle(REPO);
  const b = resolveBundle({ repoRoot: REPO, cfg });
  assert.deepEqual(b.plugins, ["ultrapowers", "context-mode"]);
  assert.deepEqual(b.mcpServers, ["scrapling", "context7", "deepseek"]);
  for (const p of b.plugins) assert.ok(p in cfg.managedPlugins, `${p} is not a managed plugin`);
  for (const s of b.mcpServers) assert.ok(s in cfg.managedMcpServers, `${s} is not a managed server`);
  for (const f of cfg.forbiddenPlugins) {
    assert.ok(f in cfg.managedPlugins, `forbidden ${f} must be managed to be removable`);
    assert.ok(!b.plugins.includes(f), `forbidden ${f} is required`);
  }
  for (const k of cfg.keepInstalled) assert.ok(k in cfg.managedPlugins, `keepInstalled ${k} is not managed`);
});

test("@important deepseekDefault is a non-off level and the deepseek server is a node server on a CLAUDE_DIR-relative path", () => {
  const cfg = loadBundle(REPO);
  assert.ok(["light", "medium", "heavy"].includes(cfg.deepseekDefault));
  const d = cfg.managedMcpServers.deepseek;
  assert.equal(d.command, "node");
  assert.equal(d.requires, "node");
  assert.ok(d.args[0].includes("{{CLAUDE_DIR}}"), "arg uses the {{CLAUDE_DIR}} placeholder, not ~");
  assert.ok(d.args[0].endsWith("mcp-servers/deepseek/server.mjs"));
  assert.deepEqual(cfg.sessionDefaults, { model: "sonnet", effortLevel: "medium" });
});

test("@important bundle.json carries no profile concept", () => {
  const cfg = loadBundle(REPO);
  for (const k of ["profiles", "variants", "deepseekDefaults"]) assert.ok(!(k in cfg), `${k} is back`);
  for (const [k, v] of Object.entries(cfg)) {
    if (!k.startsWith("$")) continue;
    assert.doesNotMatch(String(v), /profile|\blite\b|variant/i, `${k} mentions a profile`);
  }
});

test("@important filterPartialHooks drops an entry whose script is outside the bundle and keeps the rest", () => {
  const hooks = {
    PreToolUse: [
      { matcher: "Bash", hooks: [{ args: ["~/.claude/hooks/secrets-gate.mjs"] }] },
      { matcher: "Bash", hooks: [{ args: ["~/.claude/hooks/task-lifecycle-probe.mjs"] }] },
    ],
    SessionStart: [{ hooks: [{ args: ["~/.claude/hooks/task-lifecycle-probe.mjs"] }] }],
  };
  const out = filterPartialHooks(hooks, new Set(["secrets-gate.mjs"]));
  assert.deepEqual(Object.keys(out), ["PreToolUse"]);
  assert.equal(out.PreToolUse.length, 1);
  assert.equal(out.PreToolUse[0].hooks[0].args[0], "~/.claude/hooks/secrets-gate.mjs");
});
