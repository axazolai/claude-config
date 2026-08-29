// payload/bin/lib/model-migration.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { migrateSettingsModel, migrateProjectModelConfig } from "./model-migration.mjs";

// ---- migrateSettingsModel: tier-preserving, non-clobber ----

test("@important superseded opus ids migrate to claude-opus-5", () => {
  for (const id of ["claude-opus-4-8", "claude-opus-4-1", "claude-3-opus-20240229"]) {
    const r = migrateSettingsModel(id);
    assert.equal(r.changed, true, `${id} should be flagged`);
    assert.equal(r.value, "claude-opus-5");
    assert.equal(r.from, id);
  }
});

test("@important aliases are left untouched (opus[1m] is the deliberate exception)", () => {
  for (const id of ["opus", "sonnet", "haiku", "fable", "sonnet[1m]"]) {
    const r = migrateSettingsModel(id);
    assert.equal(r.changed, false, `${id} must not change`);
    assert.equal(r.value, id);
  }
});

test("@important unknown / future ids are never mis-flagged", () => {
  for (const id of ["claude-opus-6", "claude-opus-6-1", "gpt-4o", "", undefined]) {
    const r = migrateSettingsModel(id);
    assert.equal(r.changed, false, `${id} must not change`);
    assert.equal(r.value, id);
  }
});

// ---- migrateProjectModelConfig: surgical §6.3 re-migration ----

const OLD_OVERRIDES = {
  "gsd-planner": "opus",
  "gsd-pattern-mapper": "haiku",
  "gsd-integration-checker": "haiku",
  "gsd-nyquist-auditor": "haiku",
  "gsd-ui-checker": "haiku",
  "gsd-ui-auditor": "haiku",
  "gsd-verifier": "sonnet",
  "gsd-doc-verifier": "haiku",
};

test("@important all six §6.3 roles migrate old -> new", () => {
  const { config, changes } = migrateProjectModelConfig({ model_overrides: { ...OLD_OVERRIDES } });
  assert.equal(config.model_overrides["gsd-pattern-mapper"], "sonnet");
  assert.equal(config.model_overrides["gsd-integration-checker"], "sonnet");
  assert.equal(config.model_overrides["gsd-nyquist-auditor"], "sonnet");
  assert.equal(config.model_overrides["gsd-ui-checker"], "sonnet");
  assert.equal(config.model_overrides["gsd-ui-auditor"], "sonnet");
  assert.equal(config.model_overrides["gsd-verifier"], "opus");
  assert.equal(changes.length, 6);
  // Untouched roles stay put.
  assert.equal(config.model_overrides["gsd-planner"], "opus");
  assert.equal(config.model_overrides["gsd-doc-verifier"], "haiku");
});

test("@critical a foreign (user-chosen) value is left untouched", () => {
  const { config, changes } = migrateProjectModelConfig({
    model_overrides: { "gsd-pattern-mapper": "opus", "gsd-verifier": "sonnet" },
  });
  assert.equal(config.model_overrides["gsd-pattern-mapper"], "opus", "user value kept");
  // only gsd-verifier (holds the known-old value) migrates
  assert.deepEqual(changes.map((c) => c.role), ["gsd-verifier"]);
});

test("@critical the input config object is not mutated", () => {
  const input = { model_overrides: { "gsd-verifier": "sonnet" } };
  migrateProjectModelConfig(input);
  assert.equal(input.model_overrides["gsd-verifier"], "sonnet", "original must be untouched");
});
