#!/usr/bin/env node
// PreToolUse gate (matcher: Write|Edit|MultiEdit|NotebookEdit|Bash|PowerShell). Denies writes and
// commands that land outside the scratchpad layout (.ultrapowers/22-SPEC.md §3.1): the harness's
// own per-session scratchpad, a file loose in .scratchpad/, .scratchpad/tmp/, or any top-level
// .scratchpad/ folder other than phase-<NN>, adhoc, proc, test-tmp. Fail-open on unreadable input.
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { harnessTempRoot } from "../bin/lib/harness-temp.mjs";
import { frontmatter, fmField } from "./lib/phase-segment.mjs";

const ALLOWED_TOP = ["adhoc", "proc", "test-tmp"];
const PHASE_RE = /^phase-\d{2,}$/;

function target(currentPhase, today) {
  return currentPhase ? `phase-${String(currentPhase).padStart(2, "0")}/scripts/` : `adhoc/${today}-<topic>/`;
}

function harnessReason(currentPhase, today) {
  return "scratchpad-layout-guard: this path is inside the harness session scratchpad " +
    "(auto-managed, wiped on cleanup, not project storage). Use .claude/.scratchpad/" +
    `${target(currentPhase, today)} instead.`;
}

function layoutReason(segs, currentPhase, today) {
  const desc = segs.length <= 1 ? "a file directly in .scratchpad/"
    : segs[0] === "tmp" ? "a path under .scratchpad/tmp/"
    : `a path under the unrecognised .scratchpad/${segs[0]}/ folder`;
  return `scratchpad-layout-guard: ${desc} is not part of the scratchpad layout. ` +
    `Use .claude/.scratchpad/${target(currentPhase, today)} instead.`;
}

function foldPath(p) {
  const n = resolve(p).replace(/\\/g, "/");
  return process.platform === "win32" ? n.toLowerCase() : n;
}

export function decide({ toolName, toolInput, projectRoot, env, today, currentPhase }) {
  const input = toolInput || {};
  const root = resolve(projectRoot || process.cwd());
  const harnessRoot = harnessTempRoot(env || process.env);

  if (toolName === "Bash" || toolName === "PowerShell") {
    const cmd = String(input.command || "");
    if (!cmd) return null;
    let normCmd = cmd.replace(/\\/g, "/");
    let normHarness = harnessRoot.replace(/\\/g, "/");
    if (process.platform === "win32") { normCmd = normCmd.toLowerCase(); normHarness = normHarness.toLowerCase(); }
    const rootEsc = normHarness.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`${rootEsc}/[^/\\s"']+/[^/\\s"']+/scratchpad(?:[/"'\\s]|$)`);
    return re.test(normCmd) ? harnessReason(currentPhase, today) : null;
  }

  const rawPath = input.file_path || input.notebook_path;
  if (!rawPath) return null;
  const pathNorm = foldPath(resolve(root, rawPath));
  const harnessNorm = foldPath(harnessRoot);

  if (pathNorm.startsWith(harnessNorm + "/")) {
    const rel = pathNorm.slice(harnessNorm.length + 1).split("/").filter(Boolean);
    if (rel.length >= 3 && rel[2] === "scratchpad") return harnessReason(currentPhase, today);
  }

  const scratchRoot = foldPath(resolve(root, ".claude", ".scratchpad"));
  if (pathNorm === scratchRoot || pathNorm.startsWith(scratchRoot + "/")) {
    const rel = pathNorm === scratchRoot ? "" : pathNorm.slice(scratchRoot.length + 1);
    const segs = rel.split("/").filter(Boolean);
    const validTop = segs.length >= 2 && (PHASE_RE.test(segs[0]) || ALLOWED_TOP.includes(segs[0]));
    if (!validTop) return layoutReason(segs, currentPhase, today);
  }
  return null;
}

function readCurrentPhase(root) {
  let text = "";
  try { text = readFileSync(resolve(root, ".ultrapowers", "ROADMAP.md"), "utf8"); } catch { return null; }
  return fmField(frontmatter(text), "current");
}

function main() {
  let d;
  try { d = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { return; }
  d = (d && typeof d === "object" && !Array.isArray(d)) ? d : {};
  const toolInput = (d.tool_input && typeof d.tool_input === "object") ? d.tool_input : {};
  const projectRoot = process.env.CLAUDE_PROJECT_DIR || d.cwd || process.cwd();
  const reason = decide({
    toolName: d.tool_name || "",
    toolInput,
    projectRoot,
    env: process.env,
    today: new Date().toISOString().slice(0, 10),
    currentPhase: readCurrentPhase(projectRoot),
  });
  if (!reason) return;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: {
    hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } }));
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
