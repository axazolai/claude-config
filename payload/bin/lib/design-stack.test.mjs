import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { runInstaller, pruneProMaxSkills } from "./design-stack.mjs";


test("@critical pruneProMaxSkills removes only non-kept uipro skills, protecting others", () => {
  const dir = mkdtempSync(join(tmpdir(), "skills-"));
  for (const s of ["ui-ux-pro-max", "ui-styling", "design-system", "design", "brand", "slides", "impeccable", "shadcn"])
    mkdirSync(join(dir, s), { recursive: true });
  const removed = pruneProMaxSkills(dir, ["ui-ux-pro-max", "ui-styling", "design-system"],
    { protect: ["impeccable", "shadcn"] });
  assert.deepEqual(removed.sort(), ["brand", "design", "slides"]);
  for (const keep of ["ui-ux-pro-max", "ui-styling", "design-system", "impeccable", "shadcn"])
    assert.ok(existsSync(join(dir, keep)), `${keep} must survive`);
  rmSync(dir, { recursive: true, force: true });
});


test("@critical runInstaller isolates HOME/USERPROFILE from the real home", () => {
  const root = mkdtempSync(join(tmpdir(), "ri-root-"));
  // write a test script to avoid shell escaping issues
  const testScript = join(root, "test.mjs");
  writeFileSync(testScript, "process.stdout.write(process.env.USERPROFILE||process.env.HOME||'')");
  // child prints the home it sees; runInstaller must have overridden it to a scratch dir
  const r = runInstaller("node", [testScript], { root });
  assert.equal(r.skipped, false);
  assert.ok(r.ok, r.stderr);
  const childHome = r.stdout.trim();
  assert.ok(childHome.length > 0, "child saw no home");
  assert.notEqual(childHome, homedir(), "child must NOT see the real home dir");
  rmSync(root, { recursive: true, force: true });
});

