import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gsdCorePresent, buildGsdInventory, filterGsdHooks, gsdCoreInstallPlan, gsdLookingRels, gsdCoreUpdatePlan } from "./gsd-core-detect.mjs";

function claudeDir(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), "gsd-detect-"));
  for (const [rel, text] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, text);
  }
  return dir;
}

test("presence is decided by gsd-core/VERSION alone", () => {
  assert.equal(gsdCorePresent(claudeDir({})), false);
  assert.equal(gsdCorePresent(claudeDir({ "gsd-core/VERSION": "1.8.0\n" })), true);
});

test("the inventory covers exactly the five surfaces", () => {
  const dir = claudeDir({
    "gsd-core/VERSION": "1.8.0\n",
    "skills/gsd-plan-phase/SKILL.md": "x",
    "agents/gsd-planner.md": "x",
    "agents/other.md": "x",
    "hooks/gsd-config-patch.mjs": "x",
    "hooks/lib/gsd-agent-patches.mjs": "x",
    "hooks/session-init.mjs": "x",
    "skills/update-changelog/SKILL.md": "x",
  });
  const { items, categories } = buildGsdInventory({ dir, manifestRels: [] });
  const rels = items.map((i) => i.absPath.slice(dir.length + 1).replace(/\\/g, "/")).sort();
  assert.deepEqual(rels, [
    "agents/gsd-planner.md",
    "gsd-core",
    "hooks/gsd-config-patch.mjs",
    "hooks/lib/gsd-agent-patches.mjs",
    "skills/gsd-plan-phase",
  ]);
  assert.equal(categories.find((c) => c.name === "agents").count, 1);
});

test("a path this bundle owns is never in the inventory", () => {
  const dir = claudeDir({
    "gsd-core/VERSION": "1.8.0\n",
    "hooks/gsd-context-meter.mjs": "x",
    "hooks/lib/gsd-context-meter-lib.mjs": "x",
  });
  const { items } = buildGsdInventory({
    dir,
    manifestRels: ["hooks/gsd-context-meter.mjs", "hooks/lib/gsd-context-meter-lib.mjs"],
  });
  assert.deepEqual(items.map((i) => i.absPath.slice(dir.length + 1).replace(/\\/g, "/")), ["gsd-core"]);
});

test("manifest subtraction matches directory-shaped categories by prefix, not just exact rel", () => {
  const dir = claudeDir({
    "gsd-core/VERSION": "1.8.0\n",
    "skills/gsd-bundle-owned/SKILL.md": "x",
    "skills/gsd-foreign/SKILL.md": "x",
  });
  const { items } = buildGsdInventory({ dir, manifestRels: ["skills/gsd-bundle-owned/SKILL.md"] });
  const rels = items.map((i) => i.absPath.slice(dir.length + 1).replace(/\\/g, "/")).sort();
  assert.deepEqual(rels, ["gsd-core", "skills/gsd-foreign"]);
});

test("every item carries what applyPlan needs", () => {
  const dir = claudeDir({ "gsd-core/VERSION": "1.8.0\n" });
  for (const it of buildGsdInventory({ dir, manifestRels: [] }).items)
    for (const k of ["absPath", "size", "category", "reason", "mtimeMs"])
      assert.ok(k in it, `${k} missing`);
});

test("only gsd hook registrations are dropped, and they are reported", () => {
  const settings = {
    hooks: {
      PreToolUse: [
        { matcher: "Bash", hooks: [{ type: "command", command: "node", args: ["/h/.claude/hooks/gsd-config-patch.mjs"] }] },
        { matcher: "Bash", hooks: [{ type: "command", command: "node", args: ["/h/.claude/hooks/secrets-gate.mjs"] }] },
      ],
      SessionStart: [{ hooks: [{ type: "command", command: "node", args: ["/h/.claude/hooks/gsd-session.mjs"] }] }],
    },
    model: "opus",
  };
  const { settings: out, removed } = filterGsdHooks(settings);
  assert.equal(out.hooks.PreToolUse.length, 1);
  assert.equal(out.hooks.SessionStart.length, 0);
  assert.equal(removed.length, 2);
  assert.equal(out.model, "opus");
  assert.equal(settings.hooks.PreToolUse.length, 2, "input must not be mutated");
});

