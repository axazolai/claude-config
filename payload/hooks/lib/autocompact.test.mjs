import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAutocompact, observationFrom, promotePending } from "./autocompact.mjs";

test("@important resolveAutocompact: an explicit env override wins", () => {
  const r = resolveAutocompact({ windowSize: 1_000_000, modelId: "m", state: null,
    env: { CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: "80" }, enabled: true });
  assert.deepEqual(r, { tokens: 800000, source: "env" });
});

test("@important resolveAutocompact: an observation for this model beats the assumption", () => {
  const state = { models: { m: { tokens: 835000, windowSize: 1_000_000 } } };
  assert.deepEqual(resolveAutocompact({ windowSize: 1_000_000, modelId: "m", state, env: {}, enabled: true }),
    { tokens: 835000, source: "observed" });
});

test("@important resolveAutocompact: an observation for another model is not borrowed", () => {
  const state = { models: { other: { tokens: 180000, windowSize: 200000 } } };
  assert.deepEqual(resolveAutocompact({ windowSize: 1_000_000, modelId: "m", state, env: {}, enabled: true }),
    { tokens: 1_000_000, source: "assumed" });
});

test("@important resolveAutocompact: with nothing known the point is the window itself", () => {
  assert.deepEqual(resolveAutocompact({ windowSize: 200000, modelId: "m", state: null, env: {}, enabled: true }),
    { tokens: 200000, source: "assumed" });
});

test("@important resolveAutocompact: compaction turned off means there is nothing to warn about", () => {
  assert.deepEqual(resolveAutocompact({ windowSize: 200000, modelId: "m",
    state: { models: { m: { tokens: 100000 } } }, env: {}, enabled: false }),
    { tokens: 200000, source: "disabled" });
});

test("@important resolveAutocompact: a junk env value is ignored, not obeyed", () => {
  for (const v of ["0", "-5", "101", "abc", ""]) {
    assert.equal(resolveAutocompact({ windowSize: 200000, modelId: "m", state: null,
      env: { CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: v }, enabled: true }).source, "assumed");
  }
});

test("@important observationFrom: sums the last assistant usage", () => {
  const records = [
    { type: "user", message: { content: "hi" } },
    { type: "assistant", message: { model: "claude-opus-5", usage: { input_tokens: 1, output_tokens: 2,
      cache_creation_input_tokens: 3, cache_read_input_tokens: 4 } } },
    { type: "assistant", message: { model: "claude-opus-5", usage: { input_tokens: 10, output_tokens: 20,
      cache_creation_input_tokens: 30, cache_read_input_tokens: 40 } } },
  ];
  assert.deepEqual(observationFrom(records), { tokens: 100, model: "claude-opus-5" });
});

test("@important promotePending: an unkeyed record becomes a keyed one and the pending clears", () => {
  const state = { pending: { tokens: 835000, model: "claude-opus-5", at: "2026-07-30T18:00:00Z" } };
  const { next, changed } = promotePending(state, { modelId: "claude-opus-5[1m]", windowSize: 1_000_000 });
  assert.equal(changed, true);
  assert.equal(next.pending, undefined);
  assert.equal(next.models["claude-opus-5[1m]"].tokens, 835000);
  assert.equal(next.models["claude-opus-5[1m]"].windowSize, 1_000_000);
});

test("@important promotePending: a figure bigger than this window is discarded, not promoted", () => {
  const state = { pending: { tokens: 835000, model: "claude-opus-5", at: "2026-07-30T18:00:00Z" },
    models: { "claude-sonnet-5": { tokens: 100000, windowSize: 200000 } } };
  const { next, changed } = promotePending(state, { modelId: "claude-opus-5", windowSize: 200000 });
  assert.equal(changed, true);
  assert.equal(next.pending, undefined);
  // Discarded, not wiped: an unrelated model's entry must survive the clamp branch.
  assert.deepEqual(next.models, { "claude-sonnet-5": { tokens: 100000, windowSize: 200000 } });
});

test("@important promotePending: does not mutate the caller's original state object", () => {
  const state = { pending: { tokens: 835000, model: "claude-opus-5", at: "2026-07-30T18:00:00Z" } };
  const before = JSON.parse(JSON.stringify(state));
  promotePending(state, { modelId: "claude-opus-5[1m]", windowSize: 1_000_000 });
  assert.deepEqual(state, before);
});
