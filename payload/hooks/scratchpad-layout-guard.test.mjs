import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { decide } from "./scratchpad-layout-guard.mjs";

const HOOK = fileURLToPath(new URL("./scratchpad-layout-guard.mjs", import.meta.url));
// CLAUDE_PROJECT_DIR is cleared by default: Claude Code sets it in every session's own shell
// (including the one running this suite), so a spawned test that forgot to pass a project root
// would otherwise silently resolve against this very repo instead of its tmpdir fixture.
const runHook = (input, env = {}) => spawnSync(process.execPath, [HOOK],
  { input, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: undefined, ...env } });

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

test("@important a Bash/PowerShell command naming the harness scratchpad is denied, others pass", () => {
  const p = join(harnessRoot, "slug", "uuid-1", "scratchpad", "note.txt");
  const env = { CLAUDE_CODE_TMPDIR: harnessRoot };
  assert.match(decide(args({ toolName: "Bash", toolInput: { command: `cat "${p}"` }, env })), /harness session scratchpad/);
  const flipped = p.replace(/\\/g, "/");
  assert.match(decide(args({ toolName: "PowerShell", toolInput: { command: `Get-Content "${flipped}"` }, env })), /harness session scratchpad/);
  const upper = p.toUpperCase();
  assert.match(decide(args({ toolName: "Bash", toolInput: { command: `cat "${upper}"` }, env })), /harness session scratchpad/);
  assert.equal(decide(args({ toolName: "Bash", toolInput: { command: "npm test" }, env })), null);
});

test("@important a mixed-case, forward-slash file_path still resolves through the guard (Write tool, not just Bash/PowerShell)", () => {
  const denyMixed = join(harnessRoot, "some-slug", "0000000-uuid", "scratchpad", "note.txt").replace(/\\/g, "/").toUpperCase();
  assert.match(decide(args({ toolInput: { file_path: denyMixed }, env: { CLAUDE_CODE_TMPDIR: harnessRoot } })), /harness session scratchpad/);
  const allowMixed = join(root, ".claude", ".scratchpad", "phase-22", "scripts", "x.mjs").replace(/\\/g, "/").toUpperCase();
  assert.equal(decide(args({ toolInput: { file_path: allowMixed }, currentPhase: "22" })), null);
  const denyLegacyMixed = join(root, ".claude", ".scratchpad", "note.txt").replace(/\\/g, "/").toUpperCase();
  assert.match(decide(args({ toolInput: { file_path: denyLegacyMixed } })), /directly in \.scratchpad/);
});

test("@important the deny reason names phase-<NN>/scripts/ when a current phase is known, else adhoc/<today>-<topic>/", () => {
  const withPhase = decide(args({ toolInput: { file_path: join(root, ".claude", ".scratchpad", "note.txt") }, currentPhase: "22" }));
  assert.match(withPhase, /phase-22\/scripts\//);
  const withoutPhase = decide(args({ toolInput: { file_path: join(root, ".claude", ".scratchpad", "note.txt") } }));
  assert.match(withoutPhase, /adhoc\/2026-09-27-<topic>\//);
});

test("@important phase folders follow the prune engine's two-digit naming: current 5 points at phase-05, phase-5 is unrecognised", () => {
  const reason = decide(args({ toolInput: { file_path: join(root, ".claude", ".scratchpad", "note.txt") }, currentPhase: "5" }));
  assert.match(reason, /phase-05\/scripts\//);
  assert.doesNotMatch(reason, /phase-5\//);
  assert.match(call(join(".claude", ".scratchpad", "phase-5", "scripts", "x.mjs")), /unrecognised \.scratchpad\/phase-5/);
  assert.equal(call(join(".claude", ".scratchpad", "phase-05", "scripts", "x.mjs")), null);
  assert.equal(call(join(".claude", ".scratchpad", "phase-105", "data", "x.json")), null);
});

test("@important CLAUDE_CODE_TMPDIR moves the guarded harness root", () => {
  const customRoot = join(root, "custom-tmp", "claude");
  const insideCustom = join(customRoot, "proj-a", "uuid-1", "scratchpad", "note.txt");
  assert.ok(decide(args({ toolInput: { file_path: insideCustom }, env: { CLAUDE_CODE_TMPDIR: customRoot } })));
  assert.equal(decide(args({ toolInput: { file_path: insideCustom } })), null);
});

test("@important CLAUDE_CODE_TMPDIR without a trailing claude leaf: harnessTempRoot appends it and the guard still finds the harness root", () => {
  const bareRoot = join(root, "custom-tmp-bare"); // no "claude" leaf baked in, unlike the fixture above
  const insideCustom = join(bareRoot, "claude", "proj-a", "uuid-1", "scratchpad", "note.txt");
  assert.match(decide(args({ toolInput: { file_path: insideCustom }, env: { CLAUDE_CODE_TMPDIR: bareRoot } })), /harness session scratchpad/);
});

test("@important a spawned run denies a Write into the harness scratchpad and shapes the JSON output", () => {
  const p = join(harnessRoot, "some-slug", "0000000-uuid", "scratchpad", "note.txt");
  const r = runHook(JSON.stringify({ cwd: root, tool_name: "Write", tool_input: { file_path: p } }),
    { CLAUDE_CODE_TMPDIR: harnessRoot });
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, "PreToolUse");
  assert.equal(out.permissionDecision, "deny");
  assert.match(out.permissionDecisionReason, /harness session scratchpad/);
});

test("@important a spawned run resolves the project root from CLAUDE_PROJECT_DIR over a mismatched cwd", () => {
  const wrongCwd = join(root, "moved", "away", "from", "root");
  const p = join(root, ".claude", ".scratchpad", "note.txt");
  const r = runHook(JSON.stringify({ cwd: wrongCwd, tool_name: "Write", tool_input: { file_path: p } }),
    { CLAUDE_PROJECT_DIR: root });
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.permissionDecision, "deny");
  assert.match(out.permissionDecisionReason, /directly in \.scratchpad/);
});

test("@important a spawned run ignores an ambient CLAUDE_PROJECT_DIR unless the test itself sets one", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "slg-ambient-"));
  mkdirSync(join(fixtureRoot, ".ultrapowers"), { recursive: true });
  writeFileSync(join(fixtureRoot, ".ultrapowers", "ROADMAP.md"), '---\ncurrent: "77"\n---\n');
  const p = join(fixtureRoot, ".claude", ".scratchpad", "note.txt");
  // No CLAUDE_PROJECT_DIR in this call's own env: runHook must not leak the ambient one (this
  // repo's own root, ambiently set by Claude Code's own session) — it must fall back to `cwd`.
  const r = runHook(JSON.stringify({ cwd: fixtureRoot, tool_name: "Write", tool_input: { file_path: p } }));
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.match(out.permissionDecisionReason, /phase-77\/scripts\//);
});

test("@important unparsable input exits 0 with no output", () => {
  const r = runHook("not json");
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});
