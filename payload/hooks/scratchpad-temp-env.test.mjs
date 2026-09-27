import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, utimesSync, truncateSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { envLines, hints, slugify } from "./scratchpad-temp-env.mjs";
import { harnessTempRoot } from "../bin/lib/harness-temp.mjs";

const HOOK = fileURLToPath(new URL("./scratchpad-temp-env.mjs", import.meta.url));
const HOME_KEY = process.platform === "win32" ? "USERPROFILE" : "HOME";

// scanLayout's legacy/phase filter already tolerates a few ms of NTFS clock skew
// (CLOCK_SKEW_MS in scratch-prune-lib.mjs); this 60s back-date is not about that skew — it's
// about avoiding a same-tick creation race, so a fixture's mtime reliably reads as in the past by
// the time a later Date.now()/nowMs snapshot is taken against it.
function writeAged(path, content) {
  writeFileSync(path, content);
  const past = new Date(Date.now() - 60_000);
  utimesSync(path, past, past);
}

function runHook(d, env = {}) {
  const emptyHarnessRoot = mkdtempSync(join(tmpdir(), "ste-harness-"));
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(d), encoding: "utf8",
    env: { ...process.env, CLAUDE_CODE_TMPDIR: emptyHarnessRoot, ...env },
  });
  rmSync(emptyHarnessRoot, { recursive: true, force: true });
  return r;
}

test("@important envLines: three export lines, forward slashes, single-quoted, trailing newline", () => {
  const out = envLines(join("C:", "proj", ".claude", ".scratchpad", "proc"));
  assert.equal(out, "export TEMP='C:/proj/.claude/.scratchpad/proc'\n" +
    "export TMP='C:/proj/.claude/.scratchpad/proc'\n" +
    "export TMPDIR='C:/proj/.claude/.scratchpad/proc'\n");
});

test("@important envLines: a literal single quote in the path is escaped for the shell", () => {
  const out = envLines("C:/proj's/.scratchpad/proc");
  const q = "'C:/proj'\\''s/.scratchpad/proc'";
  assert.equal(out, `export TEMP=${q}\nexport TMP=${q}\nexport TMPDIR=${q}\n`);
});

test("@temp slugify matches the real harness leaf for this project's own path", () => {
  assert.equal(slugify(String.raw`D:\6__Work\AI_Projects\claude-config`), "D--6--Work-AI-Projects-claude-config");
});

test("@important hints: legacy scratchpad content produces a scratch-prune line", () => {
  const scratchpad = mkdtempSync(join(tmpdir(), "ste-legacy-"));
  writeAged(join(scratchpad, "loose.txt"), "x");
  const lines = hints({ scratchpad, harnessBytes: 0 });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^Run \/scratch-prune:.*legacy scratchpad content/);
  rmSync(scratchpad, { recursive: true, force: true });
});

test("@important hints: harness dirs over 100MB produce a scratch-prune line, at/under the limit produce none", () => {
  const scratchpad = mkdtempSync(join(tmpdir(), "ste-clean-"));
  const over = hints({ scratchpad, harnessBytes: 100 * 1024 * 1024 + 1 });
  assert.equal(over.length, 1);
  assert.match(over[0], /^Run \/scratch-prune:.*harness session dirs/);
  assert.deepEqual(hints({ scratchpad, harnessBytes: 100 * 1024 * 1024 }), []);
  rmSync(scratchpad, { recursive: true, force: true });
});

test("@important hints: clean project (no legacy content, harness under the limit) yields no lines", () => {
  const scratchpad = mkdtempSync(join(tmpdir(), "ste-clean2-"));
  assert.deepEqual(hints({ scratchpad, harnessBytes: 0 }), []);
  rmSync(scratchpad, { recursive: true, force: true });
});

