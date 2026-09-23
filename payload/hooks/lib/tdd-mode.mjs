// The project's testing mode: "tdd" when <root>/.claude/ultrapowers.json has "tdd": true,
// "test-after" otherwise. /ultrapowers-tdd writes it; session-init, gsd-defaults-sync and the
// ultrapowers skills read it.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const readJSON = (p) => JSON.parse(readFileSync(p, "utf8").replace(/^﻿/, ""));
const writeJSON = (p, obj) => writeFileSync(p, JSON.stringify(obj, null, 2) + "\n");
const switchFile = (root) => join(root, ".claude", "ultrapowers.json");
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function resolveTddMode(root) {
  try {
    return readJSON(switchFile(root)).tdd === true ? "tdd" : "test-after";
  } catch {
    return "test-after";
  }
}

function readObject(path) {
  if (!existsSync(path)) return null;
  let v;
  try { v = readJSON(path); } catch { throw new Error(`${path} is not valid JSON; nothing was changed`); }
  if (!isObject(v)) throw new Error(`${path} is not a JSON object; nothing was changed`);
  return v;
}

// Both files are read before either is written, so a malformed one leaves both untouched.
export function setTddMode(root, on) {
  const file = switchFile(root);
  const planning = join(root, ".planning", "config.json");
  const cfg = readObject(file) || {};
  const gsd = readObject(planning);
  cfg.tdd = on;
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeJSON(file, cfg);
  if (gsd) {
    gsd.workflow = isObject(gsd.workflow) ? gsd.workflow : {};
    gsd.workflow.tdd_mode = on;
    writeJSON(planning, gsd);
  }
  return { mode: on ? "tdd" : "test-after", file, gsdSynced: Boolean(gsd) };
}
