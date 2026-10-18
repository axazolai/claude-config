import test from "node:test";
import assert from "node:assert/strict";
import { basename, dirname, join } from "node:path";
import { BUNDLE_RELS, planGsdPurge, stripGsdSettings, stripProjectInitGsd, isEmptyPlan } from "./gsd-purge.mjs";

const CD = join("/fake", ".claude");
const HOME = join("/fake", "home");

// A fake filesystem: every given path plus all its ancestors exist as entries.
function fakeFs(paths) {
  const tree = new Set();
  for (const p of paths) {
    let cur = p;
    for (;;) {
      tree.add(cur);
      const up = dirname(cur);
      if (up === cur) break;
      cur = up;
    }
  }
  return {
    list: (d) => [...tree].filter((p) => dirname(p) === d).map((p) => basename(p)),
    exists: (p) => tree.has(p),
  };
}

const at = (rel) => join(CD, ...rel.split("/"));

test("@critical the purge plan lists every GSD path and no foreign file", () => {
  const gsd = [
    "gsd-core", "get-shit-done", "gsd-user-files-backup", "agents/gsd-x.md", "skills/gsd-y",
    "commands/gsd", "hooks/gsd-z.js", "hooks/lib/gsd-w.mjs",
  ].map(at);
  const foreign = ["agents/my-agent.md", "hooks/my-hook.mjs", "hooks/my-gsd-helper.mjs", "skills/notgsd"].map(at);
  const bundle = BUNDLE_RELS.map(at);
  const { list, exists } = fakeFs([...gsd, ...foreign, ...bundle, join(HOME, ".gsd")]);
  const { paths } = planGsdPurge({ claudeDir: CD, homeDir: HOME, list, exists });
  for (const p of [...gsd, ...bundle]) assert.ok(paths.includes(p), `missing ${p}`);
  assert.ok(paths.includes(join(HOME, ".gsd")));
  assert.equal(paths[paths.length - 1], join(HOME, ".gsd"));
  for (const p of foreign) assert.ok(!paths.includes(p), `foreign ${p} listed`);
});

test("@critical GSD hooks, statusLine, permissions and env are removed and the rest of settings is kept", () => {
  const settings = {
    hooks: {
      Stop: [{ hooks: [{ command: '"C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\x\\.claude\\hooks\\gsd-core\\hooks\\gsd-x.js"' }] }],
      PreToolUse: [{ matcher: "Bash", hooks: [
        { command: "node", args: ["C:\\Users\\x\\.claude\\hooks\\gsd-config-patch.mjs"] },
        { command: "node", args: ["C:/Users/x/.claude/hooks/my-hook.mjs"] },
      ] }],
      PostToolUse: [{ hooks: [{ command: "node", args: ["C:\\Users\\x\\.claude\\hooks\\db-live-access-gate.mjs"] }] }],
      Notification: [
        { hooks: [{ command: "node", args: ["~/.claude/hooks/secrets-gate.mjs"] }] },
        { hooks: [{ command: "node", args: ["D:\\proj\\gsd-notes\\run.js"] }] },
        { hooks: [{ command: "node", args: ["/w/add-risk.mjs"] }] },
      ],
      SessionStart: [{ hooks: [{ command: "node", args: ["C:\\Users\\x\\.claude\\add-risk.mjs"] }] }],
      UserPromptSubmit: [{ hooks: [{ command:
        '"C:/Program Files/nodejs/node.exe" "C:/Users/x/.claude/hooks/gsd-check-update.js"' }] }],
      PreCompact: [{ hooks: [{ command: "node", args: ["/cfg/claude-home/hooks/lib/context-mode-gsd-agents.mjs"] }] }],
    },
    statusLine: { type: "command", command: "node C:\\Users\\x\\.claude\\hooks\\gsd-statusline.js" },
    permissions: { allow: ["Bash(npm test)", "Read(C:/Users/x/.claude/gsd-core/**)",
      "Bash(node C:/Users/x/.claude/add-risk.mjs:*)", "Read(~/.claude/gsd-user-files-backup/**)",
      "Read(C:/Users/x/.claude/hooks/my-gsd-helper.mjs)", "Bash(npx gsd-core *)",
      "Read(~/code/gsd-tool/**)"], deny: ["Bash(rm:*)"] },
    env: { GSD_HOME: "C:\\Users\\x\\.gsd", EDITOR: "vim" },
  };
  const snapshot = JSON.parse(JSON.stringify(settings));
  const { settings: next, removed } = stripGsdSettings(settings, "/cfg/claude-home");
  assert.deepEqual(settings, snapshot, "input was mutated");
  assert.equal(next.hooks.Stop, undefined);
  assert.equal(next.hooks.PostToolUse, undefined);
  assert.deepEqual(next.hooks.PreToolUse, [{ matcher: "Bash", hooks: [
    { command: "node", args: ["C:/Users/x/.claude/hooks/my-hook.mjs"] },
  ] }]);
  assert.deepEqual(next.hooks.Notification, settings.hooks.Notification);
  assert.equal(next.hooks.SessionStart, undefined);
  assert.equal(next.hooks.UserPromptSubmit, undefined);
  assert.equal(next.hooks.PreCompact, undefined);
  assert.equal(next.statusLine, undefined);
  assert.deepEqual(next.permissions, { allow: ["Bash(npm test)", "Read(C:/Users/x/.claude/hooks/my-gsd-helper.mjs)",
    "Read(~/code/gsd-tool/**)"], deny: ["Bash(rm:*)"] });
  assert.deepEqual(next.env, { EDITOR: "vim" });
  assert.deepEqual(removed, ["Stop: 1 hook(s)", "PreToolUse: 1 hook(s)", "PostToolUse: 1 hook(s)",
    "SessionStart: 1 hook(s)", "UserPromptSubmit: 1 hook(s)", "PreCompact: 1 hook(s)", "statusLine",
    "permissions.allow: 4", "env.GSD_HOME"]);
});

