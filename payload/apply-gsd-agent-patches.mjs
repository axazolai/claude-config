#!/usr/bin/env node
// CLI entry point for payload/commands/init-session.md (its only current caller —
// init-stack.md dropped this step entirely in the GSD-free rewrite, eaf1a50) - applies every
// pending patch from hooks/lib/gsd-agent-patches.mjs to
// ~/.claude/agents/gsd-*.md. Deliberately NOT wired into setup.mjs or session-init.mjs's
// auto-apply path (unlike sync-gsd-context-mode-tool.mjs's underlying lib) - these patches
// inject prose across 30+ files, so they only run when a human explicitly triggers one of
// those two commands, after session-init.mjs's read-only check has surfaced that something is
// pending.
// Usage: node apply-gsd-agent-patches.mjs [claudeDir]   (default: ~/.claude)
import { homedir } from "node:os";
import { join } from "node:path";
import { applyGsdAgentPatches, checkRecursiveAgentSpawnGuardrail } from "./hooks/lib/gsd-agent-patches.mjs";
import { applyGsdSkillPatches } from "./hooks/lib/gsd-skill-patches.mjs";
import { applyGsdHookPatches } from "./hooks/lib/gsd-hook-patches.mjs";
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");

const claudeDir = process.argv[2] || join(CLAUDE_DIR);
const result = applyGsdAgentPatches({ claudeDir });
const skResult = applyGsdSkillPatches({ claudeDir });
const hkResult = applyGsdHookPatches({ claudeDir });

if (result.applied.length) {
  console.log(`Applied ${result.applied.length} patch(es):`);
  for (const entry of result.applied) console.log(`  - ${entry}`);
}
if (result.upgraded.length) {
  console.log(`Upgraded ${result.upgraded.length} stale patch(es) to their current content:`);
  for (const entry of result.upgraded) console.log(`  - ${entry}`);
}
if (!result.applied.length && !result.upgraded.length) {
  console.log("gsd-* agents: no pending patches (already up to date, or context-mode inactive).");
}
if (result.skippedCurated.length)
  console.log(`Skipped (curated, left untouched): ${result.skippedCurated.join(", ")}`);
if (result.skippedNoAnchor.length)
  console.log(`Skipped (anchor text not found - file may have changed upstream): ${result.skippedNoAnchor.join(", ")}`);
if (result.skippedForeign.length)
  console.log(`Skipped effort (set to a non-default value by hand, left as-is): ${result.skippedForeign.join(", ")}`);
if (result.skippedNoKey.length)
  console.log(`Skipped effort (no effort key found - file may have changed upstream): ${result.skippedNoKey.join(", ")}`);
if (result.removedRetired.length) {
  console.log(`Cleaned up ${result.removedRetired.length} retired-patch leftover(s):`);
  for (const entry of result.removedRetired) console.log(`  - ${entry}`);
}

if (skResult.applied.length) {
  console.log(`Applied ${skResult.applied.length} skill effort patch(es):`);
  for (const entry of skResult.applied) console.log(`  - ${entry}`);
}
if (skResult.skippedForeign.length)
  console.log(`Skipped skill effort (non-default value, left as-is): ${skResult.skippedForeign.join(", ")}`);
if (skResult.skippedCurated.length)
  console.log(`Skipped skill (curated): ${skResult.skippedCurated.join(", ")}`);
if (skResult.skippedNoKey.length)
  console.log(`Skipped skill (no effort key - may have changed upstream): ${skResult.skippedNoKey.join(", ")}`);

if (hkResult.applied.length) {
  console.log(`Applied ${hkResult.applied.length} gsd-core hook patch(es):`);
  for (const id of hkResult.applied) console.log(`  - ${id}`);
}
if (hkResult.diverged.length) {
  console.log(`
DIVERGED - upstream rewrote the anchored line, patch NOT applied: ${hkResult.diverged.join(", ")}`);
  console.log(`  Re-read the hook and re-author the patch; do not force it.`);
}
if (hkResult.inert.length)
  console.log(`Inert (file not installed, so its protection is absent): ${hkResult.inert.join(", ")}`);

const unguarded = checkRecursiveAgentSpawnGuardrail({ claudeDir });
if (unguarded.length) {
  console.log(`\nWARNING: ${unguarded.length} agent(s) grant the Agent tool with no anti-recursion guardrail found:`);
  for (const name of unguarded) console.log(`  - ${name}`);
  console.log(`  This combination (Agent + no guardrail) caused refusals or silent stuck states in`);
  console.log(`  the 2026-07 recursive-delegation test series - see gsd.md's "Depth boundary" section.`);
  console.log(`  Review each file by hand before shipping it; there is no auto-fix for this.`);
}
