import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, readdirSync, existsSync, cpSync, statSync, chmodSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, dirname, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { resolveBundle } from "./bundle.mjs";

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
// FOREIGN fixture must be IN `rels` - i.e. no surplus.
function assertTreeEquals(dir, rels) {
  const installed = new Set(walk(dir));
  for (const rel of rels) assert.ok(installed.has(rel), `missing: ${rel}`);
  for (const rel of installed)
    if (!rel.startsWith("state/") && rel !== "settings.json" && rel !== "CLAUDE.md" && rel !== "deepseek-defaults.json" && !FOREIGN.includes(rel))
      assert.ok(rels.includes(rel), `unexpected: ${rel}`);
}

const REMOVED_LINE = "profiles were removed; installing the bundle";

test("@critical no manifest, non-TTY: installs the bundle, manifest carries files only, exit 0", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-fresh-"));
  const r = run(dir, ["--skip-all"]);
  assert.equal(r.status, 0, r.stderr);
  const m = readManifest(dir);
  assert.ok(Array.isArray(m.files) && m.files.length > 0);
  for (const k of ["profile", "variant", "maxPluginTier"]) assert.ok(!(k in m), `manifest carries ${k}`);
  assert.ok(!r.stdout.includes(REMOVED_LINE));
  assert.doesNotMatch(r.stdout, /bundle profile \[/);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "deepseek-defaults.json"), "utf8")), { level: "medium" });
  rmSync(dir, { recursive: true, force: true });
});

test("@critical --variant=<anything> is accepted, prints the deprecation line, installs the bundle", () => {
  for (const v of ["lite", "nope"]) {
    const dir = mkdtempSync(join(tmpdir(), `cc-arg-${v}-`));
    const r = run(dir, [`--variant=${v}`, "--skip-all"]);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes(REMOVED_LINE), `deprecation line not printed for ${v}`);
    assert.ok(existsSync(join(dir, "hooks/ci-watch-nudge.mjs")), `${v}: bundle not installed`);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("@critical a lite-era manifest is upgraded: profile fields dropped, lite-pruned hooks restored, stale files pruned, foreign untouched", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-lite-up-"));
  plantForeign(dir);
  assert.equal(run(dir, ["--skip-all"]).status, 0);
  const manifest = readManifest(dir);
  rmSync(join(dir, "hooks/ci-watch-nudge.mjs"));
  const stale = "hooks/retired-by-lite.mjs";
  writeFileSync(join(dir, stale), "// stale\n");
  manifest.files = manifest.files.filter((f) => f.rel !== "hooks/ci-watch-nudge.mjs");
  manifest.files.push({ rel: stale, hash: createHash("sha256").update("// stale\n").digest("hex") });
  manifest.profile = "lite"; manifest.variant = "lite"; manifest.maxPluginTier = "core";
  writeFileSync(join(dir, "state/bundle-manifest.json"), JSON.stringify(manifest, null, 2));
  const r = run(dir, ["--replace-all"]);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /Switching variant/);
  assert.ok(existsSync(join(dir, "hooks/ci-watch-nudge.mjs")), "lite-pruned hook not restored");
  assert.ok(!existsSync(join(dir, stale)), "stale manifest file not pruned");
  const m = readManifest(dir);
  for (const k of ["profile", "variant", "maxPluginTier"]) assert.ok(!(k in m), `manifest still carries ${k}`);
  assertForeignIntact(dir);
  rmSync(dir, { recursive: true, force: true });
});

test("@important the install tree matches the resolved bundle", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-tree-"));
  assert.equal(run(dir, ["--skip-all"]).status, 0);
  assertTreeEquals(dir, resolveBundle({ repoRoot: ROOT }).rels);
  rmSync(dir, { recursive: true, force: true });
});

test("@important the assembled CLAUDE.md names no GSD", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-md-"));
  assert.equal(run(dir, ["--skip-all"]).status, 0);
  const md = readFileSync(join(dir, "CLAUDE.md"), "utf8");
  assert.doesNotMatch(md, /gsd/i);
  assert.ok(!existsSync(join(dir, "rules-src/gsd.md")));
  rmSync(dir, { recursive: true, force: true });
});

