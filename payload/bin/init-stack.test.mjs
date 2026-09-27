// Tests for init-stack.mjs: the pure/read-only core (template inheritance resolver + gather)
// AND the side-effecting half (apply/install/CLI dispatch) + the profile-aware plugin tier
// filter. Mirrors payload/bin/test_init_stack.py: SyntheticFixtureTests (resolver mechanics
// against a throwaway template tree) + the parity cases from RealTemplatesTests (against the
// actual setting-templates/ tree shipped in this repo), plus new coverage for the Node-only
// apply/tier-filter/CLI additions (init-stack.py has no equivalent to port from).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { resolveChain, classify, gather, cleanNonplugin, deepMerge, splitId, keepPlugin, apply, grab, main, readMaxPluginTier, migrateProjectModelConfigFile, gatherSkills, installSkills, installedSkillNames } from "./init-stack.mjs";
import { detect } from "./lib/stack-markers.mjs";

const REPO_TEMPLATES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "setting-templates");
const REPO_LIBRARY_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "skill-library");

// Every test that touches subprocess-guarded paths (installMissing/syncGsdContextModeAgents)
// relies on this: never let the suite shell out to `claude plugin install`/marketplace add or
// spawn node for real. Mirrors setup.mjs's CLAUDE_SETUP_SKIP_PLUGINS=1 hermetic-mode pattern.
process.env.CLAUDE_INIT_STACK_SKIP_SUBPROCESS = "1";

// ---------- synthetic fixtures ----------
function writeTemplates(files) {
  const dir = mkdtempSync(join(tmpdir(), "init-stack-test-"));
  for (const [rel, data] of Object.entries(files)) {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(data), "utf8");
  }
  return dir;
}

test("@important resolveChain: vertical ancestors apply root-most first, self last", () => {
  const dir = writeTemplates({
    "_base.json": { stack: "_root", merge: { enabledPlugins: { "root-p": true } }, plugins: [] },
    "d/_base.json": { stack: "_dir", merge: { enabledPlugins: { "dir-p": true } }, plugins: [] },
    "d/leaf.json": { stack: "leaf", merge: {}, plugins: [] },
  });
  const labels = resolveChain("d/leaf.json", { templatesDir: dir }).map(([l]) => l);
  assert.deepEqual(labels, ["_base.json", "d/_base.json", "d/leaf.json"]);
});

test("@important resolveChain: explicit extends splices a cross-branch chain before the leaf", () => {
  const dir = writeTemplates({
    "a/_base.json": { stack: "a", merge: {}, plugins: [{ id: "a-p" }] },
    "b/_base.json": { stack: "b", merge: {}, plugins: [{ id: "b-p" }] },
    "a/leaf.json": { stack: "leaf", extends: ["b/_base.json"], merge: {}, plugins: [] },
  });
  const labels = resolveChain("a/leaf.json", { templatesDir: dir }).map(([l]) => l);
  assert.deepEqual(labels, ["a/_base.json", "b/_base.json", "a/leaf.json"]);
});

test("@important resolveChain: pick restricts an extended sub-chain to named top-level keys", () => {
  const dir = writeTemplates({
    "a/_base.json": { stack: "a", merge: {}, plugins: [] },
    "b/_base.json": {
      stack: "b",
      merge: { enabledPlugins: { "b-merge": true } },
      plugins: [{ id: "b-plugin" }],
      _notes: ["should be dropped"],
    },
    "a/leaf.json": {
      stack: "leaf",
      extends: ["b/_base.json"],
      pick: { "b/_base.json": ["plugins"] },
      merge: {},
      plugins: [],
    },
  });
  const chain = resolveChain("a/leaf.json", { templatesDir: dir });
  const picked = Object.fromEntries(chain)["b/_base.json"];
  assert.ok(!("merge" in picked));
  assert.ok(!("_notes" in picked));
  assert.deepEqual(picked.plugins, [{ id: "b-plugin" }]);
});

test("@important resolveChain: a<->b cycle terminates and still includes both", () => {
  const dir = writeTemplates({
    "a.json": { stack: "a", extends: ["b.json"], merge: {}, plugins: [] },
    "b.json": { stack: "b", extends: ["a.json"], merge: {}, plugins: [] },
  });
  const chain = resolveChain("a.json", { templatesDir: dir });
  const labels = chain.map(([l]) => l);
  assert.ok(labels.includes("a.json"));
  assert.ok(labels.includes("b.json"));
});

