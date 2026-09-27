#!/usr/bin/env node
// PostToolUse nudge (matcher: Write|Edit|MultiEdit; base/full only). Fires once per phase when a
// phase's <NN>-SUMMARY.md is written (.ultrapowers/phases/<NN>-<slug>/<NN>-SUMMARY.md) while
// ultrapowers is enabled (22-SPEC.md §3.3): nudges the scratch-prune skill for that phase before
// the branch finishes. Enabled-check cascades project .claude/settings.json ->
// .claude/settings.local.json -> user settings.json; the first file whose enabledPlugins carries
// the key wins, true or false. Fail-open on unreadable input.
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
const KEY = "ultrapowers@ultrapowers";
const SUMMARY_RE = /^\.ultrapowers\/phases\/(\d+)-[^/]+\/(\d+)-SUMMARY\.md$/;

export function matchSummaryPath(relPath) {
  const m = SUMMARY_RE.exec(String(relPath || "").replace(/\\/g, "/"));
  if (!m || m[1] !== m[2]) return null;
  return m[1];
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
  return `Phase closed: run the scratch-prune skill now, before finishing the branch. ` +
    `(/scratch-prune phase ${phase})`;
}

export function decide({ relPath, settingsList, doneSet }) {
  const phase = matchSummaryPath(relPath);
  if (!phase) return null;
  if (!isEnabled(settingsList || [])) return null;
  if ((doneSet || new Set()).has(phase)) return null;
  return { phase, message: nudgeMessage(phase) };
}

// Strips a leading UTF-8 BOM before parsing (session-init.mjs hits this on settings.json written
// by an external Windows tool; a raw JSON.parse throws on it).
function readJson(p) {
  try { return JSON.parse(readFileSync(p, "utf8").replace(/^﻿/, "")); } catch { return null; }
}

function readDoneSet(markerPath) {
  try { return new Set(readFileSync(markerPath, "utf8").split(/\r?\n/).filter(Boolean)); }
  catch { return new Set(); }
}

function recordDone(markerPath, phase) {
  mkdirSync(dirname(markerPath), { recursive: true });
  writeFileSync(markerPath, `${phase}\n`, { flag: "a" });
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
  if (!matchSummaryPath(relPath)) return; // cheap regex check before any file I/O below

  const markerPath = join(root, ".claude", ".scratchpad", ".cleanup-done");
  const result = decide({
    relPath,
    settingsList: [
      readJson(join(root, ".claude", "settings.json")),
      readJson(join(root, ".claude", "settings.local.json")),
      readJson(join(CLAUDE_DIR, "settings.json")),
    ],
    doneSet: readDoneSet(markerPath),
  });
  if (!result) return;

  recordDone(markerPath, result.phase);
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
