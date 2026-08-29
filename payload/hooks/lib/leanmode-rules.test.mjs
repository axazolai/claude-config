import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveEffectiveLevel, loadRuleText } from "./leanmode-rules.mjs";

function tmpRoot(leanmodeJson) {
  const root = mkdtempSync(join(tmpdir(), "lm-"));
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(join(root, ".claude", "leanmode.json"), JSON.stringify(leanmodeJson));
  return root;
}

test("@important explicit dial resolves default agent baseline", () => {
  const root = tmpRoot({ dial: "full", default: "full" });
  assert.equal(resolveEffectiveLevel("some-unmapped-agent", root), "full");
  rmSync(root, { recursive: true, force: true });
});

test("@important override wins over default", () => {
  const root = tmpRoot({ dial: "full", default: "full", overrides: { "x": "lite" } });
  assert.equal(resolveEffectiveLevel("x", root), "lite");
  rmSync(root, { recursive: true, force: true });
});

test("@important loadRuleText returns tier file content and empty for off", () => {
  assert.equal(loadRuleText("off"), "");
  assert.ok(loadRuleText("full").length > 0);
});