test("@important references is listed only when the pilot doc is its sole file", () => {
  const pilot = at("references/gsd-claude-orchestration-pilot.md");
  const solo = fakeFs([pilot]);
  assert.ok(planGsdPurge({ claudeDir: CD, homeDir: HOME, ...solo }).paths.includes(at("references")));
  const shared = fakeFs([pilot, at("references/other.md")]);
  const plan = planGsdPurge({ claudeDir: CD, homeDir: HOME, ...shared });
  assert.ok(!plan.paths.includes(at("references")));
  assert.ok(plan.paths.includes(pilot));
  const alreadyEmpty = fakeFs([at("references")]);
  assert.ok(!planGsdPurge({ claudeDir: CD, homeDir: HOME, ...alreadyEmpty }).paths.includes(at("references")));
});

test("@important project-init GSD keys are removed, other keys kept, and each removal is named", () => {
  const projectInit = {
    "D:/a": { gsdModelConfigPatched: true, initialized: "x" },
    "D:/b": { gsdInitStackGapLastCheck: "2026-01-01", gsdWorkflowConfigPatched: true, other: 1 },
  };
  const { state, removedKeys } = stripProjectInitGsd(projectInit);
  assert.deepEqual(state, { "D:/a": { initialized: "x" }, "D:/b": { other: 1 } });
  assert.deepEqual(removedKeys, ["D:/a:gsdModelConfigPatched", "D:/b:gsdWorkflowConfigPatched",
    "D:/b:gsdInitStackGapLastCheck"]);
  const plan = planGsdPurge({ claudeDir: CD, homeDir: HOME, ...fakeFs([]), projectInit });
  assert.deepEqual(plan.state.next, state);
  assert.equal(plan.state.changed, true);
});

test("@important a machine with no GSD left yields an empty plan", () => {
  const plan = planGsdPurge({ claudeDir: CD, homeDir: HOME, ...fakeFs([]),
    settings: { hooks: { Stop: [] } }, projectInit: { "D:/a": { initialized: "x" } } });
  assert.equal(isEmptyPlan(plan), true);
});
