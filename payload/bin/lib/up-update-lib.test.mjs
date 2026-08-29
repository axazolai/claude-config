import { test } from "node:test";
import assert from "node:assert/strict";

import { join } from "node:path";
import { assess } from "./up-update-lib.mjs";

// A2: /up-update works through GitHub and never through a local checkout, and this plan creates no
// state under ~/.claude. Both are trivially easy to violate later by adding one convenience path,
// so the guard is structural rather than a comment nobody reads.

// ---------------------------------------------------------------------------------------------
// assess: the refusal conditions. The command's value is not that it updates - it is that it can
// say "I did not manage this" instead of producing a plausible-looking broken build. So every
// condition asserts the verdict AND the reason: a refusal that does not say which condition fired
// is not actionable.
const CFG = { thresholds: { changedFilesPct: 25, unclassifiedRefuses: true, attributionMissingRefuses: true } };
const CLEAN = {
  buildResult: { failed: [], failures: [], obsolete: [], residual: [], attributionMissing: [], mapDrift: { unclassified: [], added: [], removed: [], reclassified: [] } },
  upstreamDiff: { changedPct: 2, trackedChanged: [] },
  mainDrift: [],
  cfg: CFG,
};

test("@critical a delta that fails to apply refuses, and names the delta", () => {
  const a = assess({ ...CLEAN, buildResult: { ...CLEAN.buildResult, failed: ["003-plugin-version-source.patch"],
    failures: [{ name: "003-plugin-version-source.patch", detail: "context not found at ~line 208" }] } });
  assert.equal(a.verdict, "needs-work");
  assert.match(a.reasons.join(" "), /003-plugin-version-source\.patch/);
});

test("@critical upstream name surviving outside the protected slug refuses", () => {
  const a = assess({ ...CLEAN, buildResult: { ...CLEAN.buildResult,
    residual: [{ path: "plugins/ultrapowers/skills/x/SKILL.md", text: "SuperPowers" }] } });
  assert.equal(a.verdict, "needs-work");
  assert.match(a.reasons.join(" "), /SKILL\.md/);
});

test("@critical a large upstream diff refuses even when everything applied", () => {
  const a = assess({ ...CLEAN, upstreamDiff: { changedPct: 40, trackedChanged: [] } });
  assert.equal(a.verdict, "needs-work");
  assert.match(a.reasons.join(" "), /40%.*25%|25%.*40%/);
});

test("@critical a hand-edited main refuses, and names what was edited", () => {
  const a = assess({ ...CLEAN, mainDrift: ["plugins/ultrapowers/skills/brainstorming/SKILL.md"] });
  assert.equal(a.verdict, "needs-work");
  assert.match(a.reasons.join(" "), /brainstorming/);
});

test("@critical an upstream file the map does not classify refuses - this is what the manifest is for", () => {
  const a = assess({ ...CLEAN, buildResult: { ...CLEAN.buildResult,
    mapDrift: { unclassified: ["commands/new-thing.md"], added: [], removed: [], reclassified: [] } } });
  assert.equal(a.verdict, "needs-work");
  assert.match(a.reasons.join(" "), /commands\/new-thing\.md/);
});

test("@critical a new upstream file the manifest has not recorded refuses, quoting the proposed class", () => {
  const a = assess({ ...CLEAN, buildResult: { ...CLEAN.buildResult,
    mapDrift: { unclassified: [], added: [{ path: "skills/new-skill/SKILL.md", proposed: "tracked" }], removed: [], reclassified: [] } } });
  assert.equal(a.verdict, "needs-work");
  assert.match(a.reasons.join(" "), /skills\/new-skill\/SKILL\.md/);
});

test("@critical missing attribution refuses - the licence obligation is not negotiable", () => {
  const a = assess({ ...CLEAN, buildResult: { ...CLEAN.buildResult,
    attributionMissing: [{ path: "plugins/ultrapowers/README.md", detail: "missing required attribution: obra/superpowers", reason: "MIT attribution" }] } });
  assert.equal(a.verdict, "needs-work");
  assert.match(a.reasons.join(" "), /obra\/superpowers/);
});
