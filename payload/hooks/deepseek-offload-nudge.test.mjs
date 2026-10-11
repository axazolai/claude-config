import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readNudge, bashNudge } from "./deepseek-offload-nudge.mjs";

function file(lines) {
  const dir = mkdtempSync(join(tmpdir(), "ds-nudge-"));
  const p = join(dir, "a.txt");
  writeFileSync(p, "x\n".repeat(lines));
  return { p, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("@important Read nudges only a whole read of a file over 300 lines", () => {
  const big = file(400), small = file(50);
  try {
    assert.equal(readNudge({ file_path: big.p }), "read");
    assert.equal(readNudge({ file_path: big.p, limit: 100 }), null);
    assert.equal(readNudge({ file_path: big.p, offset: 10 }), null);
    assert.equal(readNudge({ file_path: small.p }), null);
    assert.equal(readNudge({ file_path: join(small.p, "..", "missing.txt") }), null);
  } finally { big.cleanup(); small.cleanup(); }
});

test("@important Bash nudges long-output commands unless the output is bounded or redirected", () => {
  assert.equal(bashNudge({ command: "git log" }), "bash");
  assert.equal(bashNudge({ command: "git diff main" }), "bash");
  assert.equal(bashNudge({ command: "node run-tests.mjs" }), "bash");
  assert.equal(bashNudge({ command: "git log --oneline -20" }), null);
  assert.equal(bashNudge({ command: "git diff --stat" }), null);
  assert.equal(bashNudge({ command: "npm test | tail -20" }), null);
  assert.equal(bashNudge({ command: "npm test > out.txt" }), null);
  assert.equal(bashNudge({ command: "ls -la" }), null);
});
