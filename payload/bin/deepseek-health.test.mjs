import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pickInterval, shouldExit, classify, checkOnce, MIN10, MIN30, HR2 } from "./deepseek-health.mjs";

let savedKey;
afterEach(() => { if (savedKey === undefined) delete process.env.LLM_KEY; else process.env.LLM_KEY = savedKey; });
function withKey(v) { savedKey = process.env.LLM_KEY; if (v === undefined) delete process.env.LLM_KEY; else process.env.LLM_KEY = v; }

test("@important pickInterval: 10min when non-off and active, else 30min", () => {
  assert.equal(pickInterval({ level: "medium", idleMs: 0 }), MIN10);
  assert.equal(pickInterval({ level: "medium", idleMs: MIN30 + 1 }), MIN30);
  assert.equal(pickInterval({ level: "off", idleMs: 0 }), MIN30);
});

test("@important shouldExit: at or past 2h idle", () => {
  assert.equal(shouldExit({ idleMs: HR2 }), true);
  assert.equal(shouldExit({ idleMs: HR2 - 1 }), false);
});

test("@critical classify: grey/blue/green/red", () => {
  assert.equal(classify({ haveKey: false }), "grey");
  assert.equal(classify({ ciscoUp: false }), "blue");
  assert.equal(classify({ ciscoUp: true, reachable: true }), "green");
  assert.equal(classify({ ciscoUp: true, reachable: false }), "red");
});

test("@important checkOnce: reachable backend -> green cache file", async () => {
  withKey("sk-test");
  const dir = mkdtempSync(join(tmpdir(), "ds-health-"));
  try {
    const c = await checkOnce({ claudeDir: dir, detect: () => ({ present: true, up: true }),
      fetchImpl: async () => ({ status: 200 }), now: 1000 });
    assert.equal(c.status, "green");
    const onDisk = JSON.parse(readFileSync(join(dir, "state", "deepseek-health.json"), "utf8"));
    assert.equal(onDisk.status, "green");
    assert.equal(onDisk.checkedAt, new Date(1000).toISOString());
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("@important checkOnce: unreachable backend -> red; cisco down -> blue (no fetch)", async () => {
  withKey("sk-test");
  const dir = mkdtempSync(join(tmpdir(), "ds-health-"));
  try {
    const red = await checkOnce({ claudeDir: dir, detect: () => ({ present: true, up: true }),
      fetchImpl: async () => { throw new Error("refused"); } });
    assert.equal(red.status, "red");
    let fetched = false;
    const blue = await checkOnce({ claudeDir: dir, detect: () => ({ present: true, up: false }),
      fetchImpl: async () => { fetched = true; return { status: 200 }; } });
    assert.equal(blue.status, "blue");
    assert.equal(fetched, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("checkOnce: no key -> grey", async () => {
  withKey(undefined);
  const dir = mkdtempSync(join(tmpdir(), "ds-health-"));
  try {
    const c = await checkOnce({ claudeDir: dir, detect: () => ({ present: true, up: true }), fetchImpl: async () => ({ status: 200 }) });
    assert.equal(c.status, "grey");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
