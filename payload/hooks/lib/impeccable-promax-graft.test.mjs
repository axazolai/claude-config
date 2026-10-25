import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyPromaxGraft, SENTINEL, ANCHORS } from "./impeccable-promax-graft.mjs";





test("@critical missing/renamed reference file is skipped, never corrupted", () => {
  const dir = mkdtempSync(join(tmpdir(), "graft-empty-"));
  mkdirSync(join(dir, "impeccable", "reference"), { recursive: true });
  const r = applyPromaxGraft({ skillsDir: dir });
  assert.deepEqual(r.applied, []);
  assert.deepEqual(r.skippedNoAnchor.sort(), Object.keys(ANCHORS).sort());
  rmSync(dir, { recursive: true, force: true });
});

test("@critical file present but anchor absent is skipped, never corrupted", () => {
  // distinct from the missing-file case above: the file EXISTS with content but has no `## `
  // heading, so applyPromaxGraft's `at < 0` branch must skip it (not insert at offset 0).
  const dir = mkdtempSync(join(tmpdir(), "graft-noanchor-"));
  const refDir = join(dir, "impeccable", "reference");
  mkdirSync(refDir, { recursive: true });
  for (const file of Object.keys(ANCHORS))
    writeFileSync(join(refDir, file), `# ${file}\n\nprose with no level-two heading\n`);
  const r = applyPromaxGraft({ skillsDir: dir });
  assert.deepEqual(r.applied, []);
  assert.deepEqual(r.skippedNoAnchor.sort(), Object.keys(ANCHORS).sort());
  for (const file of Object.keys(ANCHORS))
    assert.ok(!readFileSync(join(refDir, file), "utf8").includes(SENTINEL), `${file} must be untouched`);
  rmSync(dir, { recursive: true, force: true });
});
