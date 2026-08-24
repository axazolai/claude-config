import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "./claude-code-changelog.mjs";

function tmpClaudeDir(stateEntry) {
  const dir = mkdtempSync(join(tmpdir(), "cc-cli-"));
  if (stateEntry !== undefined) {
    mkdirSync(join(dir, "state"), { recursive: true });
    writeFileSync(join(dir, "state", "component-updates.json"),
      JSON.stringify({ "claude-code-cli": stateEntry }));
  }
  return dir;
}

function captureLogs() {
  const lines = [];
  const orig = console.log;
  console.log = (...a) => lines.push(a.join(" "));
  return { lines, restore: () => { console.log = orig; } };
}

test("main: no state file at all -> friendly message, exit 0", async () => {
  const dir = tmpClaudeDir(undefined);
  const cap = captureLogs();
  const code = await main(dir, async () => "unused");
  cap.restore();
  assert.equal(code, 0);
  assert.match(cap.lines.join("\n"), /no component-update state/i);
  rmSync(dir, { recursive: true, force: true });
});

test("main: no claude-code-cli entry recorded -> friendly message, exit 0", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-cli-noentry-"));
  mkdirSync(join(dir, "state"), { recursive: true });
  writeFileSync(join(dir, "state", "component-updates.json"), JSON.stringify({ graphify: {} }));
  const cap = captureLogs();
  const code = await main(dir, async () => "unused");
  cap.restore();
  assert.equal(code, 0);
  assert.match(cap.lines.join("\n"), /no claude code cli update/i);
  rmSync(dir, { recursive: true, force: true });
});

test("main: already on the latest known version -> says so, exit 0", async () => {
  const dir = tmpClaudeDir({ installed: "2.1.241", latest: "2.1.241", updateAvailable: false });
  const cap = captureLogs();
  const code = await main(dir, async () => "unused");
  cap.restore();
  assert.equal(code, 0);
  assert.match(cap.lines.join("\n"), /already on the latest/i);
  rmSync(dir, { recursive: true, force: true });
});

test("main: prints the changelog slice for a real range", async () => {
  const dir = tmpClaudeDir({ installed: "2.1.240", latest: "2.1.241", updateAvailable: true });
  const fake = async () => ["## 2.1.241", "", "- New thing", "", "## 2.1.240", "", "- Old thing", ""].join("\n");
  const cap = captureLogs();
  const code = await main(dir, fake);
  cap.restore();
  assert.equal(code, 0);
  assert.match(cap.lines.join("\n"), /## 2\.1\.241/);
  assert.match(cap.lines.join("\n"), /New thing/);
  assert.doesNotMatch(cap.lines.join("\n"), /Old thing/);
  rmSync(dir, { recursive: true, force: true });
});

test("main: fetch failure -> clear error, exit 1", async () => {
  const dir = tmpClaudeDir({ installed: "2.1.240", latest: "2.1.241", updateAvailable: true });
  const failing = async () => { throw new Error("offline"); };
  const origErr = console.error;
  const errLines = [];
  console.error = (...a) => errLines.push(a.join(" "));
  const code = await main(dir, failing);
  console.error = origErr;
  assert.equal(code, 1);
  assert.match(errLines.join("\n"), /offline/);
  rmSync(dir, { recursive: true, force: true });
});

test("main: non-semver installed/latest -> refuses to slice, exit 0, fetcher never called", async () => {
  const dir = tmpClaudeDir({ installed: "nightly", latest: "canary", updateAvailable: true });
  const cap = captureLogs();
  const neverFetch = async () => { throw new Error("fetcher must not be called"); };
  const code = await main(dir, neverFetch);
  cap.restore();
  assert.equal(code, 0);
  assert.match(cap.lines.join("\n"), /not plain X\.Y\.Z/);
  assert.match(cap.lines.join("\n"), /nightly/);
  assert.match(cap.lines.join("\n"), /canary/);
  rmSync(dir, { recursive: true, force: true });
});

test("main: malformed JSON in state file -> friendly message, exit 0", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cc-cli-badjson-"));
  mkdirSync(join(dir, "state"), { recursive: true });
  writeFileSync(join(dir, "state", "component-updates.json"), "{ broken json truncated");
  const cap = captureLogs();
  const code = await main(dir, async () => "unused");
  cap.restore();
  assert.equal(code, 0);
  assert.match(cap.lines.join("\n"), /no component-update state/i);
  rmSync(dir, { recursive: true, force: true });
});
