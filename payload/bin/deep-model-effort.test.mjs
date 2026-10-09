import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Hermetic CLAUDE_CONFIG_DIR so the profile-default fallback cannot read a real install.
const CLAUDE = mkdtempSync(join(tmpdir(), "ds-cmd-claude-"));
process.env.CLAUDE_CONFIG_DIR = CLAUDE;
// Never spawn the real background monitor from a test.
process.env.DS_NO_MONITOR = "1";

let main;
before(async () => { ({ main } = await import("./deep-model-effort.mjs")); });

function capture() {
  const out = [], err = [];
  const ol = console.log, oe = console.error;
  console.log = (...a) => out.push(a.join(" "));
  console.error = (...a) => err.push(a.join(" "));
  return { out, err, restore: () => { console.log = ol; console.error = oe; } };
}
function projectDir() { return mkdtempSync(join(tmpdir(), "ds-cmd-root-")); }
function levelFile(root) { return join(root, ".claude", "deepseek.json"); }

test("no argument prints the current level (off by default)", async () => {
  const root = projectDir(); const c = capture();
  try { const code = await main(["--root", root], root);
    assert.equal(code, 0);
    assert.match(c.out.join("\n"), /DeepSeek offload: off/);
  } finally { c.restore(); rmSync(root, { recursive: true, force: true }); }
});

test("setting a valid level writes it and prints it", async () => {
  const root = projectDir(); const c = capture();
  try { const code = await main(["medium", "--root", root], root);
    assert.equal(code, 0);
    assert.equal(JSON.parse(readFileSync(levelFile(root), "utf8")).level, "medium");
    assert.match(c.out.join("\n"), /DeepSeek offload: medium/);
  } finally { c.restore(); rmSync(root, { recursive: true, force: true }); }
});

test("@important an invalid level returns 2 and changes nothing", async () => {
  const root = projectDir(); const c = capture();
  try { const code = await main(["bogus", "--root", root], root);
    assert.equal(code, 2);
    assert.equal(existsSync(levelFile(root)), false);
    assert.match(c.err.join("\n"), /invalid level/);
  } finally { c.restore(); rmSync(root, { recursive: true, force: true }); }
});

test("@important full includes the relaunch hint", async () => {
  const root = projectDir(); const c = capture();
  try { const code = await main(["full", "--root", root], root);
    assert.equal(code, 0);
    assert.match(c.out.join("\n"), /relaunch|claude-deepseek\.ps1/);
  } finally { c.restore(); rmSync(root, { recursive: true, force: true }); }
});

test("--root targets the given directory, not cwd", async () => {
  const root = projectDir(); const c = capture();
  try { await main(["heavy", "--root", root], process.cwd());
    assert.equal(JSON.parse(readFileSync(levelFile(root), "utf8")).level, "heavy");
  } finally { c.restore(); rmSync(root, { recursive: true, force: true }); }
});

test.after(() => rmSync(CLAUDE, { recursive: true, force: true }));
