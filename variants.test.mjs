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

// Budgeted exceptions: token -> how many occurrences of it this file is allowed to carry.
// A budget, not an exemption - exceeding it still fails, so a NEW leak of the same token is
// caught while the reviewed one is permitted.
//
// `commands/init-stack.md` is unified across profiles and legitimately names GSD once: the
// `.planning/config.json` `model_overrides` re-migration it documents (Phase 5 Part B, 0db8c6b)
// genuinely ships in lite - `bin/init-stack.mjs` and `bin/lib/model-migration.mjs` are both in
// the resolved lite set, verified 2026-07-27. Deleting the sentence would document lite as not
// doing something it does; rewording it to drop the word would only hide the token, since
// `.planning/` IS the GSD marker. The other twelve tokens stay fully enforced on this file.

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

test("@important mcpServers: base and full get scrapling and context7, lite gets none", () => {
  assert.deepEqual(resolveVariant({ repoRoot: REPO, variant: "full" }).mcpServers, ["scrapling", "context7"]);
  assert.deepEqual(resolveVariant({ repoRoot: REPO, variant: "base" }).mcpServers, ["scrapling", "context7"]);
  assert.deepEqual(resolveVariant({ repoRoot: REPO, variant: "lite" }).mcpServers, []);
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
