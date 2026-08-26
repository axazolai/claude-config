import { test } from "node:test";
import assert from "node:assert/strict";
import { COMPONENTS } from "./component-registry.mjs";

test("impeccable registry entry carries afterUpdate=promax-graft", () => {
  const imp = COMPONENTS.find((c) => c.name === "impeccable");
  assert.equal(imp.scope, "project");
  assert.equal(imp.afterUpdate, "promax-graft");
});

test("projectProbe present() is false when the skill dir is absent (no throw)", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const root = mkdtempSync(join(tmpdir(), "probe-"));
  // dynamic import of the worker's projectProbe requires it be exported; export it for testability.
  const mod = await import("./component-update-check-run.mjs");
  const probe = mod.projectProbe("impeccable", root);
  assert.equal(probe.present(), false);
  rmSync(root, { recursive: true, force: true });
});

test("updateAndRegraft re-applies the graft AFTER the update clobbers the reference files", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { SENTINEL, ANCHORS } = await import("./impeccable-promax-graft.mjs");
  const mod = await import("./component-update-check-run.mjs");

  const root = mkdtempSync(join(tmpdir(), "uar-"));
  const refDir = join(root, ".claude", "skills", "impeccable", "reference");
  mkdirSync(refDir, { recursive: true });
  const writeClean = () => { for (const f of Object.keys(ANCHORS)) writeFileSync(join(refDir, f), `# ${f}\n\n## Steps\nbody\n`); };
  writeClean();
  // fake update = what `impeccable update` really does: overwrite reference/*.md (dropping any graft)
  const probe = { update: () => writeClean() };
  const comp = { afterUpdate: "promax-graft" };

  mod.updateAndRegraft({ probe, comp, root });

  // if regraft ran BEFORE the (clobbering) update, the sentinel would be gone; its presence proves ordering
  for (const f of Object.keys(ANCHORS))
    assert.ok(readFileSync(join(refDir, f), "utf8").includes(SENTINEL), `${f} must carry the graft after updateAndRegraft`);
  rmSync(root, { recursive: true, force: true });
});

test("checkClaudeCodeUpdate: null when .last-update-result.json is missing", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { checkClaudeCodeUpdate } = await import("./component-update-check-run.mjs");
  const dir = mkdtempSync(join(tmpdir(), "cc-missing-"));
  assert.equal(checkClaudeCodeUpdate(dir, undefined), null);
  rmSync(dir, { recursive: true, force: true });
});

test("checkClaudeCodeUpdate: null on malformed JSON or a failed outcome", async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { checkClaudeCodeUpdate } = await import("./component-update-check-run.mjs");
  const dir = mkdtempSync(join(tmpdir(), "cc-bad-"));
  const file = join(dir, ".last-update-result.json");

  writeFileSync(file, "{not json");
  assert.equal(checkClaudeCodeUpdate(dir, undefined), null);

  writeFileSync(file, JSON.stringify({ outcome: "failed", version_from: "1.0.0", version_to: "1.0.1" }));
  assert.equal(checkClaudeCodeUpdate(dir, undefined), null);

  rmSync(dir, { recursive: true, force: true });
});

test("checkClaudeCodeUpdate: first-ever run reports version_from -> version_to", async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { checkClaudeCodeUpdate } = await import("./component-update-check-run.mjs");
  const dir = mkdtempSync(join(tmpdir(), "cc-first-"));
  writeFileSync(join(dir, ".last-update-result.json"),
    JSON.stringify({ outcome: "success", version_from: "2.1.240", version_to: "2.1.241" }));
  assert.deepEqual(checkClaudeCodeUpdate(dir, undefined),
    { installed: "2.1.240", latest: "2.1.241", updateAvailable: true });
  rmSync(dir, { recursive: true, force: true });
});

test("checkClaudeCodeUpdate: repeat run with no new version is NOT re-announced", async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { checkClaudeCodeUpdate } = await import("./component-update-check-run.mjs");
  const dir = mkdtempSync(join(tmpdir(), "cc-repeat-"));
  writeFileSync(join(dir, ".last-update-result.json"),
    JSON.stringify({ outcome: "success", version_from: "2.1.240", version_to: "2.1.241" }));
  const prior = { installed: "2.1.240", latest: "2.1.241", updateAvailable: true };
  assert.deepEqual(checkClaudeCodeUpdate(dir, prior),
    { installed: "2.1.241", latest: "2.1.241", updateAvailable: false });
  rmSync(dir, { recursive: true, force: true });
});

test("checkClaudeCodeUpdate: stale prior.latest ahead of the file's version_to is NOT announced (backwards case)", async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { checkClaudeCodeUpdate } = await import("./component-update-check-run.mjs");
  const dir = mkdtempSync(join(tmpdir(), "cc-stale-"));
  writeFileSync(join(dir, ".last-update-result.json"),
    JSON.stringify({ outcome: "success", version_from: "2.1.240", version_to: "2.1.241" }));
  const prior = { installed: "2.1.239", latest: "2.1.242", updateAvailable: true };
  assert.deepEqual(checkClaudeCodeUpdate(dir, prior),
    { installed: "2.1.242", latest: "2.1.241", updateAvailable: false });
  rmSync(dir, { recursive: true, force: true });
});

test("checkClaudeCodeUpdate: a further update since the prior check IS announced", async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { checkClaudeCodeUpdate } = await import("./component-update-check-run.mjs");
  const dir = mkdtempSync(join(tmpdir(), "cc-again-"));
  writeFileSync(join(dir, ".last-update-result.json"),
    JSON.stringify({ outcome: "success", version_from: "2.1.241", version_to: "2.1.242" }));
  const prior = { installed: "2.1.240", latest: "2.1.241", updateAvailable: true };
  assert.deepEqual(checkClaudeCodeUpdate(dir, prior),
    { installed: "2.1.241", latest: "2.1.242", updateAvailable: true });
  rmSync(dir, { recursive: true, force: true });
});