test("@critical a hand-set statusLine survives a base install", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-sl-mine-"));
  writeFileSync(join(dir, "settings.json"),
    JSON.stringify({ statusLine: { type: "command", command: "echo mine" } }, null, 2) + "\n");
  assert.equal(run(dir, ["--merge-all"]).status, 0);
  assert.equal(JSON.parse(readFileSync(join(dir, "settings.json"), "utf8")).statusLine.command, "echo mine");
  rmSync(dir, { recursive: true, force: true });
});

test("@critical retired token-usage files are pruned even though their basenames recur in the bundle", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-retired-files-"));
  assert.equal(run(dir, ["--merge-all"]).status, 0);
  const planted = ["skills/token-usage/SKILL.md", "skills/token-usage/scripts/report.mjs", "hooks/token-usage-log.mjs"];
  const manifest = readManifest(dir);
  for (const rel of planted) {
    const text = `// ${rel}\n`;
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
    manifest.files.push({ rel, hash: createHash("sha256").update(text).digest("hex") });
  }
  writeFileSync(join(dir, "state/bundle-manifest.json"), JSON.stringify(manifest, null, 2));
  assert.equal(run(dir, ["--merge-all"]).status, 0);
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
  assert.equal(run(dir, ["--merge-all"]).status, 0);
  const hooks = JSON.parse(readFileSync(join(dir, "settings.json"), "utf8")).hooks;
  assert.doesNotMatch(JSON.stringify(hooks), /token-usage-log/);
  assert.deepEqual(hooks.Stop, [mine]);
  assert.match(JSON.stringify(hooks.SubagentStop), /rung-usage-log/);
  rmSync(dir, { recursive: true, force: true });
});

// An unrecognised flag must not change the install or fail it.
test("@important an unknown flag is inert, and the install still succeeds", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-augment-"));
  assert.equal(run(dir, ["--skip-all"]).status, 0);
  const before = readManifest(dir).files.length;
  assert.equal(run(dir, ["--nosuchflag=on", "--skip-all"]).status, 0);
  assert.equal(readManifest(dir).files.length, before);
  rmSync(dir, { recursive: true, force: true });
});

test("@critical --dry-run writes nothing", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-dry-"));
  const r = run(dir, ["--dry-run", "--skip-all"]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(walk(dir), [], "dry-run wrote files");
  rmSync(dir, { recursive: true, force: true });
});