test("@important with CLAUDE_ENV_FILE: appends the three export lines, creates proc/, and covers .scratchpad/ in .gitignore", () => {
  const root = mkdtempSync(join(tmpdir(), "ste-root-"));
  const envDir = mkdtempSync(join(tmpdir(), "ste-env-"));
  const envFile = join(envDir, "env.sh");
  writeFileSync(envFile, "# existing\n");
  const r = runHook({ cwd: root, session_id: "s1" }, { CLAUDE_PROJECT_DIR: root, CLAUDE_ENV_FILE: envFile });
  assert.equal(r.status, 0);
  const procDir = join(root, ".claude", ".scratchpad", "proc").replace(/\\/g, "/");
  const envContent = readFileSync(envFile, "utf8");
  assert.equal(envContent, "# existing\n" + envLines(procDir));
  assert.ok(existsSync(join(root, ".claude", ".scratchpad", "proc")));
  const gitignore = readFileSync(join(root, ".claude", ".gitignore"), "utf8");
  assert.ok(gitignore.split(/\r?\n/).some((l) => l.trim() === ".scratchpad/"));
  assert.equal(r.stdout, ""); // clean project: no additionalContext
  rmSync(root, { recursive: true, force: true });
  rmSync(envDir, { recursive: true, force: true });
});

test("@important a repeated SessionStart with CLAUDE_ENV_FILE unchanged does not duplicate the export lines", () => {
  const root = mkdtempSync(join(tmpdir(), "ste-root11-"));
  const envDir = mkdtempSync(join(tmpdir(), "ste-env11-"));
  const envFile = join(envDir, "env.sh");
  writeFileSync(envFile, "");
  const env = { CLAUDE_PROJECT_DIR: root, CLAUDE_ENV_FILE: envFile };
  runHook({ cwd: root }, env);
  const first = readFileSync(envFile, "utf8");
  runHook({ cwd: root }, env);
  assert.equal(readFileSync(envFile, "utf8"), first);
  rmSync(root, { recursive: true, force: true });
  rmSync(envDir, { recursive: true, force: true });
});

test("@important with CLAUDE_ENV_FILE and no ambient CLAUDE_CODE_TMPDIR: exports the base temp dir (no claude leaf) as CLAUDE_CODE_TMPDIR", () => {
  const root = mkdtempSync(join(tmpdir(), "ste-root9-"));
  const envDir = mkdtempSync(join(tmpdir(), "ste-env9-"));
  const envFile = join(envDir, "env.sh");
  writeFileSync(envFile, "");
  const fakeTmp = mkdtempSync(join(tmpdir(), "ste-faketmp9-")); // redirected: never depend on the real machine's own tmpdir()
  const childEnv = { ...process.env, CLAUDE_PROJECT_DIR: root, CLAUDE_ENV_FILE: envFile, CLAUDE_CODE_TMPDIR: undefined,
    TEMP: fakeTmp, TMP: fakeTmp, TMPDIR: fakeTmp };
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ cwd: root }), encoding: "utf8", env: childEnv });
  assert.equal(r.status, 0);
  const content = readFileSync(envFile, "utf8");
  const expectedBase = fakeTmp.replace(/\\/g, "/");
  assert.ok(content.includes(`export CLAUDE_CODE_TMPDIR='${expectedBase}'\n`), content);
  // proves the fix closes the gap: a nested session (or this session's own later
  // harnessTempRoot() call) appends exactly one "claude" leaf onto the exported base, never two.
  const full = harnessTempRoot({ CLAUDE_CODE_TMPDIR: expectedBase });
  assert.notEqual(full, expectedBase);
  assert.equal(harnessTempRoot({ CLAUDE_CODE_TMPDIR: full }), full);
  rmSync(root, { recursive: true, force: true });
  rmSync(envDir, { recursive: true, force: true });
  rmSync(fakeTmp, { recursive: true, force: true });
});

test("@important with CLAUDE_ENV_FILE and an ambient CLAUDE_CODE_TMPDIR already set: leaves it alone, no export line added", () => {
  const root = mkdtempSync(join(tmpdir(), "ste-root10-"));
  const envDir = mkdtempSync(join(tmpdir(), "ste-env10-"));
  const envFile = join(envDir, "env.sh");
  writeFileSync(envFile, "");
  const alreadyDir = mkdtempSync(join(tmpdir(), "ste-already-"));
  const already = join(alreadyDir, "claude");
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ cwd: root }), encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, CLAUDE_ENV_FILE: envFile, CLAUDE_CODE_TMPDIR: already },
  });
  assert.equal(r.status, 0);
  const content = readFileSync(envFile, "utf8");
  assert.ok(!content.includes("CLAUDE_CODE_TMPDIR"), content);
  rmSync(root, { recursive: true, force: true });
  rmSync(envDir, { recursive: true, force: true });
  rmSync(alreadyDir, { recursive: true, force: true });
});

