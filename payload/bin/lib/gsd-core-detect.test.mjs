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

test("@important presence is decided by gsd-core/VERSION alone", () => {
  assert.equal(gsdCorePresent(claudeDir({})), false);
  assert.equal(gsdCorePresent(claudeDir({ "gsd-core/VERSION": "1.8.0\n" })), true);
});

test("@important manifest subtraction matches directory-shaped categories by prefix, not just exact rel", () => {
  const dir = claudeDir({
    "gsd-core/VERSION": "1.8.0\n",
    "skills/gsd-bundle-owned/SKILL.md": "x",
    "skills/gsd-foreign/SKILL.md": "x",
  });
  const { items } = buildGsdInventory({ dir, manifestRels: ["skills/gsd-bundle-owned/SKILL.md"] });
  const rels = items.map((i) => i.absPath.slice(dir.length + 1).replace(/\\/g, "/")).sort();
  assert.deepEqual(rels, ["gsd-core", "skills/gsd-foreign"]);
});

test("@important every item carries what applyPlan needs", () => {
  const dir = claudeDir({ "gsd-core/VERSION": "1.8.0\n" });
  for (const it of buildGsdInventory({ dir, manifestRels: [] }).items)
    for (const k of ["absPath", "size", "category", "reason", "mtimeMs"])
      assert.ok(k in it, `${k} missing`);
});

test("@important only gsd hook registrations are dropped, and they are reported", () => {
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
// Boundary of the command-string match, including the one over-reach RISK-ULTRAPOWERS-009 documents:
// a gsd path passed as an ARGUMENT to some other script is dropped too. Pinned rather than fixed -
// the alternative is parsing command lines - so a future narrowing has to face it deliberately.
test("@critical a hooks-less settings object survives untouched", () => {
  const { settings, removed } = filterGsdHooks({ model: "opus" });
  assert.deepEqual(settings, { model: "opus" });
  assert.deepEqual(removed, []);
});

// The full profile ships the GSD machinery (agents, hooks, rules) but gsd-core itself comes from
// npx, never a marketplace. Detecting it by VERSION on disk is the only honest check: an enabled
// plugin entry proved nothing, and that was the old mistake.
test("@important full without gsd-core installed asks, and the command installs globally for Claude", () => {
  const plan = gsdCoreInstallPlan({ variant: "full", present: false, interactive: true, pinnedVersion: "1.11.0", pinnedVersion: "1.11.0" });
  assert.equal(plan.action, "ask");
  assert.match(plan.command, /^npx -y @opengsd\/gsd-core@1\.11\.0 /);
  assert.match(plan.command, /--global/);
  assert.match(plan.command, /--claude/);
});

// base and lite deliberately exclude the GSD machinery; offering to install the tool there would
// contradict the detector that offers to REMOVE it.
test("@important base and lite never offer to install it", () => {
  for (const variant of ["base", "lite"]) {
    assert.equal(gsdCoreInstallPlan({ variant, present: false, interactive: true }).action, "none");
  }
});

test("@important a non-default config dir is passed through, and omitted when default", () => {
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

test("@important gsdLookingRels picks the paths gsd-core's scanner calls GSD-looking", () => {
  const rels = [
    "hooks/lib/gsd-agent-patches.mjs", "hooks/lib/gsd-defaults-sync.mjs",
    "hooks/lib/gsd-patch-frontmatter.mjs", "hooks/lib/gsd-skill-patches.mjs",
    "hooks/lib/gsd-statusline-registration.mjs", "hooks/lib/gsd-workflow-patches.mjs",
    "hooks/lib/gsd-hook-patches.mjs",
    "hooks/gsd-config-patch.mjs", "agents/gsd-executor-decomposing.md",
    "agents/gsd-task-verifier.md", "bin/lib/gsd-core-detect.mjs", "gsd-defaults-sync.mjs",
    "hooks/session-init.mjs", "rules-src/gsd.md", "apply-gsd-agent-patches.mjs",
    "hooks/lib/context-mode-gsd-agents.mjs",
  ];
  assert.deepEqual(gsdLookingRels(rels), [
    "agents/gsd-executor-decomposing.md", "agents/gsd-task-verifier.md",
    "bin/lib/gsd-core-detect.mjs", "gsd-defaults-sync.mjs", "hooks/gsd-config-patch.mjs",
    "hooks/lib/gsd-agent-patches.mjs", "hooks/lib/gsd-defaults-sync.mjs",
    "hooks/lib/gsd-hook-patches.mjs",
    "hooks/lib/gsd-patch-frontmatter.mjs", "hooks/lib/gsd-skill-patches.mjs",
    "hooks/lib/gsd-statusline-registration.mjs", "hooks/lib/gsd-workflow-patches.mjs",
  ]);
});

/* ---------- update: gsd-core is present but behind npm ---------- */

test("@important the update plan only ever fires on full, with gsd-core present", () => {
  const base = { installedVersion: "1.9.1", pinnedVersion: "1.10.0", interactive: true };
  assert.equal(gsdCoreUpdatePlan({ ...base, variant: "base", present: true }).action, "none");
  assert.equal(gsdCoreUpdatePlan({ ...base, variant: "lite", present: true }).action, "none");
  assert.equal(gsdCoreUpdatePlan({ ...base, variant: "full", present: false }).action, "none");
});

test("@important being behind asks in a TTY, updates without one, and obeys the flag", () => {
  const base = { variant: "full", present: true, installedVersion: "1.9.1", pinnedVersion: "1.10.0" };
  assert.equal(gsdCoreUpdatePlan({ ...base, interactive: true }).action, "ask");
  assert.equal(gsdCoreUpdatePlan({ ...base, interactive: false }).action, "update");
  assert.equal(gsdCoreUpdatePlan({ ...base, interactive: false, flag: true }).action, "update");
  assert.match(gsdCoreUpdatePlan({ ...base, interactive: true }).command, /@opengsd\/gsd-core@1\.10\.0/);
});

/* ---------- pinned version: the bundle declares which gsd-core it was validated against ---------- */

const PIN = { variant: "full", pinnedVersion: "1.11.0" };

test("@important the install command carries the pinned version, never @latest", () => {
  const plan = gsdCoreInstallPlan({ ...PIN, present: false, interactive: true });
  assert.match(plan.command, /@opengsd\/gsd-core@1\.11\.0/);
  assert.ok(!/@latest/.test(plan.command), `must not float to latest: ${plan.command}`);
});

test("@critical an install AHEAD of the pin is never downgraded - it is reported instead", () => {
  const ahead = gsdCoreUpdatePlan({ ...PIN, present: true, installedVersion: "1.12.0", interactive: false });
  assert.equal(ahead.action, "ahead");
  assert.equal(ahead.from, "1.12.0");
  assert.equal(ahead.to, "1.11.0");
  assert.ok(!ahead.command, "an ahead report must not carry a command that would downgrade");
});

test("@important an unreadable installed version is never guessed at", () => {
  for (const v of [null, "", "unknown"])
    assert.deepEqual(gsdCoreUpdatePlan({ ...PIN, present: true, installedVersion: v, interactive: false }),
      { action: "none", reason: "unknown-version" });
});

test("@critical a missing pin disables the whole mechanism rather than floating to latest", () => {
  assert.deepEqual(gsdCoreUpdatePlan({ variant: "full", present: true, installedVersion: "1.10.0", interactive: false }),
    { action: "none", reason: "unknown-version" });
});
