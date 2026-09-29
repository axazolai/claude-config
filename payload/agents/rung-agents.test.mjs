import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const skill = readFileSync(here("../skills/model-selection-policy/SKILL.md"), "utf8").replace(/\r\n/g, "\n");
const ROW = /^\| (\d) \| `(rung-[a-z-]+)` \| `(\w+)` \| (?:`(\w+)`|none) \|$/gm;
const rows = [...skill.matchAll(ROW)].map((m) => ({ agent: m[2], model: m[3], effort: m[4] ?? null }));

const frontmatter = (agent) => {
  const text = readFileSync(here(`./${agent}.md`), "utf8").replace(/\r\n/g, "\n");
  const block = /^---\n([\s\S]*?)\n---/.exec(text)[1];
  return Object.fromEntries(block.split("\n").map((l) => { const i = l.indexOf(":"); return [l.slice(0, i), l.slice(i + 1).trim()]; }));
};

test("@important every ladder row has an agent whose name, model and effort match, and inherits tools", () => {
  assert.equal(rows.length, 5);
  for (const r of rows) {
    const fm = frontmatter(r.agent);
    assert.equal(fm.name, r.agent);
    assert.equal(fm.model, r.model);
    assert.equal(fm.effort ?? null, r.effort, `${r.agent} effort`);
    assert.equal("tools" in fm, false, `${r.agent} must inherit tools`);
  }
});

test("@important no rung agent exists outside the ladder table", () => {
  const files = readdirSync(here("./")).filter((f) => /^rung-.*\.md$/.test(f)).map((f) => f.replace(/\.md$/, "")).sort();
  assert.deepEqual(files, rows.map((r) => r.agent).sort());
});
