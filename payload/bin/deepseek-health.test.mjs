import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classify } from "./deepseek-health.mjs";

// Empty config dir so dsConfig() reads no real deepseek.config.json — only env LLM_KEY drives haveKey.
const savedDir = process.env.CLAUDE_CONFIG_DIR;
const emptyCfg = mkdtempSync(join(tmpdir(), "ds-health-cfg-"));
process.env.CLAUDE_CONFIG_DIR = emptyCfg;

let savedKey;
afterEach(() => { if (savedKey === undefined) delete process.env.LLM_KEY; else process.env.LLM_KEY = savedKey; });
test.after(() => { rmSync(emptyCfg, { recursive: true, force: true }); if (savedDir === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = savedDir; });



test("@critical classify: grey/blue/green/red", () => {
  assert.equal(classify({ haveKey: false }), "grey");
  assert.equal(classify({ ciscoUp: false }), "blue");
  assert.equal(classify({ ciscoUp: true, reachable: true }), "green");
  assert.equal(classify({ ciscoUp: true, reachable: false }), "red");
});