/* ---------- interactive runs ----------
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

/* ---------- GSD purge: every install removes every GSD trace ---------- */
const fwd = (p) => p.replace(/\\/g, "/");
const GSD_FILES = {
  "gsd-core/VERSION": "0.0.0-test\n",
  "agents/gsd-x.md": "x",
  "commands/gsd/help.md": "x",
  "hooks/gsd-config-patch.mjs": "// former bundle file\n",
  "hooks/db-live-access-gate.mjs": "// former bundle file\n",
  "gsd-defaults.partial.json": "{}\n",
};
// Hooks as the old settings.partial.json wrote them (command + args), plus gsd-core's own shape:
// one quoted command line with no args.
function gsdSettings(dir) {
  return {
    model: "opus",
    hooks: {
      PreToolUse: [
        { matcher: "Bash|^mcp__.*", hooks: [{ type: "command", command: "node", args: [`${fwd(dir)}/hooks/db-live-access-gate.mjs`] }] },
      ],
      PostToolUse: [
        { matcher: "Write|Edit|MultiEdit|Bash", hooks: [{ type: "command", command: "node", args: [`${fwd(dir)}/hooks/gsd-config-patch.mjs`] }] },
      ],
      Notification: [
        { matcher: "", hooks: [{ type: "command", command: `"C:/Program Files/nodejs/node.exe" "${fwd(dir)}/hooks/gsd-check-update.js"` }] },
        { matcher: "", hooks: [{ type: "command", command: "echo mine-notify" }] },
      ],
    },
    statusLine: { type: "command", command: `node "${fwd(dir)}/hooks/gsd-statusline.js"` },
  };
}
function plantGsdMachine(dir) {
  for (const [rel, body] of Object.entries(GSD_FILES)) {
    mkdirSync(join(dir, dirname(rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  plantForeign(dir);
  writeFileSync(join(dir, "settings.json"), JSON.stringify(gsdSettings(dir), null, 2) + "\n");
}
// Like run(), but the sandbox home is known to the caller so `.gsd` can be planted in it.
function runWithHome(dir, args, { plantHome = true } = {}) {
  const env = setupEnv({ CLAUDE_CONFIG_DIR: dir, CLAUDE_SETUP_SKIP_PLUGINS: "1", CLAUDE_SETUP_SKIP_MCP: "1", CLAUDE_SETUP_SKIP_PURGE: "1" });
  const gsdHome = join(env.HOME, ".gsd");
  if (plantHome) { mkdirSync(gsdHome); writeFileSync(join(gsdHome, "state.json"), "{}\n"); }
  const r = spawnSync(process.execPath, [join(ROOT, "setup.mjs"), ...args], { encoding: "utf8", env, timeout: 120000 });
  return { ...r, gsdHome };
}
const GSD_PATHS = ["gsd-core", "agents/gsd-x.md", "commands/gsd", "hooks/gsd-config-patch.mjs",
  "hooks/db-live-access-gate.mjs", "gsd-defaults.partial.json"];

test("@critical an install purges every GSD trace, keeps the bundle statusLine and foreign files, and backs settings up", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-sd-purge-"));
  plantGsdMachine(dir);
  const oldSettings = readFileSync(join(dir, "settings.json"), "utf8");
  const r = runWithHome(dir, ["--merge-all"]);
  assert.equal(r.status, 0, r.stderr);
  for (const rel of GSD_PATHS) assert.equal(existsSync(join(dir, rel)), false, rel);
  assert.equal(existsSync(r.gsdHome), false, "~/.gsd");
  const text = readFileSync(join(dir, "settings.json"), "utf8");
  assert.doesNotMatch(text, /gsd|db-live-access-gate/i);
  const s = JSON.parse(text);
  assert.match(s.statusLine.command, /hooks\/statusline\.mjs/);
  assert.match(JSON.stringify(s.hooks.Notification), /mine-notify/);
  assert.equal(readFileSync(join(dir, "settings.json.pre-gsd-purge"), "utf8"), oldSettings);
  assertForeignIntact(dir);
  rmSync(dir, { recursive: true, force: true });
});

test("@critical --dry-run lists every GSD path under would remove and changes nothing", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-sd-dry-"));
  plantGsdMachine(dir);
  const before = walk(dir);
  const oldSettings = readFileSync(join(dir, "settings.json"), "utf8");
  const r = runWithHome(dir, ["--dry-run", "--merge-all"]);
  assert.equal(r.status, 0, r.stderr);
  const listed = r.stdout.split("\n").filter((l) => l.includes("would remove")).join("\n");
  for (const p of GSD_PATHS.map((rel) => fwd(join(dir, rel))))
    assert.ok(fwd(listed).includes(p), `not listed: ${p}`);
  assert.ok(fwd(listed).includes(fwd(r.gsdHome)), "~/.gsd not listed");
  assert.deepEqual(walk(dir), before);
  assert.equal(readFileSync(join(dir, "settings.json"), "utf8"), oldSettings);
  assert.equal(existsSync(r.gsdHome), true);
  assert.equal(existsSync(join(dir, "settings.json.pre-gsd-purge")), false);
  rmSync(dir, { recursive: true, force: true });
});

test("@important a machine without GSD prints no GSD section and writes no purge backup", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-sd-clean-"));
  writeFileSync(join(dir, "settings.json"), JSON.stringify({ model: "opus" }, null, 2) + "\n");
  const r = runWithHome(dir, ["--merge-all"], { plantHome: false });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /GSD:/);
  assert.equal(existsSync(join(dir, "settings.json.pre-gsd-purge")), false);
  rmSync(dir, { recursive: true, force: true });
});

test("@important GSD traces with an unparsable settings.json: paths removed, settings byte-identical, no backup", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-sd-broken-"));
  plantGsdMachine(dir);
  writeFileSync(join(dir, "settings.json"), BROKEN_JSON);
  const r = runWithHome(dir, ["--merge-all"]);
  assert.equal(r.status, 0, r.stderr);
  for (const rel of GSD_PATHS) assert.equal(existsSync(join(dir, rel)), false, rel);
  assert.equal(existsSync(r.gsdHome), false);
  assert.equal(readFileSync(join(dir, "settings.json"), "utf8"), BROKEN_JSON);
  assert.equal(existsSync(join(dir, "settings.json.pre-gsd-purge")), false);
  rmSync(dir, { recursive: true, force: true });
});

