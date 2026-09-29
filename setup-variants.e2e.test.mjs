import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, readdirSync, existsSync, cpSync, statSync, chmodSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, dirname, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";

const ROOT = dirname(fileURLToPath(import.meta.url));
const REAL_HOME = homedir();
const REAL_STATE = join(REAL_HOME, ".claude.json");
const realAutoUpdates = () => {
  try { const t = readFileSync(REAL_STATE, "utf8"); return JSON.stringify(JSON.parse(t.replace(/^﻿/, "")).autoUpdates ?? null); }
  catch (err) { return `unreadable: ${err.code ?? err.name}`; }
};
const REAL_AUTO_UPDATES_BEFORE = realAutoUpdates();
const HOME_ROOT = mkdtempSync(join(tmpdir(), "cc-home-"));
after(() => rmSync(HOME_ROOT, { recursive: true, force: true }));
const SPAWN_HOMES = [];
function sandboxHome(env) {
  const h = mkdtempSync(join(HOME_ROOT, "h-"));
  writeFileSync(join(h, ".claude.json"), "{}\n");
  const out = { ...env, HOME: h, USERPROFILE: h };
  SPAWN_HOMES.push({ HOME: out.HOME, USERPROFILE: out.USERPROFILE });
  return out;
}
const setupEnv = (extra) => sandboxHome({ ...process.env, ...extra });
const run = (dir, args) => spawnSync(process.execPath, [join(ROOT, "setup.mjs"), ...args],
  { encoding: "utf8", env: setupEnv({ CLAUDE_CONFIG_DIR: dir, CLAUDE_SETUP_SKIP_PLUGINS: "1", CLAUDE_SETUP_SKIP_MCP: "1", CLAUDE_SETUP_SKIP_PURGE: "1" }), timeout: 120000 });

function walk(dir, rel = "") {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(join(dir, e.name), r));
    else out.push(r);
  }
  return out;
}
const FOREIGN = ["settings.local.json", "projects/p/notes.md", "memory/MEMORY.md", "skills/other-tool/SKILL.md"];
function plantForeign(dir) {
  for (const f of FOREIGN) { mkdirSync(join(dir, dirname(f)), { recursive: true }); writeFileSync(join(dir, f), `foreign:${f}`); }
}
function assertForeignIntact(dir) {
  for (const f of FOREIGN) assert.equal(readFileSync(join(dir, f), "utf8"), `foreign:${f}`, `foreign file clobbered: ${f}`);
}
function readManifest(dir) {
  return JSON.parse(readFileSync(join(dir, "state/bundle-manifest.json"), "utf8"));
}
// Every rel in `rels` must exist on disk, and every installed file NOT accounted for by the
// installer's own generated-outside-V.rels paths (state/, settings.json, CLAUDE.md) or a planted
// FOREIGN fixture must be IN `rels` - i.e. no surplus. Mirrors the "lite install" test's inline
// checks above, factored out so base (and future profiles) can reuse it.
function assertTreeEquals(dir, rels) {
  const installed = new Set(walk(dir));
  for (const rel of rels) assert.ok(installed.has(rel), `missing: ${rel}`);
  for (const rel of installed)
    if (!rel.startsWith("state/") && rel !== "settings.json" && rel !== "CLAUDE.md" && !FOREIGN.includes(rel))
      assert.ok(rels.includes(rel), `unexpected: ${rel}`);
}

test("@critical switch full->lite prunes surplus; lite->full restores; foreign untouched", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-sw-"));
  plantForeign(dir);
  assert.equal(run(dir, ["--variant=full", "--replace-all"]).status, 0);
  assert.ok(existsSync(join(dir, "hooks/gsd-config-patch.mjs")));
  assert.equal(run(dir, ["--variant=lite", "--replace-all"]).status, 0);
  assert.ok(!existsSync(join(dir, "hooks/gsd-config-patch.mjs")), "gsd hook not pruned");
  assert.ok(!existsSync(join(dir, "hooks/lib/context-mode-gsd-agents.mjs")), "gsd lib not pruned (name-gate bypass broken?)");
  assert.ok(!existsSync(join(dir, "gsd-defaults.partial.json")), "gsd-defaults mirror not pruned");
  assert.equal(run(dir, ["--variant=full", "--replace-all"]).status, 0);
  assert.ok(existsSync(join(dir, "hooks/gsd-config-patch.mjs")), "full files not restored");
  assert.equal(JSON.parse(readFileSync(join(dir, "state/bundle-manifest.json"), "utf8")).variant, "full");
  for (const f of FOREIGN) assert.equal(readFileSync(join(dir, f), "utf8"), `foreign:${f}`);
  rmSync(dir, { recursive: true, force: true });
});

test("@critical full->base->lite prunes GSD then universal infra; foreign untouched", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-transitions-"));
  plantForeign(dir);

  assert.equal(run(dir, ["--variant=full", "--replace-all"]).status, 0);
  assert.ok(existsSync(join(dir, "hooks/gsd-config-patch.mjs")));
  assert.ok(existsSync(join(dir, "hooks/bg-supervision-nudge.mjs")));
  assertForeignIntact(dir);

  // full -> base: GSD-everything pruned, universal infra (base's own keep-set) stays.
  assert.equal(run(dir, ["--variant=base", "--replace-all"]).status, 0);
  assert.ok(!existsSync(join(dir, "hooks/gsd-config-patch.mjs")), "gsd hook not pruned on full->base");
  assert.ok(!existsSync(join(dir, "hooks/lib/context-mode-gsd-agents.mjs")), "gsd lib not pruned on full->base");
  assert.ok(!existsSync(join(dir, "gsd-defaults.partial.json")), "gsd-defaults mirror not pruned on full->base");
  assert.ok(existsSync(join(dir, "hooks/bg-supervision-nudge.mjs")), "universal infra wrongly pruned on full->base");
  assert.equal(readManifest(dir).profile, "base");
  assertForeignIntact(dir);

  // base -> lite: the universal infra base kept now gets pruned too.
  assert.equal(run(dir, ["--variant=lite", "--replace-all"]).status, 0);
  assert.ok(!existsSync(join(dir, "hooks/bg-supervision-nudge.mjs")), "universal infra not pruned on base->lite");
  assert.ok(!existsSync(join(dir, "hooks/gsd-config-patch.mjs")), "gsd hook still absent on lite");
  assert.equal(readManifest(dir).profile, "lite");
  assertForeignIntact(dir);

  rmSync(dir, { recursive: true, force: true });
});

