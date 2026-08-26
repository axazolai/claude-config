import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVer, compareVer, parseChangelogSections, sliceChangelogRange, formatChangelogSlice, fetchChangelogSlice }
  from "./claude-code-changelog-lib.mjs";

test("parseVer: parses plain X.Y.Z, rejects junk", () => {
  assert.deepEqual(parseVer("2.1.241"), { major: 2, minor: 1, patch: 241 });
  assert.equal(parseVer("not-a-version"), null);
  assert.equal(parseVer(undefined), null);
});

test("compareVer: orders by major, then minor, then patch", () => {
  assert.ok(compareVer(parseVer("2.1.241"), parseVer("2.1.240")) > 0);
  assert.ok(compareVer(parseVer("2.1.240"), parseVer("2.1.241")) < 0);
  assert.equal(compareVer(parseVer("2.1.241"), parseVer("2.1.241")), 0);
  assert.ok(compareVer(parseVer("2.2.0"), parseVer("2.1.999")) > 0);
});

const SAMPLE = [
  "# Changelog",
  "",
  "## 2.1.241",
  "",
  "- Bug fixes and reliability improvements",
  "",
  "## 2.1.240",
  "",
  "- Bug fixes and reliability improvements",
  "",
  "## 2.1.239",
  "",
  "- Added a thing",
  "- Fixed a thing",
  "",
].join("\n");

test("parseChangelogSections: reads version + bullets, in source order", () => {
  const sections = parseChangelogSections(SAMPLE);
  assert.deepEqual(sections.map((s) => s.version), ["2.1.241", "2.1.240", "2.1.239"]);
  assert.deepEqual(sections[2].bullets, ["Added a thing", "Fixed a thing"]);
});

test("sliceChangelogRange: (from, to] — excludes from, includes to", () => {
  const slice = sliceChangelogRange(SAMPLE, "2.1.239", "2.1.240");
  assert.deepEqual(slice.map((s) => s.version), ["2.1.240"]);
});

test("sliceChangelogRange: multi-version gap after several skipped sessions", () => {
  const slice = sliceChangelogRange(SAMPLE, "2.1.238", "2.1.241");
  assert.deepEqual(slice.map((s) => s.version), ["2.1.241", "2.1.240", "2.1.239"]);
});

test("sliceChangelogRange: empty when already at the latest version", () => {
  assert.deepEqual(sliceChangelogRange(SAMPLE, "2.1.241", "2.1.241"), []);
});

test("formatChangelogSlice: renders headings + bullets; empty slice is empty string", () => {
  const out = formatChangelogSlice(sliceChangelogRange(SAMPLE, "2.1.240", "2.1.241"));
  assert.equal(out, "## 2.1.241\n- Bug fixes and reliability improvements");
  assert.equal(formatChangelogSlice([]), "");
});

test("fetchChangelogSlice: uses the injected fetcher, never the real network", async () => {
  let calls = 0;
  const fakeFetch = async () => { calls++; return SAMPLE; };
  const slice = await fetchChangelogSlice("2.1.239", "2.1.241", fakeFetch);
  assert.equal(calls, 1);
  assert.deepEqual(slice.map((s) => s.version), ["2.1.241", "2.1.240"]);
});
