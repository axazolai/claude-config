// payload/hooks/lib/gsd-skill-patches.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SKILL_PATCHES,
  applyGsdSkillPatches,
  checkGsdSkillPatches,
} from "./gsd-skill-patches.mjs";

const skillFixture = (effort) =>
  `---\nname: gsd-plan-phase\ndescription: Plan a phase.\neffort: ${effort}\n---\n\nBody of the skill.\n`;

// Write a skills/<name>/SKILL.md tree, return the claudeDir root.
function makeClaudeDir(skills) {
  const dir = mkdtempSync(join(tmpdir(), "gsd-skill-patches-"));
  for (const [name, content] of Object.entries(skills)) {
    mkdirSync(join(dir, "skills", name), { recursive: true });
    writeFileSync(join(dir, "skills", name, "SKILL.md"), content);
  }
  return dir;
}
const bySkill = () => Object.fromEntries(SKILL_PATCHES.map((p) => [p.skill, p]));
const effortOf = (dir, skill) =>
  readFileSync(join(dir, "skills", skill, "SKILL.md"), "utf8").match(/^effort: (\S+)$/m)[1];

test("the three effort patches are registered, each with its own target", () => {
  const patches = bySkill();
  assert.deepEqual(Object.keys(patches).sort(), ["gsd-autonomous", "gsd-execute-phase", "gsd-plan-phase"]);
  for (const p of SKILL_PATCHES) {
    assert.equal(p.key, "effort");
    assert.ok(p.from.includes("max"));
  }
  assert.equal(patches["gsd-plan-phase"].to, "xhigh");
  assert.equal(patches["gsd-autonomous"].to, "xhigh");
  assert.equal(patches["gsd-execute-phase"].to, "high");
});

test("gsd-core 1.10.0 ships `high`, and the two xhigh targets still re-tune it", () => {
  const patches = bySkill();
  assert.ok(patches["gsd-plan-phase"].from.includes("high"));
  assert.ok(patches["gsd-autonomous"].from.includes("high"));

  const dir = makeClaudeDir({
    "gsd-plan-phase": skillFixture("high"),
    "gsd-autonomous": skillFixture("high"),
  });
  const res = applyGsdSkillPatches({ claudeDir: dir });
  assert.equal(res.applied.length, 2);
  assert.deepEqual(res.skippedForeign, []);
  assert.equal(effortOf(dir, "gsd-plan-phase"), "xhigh");
  assert.equal(effortOf(dir, "gsd-autonomous"), "xhigh");
  assert.deepEqual(checkGsdSkillPatches({ claudeDir: dir }), {});
});

test("gsd-execute-phase on gsd-core 1.10.0's `high` is already current — no write", () => {
  const dir = makeClaudeDir({ "gsd-execute-phase": skillFixture("high") });
  const res = applyGsdSkillPatches({ claudeDir: dir });
  assert.deepEqual(res.applied, []);
  assert.deepEqual(res.skippedForeign, []);
  assert.equal(effortOf(dir, "gsd-execute-phase"), "high");
  assert.deepEqual(checkGsdSkillPatches({ claudeDir: dir }), {});
});

test("gsd-execute-phase still on the pre-1.10.0 `max` is pulled down to high", () => {
  const dir = makeClaudeDir({ "gsd-execute-phase": skillFixture("max") });
  assert.ok(checkGsdSkillPatches({ claudeDir: dir })["gsd-execute-phase/SKILL.md"]);
  const res = applyGsdSkillPatches({ claudeDir: dir });
  assert.ok(res.applied.some((e) => e.startsWith("gsd-execute-phase/SKILL.md")));
  assert.equal(effortOf(dir, "gsd-execute-phase"), "high");
  assert.deepEqual(checkGsdSkillPatches({ claudeDir: dir }), {});
});

test("fresh apply rewrites effort max -> xhigh and clears pending", () => {
  const dir = makeClaudeDir({ "gsd-plan-phase": skillFixture("max") });
  // RED precondition: pending before apply.
  assert.ok(checkGsdSkillPatches({ claudeDir: dir })["gsd-plan-phase/SKILL.md"]);

  const res = applyGsdSkillPatches({ claudeDir: dir });
  assert.ok(res.applied.some((e) => e.startsWith("gsd-plan-phase/SKILL.md")));

  assert.equal(effortOf(dir, "gsd-plan-phase"), "xhigh");
  // Nothing pending after apply.
  assert.deepEqual(checkGsdSkillPatches({ claudeDir: dir }), {});
});

test("re-apply is idempotent (no second write)", () => {
  const dir = makeClaudeDir({ "gsd-plan-phase": skillFixture("max") });
  applyGsdSkillPatches({ claudeDir: dir });
  const res2 = applyGsdSkillPatches({ claudeDir: dir });
  assert.deepEqual(res2.applied, []);
});

test("a user-chosen foreign value is left untouched", () => {
  const dir = makeClaudeDir({ "gsd-plan-phase": skillFixture("medium") });
  const res = applyGsdSkillPatches({ claudeDir: dir });
  assert.equal(res.applied.length, 0);
  assert.ok(res.skippedForeign.some((e) => e.startsWith("gsd-plan-phase/SKILL.md")));
  assert.equal(effortOf(dir, "gsd-plan-phase"), "medium");
  assert.deepEqual(checkGsdSkillPatches({ claudeDir: dir }), {});
});

test("a curated skill file is skipped, not rewritten", () => {
  const curated = "<!-- CURATED:NOEDIT -->\n" + skillFixture("max");
  const dir = makeClaudeDir({ "gsd-plan-phase": curated });
  const res = applyGsdSkillPatches({ claudeDir: dir });
  assert.equal(res.applied.length, 0);
  assert.ok(res.skippedCurated.includes("gsd-plan-phase/SKILL.md"));
  assert.equal(effortOf(dir, "gsd-plan-phase"), "max");
});

test("an absent skill directory is a silent no-op", () => {
  const dir = makeClaudeDir({}); // no skills at all
  const res = applyGsdSkillPatches({ claudeDir: dir });
  assert.deepEqual(res.applied, []);
  assert.deepEqual(checkGsdSkillPatches({ claudeDir: dir }), {});
});
