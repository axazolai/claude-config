import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSessionDefaultsPlan, describeSessionChange } from "./session-defaults.mjs";

const MANAGED = { model: "sonnet", effortLevel: "high" };

test("@important absent keys each produce a change, described as unset", () => {
  const changes = buildSessionDefaultsPlan({}, MANAGED);
  assert.deepEqual(changes, [
    { key: "model", from: undefined, to: "sonnet", conflict: false },
    { key: "effortLevel", from: undefined, to: "high", conflict: false },
  ]);
  assert.equal(describeSessionChange(changes[0]), "model: (unset) -> sonnet");
});

test("@important a key already at the managed value produces no change", () => {
  assert.deepEqual(buildSessionDefaultsPlan({ model: "sonnet", effortLevel: "high" }, MANAGED), []);
});

test("@important a different value is a conflict, described with the current value", () => {
  const changes = buildSessionDefaultsPlan({ model: "claude-opus-5-5" }, MANAGED);
  assert.deepEqual(changes, [
    { key: "model", from: "claude-opus-5-5", to: "sonnet", conflict: true },
    { key: "effortLevel", from: undefined, to: "high", conflict: false },
  ]);
  assert.equal(describeSessionChange(changes[0]), "model: claude-opus-5-5 -> sonnet");
});

test("@important one key correct and another conflicting reports only the conflicting change", () => {
  const changes = buildSessionDefaultsPlan({ model: "sonnet", effortLevel: "medium" }, MANAGED);
  assert.deepEqual(changes, [
    { key: "effortLevel", from: "medium", to: "high", conflict: true },
  ]);
});

test("@important a non-string current value is described via JSON.stringify, not string coercion", () => {
  const changes = buildSessionDefaultsPlan({ model: {} }, MANAGED);
  const modelChange = changes.find((c) => c.key === "model");
  assert.equal(describeSessionChange(modelChange), "model: {} -> sonnet");
});
