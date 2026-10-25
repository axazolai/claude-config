import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFragment, assembleClaudeMd } from "./assemble-claude-md.mjs";

const REAL = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "claude-md");

function fixture(eol) {
  const d = mkdtempSync(join(tmpdir(), "cmd-"));
  const w = (n, s) => writeFileSync(join(d, n), s.replace(/\n/g, eol));
  w("10-second.md", "## SECOND\nsecond-body\n");
  w("05-first.md", "---\nprofiles: [base]\n---\n## FIRST\nfirst-body\n");
  w("notes.txt", "ignored\n");
  return d;
}

test("@important fragments are concatenated in NN order after the marker, one blank line between", () => {
  const o = assembleClaudeMd(fixture("\n"));
  assert.equal(o, "<!-- CURATED:NOEDIT -->\n\n## FIRST\nfirst-body\n\n## SECOND\nsecond-body\n");
});

test("@important a leading frontmatter block contributes nothing: no --- line and no profiles: line", () => {
  const o = assembleClaudeMd(fixture("\n"));
  assert.doesNotMatch(o, /^---$/m);
  assert.doesNotMatch(o, /^profiles:/m);
  assert.equal(parseFragment("## Y\nz").body, "## Y\nz");
});

test("@important a CRLF fragment set assembles to the same output as its LF twin", () => {
  assert.equal(assembleClaudeMd(fixture("\r\n")), assembleClaudeMd(fixture("\n")));
});

test("@important real fragments: no lite or profile wording, no GSD, marker first", () => {
  const o = assembleClaudeMd(REAL);
  assert.ok(o.startsWith("<!-- CURATED:NOEDIT -->\n"));
  assert.doesNotMatch(o, /\(lite\)|lite profile|lite variant|`lite`/);
  assert.doesNotMatch(o, /\bgsd\b/i);
  assert.doesNotMatch(o, /^---$/m);
});

test("@important real fragments: the rules every session depends on are present", () => {
  const o = assembleClaudeMd(REAL);
  assert.match(o, /^# USER RULES$/m);
  assert.match(o, /## WEB ACCESS/);
  assert.match(o, /Context7 and Scrapling are user-scope MCP servers/);
  assert.match(o, /DEFAULT executor: claude-sonnet-5-5/);
  assert.match(o, /Every track starts on `medium`/);
  assert.ok(o.includes("/effort high"), "brainstorming effort rule missing");
  assert.match(o, /role map in the `model-selection-policy` skill/);
  assert.match(o, /elapsed time of a background task/);
  assert.match(o, /phase-<NN>\/\{scripts,data,logs\}\//);
  assert.match(o, /read `<project>\/\.claude\/tools\/INDEX\.md`/);
  assert.doesNotMatch(o, /\.scratchpad\/tmp\//);
});
