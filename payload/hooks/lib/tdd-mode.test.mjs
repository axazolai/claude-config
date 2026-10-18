import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveTddMode } from "./tdd-mode.mjs";
import { main } from "../../bin/ultrapowers-tdd.mjs";

function project({ switchText, planning } = {}) {
  const root = mkdtempSync(join(tmpdir(), "tdd-mode-"));
  mkdirSync(join(root, ".git"));
  if (switchText !== undefined) {
    mkdirSync(join(root, ".claude"));
    writeFileSync(join(root, ".claude", "ultrapowers.json"), switchText);
  }
  if (planning) {
    mkdirSync(join(root, ".planning"));
    writeFileSync(join(root, ".planning", "config.json"), JSON.stringify(planning, null, 2));
  }
  return root;
}
const readJSON = (p) => JSON.parse(readFileSync(p, "utf8"));
const quiet = (fn) => { const log = console.log; console.log = () => {}; try { return fn(); } finally { console.log = log; } };

test("@important the mode is test-after unless the switch says tdd: true", () => {
  const cases = [
    [undefined, "test-after"],
    ["{}", "test-after"],
    ['{ "tdd": false }', "test-after"],
    ['{ "tdd": "yes" }', "test-after"],
    ["not json", "test-after"],
    ['{ "tdd": true }', "tdd"],
  ];
  for (const [switchText, want] of cases) {
    const root = project({ switchText });
    assert.equal(resolveTddMode(root), want, String(switchText));
    rmSync(root, { recursive: true, force: true });
  }
});

test("@important enable writes the switch, keeps its other keys, and leaves .planning/config.json alone", () => {
  const planning = { project_code: "CK", workflow: { tdd_mode: false, code_review: true } };
  const root = project({ switchText: '{ "note": "kept" }', planning });
  assert.equal(quiet(() => main(["enable", "--root", root])), 0);
  assert.deepEqual(readJSON(join(root, ".claude", "ultrapowers.json")), { note: "kept", tdd: true });
  assert.equal(resolveTddMode(root), "tdd");
  assert.equal(quiet(() => main(["disable", "--root", root])), 0);
  assert.equal(resolveTddMode(root), "test-after");
  assert.deepEqual(readJSON(join(root, ".planning", "config.json")), planning);
  rmSync(root, { recursive: true, force: true });
});

test("@important an unknown argument changes nothing", () => {
  const root = project();
  const err = console.error; console.error = () => {};
  try { assert.equal(main(["on", "--root", root]), 2); } finally { console.error = err; }
  assert.equal(resolveTddMode(root), "test-after");
  rmSync(root, { recursive: true, force: true });
});

test("@important a malformed switch file stops the command and is left as it was", () => {
  const root = project({ switchText: "{ broken" });
  const err = console.error; console.error = () => {};
  try { assert.equal(main(["enable", "--root", root]), 1); } finally { console.error = err; }
  assert.equal(resolveTddMode(root), "test-after");
  assert.equal(readFileSync(join(root, ".claude", "ultrapowers.json"), "utf8"), "{ broken");
  rmSync(root, { recursive: true, force: true });
});