test("@important with CLAUDE_ENV_FILE: an existing .gitignore covering .scratchpad/ is left untouched, no duplicate", () => {
  const root = mkdtempSync(join(tmpdir(), "ste-root2-"));
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(join(root, ".claude", ".gitignore"), "node_modules/\n.scratchpad/\n");
  const envDir = mkdtempSync(join(tmpdir(), "ste-env2-"));
  const envFile = join(envDir, "env.sh");
  writeFileSync(envFile, "");
  runHook({ cwd: root }, { CLAUDE_PROJECT_DIR: root, CLAUDE_ENV_FILE: envFile });
  assert.equal(readFileSync(join(root, ".claude", ".gitignore"), "utf8"), "node_modules/\n.scratchpad/\n");
  rmSync(root, { recursive: true, force: true });
  rmSync(envDir, { recursive: true, force: true });
});

test("@important with CLAUDE_ENV_FILE: root .gitignore covering .claude/.scratchpad/ means .claude/.gitignore is never created", () => {
  const root = mkdtempSync(join(tmpdir(), "ste-root3-"));
  writeFileSync(join(root, ".gitignore"), ".claude/.scratchpad/\n");
  const envDir = mkdtempSync(join(tmpdir(), "ste-env3-"));
  const envFile = join(envDir, "env.sh");
  writeFileSync(envFile, "");
  runHook({ cwd: root }, { CLAUDE_PROJECT_DIR: root, CLAUDE_ENV_FILE: envFile });
  assert.equal(existsSync(join(root, ".claude", ".gitignore")), false);
  rmSync(root, { recursive: true, force: true });
  rmSync(envDir, { recursive: true, force: true });
});

test("@important with CLAUDE_ENV_FILE: broadened root .gitignore patterns (leading slash, *, or the full nested path) are all recognised", () => {
  for (const pattern of [".claude/*", "/.claude/", "/.claude/.scratchpad/", ".claude/"]) {
    const root = mkdtempSync(join(tmpdir(), "ste-rootg-"));
    writeFileSync(join(root, ".gitignore"), `${pattern}\n`);
    const envDir = mkdtempSync(join(tmpdir(), "ste-envg-"));
    const envFile = join(envDir, "env.sh");
    writeFileSync(envFile, "");
    runHook({ cwd: root }, { CLAUDE_PROJECT_DIR: root, CLAUDE_ENV_FILE: envFile });
    assert.equal(existsSync(join(root, ".claude", ".gitignore")), false, pattern);
    rmSync(root, { recursive: true, force: true });
    rmSync(envDir, { recursive: true, force: true });
  }
});

test("@important with CLAUDE_ENV_FILE: broadened .claude/.gitignore patterns (leading slash or *) are recognised, no duplicate written", () => {
  for (const pattern of ["/.scratchpad/", ".scratchpad/*"]) {
    const root = mkdtempSync(join(tmpdir(), "ste-rootn-"));
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(join(root, ".claude", ".gitignore"), `${pattern}\n`);
    const envDir = mkdtempSync(join(tmpdir(), "ste-envn-"));
    const envFile = join(envDir, "env.sh");
    writeFileSync(envFile, "");
    runHook({ cwd: root }, { CLAUDE_PROJECT_DIR: root, CLAUDE_ENV_FILE: envFile });
    assert.equal(readFileSync(join(root, ".claude", ".gitignore"), "utf8"), `${pattern}\n`, pattern);
    rmSync(root, { recursive: true, force: true });
    rmSync(envDir, { recursive: true, force: true });
  }
});

test("@important no CLAUDE_ENV_FILE: nothing written", () => {
  const root = mkdtempSync(join(tmpdir(), "ste-root4-"));
  const r = runHook({ cwd: root }, { CLAUDE_PROJECT_DIR: root, CLAUDE_ENV_FILE: undefined });
  assert.equal(r.status, 0);
  assert.equal(existsSync(join(root, ".claude", ".scratchpad", "proc")), false);
  assert.equal(existsSync(join(root, ".claude", ".gitignore")), false);
  rmSync(root, { recursive: true, force: true });
});