test("@important splitId: last '@' is the separator; no '@' -> name='' mp=whole string (matches Python rpartition)", () => {
  assert.deepEqual(splitId("foo@mp"), ["foo", "mp"]);
  assert.deepEqual(splitId("scoped@name@mp"), ["scoped@name", "mp"]); // splits on the LAST '@'
  assert.deepEqual(splitId("no-at-sign"), ["", "no-at-sign"]);
});

test("@important classify: placeholder ids beat every other state", () => {
  assert.equal(classify("<fill-me>@mp", {}), "placeholder");
});

test("@important gather: emits no_template for an unknown stack, dedups by pid first-seen", () => {
  const dir = writeTemplates({
    "_base.json": { stack: "_root", merge: {}, plugins: [{ id: "shared@mp" }] },
    "x/leaf.json": { stack: "leaf", merge: {}, plugins: [{ id: "shared@mp" }, { id: "x-only@mp" }] },
  });
  const { entries } = gather(["not-a-real-stack"], { templatesDir: dir });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].state, "no_template");
  assert.equal(entries[0].id, null);
});

test("@important cleanNonplugin drops _-prefixed keys and enabledPlugins, keeps the rest", () => {
  assert.deepEqual(
    cleanNonplugin({ enabledPlugins: { p: true }, _notes: ["x"], statusLine: { type: "root" } }),
    { statusLine: { type: "root" } },
  );
});

test("@important deepMerge recursively merges nested objects, later values win on scalars", () => {
  const dst = { a: { x: 1, y: 2 }, b: 1 };
  deepMerge(dst, { a: { y: 3, z: 4 }, b: 2 });
  assert.deepEqual(dst, { a: { x: 1, y: 3, z: 4 }, b: 2 });
});

// ---------- parity against the REAL shipped templates (payload/setting-templates) ----------
// ---------- tier filter (spec §4) ----------
test("@important keepPlugin: tier:full dropped under maxPluginTier core, kept under full or no cap", () => {
  const entry = { id: "playwright@mp", tier: "full" };
  assert.equal(keepPlugin(entry, "core"), false);
  assert.equal(keepPlugin(entry, "full"), true);
  assert.equal(keepPlugin(entry, undefined), true);
});

// ---------- apply ----------
function tmpRoot() {
  return mkdtempSync(join(tmpdir(), "init-stack-apply-"));
}

test("@critical apply removes ids and preserves sibling settings keys (additive merge)", () => {
  const root = tmpRoot();
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(
    join(root, ".claude", "settings.json"),
    JSON.stringify({ enabledPlugins: { "old@mp": true }, model: "sonnet" }),
    "utf8",
  );
  apply(["new@mp"], ["old@mp"], [], { root, templatesDir: REPO_TEMPLATES_DIR });
  const settings = JSON.parse(readFileSync(join(root, ".claude", "settings.json"), "utf8"));
  assert.equal(settings.enabledPlugins["new@mp"], true);
  assert.ok(!("old@mp" in settings.enabledPlugins));
  assert.equal(settings.model, "sonnet"); // sibling key untouched
});

test("@important apply never enables a placeholder id", () => {
  const root = tmpRoot();
  apply(["<fill-me>@mp"], [], [], { root, templatesDir: REPO_TEMPLATES_DIR });
  const settings = JSON.parse(readFileSync(join(root, ".claude", "settings.json"), "utf8"));
  assert.deepEqual(settings.enabledPlugins, {});
});

// ---------- grab (CLI arg parsing) ----------
test("@important grab: collects tokens after a flag until the next --flag", () => {
  assert.deepEqual(grab(["--enable", "a@mp", "b@mp", "--remove", "c@mp"], "--enable"), ["a@mp", "b@mp"]);
  assert.deepEqual(grab(["--enable", "a@mp", "b@mp", "--remove", "c@mp"], "--remove"), ["c@mp"]);
  assert.deepEqual(grab(["--apply-all"], "--enable"), []);
});

// ---------- main() CLI dispatch ----------
function withCapturedLog(fn) {
  const lines = [];
  const orig = console.log;
  console.log = (...args) => lines.push(args.join(" "));
  try {
    return { result: fn(), lines };
  } finally {
    console.log = orig;
  }
}

test("@important main: invalid installed_plugins.json is caught at the CLI boundary and exits 2 (not thrown)", () => {
  const configDir = mkdtempSync(join(tmpdir(), "init-stack-cfg-"));
  mkdirSync(join(configDir, "plugins"), { recursive: true });
  writeFileSync(join(configDir, "plugins", "installed_plugins.json"), "{ not valid json", "utf8");
  let threw = false;
  let result;
  const origErr = console.error;
  console.error = () => {};
  try {
    result = main(["--status", "foo@mp"], { configDir });
  } catch {
    threw = true;
  } finally {
    console.error = origErr;
  }
  assert.equal(threw, false);
  assert.equal(result, 2);
});