test("@critical a hand-set statusLine survives a base install", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-sl-mine-"));
  writeFileSync(join(dir, "settings.json"),
    JSON.stringify({ statusLine: { type: "command", command: "echo mine" } }, null, 2) + "\n");
  assert.equal(run(dir, ["--variant=base", "--merge-all"]).status, 0);
  assert.equal(JSON.parse(readFileSync(join(dir, "settings.json"), "utf8")).statusLine.command, "echo mine");
  rmSync(dir, { recursive: true, force: true });
});

test("@critical retired token-usage files are pruned even though their basenames recur in the bundle", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-retired-files-"));
  assert.equal(run(dir, ["--variant=base", "--merge-all"]).status, 0);
  const planted = ["skills/token-usage/SKILL.md", "skills/token-usage/scripts/report.mjs", "hooks/token-usage-log.mjs"];
  const manifest = readManifest(dir);
  for (const rel of planted) {
    const text = `// ${rel}\n`;
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
    manifest.files.push({ rel, hash: createHash("sha256").update(text).digest("hex") });
  }
  writeFileSync(join(dir, "state/bundle-manifest.json"), JSON.stringify(manifest, null, 2));
  assert.equal(run(dir, ["--variant=base", "--merge-all"]).status, 0);
  for (const rel of planted) assert.equal(existsSync(join(dir, rel)), false, rel);
  assert.equal(existsSync(join(dir, "skills/token-usage")), false);
  assert.equal(existsSync(join(dir, "skills")), true);
  rmSync(dir, { recursive: true, force: true });
});

test("@critical a retired hook's entries leave settings.json while the user's own hooks stay", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-retired-hook-"));
  const retired = { hooks: [{ type: "command", command: "node", args: [join(dir, "hooks", "token-usage-log.mjs")] }] };
  const mine = { hooks: [{ type: "command", command: "echo mine-stop" }] };
  writeFileSync(join(dir, "settings.json"),
    JSON.stringify({ hooks: { Stop: [retired, mine], SubagentStop: [retired] } }, null, 2) + "\n");
  assert.equal(run(dir, ["--variant=base", "--merge-all"]).status, 0);
  const hooks = JSON.parse(readFileSync(join(dir, "settings.json"), "utf8")).hooks;
  assert.doesNotMatch(JSON.stringify(hooks), /token-usage-log/);
  assert.deepEqual(hooks.Stop, [mine]);
  rmSync(dir, { recursive: true, force: true });
});

// An unrecognised flag must not change the install or fail it.
test("@important an unknown flag is inert, and the install still succeeds", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-augment-"));
  assert.equal(run(dir, ["--variant=base", "--skip-all"]).status, 0);
  const before = readManifest(dir).files.length;
  assert.equal(run(dir, ["--variant=base", "--nosuchflag=on", "--skip-all"]).status, 0);
  assert.equal(readManifest(dir).files.length, before);
  rmSync(dir, { recursive: true, force: true });
});

test("@critical --dry-run writes nothing for both variants", () => {
  for (const variant of ["lite", "full"]) {
    const dir = mkdtempSync(join(tmpdir(), "cc-dry-"));
    const r = run(dir, [`--variant=${variant}`, "--dry-run", "--skip-all"]);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(walk(dir), [], `dry-run wrote files (${variant})`);
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ---------- foreign gsd-core detector (base/lite only) ----------
 * `run()` above is always non-TTY (spawnSync pipes stdin) and so can never reach an interactive
 * branch. runTty() launches setup.mjs through a driver that forces process.stdin.isTTY first, and
 * answers arrive on stdin.
 * Answers are keyed by prompt text and written one at a time, only once the prompt has actually
 * been printed. Preloading them all on stdin does not work: the first readline buffers whatever is
 * available and discards the remainder on close(), so answer two would silently never arrive and
 * every later question would read EOF. Keying also means a prompt added to setup.mjs later gets a
 * bare Enter instead of eating the answer meant for the question under test. */
const TTY_DIR = mkdtempSync(join(tmpdir(), "cc-tty-"));
const TTY_DRIVER = join(TTY_DIR, "force-tty.mjs");
writeFileSync(TTY_DRIVER, "process.stdin.isTTY = true;\nawait import(process.env.SETUP_URL);\n");
after(() => rmSync(TTY_DIR, { recursive: true, force: true }));
function runTty(dir, args, answers = []) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [TTY_DRIVER, ...args], {
      env: setupEnv({ CLAUDE_CONFIG_DIR: dir, CLAUDE_SETUP_SKIP_PLUGINS: "1", CLAUDE_SETUP_SKIP_MCP: "1", CLAUDE_SETUP_SKIP_PURGE: "1",
        SETUP_URL: pathToFileURL(join(ROOT, "setup.mjs")).href }),
    });
    const pending = answers.map((a) => [...a]);
    let stdout = "", stderr = "", lastAnswered = null;
    const killer = setTimeout(() => child.kill(), 120000);
    child.stdout.on("data", (d) => {
      stdout += String(d);
      if (!/> $/.test(stdout)) return;
      const prompt = stdout.slice(stdout.lastIndexOf("\n") + 1);
      if (prompt === lastAnswered) return;              // terminal-mode readline can re-render one prompt
      lastAnswered = prompt;
      const i = pending.findIndex(([m]) => prompt.includes(m));
      child.stdin.write((i === -1 ? "" : pending.splice(i, 1)[0][1]) + "\n");
      // readline in terminal mode leaves stdin resumed after close(), so the child outlives its own
      // work unless the pipe is shut. Safe once the keyed answer is spent: it is the last question
      // the run asks, and if that ever stops being true the run hangs and the test says so.
      if (answers.length && !pending.length) child.stdin.end();
    });
    child.stderr.on("data", (d) => { stderr += String(d); });
    child.on("close", (status) => { clearTimeout(killer); resolve({ status, stdout, stderr }); });
  });
}
const GSD_FIXTURE = {
  "gsd-core/VERSION": "0.0.0-test\n",
  "gsd-core/lib/orchestrate.mjs": "x".repeat(3000),
  "skills/gsd-probe/SKILL.md": "x",
  "agents/gsd-planner.md": "x",
  "hooks/gsd-probe.mjs": "x",
  "hooks/gsd-legacy.js": "x",
  "hooks/lib/gsd-probe-lib.mjs": "x",
};
const GSD_REMOVED = ["gsd-core", "skills/gsd-probe", "agents/gsd-planner.md", "hooks/gsd-probe.mjs",
  "hooks/gsd-legacy.js", "hooks/lib/gsd-probe-lib.mjs"];
