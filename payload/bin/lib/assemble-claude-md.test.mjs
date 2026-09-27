import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFragment, assembleClaudeMd } from "./assemble-claude-md.mjs";

function fixture() {
  const d = mkdtempSync(join(tmpdir(), "cmd-"));
  const w = (n, s) => writeFileSync(join(d, n), s);
  w("05-language.md", "## LANGUAGE\nshared-lang\n");
  w("06-collab.md", "---\nprofiles: [full, base]\n---\n## COLLAB\nkeeps-bg-elapsed\n");
  w("06-collab.lite.md", "## COLLAB\nno-bg-elapsed\n");
  w("10-gsd.md", "---\nprofiles: [full]\n---\n## GSD\nmethodology\n");
  return d;
}
test("@important parseFragment strips frontmatter, returns profiles + body", () => {
  const r = parseFragment("---\nprofiles: [full, lite]\n---\n## X\nbody\n");
  assert.deepEqual(r.profiles, ["full", "lite"]);
  assert.equal(r.body.trimEnd(), "## X\nbody");
  assert.equal(parseFragment("## Y\nz").profiles, null);
});
test("@important full: GSD + shared + full/base side of split", () => {
  const o = assembleClaudeMd(fixture(), "full");
  assert.match(o, /## GSD/); assert.match(o, /keeps-bg-elapsed/); assert.doesNotMatch(o, /no-bg-elapsed/);
});
const REAL = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "claude-md");
test("@important real fragments: GSD full-only; base keeps bg-elapsed; lite drops it + says 'lite variant'", () => {
  const full = assembleClaudeMd(REAL, "full"), base = assembleClaudeMd(REAL, "base"), lite = assembleClaudeMd(REAL, "lite");
  assert.match(full, /rules-src\/gsd\.md/);
  assert.doesNotMatch(base, /rules-src\/gsd\.md/);
  assert.doesNotMatch(lite, /rules-src\/gsd\.md/);
  assert.match(base, /Elapsed time of a background/);
  assert.doesNotMatch(lite, /Elapsed time of a background/);
  assert.match(lite, /lite variant/);
  for (const o of [full, base, lite]) { assert.match(o, /CURATED:NOEDIT/); assert.doesNotMatch(o, /^---$/m); }
});

