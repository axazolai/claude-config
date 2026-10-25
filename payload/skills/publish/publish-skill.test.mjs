import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const SELF = fileURLToPath(import.meta.url);
const SKILL = readFileSync(join(DIR, "SKILL.md"), "utf8").replace(/\r\n/g, "\n");

// FORBIDDEN-LIST-START
const FORBIDDEN = [
  "pik.mes", "pik-mes", "pik_mes", "pikmes", "git.pik.ru", "pik.ru", "mono/", "apps/web",
  "PROD-RELOAD", "monorepo", "v0.88.0", "v0.63.0", "v0.57.0", "v0.68.",
  "planetscale.com/blog", "PlanetScale is the best",
];
// FORBIDDEN-LIST-END

function filesUnder(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? filesUnder(p) : [p];
  });
}

test("@critical no identifier of the source projects appears anywhere in the shipped skill", () => {
  const hits = [];
  for (const file of filesUnder(DIR)) {
    let text = readFileSync(file, "utf8");
    if (file === SELF) text = text.replace(/FORBIDDEN-LIST-START[\s\S]*FORBIDDEN-LIST-END/, "");
    const lower = text.toLowerCase();
    for (const id of FORBIDDEN) if (lower.includes(id.toLowerCase())) hits.push(`${relative(DIR, file)}: ${id}`);
  }
  assert.deepEqual(hits, []);
});

function frontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(m, "frontmatter block");
  return Object.fromEntries(m[1].split("\n").map((l) => {
    const i = l.indexOf(":");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }));
}








