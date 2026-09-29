import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8").replace(/\r\n/g, "\n");
const FULL = read("./SKILL.md");
const LITE = read("../../../payload-lite/skills/model-selection-policy/SKILL.md");
const ROWS = [
  "| 1 | `rung-haiku` | `haiku` | none |",
  "| 2 | `rung-sonnet-medium` | `sonnet` | `medium` |",
  "| 3 | `rung-sonnet-high` | `sonnet` | `high` |",
  "| 4 | `rung-opus-medium` | `opus` | `medium` |",
  "| 5 | `rung-opus-high` | `opus` | `high` |",
];

test("@important both skills carry the five-rung ladder and no high-first effort advice", () => {
  for (const [name, text] of [["full", FULL], ["lite", LITE]]) {
    for (const row of ROWS) assert.ok(text.includes(row), `${name} lacks ${row}`);
    assert.doesNotMatch(text, /Start \*\*`high`\*\*/, name);
    assert.match(text, /## Sonnet 5\.5/, name);
    assert.match(text, /DEFAULT executor: \*\*claude-sonnet-5-5\*\*/, name);
  }
});

test("@important only the full skill carries the role → start rung map", () => {
  assert.match(FULL, /## Ultrapowers dispatch: role → start rung/);
  assert.doesNotMatch(LITE, /role → start rung/);
});
