import { test } from "node:test";
import assert from "node:assert/strict";
import { validate } from "./validate.mjs";

test("@important validate: empty or whitespace -> bad_output", () => {
  assert.equal(validate("", {}).ok, false);
  assert.equal(validate("   \n", {}).ok, false);
  assert.equal(validate(null, {}).ok, false);
});

test("@important validate: json flag requires parseable JSON", () => {
  assert.equal(validate("{}", { json: true }).ok, true);
  assert.equal(validate('{"a":1}', { json: true }).ok, true);
  assert.equal(validate("not json", { json: true }).ok, false);
});

test("@important validate: needs substrings must all be present", () => {
  assert.equal(validate("has the code here", { needs: ["code"] }).ok, true);
  assert.equal(validate("missing it", { needs: ["code"] }).ok, false);
  assert.equal(validate("a and b", { needs: ["a", "b"] }).ok, true);
  assert.equal(validate("only a", { needs: ["a", "b"] }).ok, false);
});

test("validate: a bad check returns reason bad_output", () => {
  assert.deepEqual(validate("", {}), { ok: false, reason: "bad_output" });
});