// Both registration shapes on purpose. The args form is this bundle's; the bare quoted command
// line with no args at all is what every hook of a real gsd-core install actually looks like, and
// a matcher that only reads `args` leaves it registered after the file underneath it has moved.
const cmdHook = (command) => ({ matcher: "", hooks: [{ type: "command", command }] });
function plantGsdCore(dir, { settings = true } = {}) {
  for (const [rel, body] of Object.entries(GSD_FIXTURE)) {
    mkdirSync(join(dir, dirname(rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  if (!settings) return;
  const fwd = (rel) => join(dir, rel).replace(/\\/g, "/");
  // Registered under an event settings.partial.json never declares, so the assertions below see the
  // detector's own filter and not the settings merge's claim-our-slots pass.
  writeFileSync(join(dir, "settings.json"), JSON.stringify({
    hooks: {
      Notification: [
        { matcher: "", hooks: [{ type: "command", command: "node", args: [join(dir, "hooks", "gsd-probe.mjs")] }] },
        cmdHook(`"C:/Program Files/nodejs/node.exe" "${fwd("hooks/gsd-legacy.js")}"`),
        cmdHook(`"${fwd("hooks/gsd-legacy.js")}" --quiet`),
        cmdHook(`node "${fwd("hooks/lib/gsd-probe-lib.mjs")}"`),
        cmdHook(`node "${fwd("hooks/session-init.mjs")}"`),
      ],
    },
  }, null, 2) + "\n");
}
const gsdPresent = (dir) => existsSync(join(dir, "gsd-core/VERSION"));
const batches = (dir) => (existsSync(join(dir, ".cleanup-trash")) ? readdirSync(join(dir, ".cleanup-trash")) : []);
const NOT_REPORTED = /is installed here and is not part of this bundle/;
// The one way to exercise the NON-relocated branch (CDIR === <home>/.claude) without deploying into
// the real ~/.claude: `homedir()` reads USERPROFILE on Windows and HOME elsewhere, so redirecting
// both moves the whole default. CLAUDE_CONFIG_DIR must be deleted, not just omitted - `run()`'s
// env spread would otherwise inherit an ambient one and silently put the run back on the relocated
// branch this exists to be the opposite of.
function runAtHome(home, args) {
  const env = { ...process.env, USERPROFILE: home, HOME: home, CLAUDE_SETUP_SKIP_PLUGINS: "1", CLAUDE_SETUP_SKIP_MCP: "1", CLAUDE_SETUP_SKIP_PURGE: "1" };
  delete env.CLAUDE_CONFIG_DIR;
  SPAWN_HOMES.push({ HOME: env.HOME, USERPROFILE: env.USERPROFILE });
  return spawnSync(process.execPath, [join(ROOT, "setup.mjs"), ...args], { encoding: "utf8", env, timeout: 120000 });
}
// A second REPO_ROOT, so a test can break an installer input (settings.partial.json) that lives in
// the repository itself. docs/ is 1.8 MB of files setup.mjs never reads; `.git` is carried when it
// is a worktree pointer file so resolveInstalledSha() answers from git instead of falling through
// to its GitHub fetch.
function copyRepoRoot() {
  const repo = mkdtempSync(join(tmpdir(), "cc-repo-"));
  const gitIsDir = existsSync(join(ROOT, ".git")) && statSync(join(ROOT, ".git")).isDirectory();
  const skip = new Set(["docs", "node_modules", ".ultrapowers", ".planning", ".claude"]);
  // Entry by entry: the temp dir may live under .claude/.scratchpad, and cpSync refuses a whole-tree
  // copy into its own subdirectory before any filter runs.
  for (const name of readdirSync(ROOT)) {
    if (skip.has(name) || (name === ".git" && gitIsDir)) continue;
    cpSync(join(ROOT, name), join(repo, name), { recursive: true });
  }
  return repo;
}

test("@critical --uninstall-gsd moves gsd-core to a trash batch, backs settings up first, drops only gsd hooks", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-gsd-"));
  plantGsdCore(dir);

  const dry = run(dir, ["--variant=base", "--uninstall-gsd", "--dry-run", "--skip-all"]);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /\[dry-run\] would move \d+ path\(s\)/);
  assert.ok(gsdPresent(dir), "dry-run removed something");
  assert.deepEqual(batches(dir), []);

  const r = run(dir, ["--variant=base", "--uninstall-gsd", "--skip-all"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /gsd-core 0\.0\.0-test is installed here and is not part of this bundle/);
  for (const rel of GSD_REMOVED) assert.ok(!existsSync(join(dir, rel)), `not removed: ${rel}`);

  const ts = batches(dir);
  assert.equal(ts.length, 1, `expected exactly one trash batch, got ${ts.join(", ")}`);
  const batch = join(dir, ".cleanup-trash", ts[0]);
  assert.ok(existsSync(join(batch, "manifest.json")), "batch manifest missing");
  assert.ok(r.stdout.includes(`trash batch: ${batch.replace(/\\/g, "/")}`), "batch path not printed before the moves");
  const backup = join(batch, "settings.json.pre-gsd-uninstall");
  assert.ok(existsSync(backup), "pre-edit settings copy missing from the batch");
  assert.equal(JSON.parse(readFileSync(backup, "utf8")).hooks.Notification.length, 5, "backup is not the PRE-edit copy");

  // Three gsd hook registrations go (args form, interpreter+quoted path, quoted path + trailing
  // arg); the hooks/lib entry and the unrelated hook stay.
  const settings = JSON.parse(readFileSync(join(dir, "settings.json"), "utf8"));
  assert.equal(settings.hooks.Notification.length, 2, "wrong set of gsd hook registrations removed");
  const left = JSON.stringify(settings.hooks.Notification);
  assert.ok(!/hooks\/gsd-probe\.mjs|hooks\/gsd-legacy\.js/.test(left), "a gsd hook registration survived");
  assert.ok(left.includes("gsd-probe-lib.mjs") && left.includes("session-init.mjs"), "a non-gsd-hook entry was dropped");
  assert.match(r.stdout, /removed 3 gsd-\* hook registration\(s\)/);

  // restoreBatch deletes the whole batch (backup included), so the cp must be printed FIRST; and
  // claude-cleanup.mjs reads CLAUDE_CONFIG_DIR, not its own location, so a relocated dir must
  // travel with the command or the restore silently targets ~/.claude.
  const cpAt = r.stdout.indexOf(`cp "`);
  const restoreAt = r.stdout.indexOf(`restore --ts ${ts[0]}`);
  assert.ok(cpAt !== -1, "rollback did not print a cp for settings.json");
  assert.ok(restoreAt !== -1, "rollback did not print the batch restore command with this run's ts");
  assert.ok(cpAt < restoreAt, "rollback prints restore before cp - restoring first destroys the backup");
  assert.ok(r.stdout.includes(`CLAUDE_CONFIG_DIR="${dir.replace(/\\/g, "/")}" node "`),
    "relocated config dir not carried into the printed restore command");
  rmSync(dir, { recursive: true, force: true });
});

test("@critical the rollback prints a runnable restore for both shells when relocated, and one plain line when not", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-gsd-shell-"));
  plantGsdCore(dir, { settings: false });
  const r = run(dir, ["--variant=base", "--uninstall-gsd", "--skip-all"]);
  assert.equal(r.status, 0, r.stderr);
  const cd = dir.replace(/\\/g, "/");
  const restore = `node "${join(dir, "bin", "claude-cleanup.mjs").replace(/\\/g, "/")}" restore --ts ${batches(dir)[0]}`;
  assert.ok(r.stdout.includes(`\n    bash:       CLAUDE_CONFIG_DIR="${cd}" ${restore}\n`),
    "no labelled POSIX form of the restore command");
  assert.ok(r.stdout.includes(`\n    PowerShell: $env:CLAUDE_CONFIG_DIR="${cd}"; ${restore}\n`),
    "no labelled PowerShell form of the restore command");
  // `VAR="x" cmd` parses in PowerShell as a command NAMED `VAR=x` and dies at run time with "is not
  // recognized", so the PowerShell line must be an assignment plus a statement separator - never
  // the POSIX prefix with a label glued on.
  const ps = r.stdout.split("\n").find((l) => l.includes("PowerShell:"));
  assert.match(ps, /^ +PowerShell: \$env:CLAUDE_CONFIG_DIR="[^"]+"; node "[^"]+" restore --ts [\w.-]+$/);
  rmSync(dir, { recursive: true, force: true });

  const home = mkdtempSync(join(tmpdir(), "cc-gsd-home-"));
  const cdir = join(home, ".claude");
  mkdirSync(cdir, { recursive: true });
  plantGsdCore(cdir, { settings: false });
  const r2 = runAtHome(home, ["--variant=base", "--uninstall-gsd", "--skip-all"]);
  assert.equal(r2.status, 0, r2.stderr);
  assert.equal(batches(cdir).length, 1, "the non-relocated run did not reach the removal");
  assert.ok(r2.stdout.includes(
    `\n    node "${join(cdir, "bin", "claude-cleanup.mjs").replace(/\\/g, "/")}" restore --ts ${batches(cdir)[0]}\n`),
    "the default config dir did not get the plain, environment-free restore line");
  assert.doesNotMatch(r2.stdout, /PowerShell:|\$env:/, "a per-shell split was printed for a config dir that needs none");
  assert.doesNotMatch(r2.stdout, /CLAUDE_CONFIG_DIR="/, "an env prefix was printed for the default config dir");
  rmSync(home, { recursive: true, force: true });
});

test("@critical a malformed settings.hooks shape cannot throw after the files have already moved", () => {
  // The detector's settings read runs AFTER applyPlan, so anything that throws there strands the
  // user with files in the trash and no printed way back. Reaching it takes a repo whose
  // settings.partial.json is absent: with it present the merge in main() crashes on these same
  // shapes first, harmlessly, before anything has moved.
  const repo = copyRepoRoot();
  rmSync(join(repo, "settings.partial.json"), { force: true });
  for (const hooks of ["x", { Notification: [null] }, { Notification: {} }]) {
    const label = JSON.stringify(hooks);
    const dir = mkdtempSync(join(tmpdir(), "cc-gsd-badhooks-"));
    plantGsdCore(dir, { settings: false });
    writeFileSync(join(dir, "settings.json"), JSON.stringify({ hooks }, null, 2) + "\n");
    const r = spawnSync(process.execPath, [join(repo, "setup.mjs"), "--variant=base", "--uninstall-gsd", "--skip-all"],
      { encoding: "utf8", env: setupEnv({ CLAUDE_CONFIG_DIR: dir, CLAUDE_SETUP_SKIP_PLUGINS: "1", CLAUDE_SETUP_SKIP_MCP: "1", CLAUDE_SETUP_SKIP_PURGE: "1" }), timeout: 120000 });
    assert.equal(r.status, 0, `${label}: ${r.stderr}`);
    assert.equal(batches(dir).length, 1, `${label}: the run never reached the removal`);
    assert.ok(!gsdPresent(dir), `${label}: gsd-core was not moved`);
    assert.ok(r.stdout.includes(`restore --ts ${batches(dir)[0]}`),
      `${label}: files moved but the rollback for this batch was never printed`);
    rmSync(dir, { recursive: true, force: true });
  }
  rmSync(repo, { recursive: true, force: true });
});

test("@critical a bulk flag is never consent, and never a prompt either", async () => {
  for (const bulk of ["--replace-all", "--merge-all"]) {
    const dir = mkdtempSync(join(tmpdir(), "cc-gsd-bulk-"));
    plantGsdCore(dir);
    // Non-TTY and forced-TTY both: a bulk flag means "never ask", so the PTY case must not block.
    for (const launch of [async (d, a) => run(d, a), runTty]) {
      const r = await launch(dir, ["--variant=base", bulk]);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, NOT_REPORTED);
      assert.match(r.stdout, /Reporting only \(non-interactive\)/);
      assert.doesNotMatch(r.stdout, /Move all of it to the cleanup trash/, `${bulk} prompted instead of reporting`);
      assert.ok(gsdPresent(dir), `${bulk} silently uninstalled a foreign product`);
      for (const rel of GSD_REMOVED) assert.ok(existsSync(join(dir, rel)), `removed without consent: ${rel}`);
      assert.deepEqual(batches(dir), []);
      assert.equal(JSON.parse(readFileSync(join(dir, "settings.json"), "utf8")).hooks.Notification.length, 5,
        "report-only must not edit settings.json");
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

test("@critical a file this bundle owns is never claimed as foreign, even when the stale prune declined it", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-gsd-downgrade-"));
  assert.equal(run(dir, ["--variant=full", "--skip-all"]).status, 0);
  const ours = ["hooks/gsd-config-patch.mjs",
    "hooks/lib/gsd-agent-patches.mjs", "hooks/lib/gsd-skill-patches.mjs", "agents/gsd-task-verifier.md"];
  for (const rel of ours) assert.ok(existsSync(join(dir, rel)), `full install is missing ${rel}`);
  plantGsdCore(dir, { settings: false });

  // Run 1. Non-TTY without a bulk flag: pruneStale reports and removes nothing, so every one of
  // `ours` is still on disk and absent from THIS run's manifest - the shape that used to be swept
  // up. Here pruneStale still has them as candidates, so its returned set alone would cover this.
  const r = run(dir, ["--variant=base", "--uninstall-gsd"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /non-interactive: not removed/, "pruneStale unexpectedly pruned - run 1 no longer covers its case");
  assert.ok(!gsdPresent(dir), "the foreign gsd-core was not removed");
  for (const rel of ours) assert.ok(existsSync(join(dir, rel)), `bundle-owned file claimed as foreign: ${rel}`);

  // Run 2, which is what pins the all-profiles set specifically. Run 1 rewrote the manifest as
  // base's, so these rels are no longer candidates: pruneStale has nothing to report and hands back
  // an empty set, and they are absent from this run's manifest too. Only a shield that depends on
  // no manifest at all still knows they are ours.
  plantGsdCore(dir, { settings: false });
  // The one full-install leftover pruneStale would still list on run 2, removed by hand so its
  // report is empty and `prunedRels` is provably contributing nothing to the assertions below.
  rmSync(join(dir, "gsd-defaults.partial.json"), { force: true });
  const r2 = run(dir, ["--variant=base", "--uninstall-gsd"]);
  assert.equal(r2.status, 0, r2.stderr);
  assert.doesNotMatch(r2.stdout, /stale files no longer in the bundle/,
    "pruneStale still had candidates - run 2 is not the post-manifest-rewrite shape it exists to cover");
  assert.ok(!gsdPresent(dir), "the foreign gsd-core was not removed on the second run");
  for (const rel of ours) assert.ok(existsSync(join(dir, rel)), `bundle-owned file claimed as foreign on run 2: ${rel}`);
  rmSync(dir, { recursive: true, force: true });
});

test("@important the detector never fires on full, nor when gsd-core is absent", () => {
  const full = mkdtempSync(join(tmpdir(), "cc-gsd-full-"));
  plantGsdCore(full);
  const rf = run(full, ["--variant=full", "--uninstall-gsd", "--skip-all"]);
  assert.equal(rf.status, 0, rf.stderr);
  assert.doesNotMatch(rf.stdout, NOT_REPORTED);
  assert.ok(gsdPresent(full), "full profile removed gsd-core");
  assert.deepEqual(batches(full), []);
  rmSync(full, { recursive: true, force: true });

  const none = mkdtempSync(join(tmpdir(), "cc-gsd-none-"));
  const rn = run(none, ["--variant=base", "--uninstall-gsd", "--skip-all"]);
  assert.equal(rn.status, 0, rn.stderr);
  assert.doesNotMatch(rn.stdout, NOT_REPORTED);
  assert.deepEqual(batches(none), []);
  rmSync(none, { recursive: true, force: true });
});

test("@critical the interactive prompt defaults to no; only an explicit yes removes anything", async () => {
  const TTY_ARGS = ["--variant=base", "--enable-update-check"];
  const PROMPT = "Move all of it to the cleanup trash?";
  const asked = (r) => {
    assert.match(r.stdout, /left unchanged \(CLAUDE_CONFIG_DIR not set\)/, "an earlier prompt was not answered");
    assert.ok(r.stdout.includes(PROMPT), "the detector never asked");
  };
  for (const answer of ["n", ""]) {
    const dir = mkdtempSync(join(tmpdir(), "cc-gsd-no-"));
    plantGsdCore(dir, { settings: false });
    const r = await runTty(dir, TTY_ARGS, [[PROMPT, answer]]);
    assert.equal(r.status, 0, r.stderr);
    asked(r);
    assert.ok(gsdPresent(dir), `answer ${JSON.stringify(answer)} removed gsd-core`);
    assert.deepEqual(batches(dir), []);
    rmSync(dir, { recursive: true, force: true });
  }
  const yes = mkdtempSync(join(tmpdir(), "cc-gsd-yes-"));
  plantGsdCore(yes, { settings: false });
  const r = await runTty(yes, TTY_ARGS, [[PROMPT, "y"]]);
  assert.equal(r.status, 0, r.stderr);
  asked(r);
  assert.ok(!gsdPresent(yes), "an explicit yes did not remove gsd-core");
  assert.equal(batches(yes).length, 1);
  rmSync(yes, { recursive: true, force: true });
});

function mcpRun(claudeJson, args, extraEnv = {}) {
  const dir = mkdtempSync(join(tmpdir(), "cc-mcp-"));
  if (claudeJson) writeFileSync(join(dir, ".claude.json"), JSON.stringify(claudeJson));
  const r = spawnSync(process.execPath, [join(ROOT, "setup.mjs"), ...args], { encoding: "utf8", timeout: 120000,
    env: setupEnv({ CLAUDE_CONFIG_DIR: dir, CLAUDE_SETUP_SKIP_PLUGINS: "1", CLAUDE_SETUP_SKIP_MCP: "1",
      CLAUDE_SETUP_SKIP_PURGE: "1", ...extraEnv }) });
  rmSync(dir, { recursive: true, force: true });
  return r.stdout + r.stderr;
}
const mcpSection = (out) => out.slice(out.indexOf("--- mcp reconciliation ---")).split("\n---")[0];

test("@important base dry-run plans both MCP servers and changes nothing", () => {
  const out = mcpRun({}, ["--variant=base", "--dry-run"]);
  const sec = mcpSection(out);
  assert.match(sec, /add\s+claude mcp add --scope user scrapling -- uvx/);
  assert.match(sec, /add\s+claude mcp add --scope user --transport http context7/);
  assert.match(sec, /\(dry-run: no MCP changes\)/);
});

test("@critical the Context7 key never appears in setup output", () => {
  const out = mcpRun({}, ["--variant=base", "--dry-run"], { CONTEXT7_API_KEY: "SECRETX-e2e" });
  assert.doesNotMatch(out, /SECRETX-e2e/);
  assert.match(mcpSection(out), /CONTEXT7_API_KEY: \*\*\*/);
});

test("@important lite plans removal of a configured managed server and adds nothing", () => {
  const sec = mcpSection(mcpRun({ mcpServers: { scrapling: { command: "uvx" } } }, ["--variant=lite", "--dry-run"]));
  assert.match(sec, /remove\s+claude mcp remove --scope user scrapling/);
  assert.doesNotMatch(sec, /\badd\s+claude/);
});

test("@important a relocated config dir without .claude.json plans every server, never reading HOME's", () => {
  const sec = mcpSection(mcpRun(null, ["--variant=base", "--dry-run"]));
  assert.match(sec, /add\s+claude mcp add --scope user scrapling/);
  assert.match(sec, /add\s+claude mcp add --scope user --transport http context7/);
  assert.match(sec, /then\s+uvx --from "scrapling\[ai\]" scrapling install/);
});

test("@important dry-run reports session-default conflicts and writes nothing", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-sessdef-"));
  const before = JSON.stringify({ model: "claude-opus-5-5", effortLevel: "xhigh" }, null, 2) + "\n";
  writeFileSync(join(dir, "settings.json"), before);
  const r = run(dir, ["--variant=base", "--dry-run"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /--- session defaults ---/);
  assert.match(r.stdout, /model: claude-opus-5-5 -> sonnet/);
  assert.match(r.stdout, /effortLevel: xhigh -> medium/);
  assert.equal(readFileSync(join(dir, "settings.json"), "utf8"), before);
  rmSync(dir, { recursive: true, force: true });
});

test("@important --replace-all writes the managed session defaults, keeping other keys", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-sessdef-"));
  writeFileSync(join(dir, "settings.json"), JSON.stringify({
    model: "claude-opus-5-5", effortLevel: "xhigh",
    statusLine: { type: "command", command: "echo mine" },
  }, null, 2) + "\n");
  const r = run(dir, ["--variant=base", "--replace-all"]);
  assert.equal(r.status, 0, r.stderr);
  const settings = JSON.parse(readFileSync(join(dir, "settings.json"), "utf8"));
  assert.equal(settings.model, "sonnet");
  assert.equal(settings.effortLevel, "medium");
  assert.equal(settings.statusLine.command, "echo mine");
  rmSync(dir, { recursive: true, force: true });
});

test("@critical an unparsable settings.json is left byte-identical, with or without a bulk flag", () => {
  const broken = '{\n  "model": "claude-opus-5-5",\n  "hooks": {},\n}\n';
  for (const args of [[], ["--variant=base", "--replace-all"], ["--variant=base", "--merge-all"]]) {
    const dir = mkdtempSync(join(tmpdir(), "cc-sessdef-"));
    assert.equal(run(dir, ["--variant=base", "--replace-all"]).status, 0);
    writeFileSync(join(dir, "settings.json"), broken);
    const r = run(dir, args);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(join(dir, "settings.json"), "utf8"), broken, `settings.json rewritten under [${args}]`);
    assert.match(r.stdout, /settings\.json: INVALID JSON - left untouched/);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("@important --merge-all keeps a conflicting session default and adds an absent one", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-sessdef-"));
  writeFileSync(join(dir, "settings.json"), JSON.stringify({ model: "claude-opus-5-5" }, null, 2) + "\n");
  const r = run(dir, ["--variant=base", "--merge-all"]);
  assert.equal(r.status, 0, r.stderr);
  const settings = JSON.parse(readFileSync(join(dir, "settings.json"), "utf8"));
  assert.equal(settings.model, "claude-opus-5-5");
  assert.equal(settings.effortLevel, "medium");
  assert.match(r.stdout, /kept model: claude-opus-5-5/);
  rmSync(dir, { recursive: true, force: true });
});

test("@important --skip-all reports session-default conflicts and writes nothing, absent keys included", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-sessdef-skip-"));
  const before = JSON.stringify({ model: "claude-opus-5-5" }, null, 2) + "\n";
  writeFileSync(join(dir, "settings.json"), before);
  const r = run(dir, ["--variant=base", "--skip-all"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /--- session defaults ---/);
  assert.match(r.stdout, /\(--skip-all: settings unchanged\)/);
  assert.equal(readFileSync(join(dir, "settings.json"), "utf8"), before);
  rmSync(dir, { recursive: true, force: true });
});

test("@important session defaults are written when settings.json does not exist yet", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-sessdef-absent-"));
  const r = run(dir, ["--variant=base"]);
  assert.equal(r.status, 0, r.stderr);
  const settings = JSON.parse(readFileSync(join(dir, "settings.json"), "utf8"));
  assert.equal(settings.model, "sonnet");
  assert.equal(settings.effortLevel, "medium");
  rmSync(dir, { recursive: true, force: true });
});

// Pre-decided so the update-check and PowerShell-tool opt-ins (later in the same run) never ask -
// only the targeted session-defaults prompt is left interactive, which the TTY driver relies on
// being the run's last question (see runTty's own comment above).
function sessionDefaultsTtyFixture(dir, modelValue) {
  assert.equal(run(dir, ["--variant=base", "--replace-all"]).status, 0);
  const settings = JSON.parse(readFileSync(join(dir, "settings.json"), "utf8"));
  settings.model = modelValue;
  delete settings.effortLevel;
  settings.env = { ...(settings.env || {}), CLAUDE_CONFIG_UPDATE_CHECK: "0", CLAUDE_CODE_USE_POWERSHELL_TOOL: "0" };
  writeFileSync(join(dir, "settings.json"), JSON.stringify(settings, null, 2) + "\n");
}

test("@important interactive n on a session-default conflict still writes the absent key", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-sessdef-tty-n-"));
  sessionDefaultsTtyFixture(dir, "claude-opus-5-5");
  const r = await runTty(dir, ["--variant=base"], [["replace 1 session default(s)?", "n"]]);
  assert.equal(r.status, 0, r.stderr);
  const after = JSON.parse(readFileSync(join(dir, "settings.json"), "utf8"));
  assert.equal(after.model, "claude-opus-5-5");
  assert.equal(after.effortLevel, "medium");
  rmSync(dir, { recursive: true, force: true });
});

test("@important a superseded model with a session-default conflict asks one question, not two", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-sessdef-tty-migrate-"));
  sessionDefaultsTtyFixture(dir, "claude-opus-4-8");
  const r = await runTty(dir, ["--variant=base"], [["replace 1 session default(s)?", "y"]]);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /looks superseded/);
  const after = JSON.parse(readFileSync(join(dir, "settings.json"), "utf8"));
  assert.equal(after.model, "sonnet");
  assert.equal(after.effortLevel, "medium");
  rmSync(dir, { recursive: true, force: true });
});

test("@important a superseded model's tier-preserving id is reported in dry-run, where no kept-line ever prints", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-sessdef-migrate-dry-"));
  writeFileSync(join(dir, "settings.json"), JSON.stringify({ model: "claude-opus-4-8" }, null, 2) + "\n");
  const r = run(dir, ["--variant=base", "--dry-run"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /model: claude-opus-4-8 -> sonnet \(superseded - claude-opus-5-5 is the tier-preserving id/);
  rmSync(dir, { recursive: true, force: true });
});

test("@important a kept superseded model conflict also reports its tier-preserving id", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-sessdef-migrate-kept-"));
  writeFileSync(join(dir, "settings.json"), JSON.stringify({ model: "claude-opus-4-8" }, null, 2) + "\n");
  const r = run(dir, ["--variant=base", "--merge-all"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /kept model: claude-opus-4-8 \(re-run with --replace-all to set sonnet\) \(superseded - claude-opus-5-5 is the tier-preserving id/);
  const settings = JSON.parse(readFileSync(join(dir, "settings.json"), "utf8"));
  assert.equal(settings.model, "claude-opus-4-8");
  rmSync(dir, { recursive: true, force: true });
});

const BROKEN_JSON = '{\n  "model": "claude-opus-5-5",\n  "hooks": {},\n}\n';
const notValid = (dir, block) => `${join(dir, "settings.json")}: not valid JSON — skipped (${block})`;
// fakeClaude: PATH holds only a recording `claude` stub (plus the OS shell dir), so no real CLI runs.
function jsonSafetyRun({ settings, claudeJson = '{\n  "autoUpdates": true\n}\n', args, env = {}, fakeClaude = false, readOnly = false }) {
  const dir = mkdtempSync(join(tmpdir(), "cc-jsonsafe-"));
  const bin = mkdtempSync(join(tmpdir(), "cc-fakebin-"));
  if (settings !== undefined) writeFileSync(join(dir, "settings.json"), settings);
  writeFileSync(join(dir, ".claude.json"), claudeJson);
  if (readOnly) chmodSync(join(dir, "settings.json"), 0o444);
  const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^path$/i.test(k)));
  let PATH = process.env.PATH ?? process.env.Path;
  if (fakeClaude) {
    if (process.platform === "win32") {
      writeFileSync(join(bin, "claude.cmd"), '@echo %*>> "%~dp0calls.log"\r\n');
      PATH = `${bin};${join(process.env.SystemRoot || "C:\Windows", "System32")}`;
    } else {
      writeFileSync(join(bin, "claude"), '#!/bin/sh\necho "$@" >> "$(dirname "$0")/calls.log"\n');
      chmodSync(join(bin, "claude"), 0o755);
      PATH = `${bin}:/usr/bin:/bin`;
    }
  }
  const r = spawnSync(process.execPath, [join(ROOT, "setup.mjs"), ...args], { encoding: "utf8", timeout: 120000,
    env: sandboxHome({ ...base, PATH, CLAUDE_CONFIG_DIR: dir, CLAUDE_SETUP_SKIP_PURGE: "1", ...env }) });
  if (readOnly) chmodSync(join(dir, "settings.json"), 0o644);
  const readOr = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);
  const res = { dir, status: r.status, stderr: r.stderr, out: r.stdout + r.stderr,
    settings: readOr(join(dir, "settings.json")), claudeJson: readOr(join(dir, ".claude.json")),
    calls: readOr(join(bin, "calls.log")) || "" };
  rmSync(dir, { recursive: true, force: true });
  rmSync(bin, { recursive: true, force: true });
  return res;
}
const SKIP_BOTH = { CLAUDE_SETUP_SKIP_PLUGINS: "1", CLAUDE_SETUP_SKIP_MCP: "1" };

test("@critical plugin reconciliation leaves an unparsable settings.json byte-identical under --replace-all", () => {
  const r = jsonSafetyRun({ settings: BROKEN_JSON, args: ["--variant=base", "--replace-all"],
    env: { CLAUDE_SETUP_SKIP_MCP: "1" }, fakeClaude: true });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.settings, BROKEN_JSON);
  assert.ok(r.out.includes(notValid(r.dir, "plugin reconciliation")), r.out);
});

