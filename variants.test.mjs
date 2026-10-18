import { test } from "node:test";
import assert from "node:assert/strict";

import { globToRe, resolveVariant, resolvedExclude, profilesOf, loadVariants } from "./variants.mjs";

// Static import specifiers (relative only). Dynamic import() is intentionally NOT matched:
// full-only code loads excluded libs via gated dynamic imports, which is legal in lite.
// Matches: import "specifier" or import ... from "specifier", including multiline forms.
function staticImportRels(text) {
  const out = [];
  // Pattern: import keyword + anything up to the statement's own semicolon + quoted specifier.
  // `[^;]` rather than `[\s\S]`: the old form skipped across whole files, so an import of a
  // non-relative module ("node:path";) let the scan run on and match the next dot-prefixed
  // string literal it found - reporting a plain constant as an import edge. Multiline import
  // forms still match, since they contain no semicolon before their own.
  for (const m of text.matchAll(/^[ \t]*import\s[^;]*?["'](\.[^"']+)["'];/gm)) {
    out.push(m[1]);
  }
  return out;
}

test("@important globToRe: * does not cross /, ** does", () => {
  assert.ok(globToRe("hooks/lib/leanmode-*").test("hooks/lib/leanmode-rules.mjs"));
  assert.ok(!globToRe("hooks/*").test("hooks/lib/leanmode-rules.mjs"));
  assert.ok(globToRe("rules-src/**").test("rules-src/templates/next.AGENTS.md"));
  assert.ok(!globToRe("CLAUDE.md").test("payload-lite/CLAUDE.md"));
  // literal space stays literal, does not become wildcard
  assert.ok(!globToRe("a b*").test("aXb.mjs"));
  assert.ok(globToRe("a b*").test("a bc.mjs"));
});

// Retired: "classification: every payload file is covered by include ∪ exclude (lite)".
// Under the denylist model (Task 1-2) `uncovered` is hardcoded to [] on every non-legacy
// resolution path (see resolveVariant in variants.mjs) so that assertion was vacuously true
// regardless of what the resolver actually did. The orphan-overlay guard below and the
// family-purity guards further down are the denylist-appropriate replacements: they exercise
// resolver output that can actually vary (overlay files that never landed a base target;
// GSD/full-only basenames leaking into a profile that must not ship them).

// "setting-templates" was dropped from this list under three-profile unification (Task 6):
// setting-templates/ now ships in EVERY profile (variant-agnostic stack templates; which
// plugins a profile is willing to enable is the tier filter, not file exclusion - see
// .ultrapowers/archive/specs/2026-07-26-three-profile-unification-design.md §2.1/§4), and the now-
// unified payload/commands/init-stack.md legitimately references
// `~/.claude/setting-templates/` for every profile, including lite. "init-stack.py" stays
// forbidden: the Python implementation is deleted, so the unified doc invokes
// `node ~/.claude/bin/init-stack.mjs` only.

// Scope is deliberately NOT all of `skills/` — `skills/update-changelog/**` legitimately
// mentions "GSD" (it's the changelog-writer's own instruction to STRIP any mention of GSD from
// user-facing release notes, e.g. SKILL.md's "of every trace of AI tooling, GSD, ..." and
// "GSD scope/decision identifiers" sections), so a blanket skills/ scan would false-positive on
// it forever. Only `skills/model-selection-policy/**` is the one this test is actually guarding
// (Fix 4: the lite overlay must not regress back to citing /gsd-execute-phase / /gsd-debug).
const FIXTURE = { profiles: {
  full: { plugins: [] },
  base: { exclude: ["a/*", "b/*"] },
  lite: { extends: "base", exclude: ["c/*"] },
}};

test("@important profilesOf: prefers profiles, falls back to variants", () => {
  assert.equal(profilesOf({ profiles: { x: 1 } }).x, 1);
  assert.equal(profilesOf({ variants: { y: 2 } }).y, 2);
  assert.deepEqual(profilesOf({}), {});
});

test("@important resolvedExclude: unions the extends chain, child last", () => {
  assert.deepEqual(resolvedExclude(FIXTURE, "full"), []);
  assert.deepEqual(resolvedExclude(FIXTURE, "base"), ["a/*", "b/*"]);
  assert.deepEqual(resolvedExclude(FIXTURE, "lite"), ["a/*", "b/*", "c/*"]);
});

// Task 7: an install against an unknown marketplace fails outright, and setup.mjs will not guess a
// repo. So every marketplace a managed plugin lives in must have its source recorded here.
const REPO = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