// Verbatim shapes from the live gsd-core install this feature targets: one quoted command line,
// no args array at all. Matching only `args` left every real registration in place.
test("a gsd-core command-string registration is dropped even with no args array", () => {
  const settings = {
    hooks: {
      SessionStart: [
        { hooks: [{ type: "command", command: '"C:/Program Files/nodejs/node.exe" "C:/Users/Axa/.claude/hooks/gsd-check-update.js"' }] },
        { hooks: [{ type: "command", command: '"C:/Users/Axa/.claude/hooks/gsd-session-state.sh"' }] },
        { hooks: [{ type: "command", command: '"C:/Program Files/nodejs/node.exe" "C:/Users/Axa/.claude/hooks/session-init.mjs"' }] },
        { hooks: [{ type: "command", command: "node /h/.claude/hooks/lib/gsd-agent-patches.mjs" }] },
        { hooks: [{ type: "command", command: "node C:\\Users\\Axa\\.claude\\hooks\\gsd-phase-boundary.sh --quiet" }] },
      ],
    },
  };
  const { settings: out, removed } = filterGsdHooks(settings);
  assert.deepEqual(removed.map((r) => r.event), ["SessionStart", "SessionStart", "SessionStart"]);
  assert.equal(out.hooks.SessionStart.length, 2, "a non-gsd hook or a hooks/lib entry was dropped");
});

// Boundary of the command-string match, including the one over-reach RISK-ULTRAPOWERS-009 documents:
// a gsd path passed as an ARGUMENT to some other script is dropped too. Pinned rather than fixed -
// the alternative is parsing command lines - so a future narrowing has to face it deliberately.
test("the command-string match holds its boundary in both directions", () => {
  const cases = [
    ['"C:/nodejs/node.exe" "C:/Users/a/.claude/hooks/gsd-x.js"', true, "quoted absolute path"],
    ["node C:\\Users\\a\\.claude\\hooks\\gsd-x.js --flag", true, "backslashes, unquoted, trailing arg"],
    ["node hooks/gsd-x.js", true, "space-preceded relative path"],
    ["hooks/gsd-x.js", true, "relative path at the start of the string"],
    ["node 'hooks/gsd-x.js'", true, "single-quoted"],
    ['node "/h/.claude/hooks/lib/other.mjs" --patch "/h/.claude/hooks/gsd-x.js"', true, "gsd path as an argument (documented over-reach)"],
    ['node "/h/.claude/hooks/lib/gsd-agent-patches.mjs"', false, "hooks/lib is never a registered hook"],
    ['node "/h/.claude/my-hooks/gsd-x.js"', false, "a different directory ending in hooks"],
    ['node "/h/.claude/xhooks/gsd-x.js"', false, "no separator before hooks"],
    ['node "/h/.hooks/gsd-x.js"', false, "dot-prefixed directory"],
    ['node "/h/.claude/hooks/gsd/x.js"', false, "gsd is a directory, not a gsd- prefix"],
    ['node "/h/.claude/hooks/session-init.mjs"', false, "an unrelated hook"],
  ];
  for (const [command, shouldDrop, why] of cases) {
    const { removed } = filterGsdHooks({ hooks: { X: [{ hooks: [{ type: "command", command }] }] } });
    assert.equal(removed.length, shouldDrop ? 1 : 0, `${why}: ${command}`);
  }
});

test("a hooks-less settings object survives untouched", () => {
  const { settings, removed } = filterGsdHooks({ model: "opus" });
  assert.deepEqual(settings, { model: "opus" });
  assert.deepEqual(removed, []);
});

// The full profile ships the GSD machinery (agents, hooks, rules) but gsd-core itself comes from
// npx, never a marketplace. Detecting it by VERSION on disk is the only honest check: an enabled
// plugin entry proved nothing, and that was the old mistake.
test("full without gsd-core installed asks, and the command installs globally for Claude", () => {
  const plan = gsdCoreInstallPlan({ variant: "full", present: false, interactive: true, pinnedVersion: "1.11.0", pinnedVersion: "1.11.0" });
  assert.equal(plan.action, "ask");
  assert.match(plan.command, /^npx -y @opengsd\/gsd-core@1\.11\.0 /);
  assert.match(plan.command, /--global/);
  assert.match(plan.command, /--claude/);
});

test("without a TTY it installs rather than printing - on full this is a bundle dependency", () => {
  const plan = gsdCoreInstallPlan({ variant: "full", present: false, interactive: false, pinnedVersion: "1.11.0" });
  assert.equal(plan.action, "install");
  assert.match(plan.command, /@opengsd\/gsd-core/);
});

test("gsd-core already on disk means nothing to do", () => {
  assert.equal(gsdCoreInstallPlan({ variant: "full", present: true, interactive: true }).action, "none");
});

// base and lite deliberately exclude the GSD machinery; offering to install the tool there would
// contradict the detector that offers to REMOVE it.
test("base and lite never offer to install it", () => {
  for (const variant of ["base", "lite"]) {
    assert.equal(gsdCoreInstallPlan({ variant, present: false, interactive: true }).action, "none");
  }
});

