// payload/hooks/lib/gsd-patch-frontmatter.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { setFrontmatterField } from "./gsd-patch-frontmatter.mjs";

const P = { key: "effort", from: ["low"], to: "medium" };
const PMAX = { key: "effort", from: ["max"], to: "xhigh" };

const fm = (effortLine, body = "\nBody text.\n") =>
  `---\nname: some-agent\n${effortLine}\ntools: Read\n---\n${body}`;

test("@important value in `from` is set to `to` (applied)", () => {
  const { content, kind } = setFrontmatterField(fm("effort: low"), P);
  assert.equal(kind, "applied");
  assert.match(content, /^effort: medium$/m);
  assert.doesNotMatch(content, /effort: low/);
});

test("@important a foreign value is left untouched (skippedForeign)", () => {
  const src = fm("effort: high");
  const { content, kind } = setFrontmatterField(src, P);
  assert.equal(kind, "skippedForeign");
  assert.equal(content, src);
});

test("@important missing key in frontmatter is noKey", () => {
  const src = "---\nname: x\ntools: Read\n---\nBody.\n";
  const { content, kind } = setFrontmatterField(src, P);
  assert.equal(kind, "noKey");
  assert.equal(content, src);
});

test("@important double-quoted value is matched and rewritten unquoted", () => {
  const { content, kind } = setFrontmatterField(fm('effort: "max"'), PMAX);
  assert.equal(kind, "applied");
  assert.match(content, /^effort: xhigh$/m);
});

test("@important CRLF line endings are preserved", () => {
  const src = "---\r\nname: x\r\neffort: low\r\ntools: Read\r\n---\r\nBody.\r\n";
  const { content, kind } = setFrontmatterField(src, P);
  assert.equal(kind, "applied");
  assert.ok(content.includes("effort: medium\r\n"), "rewritten line keeps CRLF");
  assert.ok(content.includes("name: x\r\n"), "other CRLF lines intact");
});

test("@critical only the frontmatter is touched; a stray body `effort:` is left alone", () => {
  const src = fm("effort: low", "\nProse mentioning effort: low in text.\n");
  const { content, kind } = setFrontmatterField(src, P);
  assert.equal(kind, "applied");
  assert.match(content, /^effort: medium$/m);
  assert.ok(content.includes("Prose mentioning effort: low in text."), "body untouched");
});

test("@critical key only in the body, not frontmatter, is noKey (body never mutated)", () => {
  const src = "---\nname: x\ntools: Read\n---\nSome effort: low in prose.\n";
  const { content, kind } = setFrontmatterField(src, P);
  assert.equal(kind, "noKey");
  assert.equal(content, src);
});

// gsd-core 1.9.1 stopped shipping `effort:` on any agent, so a patch that only rewrites an
// existing value became a silent no-op. insertIfMissing restores the intent: pin the value.
const PINS = { key: "effort", from: ["low"], to: "medium", insertIfMissing: true };

test("@important a missing key is inserted when the patch asks for it", () => {
  const src = "---\nname: x\ntools: Read\n---\nBody.\n";
  const { content, kind } = setFrontmatterField(src, PINS);
  assert.equal(kind, "applied");
  assert.match(content, /^effort: medium$/m);
  assert.ok(content.startsWith("---\nname: x\ntools: Read\neffort: medium\n---\n"), content.slice(0, 60));
});

test("@critical a file with no frontmatter is never given one", () => {
  const src = "Just a body, no frontmatter.\n";
  const { content, kind } = setFrontmatterField(src, PINS);
  assert.equal(kind, "noKey");
  assert.equal(content, src);
});
