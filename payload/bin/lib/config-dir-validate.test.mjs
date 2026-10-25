// payload/bin/lib/config-dir-validate.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, symlinkSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateConfigDir } from "./config-dir-validate.mjs";

const isWin = process.platform === "win32";
const FIXED = () => "Fixed"; // fake drive-type: treat as a local fixed disk

function tmp() { return realpathSync(mkdtempSync(join(tmpdir(), "cdv-"))); }



test("@critical rejects a symlink/junction in the path", (t) => {
  const base = tmp();
  try {
    const real = join(base, "real"); mkdirSync(real);
    const link = join(base, "link");
    try { symlinkSync(real, link, isWin ? "junction" : "dir"); } catch { return t.skip("symlink unavailable"); }
    const r = validateConfigDir(join(link, "config"), FIXED);
    assert.equal(r.ok, false);
    assert.match(r.error, /symlink|junction/i);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

if (isWin) {

  test("@critical rejects UNC paths and Windows-illegal characters", () => {
    assert.equal(validateConfigDir("\\\\server\\share\\x", FIXED).ok, false);
    assert.equal(validateConfigDir("D:\\a<b", FIXED).ok, false);
  });
}
