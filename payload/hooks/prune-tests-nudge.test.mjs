// payload/hooks/prune-tests-nudge.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hasUntaggedTest, findUntaggedTests, MESSAGE } from "./prune-tests-nudge.mjs";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "prune-tests-nudge.mjs");

function scratch(build) {
  const dir = mkdtempSync(join(tmpdir(), "prune-nudge-"));
  mkdirSync(join(dir, ".git"), { recursive: true });
  build(dir);
  return dir;
}

const runHook = (payload) =>
  spawnSync(process.execPath, [HOOK], { input: JSON.stringify(payload), encoding: "utf8" }).stdout;

test("@important hasUntaggedTest sees an untagged JS declaration", () => {
  assert.equal(hasUntaggedTest('test("parses an empty header list", () => {});'), true);
  assert.equal(hasUntaggedTest('it("rounds half up", () => {});'), true);
});

test("@important hasUntaggedTest reads pytest and Go declarations", () => {
  assert.equal(hasUntaggedTest("def test_rounds_half_up():\n    pass"), true);
  assert.equal(hasUntaggedTest("def test_rounds_half_up():  # @important\n    pass"), false);
  assert.equal(hasUntaggedTest("func TestRoundsHalfUp(t *testing.T) {}"), true);
});

test("@important hasUntaggedTest reads the tag off an annotation's following line", () => {
  assert.equal(hasUntaggedTest('@Test\nfun `@critical rejects an expired token`() {}'), false);
  assert.equal(hasUntaggedTest('[Fact]\npublic void RoundsHalfUp() {}'), true);
});

test("@important hasUntaggedTest ignores prose that merely mentions a runner", () => {
  assert.equal(hasUntaggedTest("// run it (the suite) before pushing\nconst x = 1;"), false);
  assert.equal(hasUntaggedTest("// test (see the table below)\nconst x = 1;"), false);
});

test("@important hasUntaggedTest sees a parameterised declaration", () => {
  assert.equal(hasUntaggedTest('it.each([[1], [2]])("doubles %i", (n) => {});'), true);
  assert.equal(hasUntaggedTest('test.each([[1]])("@important doubles %i", (n) => {});'), false);
});

test("@important findUntaggedTests ignores build and dependency directories", () => {
  const dir = scratch((d) => {
    mkdirSync(join(d, "node_modules", "left-pad"), { recursive: true });
    writeFileSync(join(d, "node_modules", "left-pad", "index.test.js"), 'test("x", () => {});');
    mkdirSync(join(d, "dist"), { recursive: true });
    writeFileSync(join(d, "dist", "bundle.spec.js"), 'test("y", () => {});');
  });
  assert.equal(findUntaggedTests(dir), false);
  rmSync(dir, { recursive: true, force: true });
});

test("@important findUntaggedTests is false once every test is tagged", () => {
  const dir = scratch((d) => {
    mkdirSync(join(d, "src"), { recursive: true });
    writeFileSync(join(d, "src", "parser.test.mjs"), 'test("@critical parses", () => {});');
  });
  assert.equal(findUntaggedTests(dir), false);
  rmSync(dir, { recursive: true, force: true });
});

test("@important a push with untagged tests left emits the prune reminder", () => {
  const dir = scratch((d) => writeFileSync(join(d, "parser.test.mjs"), 'test("parses", () => {});'));
  const out = runHook({ tool_input: { command: "git push origin master" }, cwd: dir });
  assert.equal(JSON.parse(out).hookSpecificOutput.additionalContext, MESSAGE);
  rmSync(dir, { recursive: true, force: true });
});

test("@important a project carrying no tests is never asked to prune", () => {
  const dir = scratch((d) => {
    mkdirSync(join(d, "src"), { recursive: true });
    writeFileSync(join(d, "src", "index.mjs"), "export const x = 1;");
  });
  assert.equal(findUntaggedTests(dir), false);
  assert.equal(runHook({ tool_input: { command: "git push" }, cwd: dir }), "");
  rmSync(dir, { recursive: true, force: true });
});

test("@important the prune's own push does not re-raise the reminder", () => {
  const dir = scratch((d) => writeFileSync(join(d, "parser.test.mjs"), 'test("@important parses", () => {});'));
  assert.equal(runHook({ tool_input: { command: "git push" }, cwd: dir }), "");
  rmSync(dir, { recursive: true, force: true });
});

test("@important malformed hook input is swallowed", () => {
  const r = spawnSync(process.execPath, [HOOK], { input: "{not json", encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});