test("@important main --apply-all respects maxPluginTier from the bundle manifest (drops tier:full)", () => {
  const configDir = mkdtempSync(join(tmpdir(), "init-stack-cfg-"));
  mkdirSync(join(configDir, "state"), { recursive: true });
  writeFileSync(join(configDir, "state", "bundle-manifest.json"), JSON.stringify({ maxPluginTier: "core" }), "utf8");
  const root = mkdtempSync(join(tmpdir(), "init-stack-root-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { react: "^18" } }), "utf8");
  withCapturedLog(() => main(["--apply-all"], { configDir, root, templatesDir: REPO_TEMPLATES_DIR }));
  const settings = JSON.parse(readFileSync(join(root, ".claude", "settings.json"), "utf8"));
  assert.equal(settings.enabledPlugins["typescript-lsp@claude-plugins-official"], true);
  assert.ok(!("playwright@claude-plugins-official" in settings.enabledPlugins));
});

test("@important readMaxPluginTier: corrupt (invalid-JSON) manifest degrades to no cap, does not throw", () => {
  const configDir = mkdtempSync(join(tmpdir(), "init-stack-cfg-"));
  mkdirSync(join(configDir, "state"), { recursive: true });
  writeFileSync(join(configDir, "state", "bundle-manifest.json"), "{ not valid json", "utf8");
  assert.doesNotThrow(() => readMaxPluginTier(configDir));
  assert.equal(readMaxPluginTier(configDir), undefined);
});

// ---------- §6.3 project model-config re-migration (Phase 5 Part B) ----------
function makeProjectRoot(configJson) {
  const root = mkdtempSync(join(tmpdir(), "init-stack-planning-"));
  if (configJson !== undefined) {
    mkdirSync(join(root, ".planning"), { recursive: true });
    writeFileSync(join(root, ".planning", "config.json"), configJson, "utf8");
  }
  return root;
}

test("@important migrateProjectModelConfigFile: rewrites old §6.3 overrides in .planning/config.json", () => {
  const root = makeProjectRoot(JSON.stringify({
    model_overrides: {
      "gsd-pattern-mapper": "haiku", "gsd-ui-auditor": "haiku",
      "gsd-verifier": "sonnet", "gsd-planner": "opus",
    },
  }, null, 2));
  try {
    const { changes } = migrateProjectModelConfigFile(root);
    assert.equal(changes.length, 3);
    const written = JSON.parse(readFileSync(join(root, ".planning", "config.json"), "utf8"));
    assert.equal(written.model_overrides["gsd-pattern-mapper"], "sonnet");
    assert.equal(written.model_overrides["gsd-ui-auditor"], "sonnet");
    assert.equal(written.model_overrides["gsd-verifier"], "opus");
    assert.equal(written.model_overrides["gsd-planner"], "opus", "untouched role preserved");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("@important migrateProjectModelConfigFile: idempotent second run makes no changes", () => {
  const root = makeProjectRoot(JSON.stringify({ model_overrides: { "gsd-verifier": "sonnet" } }));
  try {
    migrateProjectModelConfigFile(root);
    const before = readFileSync(join(root, ".planning", "config.json"), "utf8");
    const { changes } = migrateProjectModelConfigFile(root);
    assert.deepEqual(changes, []);
    assert.equal(readFileSync(join(root, ".planning", "config.json"), "utf8"), before, "no rewrite");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("@critical migrateProjectModelConfigFile: malformed config is left untouched, never throws", () => {
  const root = makeProjectRoot("{ not valid json");
  try {
    assert.doesNotThrow(() => migrateProjectModelConfigFile(root));
    assert.deepEqual(migrateProjectModelConfigFile(root).changes, []);
    assert.equal(readFileSync(join(root, ".planning", "config.json"), "utf8"), "{ not valid json");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Task 7: setup.mjs drives marketplace registration off these same helpers rather than a second,
// parallel mechanism that could drift from this one.
test("@important deepMerge unions arrays instead of replacing a user-set one", () => {
  const dst = { permissions: { allow: ["Bash(git:*)"] } };
  deepMerge(dst, { permissions: { allow: ["Bash(npm:*)", "Bash(git:*)"] } });
  assert.deepEqual(dst, { permissions: { allow: ["Bash(git:*)", "Bash(npm:*)"] } });
});

test("@important two .csproj projects are classified independently, not as one pooled blob", () => {
  const dir = mkdtempSync(join(tmpdir(), "csproj-"));
  try {
    mkdirSync(join(dir, "Web"), { recursive: true });
    mkdirSync(join(dir, "Cli"), { recursive: true });
    writeFileSync(join(dir, "Web", "Web.csproj"), '<Project Sdk="Microsoft.NET.Sdk.Web"></Project>');
    writeFileSync(join(dir, "Cli", "Cli.csproj"), "<Project><OutputType>Exe</OutputType></Project>");
    const found = detect(dir);
    assert.ok(found.includes("aspnet"), `expected aspnet in ${JSON.stringify(found)}`);
    assert.ok(found.includes("csharp-cli"),
      `a console project must not be suppressed by a sibling web project: ${JSON.stringify(found)}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("@important applying settings leaves no lock or temp sibling behind", () => {
  const dir = mkdtempSync(join(tmpdir(), "initstack-apply-"));
  try {
    const settingsFile = join(dir, ".claude", "settings.json");
    apply([], [], [], { root: dir, settingsFile, templatesDir: REPO_TEMPLATES_DIR });
    const left = readdirSync(join(dir, ".claude"));
    assert.deepEqual(left, ["settings.json"], `stray files: ${JSON.stringify(left)}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---------- bundled stack skills (Task 3: DB/_base.json's "postgres" entry ships as
// install.bundled, copied from payload/skill-library/, not npx-installed) ----------

// Recursively collects [relPath, contents-as-Buffer] pairs under dir, sorted, so two trees can
// be compared byte-for-byte regardless of directory-entry enumeration order.
function collectFiles(dir, base = dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...collectFiles(p, base));
    else out.push([relative(base, p).replace(/\\/g, "/"), readFileSync(p)]);
  }
  return out.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

function assertTreesByteEqual(dirA, dirB) {
  const a = collectFiles(dirA);
  const b = collectFiles(dirB);
  assert.deepEqual(a.map(([p]) => p), b.map(([p]) => p), "file lists differ");
  for (let i = 0; i < a.length; i++) {
    assert.ok(a[i][1].equals(b[i][1]), `${a[i][0]} differs byte-for-byte`);
  }
}

test("@important gatherSkills: a SQL project lists bundled:postgres as available", () => {
  const entries = gatherSkills(["sql"], { templatesDir: REPO_TEMPLATES_DIR });
  const pg = entries.find((e) => e.id === "bundled:postgres");
  assert.ok(pg, `bundled:postgres not found in ${JSON.stringify(entries.map((e) => e.id))}`);
  assert.equal(pg.name, "postgres");
  assert.equal(pg.state, "available");
  assert.deepEqual(pg.install, { bundled: "postgres" });
});

test("@important installSkills: a bundled entry is copied byte-equal from the library, no npx invoked, then reports installed", () => {
  const root = mkdtempSync(join(tmpdir(), "init-stack-bundled-"));
  try {
    const entries = gatherSkills(["sql"], { templatesDir: REPO_TEMPLATES_DIR });
    const pg = entries.find((e) => e.id === "bundled:postgres");
    const { lines } = withCapturedLog(() =>
      installSkills([pg], { libraryDir: REPO_LIBRARY_DIR, projectRoot: root }),
    );
    assert.ok(
      !lines.some((l) => l.includes("npx")),
      `no npx command should ever be invoked for a bundled entry, saw: ${JSON.stringify(lines)}`,
    );
    const dest = join(root, ".claude", "skills", "postgres");
    assert.ok(existsSync(dest), `${dest} was not created`);
    assertTreesByteEqual(dest, join(REPO_LIBRARY_DIR, "postgres"));

    const after = gatherSkills(["sql"], {
      templatesDir: REPO_TEMPLATES_DIR,
      installedSkills: installedSkillNames(root, root), // configDirPath arg unused here (no ~/.claude/skills fixture)
    });
    const pgAfter = after.find((e) => e.id === "bundled:postgres");
    assert.equal(pgAfter.state, "installed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("@important installSkills: refuses to overwrite an existing bundled-skill target", () => {
  const root = mkdtempSync(join(tmpdir(), "init-stack-bundled-existing-"));
  try {
    const dest = join(root, ".claude", "skills", "postgres");
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, "SKILL.md"), "pre-existing, must not be overwritten", "utf8");

    const entries = gatherSkills(["sql"], { templatesDir: REPO_TEMPLATES_DIR });
    const pg = entries.find((e) => e.id === "bundled:postgres");
    const { result } = withCapturedLog(() =>
      installSkills([pg], { libraryDir: REPO_LIBRARY_DIR, projectRoot: root }),
    );
    assert.deepEqual(result.ok, []);
    assert.deepEqual(result.failed, ["bundled:postgres"]);
    assert.equal(readFileSync(join(dest, "SKILL.md"), "utf8"), "pre-existing, must not be overwritten");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
