import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SKILL = readFileSync(fileURLToPath(new URL("./SKILL.md", import.meta.url)), "utf8").replace(/\r\n/g, "\n");
const ROWS = [
  "| 1 | `rung-haiku` | `haiku` | `medium` |",
  "| 2 | `rung-sonnet-medium` | `sonnet` | `medium` |",
  "| 3 | `rung-sonnet-high` | `sonnet` | `high` |",
  "| 4 | `rung-opus-medium` | `opus` | `medium` |",
  "| 5 | `rung-opus-high` | `opus` | `high` |",
];

test("@important the skill carries the five-rung ladder, the role map and no high-first effort advice", () => {
  for (const row of ROWS) assert.ok(SKILL.includes(row), `lacks ${row}`);
  assert.doesNotMatch(SKILL, /Start \*\*`high`\*\*/);
  assert.match(SKILL, /## Sonnet 5\.5/);
  assert.match(SKILL, /DEFAULT executor: \*\*claude-sonnet-5-5\*\*/);
  assert.match(SKILL, /## Ultrapowers dispatch: role → start rung/);
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

test("@important heavy reviews start on Opus at medium, small work starts on Haiku, and the brainstorming rule is present", () => {
  for (const row of [
    "| Task reviewer, logic, security or concurrency | 4 |", '| Verification ("was the goal met") | 4 |', "| Final whole-branch review | 4 |",
    "| Task reviewer, small mechanical diff | 1 |", "| Scoped re-review of a fix | 1 |", "| Implementer, small change in one file | 1 |",
  ]) {
    assert.ok(SKILL.includes(row), `skill lacks ${row}`);
  }
  assert.match(SKILL, /recommend `\/effort high`/);
  assert.match(SKILL, /Heavy review/);
  assert.match(SKILL, /Every track starts on \*\*`medium`\*\*/);
});

test("@important no track and no role starts on a high-effort rung", () => {
  const tracks = tableRows(SKILL, "| Track |");
  assert.ok(tracks.length >= 4, "track table not found");
  for (const [track, start] of tracks) assert.notEqual(start, "5", track);
  const roles = tableRows(SKILL, "| Role |");
  assert.ok(roles.length >= 10, "role map not found");
  for (const [role, start] of roles) assert.notEqual(start, "5", role);
});