test("@important mcpServers: base and full get scrapling, context7 and deepseek, lite gets only deepseek", () => {
  assert.deepEqual(resolveVariant({ repoRoot: REPO, variant: "full" }).mcpServers, ["scrapling", "context7", "deepseek"]);
  assert.deepEqual(resolveVariant({ repoRoot: REPO, variant: "base" }).mcpServers, ["scrapling", "context7", "deepseek"]);
  assert.deepEqual(resolveVariant({ repoRoot: REPO, variant: "lite" }).mcpServers, ["deepseek"]);
});

test("@important mcpServers: absent is inherited through extends, an own list replaces it, no parent gives none", () => {
  const cfg = { profiles: { bare: { exclude: [] }, parent: { exclude: [], mcpServers: ["x"] },
    child: { extends: "parent" }, own: { extends: "parent", mcpServers: [] } } };
  const mcp = (variant) => resolveVariant({ repoRoot: REPO, variant, cfg }).mcpServers;
  assert.deepEqual(mcp("bare"), []);
  assert.deepEqual(mcp("child"), ["x"]);
  assert.deepEqual(mcp("own"), []);
});

test("@important mcpServers: every profile entry is a managed server", () => {
  const cfg = loadVariants(REPO);
  for (const [name, def] of Object.entries(profilesOf(cfg)))
    for (const s of def.mcpServers || []) assert.ok(s in cfg.managedMcpServers, `${name} lists unmanaged ${s}`);
});

test("@important lite ships neither Scrapling hook", () => {
  const lite = resolveVariant({ repoRoot: REPO, variant: "lite" }).rels;
  const base = resolveVariant({ repoRoot: REPO, variant: "base" }).rels;
  for (const h of ["hooks/scrapling-raw-gate.mjs", "hooks/web-block-nudge.mjs"]) {
    assert.ok(!lite.includes(h), `lite ships ${h}`);
  }
  assert.ok(base.includes("hooks/scrapling-raw-gate.mjs") && base.includes("hooks/web-block-nudge.mjs"));
});

test("@important /publish ships in base and full, not in lite", () => {
  const rels = (variant) => resolveVariant({ repoRoot: REPO, variant }).rels;
  for (const f of ["skills/publish/SKILL.md", "skills/publish/step-subagent-brief.md"]) {
    assert.ok(rels("base").includes(f) && rels("full").includes(f), `base/full ship ${f}`);
    assert.ok(!rels("lite").includes(f), `lite ships ${f}`);
  }
  assert.ok(!rels("base").includes("skills/publish/publish-skill.test.mjs"));
});

test("@important the bundle's session defaults are sonnet at medium effort", () => {
  assert.deepEqual(loadVariants(REPO).sessionDefaults, { model: "sonnet", effortLevel: "medium" });
});

test("@important managedMcpServers.deepseek is a node server with a CLAUDE_DIR-relative path", () => {
  const d = loadVariants(REPO).managedMcpServers.deepseek;
  assert.equal(d.command, "node");
  assert.equal(d.requires, "node");
  assert.ok(d.args[0].includes("{{CLAUDE_DIR}}"), "arg uses the {{CLAUDE_DIR}} placeholder, not ~");
  assert.ok(d.args[0].endsWith("mcp-servers/deepseek/server.mjs"));
});

test("@important every profile resolves deepseek into its mcpServers", () => {
  for (const name of ["full", "base", "lite"]) {
    const v = resolveVariant({ repoRoot: REPO, variant: name });
    assert.ok(v.mcpServers.includes("deepseek"), `${name} must include deepseek`);
  }
});

test("@important deepseekDefaults covers each profile with a light/medium/heavy level", () => {
  const d = loadVariants(REPO).deepseekDefaults;
  assert.deepEqual(Object.keys(d).sort(), ["base", "full", "lite"]);
  for (const [profile, level] of Object.entries(d))
    assert.ok(["light", "medium", "heavy"].includes(level), `${profile} -> ${level} must be a non-off A-mode level`);
});

test("@critical no profile excludes the deepseek MCP server files", () => {
  const cfg = loadVariants(REPO);
  const sample = "mcp-servers/deepseek/server.mjs";
  for (const name of ["full", "base", "lite"]) {
    const excluded = resolvedExclude(cfg, name).some((g) => globToRe(g).test(sample));
    assert.ok(!excluded, `${name} must not exclude ${sample}`);
  }
  assert.ok(!(loadVariants(REPO).alwaysExclude || []).some((g) => globToRe(g).test(sample)),
    "alwaysExclude must not match the deepseek server");
});
