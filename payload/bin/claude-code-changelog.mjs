#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { fetchChangelogSlice, formatChangelogSlice, realFetchChangelogText } from "./lib/claude-code-changelog-lib.mjs";

export function defaultClaudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
}

export async function main(claudeDir = defaultClaudeDir(), fetchText = realFetchChangelogText) {
  const statePath = join(claudeDir, "state", "component-updates.json");
  if (!existsSync(statePath)) {
    console.log("No component-update state recorded yet — nothing to compare.");
    return 0;
  }
  let state;
  try {
    state = JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    console.log("No component-update state recorded yet — nothing to compare.");
    return 0;
  }
  const entry = state["claude-code-cli"];
  if (!entry || !entry.installed || !entry.latest) {
    console.log("No Claude Code CLI update has been recorded yet.");
    return 0;
  }
  if (entry.installed === entry.latest) {
    console.log(`Claude Code is already on the latest known version (${entry.latest}). Nothing new to show.`);
    return 0;
  }
  try {
    const entries = await fetchChangelogSlice(entry.installed, entry.latest, fetchText);
    if (!entries.length) {
      console.log(`No changelog sections found between ${entry.installed} and ${entry.latest}.`);
      return 0;
    }
    console.log(formatChangelogSlice(entries));
    return 0;
  } catch (err) {
    console.error(`Could not fetch the Claude Code changelog: ${err.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => { process.exitCode = code; });
}
