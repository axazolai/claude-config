// Idempotent, anchored line patches for hook files gsd-core owns (~/.claude/hooks/gsd-*.js).
// The agent/skill/workflow patchers already cover gsd-core's prompt artifacts; this is the same
// review-gated model for its executable ones.
//
// Anchored on ONE line rather than gated on a file hash. gsd-core stamps every hook with
// `// gsd-hook-version: <version>` and rewrites the file on each install, so a hash-gated patch
// would go inert on every single release and need re-capturing by hand. A line anchor survives any
// release that leaves the line alone, and an upstream rewrite of that line is reported as
// `diverged` — which is the case that actually wants a human, because it means upstream changed
// the thing the patch reasons about.
//
//   checkGsdHookPatches(claudeDir) -> read-only. { <id>: "current"|"pending"|"diverged"|"inert" }
//   applyGsdHookPatches(claudeDir) -> writes. { applied, diverged, inert }
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { withFileLock, writeFileAtomic } from "./atomic-json.mjs";

const safe = (fn) => { try { return fn(); } catch { return undefined; } };

export const HOOK_PATCHES = [
  {
    id: "isolation-guard-decomposing-executor",
    file: "hooks/gsd-agent-isolation-guard.js",
    from: "const EXECUTOR_SUBAGENT_TYPES = new Set(['gsd-executor']);",
    to: "const EXECUTOR_SUBAGENT_TYPES = new Set(['gsd-executor', 'gsd-executor-decomposing']);",
    // gsd-core's guard blocks an Agent()/Task() dispatch that promised worktree isolation and did
    // not carry it. It matches on subagent_type, and its own comment states the premise this
    // bundle breaks: "No other executor-shaped subagent_type exists in agents/ today (verified:
    // only agents/gsd-executor.md)". We ship a second one, so without this the guard is inert for
    // gsd-executor-decomposing and that fork can run and commit straight into the primary
    // checkout. The Set is upstream's own extension point — chosen, in their words, as "a Set, not
    // a bare string compare".
    why: "gsd-core's isolation guard only knows its own executor; this bundle ships a second one, which would otherwise dispatch unguarded",
  },
];

const statusOf = (claudeDir, patch) => {
  const p = join(claudeDir, patch.file);
  if (!existsSync(p)) return "inert";
  const content = safe(() => readFileSync(p, "utf8"));
  if (content === undefined) return "inert";
  if (content.includes(patch.to)) return "current";
  if (content.includes(patch.from)) return "pending";
  return "diverged";
};

const gsdCorePresent = (claudeDir) => existsSync(join(claudeDir, "gsd-core", "VERSION"));

export function checkGsdHookPatches({ claudeDir }) {
  if (!gsdCorePresent(claudeDir)) return {};
  const out = {};
  for (const patch of HOOK_PATCHES) out[patch.id] = statusOf(claudeDir, patch);
  return out;
}

export function applyGsdHookPatches({ claudeDir }) {
  const result = { applied: [], diverged: [], inert: [] };
  if (!gsdCorePresent(claudeDir)) return result;
  for (const patch of HOOK_PATCHES) {
    const p = join(claudeDir, patch.file);
    withFileLock(p, () => {
      const status = statusOf(claudeDir, patch);
      if (status === "diverged") { result.diverged.push(patch.id); return; }
      if (status === "inert") { result.inert.push(patch.id); return; }
      if (status === "current") return;
      const content = safe(() => readFileSync(p, "utf8"));
      if (content === undefined) { result.inert.push(patch.id); return; }
      safe(() => writeFileAtomic(p, content.replace(patch.from, () => patch.to)));
      result.applied.push(patch.id);
    });
  }
  return result;
}
