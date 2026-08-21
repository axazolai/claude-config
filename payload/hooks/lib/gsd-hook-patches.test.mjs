// payload/hooks/lib/gsd-hook-patches.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HOOK_PATCHES, checkGsdHookPatches, applyGsdHookPatches } from "./gsd-hook-patches.mjs";

const GUARD = "hooks/gsd-agent-isolation-guard.js";
const patch = () => HOOK_PATCHES.find((p) => p.file === GUARD);

function claudeDir({ version = "1.11.0", guard } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "gsd-hook-patches-"));
  mkdirSync(join(dir, "gsd-core"), { recursive: true });
  if (version !== null) writeFileSync(join(dir, "gsd-core", "VERSION"), `${version}\n`);
  if (guard !== undefined) {
    mkdirSync(join(dir, "hooks"), { recursive: true });
    writeFileSync(join(dir, "hooks", "gsd-agent-isolation-guard.js"), guard);
  }
  return dir;
}
const guardFile = (setLine) =>
  `#!/usr/bin/env node\n// gsd-hook-version: 1.11.0\n// preamble\n${setLine}\nfunction rest() {}\n`;

test("the registry patches gsd-core's isolation guard, and says why", () => {
  const p = patch();
  assert.ok(p, "the isolation-guard entry must exist");
  assert.match(p.from, /EXECUTOR_SUBAGENT_TYPES/);
  assert.match(p.to, /gsd-executor-decomposing/);
  assert.match(p.to, /'gsd-executor'/, "the upstream member must survive");
  assert.ok(typeof p.why === "string" && p.why.length > 20);
});

test("a guard still carrying upstream's one-element Set is patched", () => {
  const dir = claudeDir({ guard: guardFile(patch().from) });
  assert.deepEqual(checkGsdHookPatches({ claudeDir: dir })[patch().id], "pending");

  const res = applyGsdHookPatches({ claudeDir: dir });
  assert.deepEqual(res.applied, [patch().id]);
  const after = readFileSync(join(dir, "hooks", "gsd-agent-isolation-guard.js"), "utf8");
  assert.ok(after.includes(patch().to));
  assert.equal(checkGsdHookPatches({ claudeDir: dir })[patch().id], "current");
});

test("re-applying is a no-op, and never doubles the member", () => {
  const dir = claudeDir({ guard: guardFile(patch().from) });
  applyGsdHookPatches({ claudeDir: dir });
  const once = readFileSync(join(dir, "hooks", "gsd-agent-isolation-guard.js"), "utf8");
  const res2 = applyGsdHookPatches({ claudeDir: dir });
  assert.deepEqual(res2.applied, []);
  assert.equal(readFileSync(join(dir, "hooks", "gsd-agent-isolation-guard.js"), "utf8"), once);
  assert.equal((once.match(/gsd-executor-decomposing/g) || []).length, 1);
});

// The whole point of anchoring a line instead of hashing the file: a gsd-core upgrade that leaves
// the line alone keeps the patch working, and one that rewrites it is reported rather than guessed.
test("an upstream rewrite of the anchored line is reported as diverged, not forced", () => {
  const dir = claudeDir({ guard: guardFile("const EXECUTOR_SUBAGENT_TYPES = buildSet(catalog);") });
  assert.equal(checkGsdHookPatches({ claudeDir: dir })[patch().id], "diverged");
  const res = applyGsdHookPatches({ claudeDir: dir });
  assert.deepEqual(res.applied, []);
  assert.deepEqual(res.diverged, [patch().id]);
  assert.ok(!readFileSync(join(dir, "hooks", "gsd-agent-isolation-guard.js"), "utf8").includes("decomposing"),
    "a diverged file must be left exactly as it is");
});

test("gsd-core installed but too old to ship the guard reads as inert", () => {
  const dir = claudeDir({ version: "1.9.1" });
  assert.equal(checkGsdHookPatches({ claudeDir: dir })[patch().id], "inert");
  assert.deepEqual(applyGsdHookPatches({ claudeDir: dir }).applied, []);
});

test("no gsd-core at all is silence, not a status", () => {
  const dir = mkdtempSync(join(tmpdir(), "gsd-hook-patches-"));
  assert.deepEqual(checkGsdHookPatches({ claudeDir: dir }), {});
  assert.deepEqual(applyGsdHookPatches({ claudeDir: dir }).applied, []);
});