let brokenClaudeJsonRun;
const brokenClaudeJson = () => (brokenClaudeJsonRun ??= jsonSafetyRun({ claudeJson: '{ "mcpServers": {,} }\n',
  args: ["--variant=base", "--replace-all"], env: { CLAUDE_SETUP_SKIP_PLUGINS: "1" }, fakeClaude: true }));

test("@critical an unparsable .claude.json is byte-identical after --replace-all and no claude mcp command runs", () => {
  const r = brokenClaudeJson();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.claudeJson, '{ "mcpServers": {,} }\n');
  assert.doesNotMatch(r.calls, /\bmcp\b/);
});

test("@important an unparsable .claude.json prints the MCP skip line", () => {
  assert.ok(brokenClaudeJson().out.includes("cannot read .claude.json — MCP step skipped"));
});

test("@critical the update-check opt-in leaves an unparsable settings.json byte-identical under --replace-all", () => {
  const r = jsonSafetyRun({ settings: BROKEN_JSON, args: ["--variant=base", "--replace-all", "--enable-update-check"], env: SKIP_BOTH });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.settings, BROKEN_JSON);
  assert.ok(r.out.includes(notValid(r.dir, "update-check opt-in")), r.out);
});

test("@critical the PowerShell-tool opt-in leaves an unparsable settings.json byte-identical under --replace-all", () => {
  const r = jsonSafetyRun({ settings: BROKEN_JSON, args: ["--variant=base", "--replace-all", "--enable-powershell-tool"], env: SKIP_BOTH });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.settings, BROKEN_JSON);
  assert.ok(r.out.includes(notValid(r.dir, "PowerShell-tool opt-in")), r.out);
});

