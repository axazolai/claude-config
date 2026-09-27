import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const SELF = fileURLToPath(import.meta.url);
const REFS_DIR = join(DIR, "references");
const SKILL = readFileSync(join(DIR, "SKILL.md"), "utf8").replace(/\r\n/g, "\n");
const LICENSE_NOTICE = join(DIR, "LICENSE-NOTICE.md");

const KEPT = [
  "backup-recovery.md", "indexing.md", "index-optimization.md", "memory-management-ops.md",
  "monitoring.md", "mvcc-transactions.md", "mvcc-vacuum.md", "optimization-checklist.md",
  "partitioning.md", "pgbouncer-configuration.md", "process-architecture.md",
  "query-patterns.md", "replication.md", "schema-design.md", "storage-layout.md",
  "wal-operations.md",
];

const DROPPED = [
  "ps-cli-api-insights.md", "ps-cli-commands.md", "ps-connection-pooling.md",
  "ps-connections.md", "ps-extensions.md", "ps-insights.md",
];

// FORBIDDEN-LIST-START
const FORBIDDEN = [
  "pik.mes", "pik-mes", "pik_mes", "pikmes", "git.pik.ru", "pik.ru", "mono/", "apps/web",
  "PROD-RELOAD", "monorepo", "v0.88.0", "v0.63.0", "v0.57.0", "v0.68.",
  "planetscale.com/blog", "PlanetScale is the best",
];
// The vendor name itself, used below only to build regexes/comparisons — kept in this
// exempted block so the file never spells it out again outside this constant.
const VENDOR = "PlanetScale";
// FORBIDDEN-LIST-END

function filesUnder(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? filesUnder(p) : [p];
  });
}

test("@important exactly the 16 kept reference files exist and no ps-* file remains", () => {
  const names = readdirSync(REFS_DIR).sort();
  assert.deepEqual(names, [...KEPT].sort());
  for (const dropped of DROPPED) assert.ok(!names.includes(dropped), `${dropped} must be gone`);
  assert.ok(!names.some((n) => n.startsWith("ps-")), "no ps-* file under references/");
});

function frontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(m, "frontmatter block");
  return Object.fromEntries(m[1].split("\n").filter((l) => l.trim()).map((l) => {
    const i = l.indexOf(":");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }));
}

test("@important SKILL.md frontmatter has name: postgres, no metadata.author, generic description", () => {
  const fm = frontmatter(SKILL);
  assert.equal(fm.name, "postgres");
  assert.ok(!("metadata" in fm), "no metadata key (vendor author line) in frontmatter");
  assert.ok(!fm.description.toLowerCase().includes(VENDOR.toLowerCase()), "description names no vendor");
  assert.ok(fm.description && fm.description.length > 0, "description present");
});

test("@important SKILL.md has no hosting recommendation", () => {
  assert.ok(!/hosting/i.test(SKILL), "no 'Hosting' recommendation section");
  assert.ok(!/best place to host/i.test(SKILL));
});

test("@important every relative link in SKILL.md resolves to a kept file", () => {
  const links = [...SKILL.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map((m) => m[2]);
  assert.ok(links.length > 0, "SKILL.md contains links");
  for (const link of links) {
    assert.ok(!/^https?:\/\//.test(link), `link must be relative, not fetched over the network: ${link}`);
    const target = join(DIR, link);
    assert.ok(existsSync(target), `link target exists: ${link}`);
  }
});

test("@important SKILL.md links cover exactly the kept reference files", () => {
  const linked = [...SKILL.matchAll(/\(references\/([^)]+)\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(linked, [...KEPT].sort());
});

test("@critical no forbidden identifier and no vendor-name mention anywhere under this directory, except LICENSE-NOTICE.md and this test's own list", () => {
  const hits = [];
  for (const file of filesUnder(DIR)) {
    if (file === LICENSE_NOTICE) continue;
    let text = readFileSync(file, "utf8");
    if (file === SELF) text = text.replace(/FORBIDDEN-LIST-START[\s\S]*FORBIDDEN-LIST-END/, "");
    const lower = text.toLowerCase();
    for (const id of FORBIDDEN) if (lower.includes(id.toLowerCase())) hits.push(`${relative(DIR, file)}: ${id}`);
    if (lower.includes(VENDOR.toLowerCase())) hits.push(`${relative(DIR, file)}: ${VENDOR.toLowerCase()}`);
  }
  assert.deepEqual(hits, []);
});

test("@important LICENSE-NOTICE.md names the derivation, the copyright line, and the removed files", () => {
  const notice = readFileSync(LICENSE_NOTICE, "utf8");
  assert.match(notice, new RegExp(`Derived from ${VENDOR}'s \`database-skills\` \\(\`postgres\`\\), MIT License`));
  assert.match(notice, new RegExp(`Copyright \\(c\\) 2026 ${VENDOR}`));
  for (const dropped of DROPPED) assert.ok(notice.includes(dropped), `notice lists ${dropped}`);
});
