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

function makeClaudeDir(skills) {
  const dir = mkdtempSync(join(tmpdir(), "gsd-skill-patches-"));
  for (const [name, content] of Object.entries(skills)) {
    mkdirSync(join(dir, "skills", name), { recursive: true });
    writeFileSync(join(dir, "skills", name, "SKILL.md"), content);
  }
  return dir;
}

// gsd-core #3151 removed `effort:` from skill frontmatter because a static value changes
// output_config.effort on invocation and invalidates the CALLER's prompt cache. Re-inserting it
// would reintroduce that cost, so the registry is empty on purpose and there is no per-skill
// effort lever left — per-agent effort moved to `effort.agent_overrides` in the defaults partial.
test("the registry is empty, and that is the intended state", () => {
  assert.deepEqual(SKILL_PATCHES, []);
});

test("an empty registry touches nothing and reports nothing pending", () => {
  const dir = makeClaudeDir({ "gsd-plan-phase": skillFixture("high") });
  const before = readFileSync(join(dir, "skills", "gsd-plan-phase", "SKILL.md"), "utf8");

  const res = applyGsdSkillPatches({ claudeDir: dir });
  assert.deepEqual(res.applied, []);
  assert.deepEqual(res.skippedForeign, []);
  assert.deepEqual(res.skippedCurated, []);
  assert.deepEqual(res.skippedNoKey, []);
  assert.deepEqual(checkGsdSkillPatches({ claudeDir: dir }), {});

  const after = readFileSync(join(dir, "skills", "gsd-plan-phase", "SKILL.md"), "utf8");
  assert.equal(after, before, "an empty registry must not rewrite a skill file");
});

test("a skill tree that is not there at all is still a silent no-op", () => {
  const dir = makeClaudeDir({});
  assert.deepEqual(applyGsdSkillPatches({ claudeDir: dir }).applied, []);
  assert.deepEqual(checkGsdSkillPatches({ claudeDir: dir }), {});
});

// The machinery is kept because it is generic over the registry: a future skill-side frontmatter
// re-tune (some other key — not effort) needs an entry, not a rewrite. This pins the shape an
// entry must have, so a malformed one fails here rather than silently doing nothing in the field.
test("every registry entry, if any is ever added, carries the fields the applier reads", () => {
  for (const p of SKILL_PATCHES) {
    assert.equal(typeof p.id, "string");
    assert.equal(typeof p.skill, "string");
    assert.equal(typeof p.key, "string");
    assert.ok(Array.isArray(p.from), `${p.id}: 'from' must be a list`);
    assert.equal(typeof p.to, "string");
    assert.ok(!p.key.includes("effort"), `${p.id}: effort is resolved by gsd-core at install time, not patched in`);
  }
});