test("@important a BOM-prefixed valid settings.json is parsed and reconciled normally", () => {
  const r = jsonSafetyRun({ settings: "\uFEFF" + JSON.stringify({ model: "claude-opus-5-5",
    statusLine: { type: "command", command: "echo mine" } }, null, 2) + "\n",
  args: ["--variant=base", "--replace-all", "--enable-update-check"], env: SKIP_BOTH });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.out, /not valid JSON|INVALID JSON/);
  const s = JSON.parse(r.settings.replace(/^\uFEFF/, ""));
  assert.equal(s.model, "sonnet");
  assert.equal(s.statusLine.command, "echo mine");
  assert.equal(s.env.CLAUDE_CONFIG_UPDATE_CHECK, "1");
});

test("@important a failed settings.json write prints a warning", { skip: process.getuid?.() === 0 && "root ignores file modes" }, () => {
  const before = JSON.stringify({ model: "claude-opus-5-5" }, null, 2) + "\n";
  const r = jsonSafetyRun({ settings: before, args: ["--variant=base", "--replace-all"], env: SKIP_BOTH, readOnly: true });
  assert.equal(r.settings, before);
  assert.ok(r.out.includes(`WARNING: could not write ${join(r.dir, "settings.json")}`), r.out);
});

test("@important the autoUpdates block parses a BOM-prefixed valid .claude.json and enables updates", () => {
  const r = jsonSafetyRun({ settings: JSON.stringify({ model: "claude-opus-5-5" }, null, 2) + "\n",
    claudeJson: "﻿" + JSON.stringify({ autoUpdates: false, keep: 1 }, null, 2) + "\n",
    args: ["--variant=base", "--replace-all"], env: SKIP_BOTH });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.out.includes("autoUpdates: enabled"), r.out);
  assert.doesNotMatch(r.out, /autoUpdates: state file is not valid JSON/);
  assert.deepEqual(JSON.parse(r.claudeJson.replace(/^﻿/, "")), { autoUpdates: true, keep: 1 });
});

