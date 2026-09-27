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

test("@important frontmatter names the skill, its four modes and the exact argument hint", () => {
  const fm = frontmatter(SKILL);
  assert.equal(fm.name, "publish");
  for (const mode of ["/publish dev", "/publish prod", "/publish fast", "/publish step"])
    assert.ok(fm.description.includes(mode), `description names ${mode}`);
  assert.equal(fm["argument-hint"],
    '"dev | prod [X.Y.Z] | fast | step [X.Y.Z] [--dry-run] [--reconfigure] [--agent-merge] [--no-watch]"');
});

const h2 = () => [...SKILL.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());

test("@important body sections come in the required order", () => {
  const want = ["Settings", "Hard rules", "Mode: dev", "Mode: prod", "Mode: fast", "Mode: step",
    "Host specifics", "No CI/CD path", "Dry run", "Report format"];
  assert.deepEqual(h2(), want);
});

test("@important settings section carries the publish.json schema and the interview", () => {
  const settings = SKILL.split(/^## /m).find((s) => s.startsWith("Settings"));
  const json = JSON.parse(settings.match(/```json\n([\s\S]*?)```/)[1]);
  for (const k of ["host", "remote", "branches", "cli", "ci", "version", "changelog", "tests", "merge"])
    assert.ok(k in json, `schema has ${k}`);
  assert.match(settings, /### Interview/);
  assert.match(settings, /one question at a time/);
});

test("@important host specifics cover glab and gh pipelines and merges", () => {
  const host = SKILL.split(/^## /m).find((s) => s.startsWith("Host specifics"));
  for (const s of ["glab mr create", "glab ci status", "glab ci view", "glab mr merge",
    "gh pr create", "gh run watch", "gh pr merge"]) assert.ok(host.includes(s), s);
});

const WRITE = /git merge (?!-base)|git push|git tag -a|git branch -d|git branch <|git commit|mr create|pr create|mr merge|pr merge|\/retry|chore\(release\)|merge command|^\d+\. (Merge|Tag|Push|Delete|Freeze|Open the MR|Launch|Uncommitted|Version bump)/m;
const MARK = /Dry run: (printed, skipped|the filled brief is printed)/;

test("@important every writing step is marked as printed and skipped under --dry-run", () => {
  const sections = SKILL.split(/^## /m).slice(1)
    .filter((s) => /^(Mode: |No CI\/CD path|Host specifics)/.test(s));
  const unmarked = [];
  for (const section of sections) {
    const title = section.split("\n")[0];
    const chunks = title.startsWith("Mode: ") ? section.split(/^### /m).slice(1)
      : section.split(/^- \*\*|^### /m);
    for (const chunk of chunks) {
      // A table of host commands documents syntax; it is not a step.
      const body = chunk.split("\n").filter((l) => !l.startsWith("|")).join("\n");
      if (WRITE.test(body) && !MARK.test(body)) unmarked.push(`${title} / ${chunk.split("\n")[0]}`);
    }
  }
  assert.deepEqual(unmarked, []);
});

test("@important step mode dispatches the subagent brief that ships beside the skill", () => {
  assert.match(SKILL, /step-subagent-brief\.md/);
  const brief = readFileSync(join(DIR, "step-subagent-brief.md"), "utf8");
  assert.match(brief, /only push is `git push <remote> <dev>`/);
  assert.match(brief, /FAILURE REPORT/);
});