test("@important real fragments: base and full carry web routing and the MCP servers; lite neither", () => {
  const full = assembleClaudeMd(REAL, "full"), base = assembleClaudeMd(REAL, "base"), lite = assembleClaudeMd(REAL, "lite");
  for (const o of [full, base]) {
    assert.match(o, /## WEB ACCESS/);
    assert.match(o, /Context7 and Scrapling are user-scope MCP servers/);
  }
  assert.doesNotMatch(lite, /WEB ACCESS|Scrapling/);
  assert.match(lite, /Never enable the marketplace plugin named context7/);
});

// Scope for the negative lite checks is deliberately the Model Selection Policy section only,
// not the whole assembled document: 07-conventions.md and 09-plugins.lite.md legitimately say
// "ultrapowers" elsewhere in lite (the plugin itself, `.claude/ultrapowers.json`), unrelated to
// this fragment's own role-map bullet. `# Model Selection Policy` is the section's sole H1 and
// (per the real fragments) the last one in the document, so slicing from its heading to EOF
// isolates it without depending on section order elsewhere.
test("@important real fragments: model selection — Sonnet 5 default, high start; lite drops the ultrapowers role map", () => {
  const full = assembleClaudeMd(REAL, "full"), base = assembleClaudeMd(REAL, "base"), lite = assembleClaudeMd(REAL, "lite");
  for (const o of [full, base]) {
    assert.match(o, /DEFAULT executor: claude-sonnet-5/);
    assert.match(o, /Start `high`/);
    assert.match(o, /role map in the `model-selection-policy` skill/);
  }
  const liteHeading = "# Model Selection Policy";
  assert.ok(lite.includes(liteHeading));
  const liteSection = lite.slice(lite.indexOf(liteHeading));
  assert.match(liteSection, /DEFAULT executor: claude-sonnet-5/);
  assert.match(liteSection, /Start `high`/);
  assert.doesNotMatch(liteSection, /role map/);
  assert.doesNotMatch(liteSection.toLowerCase(), /ultrapowers/);
});

// Narrow, non-brittle scope: base/lite must ship neither the `rules-src/gsd.md` pointer (04-
// reading-order.full.md, full-only — already covered above) nor the "gsd" entry in the base-
// plugins list (09-plugins.full.md
// vs the shared base/lite version, which lists ultrapowers/context-mode/context7 only). A
// blanket case-insensitive "gsd" scan is deliberately NOT used here: 04-reading-order and 06-
// collaboration legitimately mention "GSD project" (a `.planning/` directory convention, not
// gsd-plugin machinery) in fragments shared by every profile per the delta table.
// Regression: repo has core.autocrlf=true, so a fresh Windows checkout materializes
// payload/claude-md/*.md with CRLF even though they're authored/stored as LF. parseFragment's
// frontmatter regex anchors on bare \n and must still match a \r\n-terminated fragment, or the
// raw "---\r\nprofiles: [...]\r\n---" block leaks into the assembled output and profile gating
// silently breaks (a full-only section would leak into base/lite). This fixture uses EXPLICIT
// \r\n throughout so it fails on a checkout-dependent working tree exactly like a real one would.
function crlfFixture() {
  const d = mkdtempSync(join(tmpdir(), "cmd-crlf-"));
  const w = (n, s) => writeFileSync(join(d, n), s);
  w("05-language.md", "## LANGUAGE\r\nshared-lang\r\n");
  w("10-gsd.md", "---\r\nprofiles: [full]\r\n---\r\n## GSD\r\nmethodology\r\n");
  return d;
}
test("@important parseFragment handles CRLF frontmatter (fresh Windows checkout, core.autocrlf=true)", () => {
  const r = parseFragment("---\r\nprofiles: [full, lite]\r\n---\r\n## X\r\nbody\r\n");
  assert.deepEqual(r.profiles, ["full", "lite"]);
  assert.doesNotMatch(r.body, /^---/m);
  assert.doesNotMatch(r.body, /^profiles:/m);
  assert.match(r.body, /## X/);
});
test("@important assembleClaudeMd on a CRLF fixture: no profiles:[full] leak into base, no raw frontmatter", () => {
  const o = assembleClaudeMd(crlfFixture(), "base");
  assert.doesNotMatch(o, /## GSD/);
  assert.doesNotMatch(o, /^---$/m);
  assert.doesNotMatch(o, /^profiles:/m);
  assert.match(o, /## LANGUAGE/);
});

test("@important real fragments: every profile has the scratchpad layout bullet and the tools-index bullet", () => {
  const full = assembleClaudeMd(REAL, "full"), base = assembleClaudeMd(REAL, "base"), lite = assembleClaudeMd(REAL, "lite");
  for (const o of [full, base, lite]) {
    assert.match(o, /phase-<NN>\/\{scripts,data,logs\}\//);
    assert.match(o, /read `<project>\/\.claude\/tools\/INDEX\.md`/);
  }
});

test("@important real fragments: no profile still carries the old .scratchpad/tmp/ wording", () => {
  const full = assembleClaudeMd(REAL, "full"), base = assembleClaudeMd(REAL, "base"), lite = assembleClaudeMd(REAL, "lite");
  for (const o of [full, base, lite]) {
    assert.doesNotMatch(o, /\.scratchpad\/tmp\//);
    assert.doesNotMatch(o, /two tiers/);
    assert.doesNotMatch(o, /older than 7 days may be deleted/);
  }
});

test("@important real fragments: the no-scaffolding rule is scoped to Opus 5.5+ only, in every profile", () => {
  const full = assembleClaudeMd(REAL, "full"), base = assembleClaudeMd(REAL, "base"), lite = assembleClaudeMd(REAL, "lite");
  for (const o of [full, base, lite]) {
    assert.match(o, /Opus 5\.5 always thinks[\s\S]*?do not add "verify"\/"double-check" scaffolding/);
  }
});

test("@important real fragments: base and full carry the SCRATCHPAD CLEANUP phase-cleanup bullet; lite does not", () => {
  const full = assembleClaudeMd(REAL, "full"), base = assembleClaudeMd(REAL, "base"), lite = assembleClaudeMd(REAL, "lite");
  for (const o of [full, base]) {
    assert.match(o, /## SCRATCHPAD CLEANUP/);
    assert.match(o, /the `scratch-prune` skill/);
  }
  assert.doesNotMatch(lite, /## SCRATCHPAD CLEANUP/);
  assert.doesNotMatch(lite, /scratch-prune/);
});
