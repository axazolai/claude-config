import { test } from "node:test";
import assert from "node:assert/strict";
import { check, legalEntries, rebaseConfig, PUBLISH_REFS } from "./up-update.mjs";

const CONFIG = {
  attribution: {
    require: [
      { path: "plugins/ultrapowers/README.md", contains: ["obra/superpowers"], reason: "MIT attribution: the fork must name upstream and state that it is a fork" },
    ],
  },
};
const INVENTORY = {
  rules: [
    { match: "skills/**", class: "tracked", reason: "the skills library" },
    { match: "LICENSE", class: "tracked", mode: "verbatim", reason: "MIT obligation: the copyright notice must survive redistribution" },
  ],
};

function fakes({ tags = ["upstream/6.2.0"], latest = "v6.2.0" } = {}) {
  const calls = [];
  return {
    calls,
    listRemoteTags(url) { calls.push(`ls-remote ${url}`); return tags; },
    async latestRelease(upstream) { calls.push(`release ${upstream}`); return latest; },
    async rawFile(owner, repo, branch, path) {
      calls.push(`raw ${owner}/${repo}@${branch}/${path}`);
      if (path.endsWith("config.json")) return JSON.stringify(CONFIG);
      if (path.endsWith("inventory.json")) return JSON.stringify(INVENTORY);
      throw new Error(`unexpected ${path}`);
    },
    async listDir() { calls.push("listDir"); return ["001-fallow-graft.patch", "readme.txt"]; },
  };
}

test("@important a newer upstream release reads as behind, naming both versions", async () => {
  const r = await check([], fakes({ latest: "v6.3.0" }));
  assert.equal(r.version.behind, true);
  assert.equal(r.version.have, "6.2.0");
  assert.equal(r.version.latest, "6.3.0");
});

test("@important the newest recorded base is used, not whichever tag came back first", async () => {
  const r = await check([], fakes({ tags: ["upstream/6.1.1", "upstream/6.2.0", "upstream/6.0.0"], latest: "v6.2.0" }));
  assert.equal(r.version.have, "6.2.0");
});

test("@important a fork with no recorded base is a problem, not a claim of being current", async () => {
  const r = await check([], fakes({ tags: [] }));
  assert.equal(r.version.current, false);
  assert.match(r.version.problem, /no upstream\/\* tag/);
});

test("@important --repo redirects every remote read for that run", async () => {
  const f = fakes();
  await check(["--repo", "someone/elses-fork"], f);
  assert.ok(f.calls.some((c) => c.includes("someone/elses-fork")));
  assert.ok(!f.calls.some((c) => c.includes("axazolai/ultrapowers")));
});

test("@important only real deltas are counted, not whatever else sits in the directory", async () => {
  const r = await check([], fakes());
  assert.deepEqual(r.deltas, ["001-fallow-graft.patch"]);
});

test("@important unreadable transform config degrades the report instead of failing the check", async () => {
  const f = fakes();
  f.rawFile = async () => { throw new Error("404"); };
  const r = await check([], f);
  assert.equal(r.version.current, true);
  assert.deepEqual(r.legal, []);
});

test("@important legal entries carry both the verbatim rules and the asserted attribution, with reasons", () => {
  const legal = legalEntries(CONFIG, INVENTORY);
  assert.deepEqual(legal.map((e) => e.path), ["LICENSE", "plugins/ultrapowers/README.md"]);
  for (const e of legal) assert.ok(e.reason && e.reason.length > 10);
});

test("@important a rebase onto a new upstream tag resets the revision to 1; the same tag keeps it", () => {
  const cfg = { originalTag: "upstream/6.3.0", originalTree: "aaa", version: { revision: 6, $why: "w" }, protect: ["x"] };
  const moved = rebaseConfig(cfg, "upstream/6.4.1", "bbb");
  assert.deepEqual(moved, { originalTag: "upstream/6.4.1", originalTree: "bbb", version: { revision: 1, $why: "w" }, protect: ["x"] });
  assert.equal(rebaseConfig(cfg, "upstream/6.3.0", "aaa").version.revision, 6);
});

test("@critical publishing force-pushes only original, never patch or main", () => {
  assert.deepEqual(PUBLISH_REFS.filter((r) => r.startsWith("+")), ["+original"]);
  assert.ok(PUBLISH_REFS.includes("patch") && PUBLISH_REFS.includes("main"));
});
