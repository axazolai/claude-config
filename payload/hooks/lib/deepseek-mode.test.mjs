import { test } from "node:test";
import assert from "node:assert/strict";
import { retryBudget } from "./deepseek-mode.mjs";







test("@critical retryBudget: full matrix of extra attempts", () => {
  assert.equal(retryBudget("light", "light"), 1);
  assert.equal(retryBudget("light", "medium"), 1);
  assert.equal(retryBudget("light", "heavy"), 0);
  assert.equal(retryBudget("medium", "light"), 3);
  assert.equal(retryBudget("medium", "medium"), 2);
  assert.equal(retryBudget("medium", "heavy"), 1);
  assert.equal(retryBudget("heavy", "light"), 5);
  assert.equal(retryBudget("heavy", "medium"), 3);
  assert.equal(retryBudget("heavy", "heavy"), 2);
  assert.equal(retryBudget("off", "light"), 0);
  assert.equal(retryBudget("full", "medium"), 0);
  assert.equal(retryBudget("medium", "bogus"), 0);
});
