import { fileURLToPath } from "node:url";
import { realpathSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { claudeDir, applyPlan, purgeRetention, restoreBatch } from "./lib/claude-cleanup-lib.mjs";
import { scanScratchpad } from "./lib/scratch-prune-lib.mjs";

export function parseArgs(argv) {
  const opts = {};
  const cmd = (argv[0] && !argv[0].startsWith("--")) ? argv[0] : "scan";
  for (let i = (cmd === argv[0] ? 1 : 0); i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === "--scratchpad") opts.scratchpad = next();
    else if (a === "--ts") opts.ts = next();
    else if (a === "--plan") opts.plan = next();
  }
  return { cmd, opts };
}

function isMain() {
  const a = process.argv[1]; if (!a) return false;
  const self = fileURLToPath(import.meta.url);
  if (resolve(a) === self) return true;
  try { return realpathSync(a) === self; } catch { return false; }
}

function stamp(nowMs) { return new Date(nowMs).toISOString().replace(/[:.]/g, "").replace(/-/g, ""); }

export function main(argv = process.argv.slice(2), nowMs = Date.now()) {
  const dir = claudeDir();
  const { cmd, opts } = parseArgs(argv);
  if (cmd === "scan") {
    if (!opts.scratchpad) { process.stderr.write("scan requires --scratchpad <abs path>\n"); process.exitCode = 1; return; }
    const res = scanScratchpad({ scratchpad: resolve(opts.scratchpad), nowMs });
    if (res.error) { process.stderr.write(res.error + "\n"); process.exitCode = 3; return; }
    process.stdout.write(JSON.stringify(res, null, 2));
  } else if (cmd === "apply") {
    if (!opts.plan) { process.stderr.write("apply requires --plan <file>\n"); process.exitCode = 1; return; }
    const finalized = JSON.parse(readFileSync(opts.plan, "utf8"));
    const res = applyPlan({ dir, items: finalized.items, nowMs, ts: finalized.ts || stamp(nowMs) });
    process.stdout.write(`Moved ${res.moved} items (${res.bytes} bytes) to ${res.batchDir}; skipped ${res.skipped}.\n`);
    if (res.skipped) {
      const moved = new Set(JSON.parse(readFileSync(join(res.batchDir, "manifest.json"), "utf8")).entries.map((e) => e.originalAbsPath));
      process.stdout.write(`skipped: ${finalized.items.filter((i) => !moved.has(i.absPath)).map((i) => i.name ?? i.absPath).join(", ")}\n`);
    }
  } else if (cmd === "purge-retention") {
    const removed = purgeRetention({ dir, nowMs });
    process.stdout.write(`Purged ${removed.length} trash batch(es): ${removed.join(", ") || "none"}.\n`);
  } else if (cmd === "restore") {
    if (!opts.ts) { process.stderr.write("restore requires --ts <ts>\n"); process.exitCode = 1; return; }
    const res = restoreBatch({ dir, ts: opts.ts });
    process.stdout.write(`Restored ${res.restored}; skipped ${res.skipped}.\n`);
  }
}

if (isMain()) main();
