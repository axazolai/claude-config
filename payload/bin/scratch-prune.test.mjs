import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { outsideTmp } from "./scratch-prune.mjs";

test("@important apply refuses a plan that reaches outside <scratchpad>/tmp/", () => {
  const tmpChild = join("D:", "p", ".claude", ".scratchpad", "tmp", "agg.py");
  const rootChild = join("D:", "p", ".claude", ".scratchpad", "archive_cutoffs.json");
  const nested = join("D:", "p", ".claude", ".scratchpad", "tmp", "pylib", "a.py");
  assert.equal(outsideTmp([{ absPath: tmpChild }]), null);
  assert.equal(outsideTmp([{ absPath: tmpChild }, { absPath: rootChild }]), rootChild);
  assert.equal(outsideTmp([{ absPath: nested }]), nested);
  assert.equal(outsideTmp({ items: [] }), "items is not an array");
});