test("a non-default config dir is passed through, and omitted when default", () => {
  const custom = gsdCoreInstallPlan({
    variant: "full", present: false, interactive: true, pinnedVersion: "1.11.0",
    configDir: "D:/alt/.claude", defaultConfigDir: "C:/Users/x/.claude",
  });
  assert.match(custom.command, /--config-dir "D:\/alt\/\.claude"/);
  const plain = gsdCoreInstallPlan({
    variant: "full", present: false, interactive: true, pinnedVersion: "1.11.0",
    configDir: "C:/Users/x/.claude", defaultConfigDir: "C:/Users/x/.claude",
  });
  assert.doesNotMatch(plain.command, /--config-dir/);
});

/* ---------- quarantine: which of our own files gsd-core's baseline scan trips over ---------- */

test("gsdLookingRels picks the paths gsd-core's scanner calls GSD-looking", () => {
  const rels = [
    "hooks/lib/gsd-agent-patches.mjs", "hooks/lib/gsd-defaults-sync.mjs",
    "hooks/lib/gsd-patch-frontmatter.mjs", "hooks/lib/gsd-skill-patches.mjs",
    "hooks/lib/gsd-statusline-registration.mjs", "hooks/lib/gsd-workflow-patches.mjs",
    "hooks/gsd-config-patch.mjs", "agents/gsd-executor-decomposing.md",
    "agents/gsd-task-verifier.md", "bin/lib/gsd-core-detect.mjs", "gsd-defaults-sync.mjs",
    "hooks/session-init.mjs", "rules-src/gsd.md", "apply-gsd-agent-patches.mjs",
    "hooks/lib/context-mode-gsd-agents.mjs",
  ];
  assert.deepEqual(gsdLookingRels(rels), [
    "agents/gsd-executor-decomposing.md", "agents/gsd-task-verifier.md",
    "bin/lib/gsd-core-detect.mjs", "gsd-defaults-sync.mjs", "hooks/gsd-config-patch.mjs",
    "hooks/lib/gsd-agent-patches.mjs", "hooks/lib/gsd-defaults-sync.mjs",
    "hooks/lib/gsd-patch-frontmatter.mjs", "hooks/lib/gsd-skill-patches.mjs",
    "hooks/lib/gsd-statusline-registration.mjs", "hooks/lib/gsd-workflow-patches.mjs",
  ]);
});

test("gsdLookingRels covers every file the installer actually reported as blocked", () => {
  const reported = [
    "hooks/lib/gsd-agent-patches.mjs", "hooks/lib/gsd-defaults-sync.mjs",
    "hooks/lib/gsd-patch-frontmatter.mjs", "hooks/lib/gsd-skill-patches.mjs",
    "hooks/lib/gsd-statusline-registration.mjs", "hooks/lib/gsd-workflow-patches.mjs",
  ];
  assert.deepEqual(gsdLookingRels(reported).sort(), [...reported].sort());
});

test("gsdLookingRels matches on the basename only, and normalises separators", () => {
  assert.deepEqual(gsdLookingRels(["hooks\\lib\\gsd-skill-patches.mjs"]), ["hooks/lib/gsd-skill-patches.mjs"]);
  assert.deepEqual(gsdLookingRels(["gsd-core/VERSION"]), []);
  assert.deepEqual(gsdLookingRels(["skills/gsd/SKILL.md", "notgsd-x.mjs", "hooks/gsdx.mjs"]), []);
  assert.deepEqual(gsdLookingRels([]), []);
});

/* ---------- update: gsd-core is present but behind npm ---------- */

test("the update plan only ever fires on full, with gsd-core present", () => {
  const base = { installedVersion: "1.9.1", pinnedVersion: "1.10.0", interactive: true };
  assert.equal(gsdCoreUpdatePlan({ ...base, variant: "base", present: true }).action, "none");
  assert.equal(gsdCoreUpdatePlan({ ...base, variant: "lite", present: true }).action, "none");
  assert.equal(gsdCoreUpdatePlan({ ...base, variant: "full", present: false }).action, "none");
});

test("an install at the pin is left alone; one ahead of it is reported", () => {
  const base = { variant: "full", present: true, interactive: true };
  assert.equal(gsdCoreUpdatePlan({ ...base, installedVersion: "1.10.0", pinnedVersion: "1.10.0" }).action, "none");
  // Ahead is reported, never silently accepted: the fork and the patches were verified against
  // the pin, so a newer gsd-core is exactly the case a human should look at.
  assert.equal(gsdCoreUpdatePlan({ ...base, installedVersion: "1.11.0", pinnedVersion: "1.10.0" }).action, "ahead");
});

