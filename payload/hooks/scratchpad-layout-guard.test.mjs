import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decide } from "./scratchpad-layout-guard.mjs";

// CLAUDE_PROJECT_DIR is cleared by default: Claude Code sets it in every session's own shell
// (including the one running this suite), so a spawned test that forgot to pass a project root
// would otherwise silently resolve against this very repo instead of its tmpdir fixture.

const root = mkdtempSync(join(tmpdir(), "slg-root-"));
const harnessRoot = join(mkdtempSync(join(tmpdir(), "slg-harness-")), "claude");

// Shared shape for decide()'s argument object; each call overrides only what it's testing.
const args = (over = {}) => ({
  toolName: "Write", toolInput: {}, projectRoot: root, env: {}, today: "2026-09-27", currentPhase: null, ...over,
});
const call = (path, over = {}) => decide(args({
  toolInput: { file_path: join(root, path) }, env: { CLAUDE_CODE_TMPDIR: harnessRoot }, ...over,
}));

test("@critical denies a write inside the harness session scratchpad", () => {
  const p = join(harnessRoot, "some-slug", "0000000-uuid", "scratchpad", "note.txt");
  const reason = decide(args({ toolInput: { file_path: p }, env: { CLAUDE_CODE_TMPDIR: harnessRoot } }));
  assert.match(reason, /harness session scratchpad/);
});

test("@critical denies a file directly in .scratchpad/", () => {
  assert.match(call(join(".claude", ".scratchpad", "note.txt")), /directly in \.scratchpad/);
});

test("@critical denies a path under .scratchpad/tmp/", () => {
  assert.match(call(join(".claude", ".scratchpad", "tmp", "x.txt")), /\.scratchpad\/tmp/);
});

test("@critical denies a path under an unrecognised top-level .scratchpad/ folder", () => {
  assert.match(call(join(".claude", ".scratchpad", "junk", "x.txt")), /unrecognised \.scratchpad\/junk/);
});

test("@critical allows the recognised layout folders and anything outside .scratchpad/", () => {
  const allowed = [
    join(".claude", ".scratchpad", "phase-22", "scripts", "x.mjs"),
    join(".claude", ".scratchpad", "adhoc", "2026-09-27-probe", "a.txt"),
    join(".claude", ".scratchpad", "proc", "x"),
    join("src", "index.mjs"),
  ];
  for (const path of allowed) assert.equal(call(path), null, path);
});










