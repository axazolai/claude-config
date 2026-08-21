import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { runInstaller, pruneProMaxSkills, registerDesignHook } from "./design-stack.mjs";

test("runInstaller with skip=true never spawns and reports skipped", () => {
  const r = runInstaller("npx", ["impeccable", "install"], { root: tmpdir(), skip: true });
  assert.deepEqual(r, { ok: true, skipped: true, stdout: "", stderr: "" });
});

test("pruneProMaxSkills removes only non-kept uipro skills, protecting others", () => {
  const dir = mkdtempSync(join(tmpdir(), "skills-"));
  for (const s of ["ui-ux-pro-max", "ui-styling", "design-system", "design", "brand", "slides", "impeccable", "shadcn"])
    mkdirSync(join(dir, s), { recursive: true });
  const removed = pruneProMaxSkills(dir, ["ui-ux-pro-max", "ui-styling", "design-system"],
    { protect: ["impeccable", "shadcn"] });
  assert.deepEqual(removed.sort(), ["brand", "design", "slides"]);
  for (const keep of ["ui-ux-pro-max", "ui-styling", "design-system", "impeccable", "shadcn"])
    assert.ok(existsSync(join(dir, keep)), `${keep} must survive`);
  rmSync(dir, { recursive: true, force: true });
});

test("registerDesignHook adds Edit|Write|MultiEdit + Stop once (idempotent)", () => {
  const dir = mkdtempSync(join(tmpdir(), "hook-"));
  const settingsFile = join(dir, "settings.json");
  const first = registerDesignHook(settingsFile, { scriptPath: ".claude/skills/impeccable/scripts/hook.mjs" });
  assert.equal(first.added, true);
  const s = JSON.parse(readFileSync(settingsFile, "utf8"));
  const post = s.hooks.PostToolUse.find((e) => e.matcher === "Edit|Write|MultiEdit");
  assert.ok(post, "PostToolUse Edit|Write|MultiEdit entry missing");
  assert.match(post.hooks[0].command, /impeccable\/scripts\/hook\.mjs/);
  assert.ok(Array.isArray(s.hooks.Stop) && s.hooks.Stop.length >= 1, "Stop entry missing");
  const second = registerDesignHook(settingsFile, { scriptPath: ".claude/skills/impeccable/scripts/hook.mjs" });
  assert.equal(second.added, false, "second call must be a no-op");
  const s2 = JSON.parse(readFileSync(settingsFile, "utf8"));
  assert.equal(s2.hooks.PostToolUse.filter((e) => e.matcher === "Edit|Write|MultiEdit").length, 1);
  rmSync(dir, { recursive: true, force: true });
});

test("runInstaller isolates HOME/USERPROFILE from the real home", () => {
  const root = mkdtempSync(join(tmpdir(), "ri-root-"));
  // write a test script to avoid shell escaping issues
  const testScript = join(root, "test.mjs");
  writeFileSync(testScript, "process.stdout.write(process.env.USERPROFILE||process.env.HOME||'')");
  // child prints the home it sees; runInstaller must have overridden it to a scratch dir
  const r = runInstaller("node", [testScript], { root });
  assert.equal(r.skipped, false);
  assert.ok(r.ok, r.stderr);
  const childHome = r.stdout.trim();
  assert.ok(childHome.length > 0, "child saw no home");
  assert.notEqual(childHome, homedir(), "child must NOT see the real home dir");
  rmSync(root, { recursive: true, force: true });
});

test("registerDesignHook recognises Impeccable's own $CLAUDE_PROJECT_DIR spelling and adds nothing", () => {
  const dir = mkdtempSync(join(tmpdir(), "hook-alt-"));
  const settingsFile = join(dir, "settings.json");
  const theirs = 'node "$CLAUDE_PROJECT_DIR/.claude/skills/impeccable/scripts/hook.mjs"';
  writeFileSync(settingsFile, JSON.stringify({ hooks: {
    PostToolUse: [{ matcher: "Edit|Write|MultiEdit", hooks: [{ type: "command", command: theirs }] }],
    Stop: [{ hooks: [{ type: "command", command: theirs }] }],
  } }, null, 2));
  const r = registerDesignHook(settingsFile, { scriptPath: ".claude/skills/impeccable/scripts/hook.mjs" });
  assert.equal(r.added, false, "equality on the whole command called this absent and appended a duplicate");
  const s = JSON.parse(readFileSync(settingsFile, "utf8"));
  assert.equal(s.hooks.PostToolUse[0].hooks.length, 1);
  assert.equal(s.hooks.Stop[0].hooks.length, 1);
  assert.equal(s.hooks.PostToolUse[0].hooks[0].command, theirs, "the existing spelling stays untouched");
  rmSync(dir, { recursive: true, force: true });
});

test("registerDesignHook collapses duplicates an earlier run left, keeping unrelated hooks", () => {
  const dir = mkdtempSync(join(tmpdir(), "hook-dup-"));
  const settingsFile = join(dir, "settings.json");
  const rel = "node .claude/skills/impeccable/scripts/hook.mjs";
  const abs = 'node "$CLAUDE_PROJECT_DIR/.claude/skills/impeccable/scripts/hook.mjs"';
  const win = "node C:\\p\\.claude\\skills\\impeccable\\scripts\\hook.mjs";
  const other = "node .claude/hooks/graphify-sync.mjs";
  writeFileSync(settingsFile, JSON.stringify({ hooks: {
    PostToolUse: [
      { matcher: "Edit|Write|MultiEdit", hooks: [{ type: "command", command: abs }, { type: "command", command: other }] },
      { matcher: "Edit|Write|MultiEdit", hooks: [{ type: "command", command: rel }] },
      { matcher: "Edit|Write|MultiEdit", hooks: [{ type: "command", command: win }] },
    ],
    Stop: [{ hooks: [{ type: "command", command: rel }] }, { hooks: [{ type: "command", command: abs }] }],
  } }, null, 2));
  const r = registerDesignHook(settingsFile, { scriptPath: ".claude/skills/impeccable/scripts/hook.mjs" });
  assert.equal(r.added, false);
  assert.equal(r.removed, 3);
  const s = JSON.parse(readFileSync(settingsFile, "utf8"));
  const impeccable = (arr) => arr.flatMap((e) => e.hooks || []).filter((h) => /impeccable/.test(h.command));
  assert.equal(impeccable(s.hooks.PostToolUse).length, 1, "PostToolUse must fire the design hook once");
  assert.equal(impeccable(s.hooks.Stop).length, 1, "Stop must fire the design hook once");
  assert.ok(s.hooks.PostToolUse.flatMap((e) => e.hooks).some((h) => h.command === other), "an unrelated hook must survive");
  rmSync(dir, { recursive: true, force: true });
});
