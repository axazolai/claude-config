#!/usr/bin/env node
// Usage: node ultrapowers-tdd.mjs [enable|disable] [--root <dir>]
// No argument prints the current testing mode of the project containing the working directory.
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findRoot } from "../hooks/lib/leanmode-rules.mjs";
import { resolveTddMode, setTddMode } from "../hooks/lib/tdd-mode.mjs";

export function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  const i = argv.indexOf("--root");
  const root = i !== -1 && argv[i + 1] ? resolve(argv[i + 1]) : findRoot(cwd);
  const cmd = argv.find((a, k) => !a.startsWith("--") && argv[k - 1] !== "--root");
  if (cmd === undefined) {
    console.log(`Testing mode: ${resolveTddMode(root)} (${root})`);
    return 0;
  }
  if (cmd !== "enable" && cmd !== "disable") {
    console.error(`usage: ultrapowers-tdd [enable|disable] [--root <dir>] (got "${cmd}")`);
    return 2;
  }
  let r;
  try { r = setTddMode(root, cmd === "enable"); }
  catch (e) { console.error(`ultrapowers-tdd: ${e.message}`); return 1; }
  console.log(`Testing mode: ${r.mode} (${r.file})${r.gsdSynced ? "; .planning/config.json workflow.tdd_mode synced" : ""}`);
  return 0;
}

function isMain() {
  const a = process.argv[1]; if (!a) return false;
  const self = fileURLToPath(import.meta.url);
  if (resolve(a) === self) return true;
  try { return realpathSync(a) === self; } catch { return false; }
}

if (isMain()) process.exitCode = main();
