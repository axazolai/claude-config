import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "session-init.mjs");
const REGISTER = ["# Risk Register", "", "## RISK-X-001 - a pre-existing entry", "", "- **Status:** Open", ""].join("\n");
// Every optional step of the hook is switched off; the MCP suggestion test turns its own step back on.
const QUIET = {
  CLAUDE_COMPONENT_AUTOUPDATE: "0", CLAUDE_MCP_SUGGEST: "0",
  CLAUDE_STACK_RULES: "0", CLAUDE_LEANMODE: "0",
  CLAUDE_CURATED_AUTOMARK_ROOT: "0",
};

// `.git` is what findRoot latches onto; `planning: true` adds a `.planning/` directory too.
function withProject({ planning = false } = {}) {
  const base = mkdtempSync(join(tmpdir(), "session-init-"));
  const root = join(base, "proj");
  mkdirSync(join(root, ".git"), { recursive: true });
  if (planning) mkdirSync(join(root, ".planning"), { recursive: true });
  mkdirSync(join(base, "home", "state"), { recursive: true });
  return { base, root };
}
const run = (base, root, env = {}) => execFileSync("node", [HOOK], {
  input: JSON.stringify({ cwd: root }),
  encoding: "utf8",
  env: { ...process.env, ...QUIET, ...env, CLAUDE_CONFIG_DIR: join(base, "home") },
});
const ctx = (out) => JSON.parse(out).hookSpecificOutput.additionalContext;

test("@important a GitHub remote with no git-host MCP gets the /init-mcp suggestion on a base manifest", () => {
  const { base, root } = withProject();
  writeFileSync(join(base, "home", "state", "bundle-manifest.json"), JSON.stringify({ profile: "base" }));
  writeFileSync(join(root, ".git", "config"), '[remote "origin"]\n\turl = https://github.com/acme/app.git\n');
  mkdirSync(join(base, "home", "commands"), { recursive: true });
  writeFileSync(join(base, "home", "commands", "init-mcp.md"), "x");
  assert.match(ctx(run(base, root, { CLAUDE_MCP_SUGGEST: "1" })), /MCP suggestion: .*GitHub.*\/init-mcp/);
  // lite does not ship the command: no suggestion
  writeFileSync(join(base, "home", "state", "bundle-manifest.json"), JSON.stringify({ profile: "lite" }));
  rmSync(join(base, "home", "commands", "init-mcp.md"));
  assert.doesNotMatch(ctx(run(base, root, { CLAUDE_MCP_SUGGEST: "1" })), /MCP suggestion/);
  rmSync(base, { recursive: true, force: true });
});

test("@important a .planning project is left alone: no settings write, no risk-register edit, no config.json note", () => {
  const { base, root } = withProject({ planning: true });
  writeFileSync(join(root, ".planning", "CLAUDE.md"), "# planning notes\n");
  writeFileSync(join(root, ".planning", "RISK_REGISTER.md"), REGISTER);
  writeFileSync(join(root, "package.json"), "{}");
  writeFileSync(join(root, ".planning", "config.json"),
    JSON.stringify({ code_quality: { fallow: { enabled: true } }, workflow: {} }));
  for (const manifest of [null, { profile: "full" }, { profile: "base" }, { profile: "lite" }]) {
    if (manifest) writeFileSync(join(base, "home", "state", "bundle-manifest.json"), JSON.stringify(manifest));
    const out = ctx(run(base, root));
    assert.equal(existsSync(join(root, ".claude", "settings.json")), false);
    assert.equal(readFileSync(join(root, ".planning", "RISK_REGISTER.md"), "utf8"), REGISTER);
    assert.doesNotMatch(out, /GSD|fallow|test_command/);
  }
  rmSync(base, { recursive: true, force: true });
});

const gitignoreAt = (root) => readFileSync(join(root, ".claude", ".gitignore"), "utf8");

test("@important a project with no .claude/.gitignore gets one carrying the scratchpad", () => {
  const { base, root } = withProject();
  run(base, root);
  assert.equal(gitignoreAt(root), ".scratchpad/\n");
  rmSync(base, { recursive: true, force: true });
});

test("@important an existing .gitignore with no trailing newline keeps its lines and gains one", () => {
  const { base, root } = withProject();
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(join(root, ".claude", ".gitignore"), "local.log");
  run(base, root);
  assert.equal(gitignoreAt(root), "local.log\n.scratchpad/\n");
  rmSync(base, { recursive: true, force: true });
});

test("@important a second session does not re-append the scratchpad line", () => {
  const { base, root } = withProject();
  run(base, root);
  run(base, root);
  assert.equal(gitignoreAt(root).match(/^\.scratchpad\/$/gm).length, 1);
  rmSync(base, { recursive: true, force: true });
});

test("@important the session context names the project's testing mode", () => {
  const { base, root } = withProject();
  assert.match(ctx(run(base, root)), /Testing mode: test-after /);
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(join(root, ".claude", "ultrapowers.json"), '{ "tdd": true }');
  assert.match(ctx(run(base, root)), /Testing mode: tdd /);
  rmSync(base, { recursive: true, force: true });
});
