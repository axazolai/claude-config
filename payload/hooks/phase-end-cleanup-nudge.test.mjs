// payload/hooks/phase-end-cleanup-nudge.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { decide, matchSummaryPath, isEnabled, nudgeMessage } from "./phase-end-cleanup-nudge.mjs";
import { resolveVariant } from "../../variants.mjs";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "phase-end-cleanup-nudge.mjs");
const REPO = fileURLToPath(new URL("../../", import.meta.url));
const SUMMARY_PATH = ".ultrapowers/phases/22-x/22-SUMMARY.md";

const scratch = () => mkdtempSync(join(tmpdir(), "phase-nudge-"));
const emptyUser = scratch(); // no settings.json inside -> "key absent everywhere" baseline

function writeSettings(root, rel, content) {
  const p = join(root, ...rel.split("/"));
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(content));
}

// CLAUDE_PROJECT_DIR is cleared by default: Claude Code sets it in every session's own shell
// (including the one running this suite), so a spawned test that forgot to pass a project root
// would otherwise silently resolve against this very repo instead of its tmpdir fixture.
const runHook = (payload, env = {}) => spawnSync(process.execPath, [HOOK], {
  input: JSON.stringify(payload), encoding: "utf8",
  env: { ...process.env, CLAUDE_CONFIG_DIR: emptyUser, CLAUDE_PROJECT_DIR: undefined, ...env },
});

test("@important matchSummaryPath matches <NN>-<slug>/<NN>-SUMMARY.md, rejects a mismatched NN or another shape", () => {
  assert.equal(matchSummaryPath(".ultrapowers/phases/22-x/22-SUMMARY.md"), "22");
  assert.equal(matchSummaryPath(".ultrapowers/phases/22-x/23-SUMMARY.md"), null);
  assert.equal(matchSummaryPath(".ultrapowers/phases/22-x/22-PLAN.md"), null);
  assert.equal(matchSummaryPath("other/22-x/22-SUMMARY.md"), null);
  assert.equal(matchSummaryPath(".ultrapowers/phases/22-SUMMARY.md"), null);
});

test("@important nudgeMessage: names the phase once, in the actionable /scratch-prune phase <NN> form", () => {
  assert.equal(nudgeMessage("22"), "Phase closed: run the scratch-prune skill now, before finishing the branch. (/scratch-prune phase 22)");
});

test("@important isEnabled: the first settings file whose enabledPlugins carries the key wins, true or false", () => {
  const KEY = "ultrapowers@ultrapowers";
  assert.equal(isEnabled([{ enabledPlugins: { [KEY]: false } }, { enabledPlugins: { [KEY]: true } }, null]), false);
  assert.equal(isEnabled([null, { enabledPlugins: { [KEY]: true } }, null]), true);
  assert.equal(isEnabled([null, null, { enabledPlugins: { [KEY]: true } }]), true);
  assert.equal(isEnabled([null, null, null]), false);
  assert.equal(isEnabled([{}, {}, {}]), false);
});

test("@important decide: fires only for a matching path, enabled, and not yet recorded", () => {
  const enabled = [{ enabledPlugins: { "ultrapowers@ultrapowers": true } }];
  assert.deepEqual(decide({ relPath: SUMMARY_PATH, settingsList: enabled, doneSet: new Set() }),
    { phase: "22", message: nudgeMessage("22") });
  assert.equal(decide({ relPath: "other.md", settingsList: enabled, doneSet: new Set() }), null);
  assert.equal(decide({ relPath: SUMMARY_PATH, settingsList: [{ enabledPlugins: { "ultrapowers@ultrapowers": false } }], doneSet: new Set() }), null);
  assert.equal(decide({ relPath: SUMMARY_PATH, settingsList: enabled, doneSet: new Set(["22"]) }), null);
});

test("@important a spawned run on a matching write with ultrapowers enabled nudges phase 22 and records it", () => {
  const root = scratch();
  writeSettings(root, ".claude/settings.json", { enabledPlugins: { "ultrapowers@ultrapowers": true } });
  const filePath = join(root, ".ultrapowers", "phases", "22-x", "22-SUMMARY.md");
  const r = runHook({ tool_name: "Write", tool_input: { file_path: filePath }, cwd: root });
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, "PostToolUse");
  assert.match(out.additionalContext, /Phase closed/);
  assert.match(out.additionalContext, /\/scratch-prune phase 22/);
  assert.equal(out.additionalContext.match(/22/g).length, 1); // the phase number appears exactly once
  assert.equal(readFileSync(join(root, ".claude", ".scratchpad", ".cleanup-done"), "utf8"), "22\n");
  rmSync(root, { recursive: true, force: true });
});