test("@important --doctor parses a BOM-prefixed valid settings.json", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-doctor-"));
  const hook = join(dir, "hook.mjs");
  writeFileSync(hook, "export {};\n");
  writeFileSync(join(dir, "settings.json"), "﻿" + JSON.stringify({
    hooks: { SessionStart: [{ hooks: [{ type: "command", command: "node", args: [hook] }] }] } }, null, 2) + "\n");
  const r = run(dir, ["--doctor"]);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /missing or invalid JSON/);
  assert.match(r.stdout, /SessionStart: OK/);
});

test("@critical no setup.mjs run in this file reaches the real home or its .claude.json", () => {
  const fold = (p) => (process.platform === "win32" ? resolve(p).toLowerCase() : resolve(p));
  const sameOrInside = (child, parent) => {
    const rel = relative(fold(parent), fold(child));
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  };
  // A tmpdir under the home (Windows' default %LOCALAPPDATA%\Temp) is the one allowed place below it.
  const tmpUnderHome = sameOrInside(tmpdir(), REAL_HOME);
  assert.ok(SPAWN_HOMES.length > 0, "no setup.mjs spawn was recorded");
  for (const h of SPAWN_HOMES) {
    assert.ok(h.HOME && h.USERPROFILE, `a spawn ran without a sandbox home: ${JSON.stringify(h)}`);
    for (const p of [h.HOME, h.USERPROFILE]) {
      assert.ok(!sameOrInside(REAL_HOME, p), `sandbox home ${p} is the real home or an ancestor of it`);
      const underHome = sameOrInside(p, REAL_HOME);
      assert.ok(!underHome || (tmpUnderHome && sameOrInside(p, tmpdir()) && fold(p) !== fold(tmpdir())),
        `sandbox home ${p} lies under the real home ${REAL_HOME}`);
    }
  }
  assert.equal(realAutoUpdates(), REAL_AUTO_UPDATES_BEFORE, `${REAL_STATE} autoUpdates changed`);
});
