#!/usr/bin/env node
// PostToolUse / PostToolUseFailure advisory (matcher: WebFetch|ctx_fetch_and_index). When a plain
// fetch comes back blocked or as an empty JS shell, points at the Scrapling tool that gets through.
// Never blocks. Fail-open.
import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

const CHALLENGE = /Just a moment\.\.\.|cf-chl|Attention Required! \| Cloudflare|Enable JavaScript and cookies to continue/i;
// WebFetch reports a refused fetch as "The server returned HTTP 403 Forbidden." and drops the body.
const HARNESS_BLOCK = /server returned HTTP (403|429|503)\b/i;
const HTTP_BLOCK = /\b(403|429|503)\b[^\n]{0,40}(forbidden|too many requests|service unavailable|blocked|denied)/i;
const SPA_SHELL = /You need to enable JavaScript to run this app/i;

// A page body is prose that may discuss status codes; the loose status pattern applies only to
// a failed tool's error text.
export function classify(text, { failure = false } = {}) {
  const t = String(text || "");
  if (CHALLENGE.test(t) || HARNESS_BLOCK.test(t) || (failure && HTTP_BLOCK.test(t))) return "blocked";
  if (SPA_SHELL.test(t)) return "js-shell";
  return null;
}

const responseText = (r) => (typeof r === "string" ? r
  : Object.values(r || {}).filter((v) => typeof v === "string").join("\n"));

export function nudgeFor(kind) {
  const tool = kind === "blocked" ? "stealthy_fetch" : "fetch";
  return `web-block-nudge: the page came back ${kind === "blocked" ? "blocked or as an anti-bot challenge" : "as an empty JavaScript shell"}. ` +
    `Retry through Scrapling \`${tool}\` with a css_selector for the part you need.`;
}

function main() {
  let d;
  try { d = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { return; }
  const failure = d.hook_event_name === "PostToolUseFailure";
  const kind = classify(failure ? d.error : responseText(d.tool_response), { failure });
  if (!kind) return;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: {
    hookEventName: failure ? "PostToolUseFailure" : "PostToolUse", additionalContext: nudgeFor(kind) } }));
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
