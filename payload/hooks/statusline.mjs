#!/usr/bin/env node
// statusLine renderer. Composes pending updates, model,
// context, project, and (when applicable) ultrapowers work status into one line, with no
// subprocess spawned. Any error yields empty output - the statusline never breaks the prompt.
import { readFileSync, writeFileSync, realpathSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import { computeContext, contextMetrics } from "./lib/statusline-lib.mjs";
import { severityOf } from "./lib/context-severity.mjs";
import { resolveAutocompact, promotePending, autoCompactEnabledFrom } from "./lib/autocompact.mjs";
import { pendingNames } from "./lib/component-registry.mjs";
import { readPhaseState, renderPhaseSegment } from "./lib/phase-segment.mjs";
import { dsSegment } from "./lib/deepseek-segment.mjs";
import { progressEnabled } from "./lib/status-project-progress.mjs";

const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
const YELLOW = (s) => `\x1b[33m${s}\x1b[0m`;
const DIM = (s) => `\x1b[2m${s}\x1b[0m`;
const safe = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };

export function renderUpdates(names) {
  if (!Array.isArray(names) || !names.length) return "";
  const shown = names.slice(0, 2);
  const rest = names.length - shown.length;
  return YELLOW(`⬆ ${shown.join(" ")}${rest > 0 ? ` +${rest}` : ""}`);
}

export function paintContext(text, opts) {
  const { colour, icon } = opts || {};
  if (!text) return "";
  const painted = colour ? `\x1b[${colour}m${text}\x1b[0m` : text;
  return icon ? `${icon} ${painted}` : painted;
}

export function render({ updates, model, context, ds, project, up } = {}) {
  return [renderUpdates(updates), model, context, ds, project, up]
    .filter(Boolean)
    .join(DIM(" │ "));
}

// Phase resolution (ROADMAP `current`, else the git branch) lives in lib/phase-segment.mjs.
// This file keeps the wiring only.

function upState(root) {
  return renderPhaseSegment(readPhaseState(root));
}

function contextSegment(data) {
  const text = safe(() => computeContext(data), "") || "";
  if (!text) return "";
  const m = safe(() => contextMetrics(data), null);
  if (!m) return text;
  const statePath = join(CLAUDE_DIR, "state", "autocompact.json");
  const modelId = (data.model && data.model.id) || "";
  let state = safe(() => JSON.parse(readFileSync(statePath, "utf8")), null) || {};
  const promoted = safe(() => promotePending(state, { modelId, windowSize: m.windowSize }), null);
  if (promoted && promoted.changed) {
    state = promoted.next;
    safe(() => writeFileSync(statePath, JSON.stringify(state, null, 2)));
  }
  const settings = safe(() => JSON.parse(readFileSync(join(CLAUDE_DIR, "settings.json"), "utf8")), null);
  const ac = safe(() => resolveAutocompact({ windowSize: m.windowSize, modelId, state,
    enabled: autoCompactEnabledFrom(settings) }), null);
  const windowPct = m.pct != null ? Number(m.pct) : (m.tokens / m.windowSize) * 100;
  // Only collapse onto windowPct when the source's point is the full window - "assumed" with no
  // CLAUDE_CODE_AUTO_COMPACT_WINDOW narrowing it, or "disabled" (which is always the full window).
  // A narrowed capacity must still diverge from windowPct, that divergence is the whole reason
  // the two ladders exist.
  const collapse = ac && (ac.source === "assumed" || ac.source === "disabled") && ac.tokens === m.windowSize;
  const acProgress = ac && !collapse && ac.tokens > 0 ? (m.tokens / ac.tokens) * 100 : windowPct;
  return safe(() => paintContext(text, severityOf({ windowPct, acProgress })), text) || text;
}

async function main(raw) {
  const data = safe(() => JSON.parse(raw || "{}"), {}) || {};
  const ws = data.workspace || {};
  const root = resolve(ws.current_dir || ws.project_dir || process.cwd());
  const state = safe(() => JSON.parse(readFileSync(join(CLAUDE_DIR, "state", "component-updates.json"), "utf8")), null);
  const progress = safe(() => progressEnabled(CLAUDE_DIR), true);
  process.stdout.write(render({
    updates: pendingNames(state),
    model: (data.model && data.model.display_name) || "",
    context: safe(() => contextSegment(data), "") || "",
    ds: safe(() => dsSegment({ root, claudeDir: CLAUDE_DIR }), "") || "",
    project: basename(root),
    up: progress ? (safe(() => upState(root)) || "") : "",
  }));
}

function isMainModule() {
  const a = process.argv[1];
  if (!a) return false;
  if (import.meta.url === pathToFileURL(a).href) return true;
  try { return import.meta.url === pathToFileURL(realpathSync(a)).href; } catch { return false; }
}

if (isMainModule()) {
  process.stdout.on("error", () => {});
  let input = "";
  let done = false;
  // No process.exit(): on Windows a pipe write is async, and exiting on the spot can truncate
  // the line we just wrote. Nothing else holds the loop open once stdin is released below, so
  // the process ends on its own.
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(guard);
    // main is async, so the release below has to wait for it rather than run alongside: the
    // documented order is write the line, THEN let go of stdin. A rejection cannot escape either - both settle paths release.
    const release = () => {
      process.exitCode = 0;
      // Rendering alone does not end the process: the `data` listener below keeps the readable
      // flowing, so stdin that never closes would hold the event loop open forever after the line
      // was already printed. Releasing the handle is what lets the loop drain.
      try { process.stdin.pause(); process.stdin.destroy(); } catch { /* already gone */ }
    };
    main(input).then(release, release);
  };
  // A statusLine command whose stdin never closes would otherwise hang forever and leave the
  // prompt with no line at all; rendering what arrived beats rendering nothing.
  const guard = setTimeout(finish, Number(process.env.CLAUDE_STATUSLINE_STDIN_MS) || 1500);
  guard.unref();
  if (process.stdin.isTTY) finish();
  else {
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("error", finish);
    process.stdin.on("end", finish);
  }
}