test("@critical a BOM-prefixed settings.json is still purged of GSD registrations, and the backup keeps the original bytes", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-sd-bom-"));
  plantGsdMachine(dir);
  const bomSettings = "﻿" + JSON.stringify(gsdSettings(dir), null, 2) + "\n";
  writeFileSync(join(dir, "settings.json"), bomSettings);
  const r = runWithHome(dir, ["--merge-all"]);
  assert.equal(r.status, 0, r.stderr);
  const text = readFileSync(join(dir, "settings.json"), "utf8");
  assert.doesNotMatch(text, /gsd|db-live-access-gate/i);
  const s = JSON.parse(text.replace(/^﻿/, ""));
  assert.match(s.statusLine.command, /hooks\/statusline\.mjs/);
  assert.match(JSON.stringify(s.hooks.Notification), /mine-notify/);
  assert.equal(readFileSync(join(dir, "settings.json.pre-gsd-purge"), "utf8"), bomSettings);
  rmSync(dir, { recursive: true, force: true });
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

test("@important base dry-run plans all three MCP servers and changes nothing", () => {
  const out = mcpRun({}, ["--dry-run"]);
  const sec = mcpSection(out);
  assert.match(sec, /add\s+claude mcp add --scope user scrapling -- uvx/);
  assert.match(sec, /add\s+claude mcp add --scope user --transport http context7/);
  assert.match(sec, /add\s+claude mcp add --scope user deepseek -- node/);
  assert.match(sec, /\(dry-run: no MCP changes\)/);
});

test("@critical the Context7 key never appears in setup output", () => {
  const out = mcpRun({}, ["--dry-run"], { CONTEXT7_API_KEY: "SECRETX-e2e" });
  assert.doesNotMatch(out, /SECRETX-e2e/);
  assert.match(mcpSection(out), /CONTEXT7_API_KEY: \*\*\*/);
});

test("@important a relocated config dir without .claude.json plans every server, never reading HOME's", () => {
  const sec = mcpSection(mcpRun(null, ["--dry-run"]));
  assert.match(sec, /add\s+claude mcp add --scope user scrapling/);
  assert.match(sec, /add\s+claude mcp add --scope user --transport http context7/);
  assert.match(sec, /add\s+claude mcp add --scope user deepseek -- node/);
  assert.match(sec, /then\s+uvx --from "scrapling\[ai\]" scrapling install/);
});

test("@important dry-run reports session-default conflicts and writes nothing", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-sessdef-"));
  const before = JSON.stringify({ model: "claude-opus-5-5", effortLevel: "xhigh" }, null, 2) + "\n";
  writeFileSync(join(dir, "settings.json"), before);
  const r = run(dir, ["--dry-run"]);
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
  const r = run(dir, ["--replace-all"]);
  assert.equal(r.status, 0, r.stderr);
  const settings = JSON.parse(readFileSync(join(dir, "settings.json"), "utf8"));
  assert.equal(settings.model, "sonnet");
  assert.equal(settings.effortLevel, "medium");
  assert.equal(settings.statusLine.command, "echo mine");
  rmSync(dir, { recursive: true, force: true });
});

