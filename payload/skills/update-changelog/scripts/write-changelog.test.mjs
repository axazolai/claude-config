import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "write-changelog.mjs");
const run = (args) => execFileSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });

function project(version = "1.2.3") {
  const root = mkdtempSync(join(tmpdir(), "write-changelog-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "x", version }, null, 2));
  return root;
}



test("@critical --version-only rejects a malformed version", () => {
  const root = project();
  assert.throws(() => run(["--version-only", "--final-version", "v1.3", "--root", root]));
});

test("@critical without --version-only an empty entries file is still refused", () => {
  const root = project();
  const f = join(root, "entries.json");
  writeFileSync(f, JSON.stringify({ entries: [], finalVersion: "1.3.0" }));
  assert.throws(() => run(["--entries-file", f, "--root", root]));
});