test("@important a spawned run ignores an ambient CLAUDE_PROJECT_DIR unless the test itself sets one", () => {
  const fixtureRoot = scratch();
  writeSettings(fixtureRoot, ".claude/settings.json", { enabledPlugins: { "ultrapowers@ultrapowers": true } });
  const filePath = join(fixtureRoot, ".ultrapowers", "phases", "22-x", "22-SUMMARY.md");
  // No CLAUDE_PROJECT_DIR in this call's own env: runHook must not leak the ambient one (this
  // repo's own root, ambiently set by Claude Code's own session) — it must fall back to `cwd`.
  const r = runHook({ tool_name: "Write", tool_input: { file_path: filePath }, cwd: fixtureRoot });
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.match(out.additionalContext, /Phase closed/);
  assert.match(out.additionalContext, /\/scratch-prune phase 22/);
  rmSync(fixtureRoot, { recursive: true, force: true });
});

test("@important the same phase again is silent; a disabled project or another file are silent too", () => {
  const enabled = { enabledPlugins: { "ultrapowers@ultrapowers": true } };
  const summaryPath = (root) => join(root, ".ultrapowers", "phases", "22-x", "22-SUMMARY.md");

  const repeat = scratch();
  writeSettings(repeat, ".claude/settings.json", enabled);
  const payload = { tool_name: "Write", tool_input: { file_path: summaryPath(repeat) }, cwd: repeat };
  runHook(payload);
  assert.equal(runHook(payload).stdout, "");
  rmSync(repeat, { recursive: true, force: true });

  const disabled = scratch();
  writeSettings(disabled, ".claude/settings.json", { enabledPlugins: { "ultrapowers@ultrapowers": false } });
  const r2 = runHook({ tool_name: "Write", tool_input: { file_path: summaryPath(disabled) }, cwd: disabled });
  assert.equal(r2.stdout, "");
  assert.ok(!existsSync(join(disabled, ".claude", ".scratchpad", ".cleanup-done")));
  rmSync(disabled, { recursive: true, force: true });

  const otherFile = scratch();
  writeSettings(otherFile, ".claude/settings.json", enabled);
  const planPath = join(otherFile, ".ultrapowers", "phases", "22-x", "22-PLAN.md");
  const r3 = runHook({ tool_name: "Write", tool_input: { file_path: planPath }, cwd: otherFile });
  assert.equal(r3.stdout, "");
  rmSync(otherFile, { recursive: true, force: true });
});

test("@important enabled-check cascades project settings.json -> settings.local.json -> user settings.json", () => {
  const summaryPath = (root) => join(root, ".ultrapowers", "phases", "22-x", "22-SUMMARY.md");
  const KEY = "ultrapowers@ultrapowers";

  const rootUser = scratch();
  const userDir = scratch();
  writeSettings(userDir, "settings.json", { enabledPlugins: { [KEY]: true } });
  const r1 = runHook({ tool_name: "Write", tool_input: { file_path: summaryPath(rootUser) }, cwd: rootUser },
    { CLAUDE_CONFIG_DIR: userDir });
  assert.match(JSON.parse(r1.stdout).hookSpecificOutput.additionalContext, /Phase closed/);
  rmSync(rootUser, { recursive: true, force: true });
  rmSync(userDir, { recursive: true, force: true });

  const rootLocal = scratch();
  writeSettings(rootLocal, ".claude/settings.local.json", { enabledPlugins: { [KEY]: true } });
  const r2 = runHook({ tool_name: "Write", tool_input: { file_path: summaryPath(rootLocal) }, cwd: rootLocal });
  assert.match(JSON.parse(r2.stdout).hookSpecificOutput.additionalContext, /Phase closed/);
  rmSync(rootLocal, { recursive: true, force: true });

  const rootProject = scratch();
  writeSettings(rootProject, ".claude/settings.json", { enabledPlugins: { [KEY]: false } });
  writeSettings(rootProject, ".claude/settings.local.json", { enabledPlugins: { [KEY]: true } });
  const r3 = runHook({ tool_name: "Write", tool_input: { file_path: summaryPath(rootProject) }, cwd: rootProject });
  assert.equal(r3.stdout, "");
  rmSync(rootProject, { recursive: true, force: true });
});

test("@important lite resolves without the phase-end cleanup nudge hook; base and full ship it", () => {
  const lite = resolveVariant({ repoRoot: REPO, variant: "lite" }).rels;
  const base = resolveVariant({ repoRoot: REPO, variant: "base" }).rels;
  const full = resolveVariant({ repoRoot: REPO, variant: "full" }).rels;
  assert.ok(!lite.includes("hooks/phase-end-cleanup-nudge.mjs"));
  assert.ok(base.includes("hooks/phase-end-cleanup-nudge.mjs"));
  assert.ok(full.includes("hooks/phase-end-cleanup-nudge.mjs"));
});

test("@important malformed hook input exits 0 with no output", () => {
  const r = spawnSync(process.execPath, [HOOK], {
    input: "not json", encoding: "utf8", env: { ...process.env, CLAUDE_CONFIG_DIR: emptyUser },
  });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});
