import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8").replace(/\r\n/g, "\n");
const FULL = read("./SKILL.md");
const LITE = read("../../../payload-lite/skills/model-selection-policy/SKILL.md");
const ROWS = [
  "| 1 | `rung-haiku` | `haiku` | `medium` |",
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

// Data rows of the markdown table whose header row starts with `header`, split into trimmed cells.
const tableRows = (text, header) => {
  const lines = text.split("\n");
  const rows = [];
  for (let i = lines.findIndex((l) => l.startsWith(header)) + 2; lines[i]?.startsWith("|"); i++) {
    rows.push(lines[i].split("|").slice(1, -1).map((c) => c.trim()));
  }
  return rows;
};

test("@important heavy reviews start on Opus at medium, small work starts on Haiku, and both skills carry the brainstorming rule", () => {
  for (const row of [
    "| Task reviewer, logic, security or concurrency | 4 |", '| Verification ("was the goal met") | 4 |', "| Final whole-branch review | 4 |",
    "| Task reviewer, small mechanical diff | 1 |", "| Scoped re-review of a fix | 1 |", "| Implementer, small change in one file | 1 |",
  ]) {
    assert.ok(FULL.includes(row), `full skill lacks ${row}`);
  }
  for (const [name, text] of [["full", FULL], ["lite", LITE]]) {
    assert.match(text, /recommend `\/effort high`/, name);
    assert.match(text, /Heavy review/, name);
    assert.match(text, /Every track starts on \*\*`medium`\*\*/, name);
  }
});

test("@important no track and no role starts on a high-effort rung", () => {
  for (const [name, text] of [["full", FULL], ["lite", LITE]]) {
    const tracks = tableRows(text, "| Track |");
    assert.ok(tracks.length >= 4, `${name} track table not found`);
    for (const [track, start] of tracks) assert.notEqual(start, "5", `${name}: ${track}`);
  }
  const roles = tableRows(FULL, "| Role |");
  assert.ok(roles.length >= 10, "role map not found");
  for (const [role, start] of roles) assert.notEqual(start, "5", role);
});
