// payload/hooks/lib/protected-lib.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { collectRules, decide } from "./protected-lib.mjs";

const tree = (files) => {
  const root = mkdtempSync(join(tmpdir(), "prot-"));
  for (const [p, body] of Object.entries(files)) {
    const abs = join(root, p);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  }
  return root;
};

test("@critical a .protected hidden by .gitignore is reported", () => {
  const root = tree({ ".gitignore": ".protected\n", ".protected": "docs/\n" });
  assert.equal(collectRules(root, "docs/spec.md").hidden, ".protected");
});

test("@critical editing a protected path is denied and the message names the rule", () => {
  const root = tree({ ".protected": "docs/spec.md\n" });
  const v = decide({ root, tool: "Edit", path: join(root, "docs/spec.md") });
  assert.match(v.message, /^Denied: docs\/spec\.md is protected\./m);
  assert.match(v.message, /Rule: \.protected:1 {2}`docs\/spec\.md`/);
  assert.match(v.message, /read and copied FROM, never edited, deleted or moved/);
});

test("@critical editing an unprotected path is allowed", () => {
  const root = tree({ ".protected": "docs/spec.md\n" });
  assert.equal(decide({ root, tool: "Edit", path: join(root, "docs/other.md") }), null);
});

// The rule forbids editing, deleting and moving. Creating a record that does not exist yet is
// none of the three, and refusing it means a phase cannot write its own spec at all.
// Deletion stays denied, so "remove it, then create it again" is not a way around this.
test("@critical overwriting an existing protected path is denied", () => {
  const root = tree({ ".protected": "docs/spec.md\n", "docs/spec.md": "body\n" });
  assert.ok(decide({ root, tool: "Write", path: join(root, "docs/spec.md") }));
});

test("@critical copying FROM a protected path is allowed, copying ONTO it is not", () => {
  const root = tree({ ".protected": "docs/spec.md\n" });
  assert.equal(decide({ root, tool: "Bash", command: "cp docs/spec.md /tmp/" }), null);
  assert.ok(decide({ root, tool: "Bash", command: "cp draft.md docs/spec.md" }));
});

// A path lifted out of an unparseable command carries junk ahead of the real one, so the
// suffixes are tried too - without this the protection switches off exactly where it matters.
test("@critical a protected path is found inside an unparseable command", () => {
  const root = tree({ ".protected": "docs/spec.md\n" });
  const v = decide({ root, tool: "Bash", command: "rm -rf $TARGET/docs/spec.md" });
  assert.ok(v);
  assert.match(v.message, /could not be parsed/);
});

// The intrinsic rule, and why .protected must not be listed inside itself: no entry could
// express "editable but undeletable", and one that tried would be negatable from below.
test("@critical .protected may be edited but never deleted", () => {
  const root = tree({ ".protected": "docs/\n" });
  assert.equal(decide({ root, tool: "Edit", path: join(root, ".protected") }), null);
  const v = decide({ root, tool: "Bash", command: "rm .protected" });
  assert.ok(v);
  assert.match(v.message, /intrinsic to the mechanism/);
});

test("@critical a hidden list denies every write in scope, but never its own repair", () => {
  const root = tree({ ".gitignore": ".protected\n", ".protected": "docs/\n" });
  const denied = decide({ root, tool: "Edit", path: join(root, "anything.md") });
  assert.ok(denied);
  assert.match(denied.message, /hidden by `\.gitignore`/);
  assert.equal(decide({ root, tool: "Edit", path: join(root, ".gitignore") }), null);
  assert.equal(decide({ root, tool: "Edit", path: join(root, ".protected") }), null);
});

test("@critical a read command is never denied", () => {
  const root = tree({ ".protected": "docs/\n" });
  assert.equal(decide({ root, tool: "Bash", command: "cat docs/spec.md" }), null);
});