test("@critical an unparsable settings.json is left byte-identical, with or without a bulk flag", () => {
  const broken = '{\n  "model": "claude-opus-5-5",\n  "hooks": {},\n}\n';
  for (const args of [[], ["--replace-all"], ["--merge-all"]]) {
    const dir = mkdtempSync(join(tmpdir(), "cc-sessdef-"));
    assert.equal(run(dir, ["--replace-all"]).status, 0);
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
  const r = run(dir, ["--merge-all"]);
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
  const r = run(dir, ["--skip-all"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /--- session defaults ---/);
  assert.match(r.stdout, /\(--skip-all: settings unchanged\)/);
  assert.equal(readFileSync(join(dir, "settings.json"), "utf8"), before);
  rmSync(dir, { recursive: true, force: true });
});

test("@important session defaults are written when settings.json does not exist yet", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-sessdef-absent-"));
  const r = run(dir, []);
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
  assert.equal(run(dir, ["--replace-all"]).status, 0);
  const settings = JSON.parse(readFileSync(join(dir, "settings.json"), "utf8"));
  settings.model = modelValue;
  delete settings.effortLevel;
  settings.env = { ...(settings.env || {}), CLAUDE_CONFIG_UPDATE_CHECK: "0", CLAUDE_CODE_USE_POWERSHELL_TOOL: "0" };
  writeFileSync(join(dir, "settings.json"), JSON.stringify(settings, null, 2) + "\n");
}

test("@important interactive n on a session-default conflict still writes the absent key", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-sessdef-tty-n-"));
  sessionDefaultsTtyFixture(dir, "claude-opus-5-5");
  const r = await runTty(dir, [], [["replace 1 session default(s)?", "n"]]);
  assert.equal(r.status, 0, r.stderr);
  const after = JSON.parse(readFileSync(join(dir, "settings.json"), "utf8"));
  assert.equal(after.model, "claude-opus-5-5");
  assert.equal(after.effortLevel, "medium");
  rmSync(dir, { recursive: true, force: true });
});

test("@important a superseded model with a session-default conflict asks one question, not two", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-sessdef-tty-migrate-"));
  sessionDefaultsTtyFixture(dir, "claude-opus-4-8");
  const r = await runTty(dir, [], [["replace 1 session default(s)?", "y"]]);
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
  const r = run(dir, ["--dry-run"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /model: claude-opus-4-8 -> sonnet \(superseded - claude-opus-5-5 is the tier-preserving id/);
  rmSync(dir, { recursive: true, force: true });
});

test("@important a kept superseded model conflict also reports its tier-preserving id", () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-sessdef-migrate-kept-"));
  writeFileSync(join(dir, "settings.json"), JSON.stringify({ model: "claude-opus-4-8" }, null, 2) + "\n");
  const r = run(dir, ["--merge-all"]);
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
  const r = jsonSafetyRun({ settings: BROKEN_JSON, args: ["--replace-all"],
    env: { CLAUDE_SETUP_SKIP_MCP: "1" }, fakeClaude: true });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.settings, BROKEN_JSON);
  assert.ok(r.out.includes(notValid(r.dir, "plugin reconciliation")), r.out);
});

let brokenClaudeJsonRun;
const brokenClaudeJson = () => (brokenClaudeJsonRun ??= jsonSafetyRun({ claudeJson: '{ "mcpServers": {,} }\n',
  args: ["--replace-all"], env: { CLAUDE_SETUP_SKIP_PLUGINS: "1" }, fakeClaude: true }));

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
  const r = jsonSafetyRun({ settings: BROKEN_JSON, args: ["--replace-all", "--enable-update-check"], env: SKIP_BOTH });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.settings, BROKEN_JSON);
  assert.ok(r.out.includes(notValid(r.dir, "update-check opt-in")), r.out);
});

test("@critical the PowerShell-tool opt-in leaves an unparsable settings.json byte-identical under --replace-all", () => {
  const r = jsonSafetyRun({ settings: BROKEN_JSON, args: ["--replace-all", "--enable-powershell-tool"], env: SKIP_BOTH });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.settings, BROKEN_JSON);
  assert.ok(r.out.includes(notValid(r.dir, "PowerShell-tool opt-in")), r.out);
});

test("@important a BOM-prefixed valid settings.json is parsed and reconciled normally", () => {
  const r = jsonSafetyRun({ settings: "\uFEFF" + JSON.stringify({ model: "claude-opus-5-5",
    statusLine: { type: "command", command: "echo mine" } }, null, 2) + "\n",
  args: ["--replace-all", "--enable-update-check"], env: SKIP_BOTH });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.out, /not valid JSON|INVALID JSON/);
  const s = JSON.parse(r.settings.replace(/^\uFEFF/, ""));
  assert.equal(s.model, "sonnet");
  assert.equal(s.statusLine.command, "echo mine");
  assert.equal(s.env.CLAUDE_CONFIG_UPDATE_CHECK, "1");
});

test("@important a failed settings.json write prints a warning", { skip: process.getuid?.() === 0 && "root ignores file modes" }, () => {
  const before = JSON.stringify({ model: "claude-opus-5-5" }, null, 2) + "\n";
  const r = jsonSafetyRun({ settings: before, args: ["--replace-all"], env: SKIP_BOTH, readOnly: true });
  assert.equal(r.settings, before);
  assert.ok(r.out.includes(`WARNING: could not write ${join(r.dir, "settings.json")}`), r.out);
});

test("@important the autoUpdates block parses a BOM-prefixed valid .claude.json and enables updates", () => {
  const r = jsonSafetyRun({ settings: JSON.stringify({ model: "claude-opus-5-5" }, null, 2) + "\n",
    claudeJson: "﻿" + JSON.stringify({ autoUpdates: false, keep: 1 }, null, 2) + "\n",
    args: ["--replace-all"], env: SKIP_BOTH });
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