test("@important project root equal to the home dir: nothing written even with CLAUDE_ENV_FILE", () => {
  const root = mkdtempSync(join(tmpdir(), "ste-root5-"));
  const envDir = mkdtempSync(join(tmpdir(), "ste-env5-"));
  const envFile = join(envDir, "env.sh");
  writeFileSync(envFile, "");
  const r = runHook({ cwd: root }, { CLAUDE_PROJECT_DIR: root, CLAUDE_ENV_FILE: envFile, [HOME_KEY]: root });
  assert.equal(r.status, 0);
  assert.equal(readFileSync(envFile, "utf8"), "");
  assert.equal(existsSync(join(root, ".claude", ".scratchpad", "proc")), false);
  rmSync(root, { recursive: true, force: true });
  rmSync(envDir, { recursive: true, force: true });
});

test("@important target path over 200 characters: no redirect, one-line warning in additionalContext", () => {
  const base = mkdtempSync(join(tmpdir(), "ste-long-"));
  const suffixLen = "/.claude/.scratchpad/proc".length;
  const padLen = Math.max(210 - base.length - suffixLen, 10);
  const root = join(base, "x".repeat(padLen));
  mkdirSync(root, { recursive: true });
  const procDir = join(root, ".claude", ".scratchpad", "proc").replace(/\\/g, "/");
  assert.ok(procDir.length > 200, `test setup must exceed 200 chars, got ${procDir.length}`);
  const envDir = mkdtempSync(join(tmpdir(), "ste-env6-"));
  const envFile = join(envDir, "env.sh");
  writeFileSync(envFile, "");
  const r = runHook({ cwd: root }, { CLAUDE_PROJECT_DIR: root, CLAUDE_ENV_FILE: envFile });
  assert.equal(r.status, 0);
  assert.equal(readFileSync(envFile, "utf8"), "");
  assert.equal(existsSync(join(root, ".claude", ".scratchpad", "proc")), false);
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, "SessionStart");
  assert.match(out.additionalContext, /over 200/);
  assert.equal(out.additionalContext.split("\n").length, 1);
  rmSync(base, { recursive: true, force: true });
  rmSync(envDir, { recursive: true, force: true });
});

test("@important a failure inside the redirect block never drops the /scratch-prune hint computed after it", () => {
  const root = mkdtempSync(join(tmpdir(), "ste-root13-"));
  mkdirSync(join(root, ".claude", ".scratchpad"), { recursive: true });
  writeAged(join(root, ".claude", ".scratchpad", "loose.txt"), "x");
  // CLAUDE_ENV_FILE points at a directory, not a file: hasAllLines()'s readFileSync (and, were
  // it reached, appendFileSync) throws EISDIR/EPERM deterministically, inside the redirect's own
  // try/catch — proc/ still gets created first, proving the throw happens mid-block, not before it.
  const envFile = mkdtempSync(join(tmpdir(), "ste-envfail13-"));
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ cwd: root }), encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, CLAUDE_ENV_FILE: envFile },
  });
  assert.equal(r.status, 0);
  assert.ok(existsSync(join(root, ".claude", ".scratchpad", "proc")), "proc/ should exist: the throw is after mkdirSync, not before");
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.match(out.additionalContext, /Run \/scratch-prune:.*legacy scratchpad content/);
  rmSync(root, { recursive: true, force: true });
  rmSync(envFile, { recursive: true, force: true });
});

test("@important a spawned run surfaces a scratch-prune hint for legacy scratchpad content", () => {
  const root = mkdtempSync(join(tmpdir(), "ste-root7-"));
  mkdirSync(join(root, ".claude", ".scratchpad"), { recursive: true });
  writeAged(join(root, ".claude", ".scratchpad", "loose.txt"), "x");
  const r = runHook({ cwd: root }, { CLAUDE_PROJECT_DIR: root });
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.match(out.additionalContext, /Run \/scratch-prune:.*legacy scratchpad content/);
  rmSync(root, { recursive: true, force: true });
});

