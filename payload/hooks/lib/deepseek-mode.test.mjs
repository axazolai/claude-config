import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LEVELS, resolveLevel, setLevel, retryBudget } from "./deepseek-mode.mjs";

function tmp() {
  const d = mkdtempSync(join(tmpdir(), "ds-mode-"));
  return { root: d, claudeDir: d, cleanup: () => rmSync(d, { recursive: true, force: true }) };
}
function writeProject(root, obj) {
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(join(root, ".claude", "deepseek.json"), typeof obj === "string" ? obj : JSON.stringify(obj));
}
function writeDefaults(claudeDir, obj) {
  writeFileSync(join(claudeDir, "deepseek-defaults.json"), JSON.stringify(obj));
}

test("@important resolveLevel: project file wins", () => {
  const t = tmp();
  try { writeProject(t.root, { level: "heavy" }); writeDefaults(t.claudeDir, { level: "light" });
    assert.equal(resolveLevel(t.root, t.claudeDir), "heavy"); } finally { t.cleanup(); }
});

test("@important resolveLevel: falls back to profile default when no project file", () => {
  const t = tmp();
  try { writeDefaults(t.claudeDir, { level: "medium" });
    assert.equal(resolveLevel(t.root, t.claudeDir), "medium"); } finally { t.cleanup(); }
});

test("resolveLevel: neither file -> off", () => {
  const t = tmp();
  try { assert.equal(resolveLevel(t.root, t.claudeDir), "off"); } finally { t.cleanup(); }
});

test("@important resolveLevel: malformed project JSON falls through, never throws", () => {
  const t = tmp();
  try {
    writeProject(t.root, "{not json");
    writeDefaults(t.claudeDir, { level: "medium" });
    assert.equal(resolveLevel(t.root, t.claudeDir), "medium");
    // and with no defaults either -> off, still no throw
    rmSync(join(t.claudeDir, "deepseek-defaults.json"));
    assert.equal(resolveLevel(t.root, t.claudeDir), "off");
  } finally { t.cleanup(); }
});

test("@important resolveLevel: invalid level value is treated as absent", () => {
  const t = tmp();
  try { writeProject(t.root, { level: "bogus" }); writeDefaults(t.claudeDir, { level: "light" });
    assert.equal(resolveLevel(t.root, t.claudeDir), "light"); } finally { t.cleanup(); }
});

test("@important setLevel: writes a valid level and rejects an invalid one", () => {
  const t = tmp();
  try {
    const r = setLevel(t.root, "light");
    assert.deepEqual(r, { level: "light", file: join(t.root, ".claude", "deepseek.json") });
    assert.equal(JSON.parse(readFileSync(r.file, "utf8")).level, "light");
    assert.throws(() => setLevel(t.root, "bogus"), /invalid level/);
    // unchanged after the rejected write
    assert.equal(JSON.parse(readFileSync(r.file, "utf8")).level, "light");
  } finally { t.cleanup(); }
});

test("setLevel: preserves other keys in the config", () => {
  const t = tmp();
  try {
    writeProject(t.root, { level: "off", note: "keep me" });
    setLevel(t.root, "heavy");
    const cfg = JSON.parse(readFileSync(join(t.root, ".claude", "deepseek.json"), "utf8"));
    assert.equal(cfg.level, "heavy");
    assert.equal(cfg.note, "keep me");
  } finally { t.cleanup(); }
});

test("@critical retryBudget: full matrix of extra attempts", () => {
  assert.equal(retryBudget("light", "light"), 1);
  assert.equal(retryBudget("light", "medium"), 1);
  assert.equal(retryBudget("light", "heavy"), 0);
  assert.equal(retryBudget("medium", "light"), 3);
  assert.equal(retryBudget("medium", "medium"), 2);
  assert.equal(retryBudget("medium", "heavy"), 1);
  assert.equal(retryBudget("heavy", "light"), 5);
  assert.equal(retryBudget("heavy", "medium"), 3);
  assert.equal(retryBudget("heavy", "heavy"), 2);
  assert.equal(retryBudget("off", "light"), 0);
  assert.equal(retryBudget("full", "medium"), 0);
  assert.equal(retryBudget("medium", "bogus"), 0);
});

test("LEVELS lists the five levels in order", () => {
  assert.deepEqual(LEVELS, ["off", "light", "medium", "heavy", "full"]);
});
