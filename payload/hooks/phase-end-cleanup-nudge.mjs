#!/usr/bin/env node
// PostToolUse nudge (matcher: Write|Edit|MultiEdit). Fires once per phase: after a write to
// `.ultrapowers/ROADMAP.md`, the highest-numbered row with `status: complete` that is not the
// `current` phase and has not been nudged before gets a nudge to run the scratch-prune skill,
// while ultrapowers is enabled. Enabled-check cascades project .claude/settings.json ->
// .claude/settings.local.json -> user settings.json; the first file whose enabledPlugins carries
// the key wins, true or false. Fail-open on unreadable input.
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import { frontmatter, fmField, roadmapPhases } from "./lib/phase-segment.mjs";

const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
const KEY = "ultrapowers@ultrapowers";
const ROADMAP_REL = ".ultrapowers/ROADMAP.md";

export function isRoadmapPath(relPath) {
  return String(relPath || "").replace(/\\/g, "/") === ROADMAP_REL;
}

export function isEnabled(settingsList) {
  for (const s of settingsList) {
    const ep = s && s.enabledPlugins;
    if (ep && typeof ep === "object" && !Array.isArray(ep) && Object.prototype.hasOwnProperty.call(ep, KEY))
      return ep[KEY] === true;
  }
  return false;
}

export function nudgeMessage(phase) {
  return `Phase ${phase} closed: run the scratch-prune skill for it. (/scratch-prune phase ${phase})`;
}

// Returns { phase, message } for the phase to nudge, else null.
export function decide({ relPath, roadmapText, settingsList, doneSet }) {
  if (!isRoadmapPath(relPath)) return null;
  if (!isEnabled(settingsList || [])) return null;
  const current = fmField(frontmatter(roadmapText), "current");
  const done = doneSet || new Set();
  const closed = roadmapPhases(roadmapText)
    .filter((r) => r.status === "complete" && r.phase && r.phase !== current && !done.has(r.phase))
    .sort((a, b) => Number(b.phase) - Number(a.phase));
  if (!closed.length) return null;
  return { phase: closed[0].phase, message: nudgeMessage(closed[0].phase) };
}

// Strips a leading UTF-8 BOM before parsing (settings.json written by an external Windows tool).
function readJson(p) {
  try { return JSON.parse(readFileSync(p, "utf8").replace(/^﻿/, "")); } catch { return null; }
}

function readLines(p) {
  try { return readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean); } catch { return []; }
}

function toRel(root, rawPath) {
  const rootNorm = resolve(root).replace(/\\/g, "/");
  const absNorm = resolve(root, rawPath).replace(/\\/g, "/");
  return absNorm.startsWith(rootNorm + "/") ? absNorm.slice(rootNorm.length + 1) : absNorm;
}

function main() {
  let d;
  try { d = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { return; }
  d = (d && typeof d === "object" && !Array.isArray(d)) ? d : {};
  const input = (d.tool_input && typeof d.tool_input === "object") ? d.tool_input : {};
  const rawPath = input.file_path;
  if (!rawPath) return;

  const root = resolve(process.env.CLAUDE_PROJECT_DIR || d.cwd || process.cwd());
  const relPath = toRel(root, rawPath);
  if (!isRoadmapPath(relPath)) return; // cheap check before any file I/O below

  const donePath = join(root, ".claude", ".scratchpad", ".cleanup-done");
  let roadmapText = "";
  try { roadmapText = readFileSync(join(root, ROADMAP_REL), "utf8"); } catch { return; }
  const result = decide({
    relPath,
    roadmapText,
    settingsList: [
      readJson(join(root, ".claude", "settings.json")),
      readJson(join(root, ".claude", "settings.local.json")),
      readJson(join(CLAUDE_DIR, "settings.json")),
    ],
    doneSet: new Set(readLines(donePath)),
  });
  if (!result) return;

  mkdirSync(dirname(donePath), { recursive: true });
  writeFileSync(donePath, `${result.phase}\n`, { flag: "a" });
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: result.message },
  }));
}

function isMainModule() {
  const a = process.argv[1];
  if (!a) return false;
  if (import.meta.url === pathToFileURL(a).href) return true;
  try { return import.meta.url === pathToFileURL(realpathSync(a)).href; } catch { return false; }
}

if (isMainModule()) {
  try { main(); } catch { /* fail-open */ }
  process.exit(0);
}