test("@important the current session's own harness dir is excluded from the 100MB hint, even though it alone is over the limit", () => {
  const root = mkdtempSync(join(tmpdir(), "ste-root8-"));
  // harnessTempRoot appends a "claude" leaf unless the given dir's basename already is one
  // (see harness-temp.mjs); mirror scratchpad-layout-guard.test.mjs's fixture shape so
  // CLAUDE_CODE_TMPDIR lands exactly where the hook will look.
  const harnessParent = mkdtempSync(join(tmpdir(), "ste-harness8-"));
  const harnessRoot = join(harnessParent, "claude");
  const uuid = "0000000a-0000-4000-8000-000000000000";
  const slugDir = join(harnessRoot, slugify(root), uuid);
  mkdirSync(slugDir, { recursive: true });
  const big = join(slugDir, "big.bin");
  writeFileSync(big, "");
  truncateSync(big, 101 * 1024 * 1024); // sparse: logical size only, no real write
  // Not BUG-003/skew-specific here: this dir is excluded via excludeUuids (session_id below),
  // checked in harnessSessionDirs's loop before mtimeMs is ever read, so its age plays no part
  // in the exclusion this test checks. Back-dated anyway as general fixture hygiene — the same
  // same-tick creation race writeAged()'s own doc comment describes.
  const past = new Date(Date.now() - 60_000);
  utimesSync(big, past, past);
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ cwd: root, session_id: uuid }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, CLAUDE_CODE_TMPDIR: harnessRoot },
  });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, ""); // this session's own 101MB dir must not trip the harness-bytes hint
  rmSync(root, { recursive: true, force: true });
  rmSync(harnessParent, { recursive: true, force: true });
});

test("@important another session live in the registry is left out of the 100MB hint; once it ends, its dir counts", () => {
  const root = mkdtempSync(join(tmpdir(), "ste-root9b-"));
  const harnessParent = mkdtempSync(join(tmpdir(), "ste-harness9-"));
  const harnessRoot = join(harnessParent, "claude");
  const uuid = "0000000b-0000-4000-8000-000000000000";
  const big = join(harnessRoot, slugify(root), uuid, "big.bin");
  mkdirSync(join(big, ".."), { recursive: true });
  writeFileSync(big, "");
  truncateSync(big, 101 * 1024 * 1024);
  const past = new Date(Date.now() - 25 * 3_600_000);
  utimesSync(big, past, past);
  const config = mkdtempSync(join(tmpdir(), "ste-config9-"));
  mkdirSync(join(config, "sessions"));
  const reg = join(config, "sessions", `${process.pid}.json`);
  const run = () => spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ cwd: root }), encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, CLAUDE_CODE_TMPDIR: harnessRoot, CLAUDE_CONFIG_DIR: config } });
  writeFileSync(reg, JSON.stringify({ pid: process.pid, sessionId: uuid }));
  assert.equal(run().stdout, "");
  writeFileSync(reg, JSON.stringify({ pid: process.pid, sessionId: "0000000c-0000-4000-8000-000000000000" }));
  assert.match(JSON.parse(run().stdout).hookSpecificOutput.additionalContext, /harness session dirs total/);
  rmSync(root, { recursive: true, force: true });
  rmSync(harnessParent, { recursive: true, force: true });
  rmSync(config, { recursive: true, force: true });
});

test("@important the 100MB hint counts only harness dirs older than 24h, the age /scratch-prune removes", () => {
  const root = mkdtempSync(join(tmpdir(), "ste-root10-"));
  const harnessParent = mkdtempSync(join(tmpdir(), "ste-harness10-"));
  const harnessRoot = join(harnessParent, "claude");
  const big = join(harnessRoot, slugify(root), "0000000d-0000-4000-8000-000000000000", "big.bin");
  mkdirSync(join(big, ".."), { recursive: true });
  writeFileSync(big, "");
  truncateSync(big, 101 * 1024 * 1024);
  const config = mkdtempSync(join(tmpdir(), "ste-config10-"));
  mkdirSync(join(config, "sessions"));
  const run = () => spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ cwd: root }), encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, CLAUDE_CODE_TMPDIR: harnessRoot, CLAUDE_CONFIG_DIR: config } });
  const age = (hours) => { const t = new Date(Date.now() - hours * 3_600_000); utimesSync(big, t, t); };
  age(23);
  assert.equal(run().stdout, "");
  age(25);
  assert.match(JSON.parse(run().stdout).hookSpecificOutput.additionalContext, /harness session dirs total/);
  rmSync(root, { recursive: true, force: true });
  rmSync(harnessParent, { recursive: true, force: true });
  rmSync(config, { recursive: true, force: true });
});

test("@important unparsable input exits 0 with no output", () => {
  const r = spawnSync(process.execPath, [HOOK], { input: "not json", encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});
