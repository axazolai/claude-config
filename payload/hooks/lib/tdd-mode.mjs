// The project's testing mode: "tdd" when <root>/.claude/ultrapowers.json has "tdd": true,
// "test-after" otherwise. /ultrapowers-tdd writes it; session-init, gsd-defaults-sync and the
// ultrapowers skills read it.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const readJSON = (p) => JSON.parse(readFileSync(p, "utf8").replace(/^﻿/, ""));
const writeJSON = (p, obj) => writeFileSync(p, JSON.stringify(obj, null, 2) + "\n");
const switchFile = (root) => join(root, ".claude", "ultrapowers.json");

export function resolveTddMode(root) {
  try {
    return readJSON(switchFile(root)).tdd === true ? "tdd" : "test-after";
  } catch {
    return "test-after";
  }
}

export function setTddMode(root, on) {
  const file = switchFile(root);
  let cfg = {};
  if (existsSync(file)) {
    const cur = readJSON(file);
    if (cur && typeof cur === "object" && !Array.isArray(cur)) cfg = cur;
  }
  cfg.tdd = on;
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeJSON(file, cfg);

  const planning = join(root, ".planning", "config.json");
  let gsd = false;
  if (existsSync(planning)) {
    const p = readJSON(planning);
    if (p && typeof p === "object" && !Array.isArray(p)) {
      p.workflow = p.workflow && typeof p.workflow === "object" ? p.workflow : {};
      p.workflow.tdd_mode = on;
      writeJSON(planning, p);
      gsd = true;
    }
  }
  return { mode: on ? "tdd" : "test-after", file, gsdSynced: gsd };
}