test("a version that cannot be read is never guessed at", () => {
  const base = { variant: "full", present: true, interactive: true };
  for (const [installed, latest] of [[null, "1.10.0"], ["1.9.1", null], ["unknown", "1.10.0"], ["1.9.1", ""]])
    assert.deepEqual(gsdCoreUpdatePlan({ ...base, installedVersion: installed, pinnedVersion: latest }),
      { action: "none", reason: "unknown-version" });
});

test("being behind asks in a TTY, updates without one, and obeys the flag", () => {
  const base = { variant: "full", present: true, installedVersion: "1.9.1", pinnedVersion: "1.10.0" };
  assert.equal(gsdCoreUpdatePlan({ ...base, interactive: true }).action, "ask");
  assert.equal(gsdCoreUpdatePlan({ ...base, interactive: false }).action, "update");
  assert.equal(gsdCoreUpdatePlan({ ...base, interactive: false, flag: true }).action, "update");
  assert.match(gsdCoreUpdatePlan({ ...base, interactive: true }).command, /@opengsd\/gsd-core@1\.10\.0/);
});

test("a prerelease is older than the release that shares its numbers", () => {
  const base = { variant: "full", present: true, interactive: true };
  assert.equal(gsdCoreUpdatePlan({ ...base, installedVersion: "1.10.0-rc.6", pinnedVersion: "1.10.0" }).action, "ask");
  assert.equal(gsdCoreUpdatePlan({ ...base, installedVersion: "1.10.0", pinnedVersion: "1.10.0-rc.6" }).action, "ahead");
});

test("the update command carries a non-default config dir, like the install one", () => {
  const plan = gsdCoreUpdatePlan({
    variant: "full", present: true, installedVersion: "1.9.1", pinnedVersion: "1.10.0",
    interactive: true, configDir: "D:/alt/.claude", defaultConfigDir: "C:/Users/x/.claude",
  });
  assert.match(plan.command, /--config-dir "D:\/alt\/\.claude"/);
});

/* ---------- pinned version: the bundle declares which gsd-core it was validated against ---------- */

const PIN = { variant: "full", pinnedVersion: "1.11.0" };

test("the install command carries the pinned version, never @latest", () => {
  const plan = gsdCoreInstallPlan({ ...PIN, present: false, interactive: true });
  assert.match(plan.command, /@opengsd\/gsd-core@1\.11\.0/);
  assert.ok(!/@latest/.test(plan.command), `must not float to latest: ${plan.command}`);
});

test("an absent gsd-core installs without a TTY - it is a bundle dependency, not a plugin", () => {
  assert.equal(gsdCoreInstallPlan({ ...PIN, present: false, interactive: false }).action, "install");
  assert.equal(gsdCoreInstallPlan({ ...PIN, present: false, interactive: true }).action, "ask");
});

test("a behind install is brought up to the pin, with or without a TTY", () => {
  const behind = { ...PIN, present: true, installedVersion: "1.10.0" };
  assert.equal(gsdCoreUpdatePlan({ ...behind, interactive: false }).action, "update");
  assert.equal(gsdCoreUpdatePlan({ ...behind, interactive: true }).action, "ask");
  assert.match(gsdCoreUpdatePlan({ ...behind, interactive: false }).command, /gsd-core@1\.11\.0/);
});

test("an install AHEAD of the pin is never downgraded - it is reported instead", () => {
  const ahead = gsdCoreUpdatePlan({ ...PIN, present: true, installedVersion: "1.12.0", interactive: false });
  assert.equal(ahead.action, "ahead");
  assert.equal(ahead.from, "1.12.0");
  assert.equal(ahead.to, "1.11.0");
  assert.ok(!ahead.command, "an ahead report must not carry a command that would downgrade");
});

test("an install exactly at the pin is left alone", () => {
  assert.equal(gsdCoreUpdatePlan({ ...PIN, present: true, installedVersion: "1.11.0", interactive: true }).action, "none");
});

test("a prerelease of the pinned version still counts as behind it", () => {
  assert.equal(gsdCoreUpdatePlan({ ...PIN, present: true, installedVersion: "1.11.0-rc.1", interactive: false }).action, "update");
});

test("an unreadable installed version is never guessed at", () => {
  for (const v of [null, "", "unknown"])
    assert.deepEqual(gsdCoreUpdatePlan({ ...PIN, present: true, installedVersion: v, interactive: false }),
      { action: "none", reason: "unknown-version" });
});

test("a missing pin disables the whole mechanism rather than floating to latest", () => {
  assert.deepEqual(gsdCoreUpdatePlan({ variant: "full", present: true, installedVersion: "1.10.0", interactive: false }),
    { action: "none", reason: "unknown-version" });
});
