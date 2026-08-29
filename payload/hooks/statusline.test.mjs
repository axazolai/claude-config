// payload/hooks/statusline.test.mjs
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderUpdates, renderGsd, render, installedProfile, paintContext, renderHookPatches } from "./statusline.mjs";

const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");

test("@important nothing pending renders no updates segment", () => {
  assert.equal(renderUpdates([]), "");
  assert.equal(renderUpdates(null), "");
});

test("@important up to two components are named, the rest collapse", () => {
  assert.equal(strip(renderUpdates(["context-mode"])), "⬆ context-mode");
  assert.equal(strip(renderUpdates(["context-mode", "graphify"])), "⬆ context-mode graphify");
  assert.equal(strip(renderUpdates(["a", "b", "c", "d"])), "⬆ a b +2");
});

// renderSdd, renderPhase and roadmapPhases moved to lib/phase-segment.mjs and are tested there.
// What stays here is the entry point's behaviour, which is what this file is for.

test("@important render joins the floor in order", () => {
  const line = strip(render({ updates: [], model: "Opus 5 (1M)", context: "45.0K/200K 22%",
    project: "claude-config" }));
  assert.equal(line, "Opus 5 (1M) │ 45.0K/200K 22% │ claude-config");
});

test("@important the gsd bar is full only at 100% and empty only at 0%", () => {
  const bar = (percent) => /\[(.*?)\]/.exec(renderGsd({ milestone: "v1", phase: "1", status: "x", percent }))[1];
  assert.equal(bar(0), "░░░");
  assert.equal(bar(1), "█░░");
  assert.equal(bar(83), "██░");
  assert.equal(bar(99), "██░");
  assert.equal(bar(100), "███");
});

test("@important the pure renderers never throw on absent or malformed input", () => {
  assert.equal(renderUpdates("context-mode"), "");
  assert.equal(renderUpdates({}), "");
  assert.doesNotThrow(() => renderGsd());
  assert.doesNotThrow(() => render());
});

const ENTRY = join(dirname(fileURLToPath(import.meta.url)), "statusline.mjs");
const TMP = mkdtempSync(join(tmpdir(), "statusline-test-"));
after(() => rmSync(TMP, { recursive: true, force: true }));

const write = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); return path; };
const dir = (...parts) => { const p = join(TMP, ...parts); mkdirSync(p, { recursive: true }); return p; };

const EMPTY_CLAUDE_DIR = dir("claude-empty");
// The gsd segment requires gsd-core installed, so every gsd assertion needs a claudeDir that has it.
const GSD_CLAUDE_DIR = dir("claude-gsd-core");
// A fixture that carries gsd-core must also carry its isolation guard, or the hook-patch alarm
// correctly reports "inert" and shows up in the rendered line. Already-patched = silent.
const PATCHED_GUARD = "// gsd-hook-version: 1.11.0\n" +
  "const EXECUTOR_SUBAGENT_TYPES = new Set(['gsd-executor', 'gsd-executor-decomposing']);\n";
write(join(GSD_CLAUDE_DIR, "gsd-core", "VERSION"), "1.8.0\n");
write(join(GSD_CLAUDE_DIR, "hooks", "gsd-agent-isolation-guard.js"), PATCHED_GUARD);

function runEntry(input, { claudeDir = EMPTY_CLAUDE_DIR, env: extraEnv = {} } = {}) {
  const env = { ...process.env, CLAUDE_CONFIG_DIR: claudeDir };
  delete env.CLAUDE_CODE_AUTO_COMPACT_WINDOW;
  delete env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE;
  Object.assign(env, extraEnv);
  return spawnSync(process.execPath, [ENTRY], { input, encoding: "utf8", env, cwd: TMP });
}

const payload = (root, extra = {}) => JSON.stringify({ workspace: { current_dir: root }, ...extra });

// Rendering without a subprocess is the reason the git segment was dropped, so it is a property of
// the source and not of any one render: a reintroduced spawn would still pass every test below.
// Method calls are excluded by the lookbehind - `.exec(` on a RegExp is all over this renderer.
test("@important entry point: the project segment is the directory name and nothing else", () => {
  const root = dir("proj-only");
  const out = runEntry(payload(root, { model: { display_name: "Opus 5" } }));
  assert.equal(out.status, 0);
  assert.equal(strip(out.stdout), "Opus 5 │ proj-only");
});

test("@important entry point: malformed JSON on stdin yields a clean line and a zero exit", () => {
  const root = dir("plain-malformed");
  const bad = runEntry("{ this is not json");
  assert.equal(bad.status, 0);
  assert.equal(bad.stderr, "");
  assert.doesNotMatch(bad.stdout, /Error|at .*\.mjs/);
  const rooted = runEntry(`{ "workspace": broken ${root}`);
  assert.equal(rooted.status, 0);
  assert.equal(rooted.stderr, "");
});

test("@important entry point: a missing state file renders no updates segment", () => {
  const root = dir("plain-nostate");
  const out = runEntry(payload(root));
  assert.equal(out.status, 0);
  assert.equal(out.stderr, "");
  assert.doesNotMatch(out.stdout, /⬆/);
  assert.ok(strip(out.stdout).startsWith("plain-nostate"), `got: ${JSON.stringify(out.stdout)}`);
});

test("@important entry point: pending components are named first, in registry order", () => {
  const claudeDir = dir("claude-pending");
  write(join(claudeDir, "state", "component-updates.json"), JSON.stringify({
    graphify: { updateAvailable: true },
    "context-mode": { updateAvailable: true },
    zzz: { updateAvailable: true },
    quiet: { updateAvailable: false },
  }));
  const out = runEntry(payload(dir("plain-pending")), { claudeDir });
  assert.equal(out.status, 0);
  assert.ok(strip(out.stdout).startsWith("⬆ context-mode graphify +1 │ "), `got: ${JSON.stringify(out.stdout)}`);
});

test("@important entry point: the context segment shows the real current_usage sum", () => {
  const out = runEntry(payload(dir("plain-ctx"), {
    context_window: {
      context_window_size: 200000,
      used_percentage: 22,
      current_usage: { input_tokens: 40000, cache_creation_input_tokens: 1000, cache_read_input_tokens: 2000, output_tokens: 500 },
    },
  }));
  assert.equal(out.status, 0);
  assert.ok(strip(out.stdout).startsWith("43.5K/200K 22% │ "), `got: ${JSON.stringify(out.stdout)}`);
});

test("@important entry point: CLAUDE_CODE_AUTO_COMPACT_WINDOW narrows the icon ladder, not the colour ladder", () => {
  const root = dir("plain-window-narrow");
  const out = runEntry(payload(root, {
    context_window: { context_window_size: 1000000, used_percentage: 32 },
  }), { env: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: "600000" } });
  assert.equal(out.status, 0);
  // colour: 32% of the full 1M window is the yellow band - windowPct is never narrowed.
  assert.match(out.stdout, /\x1b\[33m320\.0K\/1M 32%\x1b\[0m/, `colour: got ${JSON.stringify(out.stdout)}`);
  // icon: 320K of a 600K capacity is 53% of the way to compaction - past the 💡 floor.
  // Asserting both, on the same render, fails if colour and icon ever collapse onto one number.
  assert.match(strip(out.stdout), /💡 320\.0K\/1M 32%/, `icon: got ${JSON.stringify(out.stdout)}`);
});

const GSD_STATE = `---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 05.1
current_phase_name: nas-transport-robustness-hardening
status: verifying
progress:
  total_phases: 6
  completed_phases: 5
---

# Project State
`;

test("@important entry point: a real GSD project renders the gsd segment", () => {
  const root = dir("gsd-proj");
  write(join(root, ".planning", "config.json"), "{}");
  write(join(root, ".planning", "STATE.md"), GSD_STATE);
  const out = runEntry(payload(root), { claudeDir: GSD_CLAUDE_DIR });
  assert.equal(out.status, 0);
  assert.equal(strip(out.stdout), "gsd-proj │ v1.0 [██░] 83% · Phase 05.1 verifying");
});

const phaseTree = (name, { current, rows = [], phases = {}, eol = "\n" }) => {
  const root = dir(name);
  const fm = ["---", `current: ${current === null ? "null" : `"${current}"`}`, "phases:",
    ...rows.map((r) => `  - { phase: "${r.phase}", slug: ${r.slug}, status: ${r.status} }`),
    "---", "", "# Roadmap"].join(eol);
  write(join(root, ".ultrapowers", "ROADMAP.md"), fm);
  for (const [id, body] of Object.entries(phases))
    write(join(root, ".ultrapowers", "phases", id, `${id.slice(0, 2)}-STATE.md`), body.replaceAll("\n", eol));
  return root;
};

const STATE_08 = '---\nphase: "08"\nstatus: running\ntasks_done: 2\ntasks_total: 6\n---\n';

test("@important entry point: ROADMAP current names the phase in flight", () => {
  const root = phaseTree("sel-current", { current: "08", phases: { "08-unified": STATE_08 } });
  assert.match(strip(runEntry(payload(root)).stdout), /08 unified$/);
});

// Zero or several running phases means the tree does not know which phase is in flight. The bar
// says so by rendering the tally rather than picking one.
test("@important entry point: counters come from the live ledger, not from stale frontmatter", () => {
  const root = phaseTree("sel-counters", {
    current: "09",
    rows: [{ phase: "09", slug: "later", status: "running" }],
    phases: { "09-later": '---\nstatus: running\naction: planning\ntasks_done: 99\ntasks_total: 99\n---\n' },
  });
  const sdd = join(root, ".ultrapowers", "sdd", "phases-09-later");
  for (const n of [1, 2, 3]) write(join(sdd, `task-${n}-brief.md`), "b");
  write(join(sdd, "task-1-report.md"), "r");
  assert.match(strip(runEntry(payload(root)).stdout), /09 1\/2\/0 — later$/);
});

// tasks_dropped belongs to a frontmatter tally and must not touch ledger-derived counts: a
// retired task is either already among the unreported briefs or was never written as one.
// .trim() in fmField: CR is a JS LineTerminator so `(.+)$` never captures it, but trailing
// spaces are captured and would leave a quoted id closing-quote intact.
// mtime used to decide which ledger the bar showed. It no longer decides anything: only the
// resolved phase's own ledger is read, so a newer unrelated one cannot take the segment.
test("@important entry point: a foreign ledger cannot take the segment however new it is", () => {
  const root = phaseTree("sel-outrank", { current: "08", phases: { "08-unified": STATE_08 } });
  const ledger = write(join(root, ".ultrapowers", "sdd", "phases-99-stale-plan", "task-1-brief.md"), "b");
  const future = Date.now() / 1000 + 3600;
  utimesSync(ledger, future, future);
  const out = strip(runEntry(payload(root)).stdout);
  assert.match(out, /08 unified$/);
  assert.doesNotMatch(out, /stale-plan/);
});

// This is the defect the phase was opened for: with no phase resolvable the bar used to render
// the newest ledger's tally, which belonged to finished work.
test("@important entry point: the same input renders the same line twice", () => {
  const root = dir("gsd-proj");
  const input = payload(root, { context_window: { remaining_percentage: 72.3, total_tokens: 200000 } });
  assert.equal(runEntry(input).stdout, runEntry(input).stdout);
});

const claudeDirWithProfile = (name, profile) => {
  const d = dir(name);
  if (profile !== undefined) write(join(d, "state", "bundle-manifest.json"), JSON.stringify({ profile }));
  return d;
};

test("@important installedProfile reads the manifest, and null when there is none", () => {
  assert.equal(installedProfile(claudeDirWithProfile("prof-lite", "lite")), "lite");
  assert.equal(installedProfile(claudeDirWithProfile("prof-none")), null);
});

// A machine installed by a pre-`profile` bundle carries `variant` only. Without the fallback a
// legacy lite install resolves to null, fails open, and shows the segment lite exists to suppress.
test("@important entry point: lite suppresses the ultrapowers segment, base keeps it", () => {
  const root = dir("up-gate");
  write(join(root, ".ultrapowers", "ROADMAP.md"), ["---", "current: null", "phases:",
    '  - { phase: "01", slug: my-plan, status: complete }', "---", "", "# Roadmap"].join("\n"));

  const onLite = runEntry(payload(root), { claudeDir: claudeDirWithProfile("cd-lite", "lite") });
  assert.doesNotMatch(strip(onLite.stdout), /my-plan/);

  const onBase = runEntry(payload(root), { claudeDir: claudeDirWithProfile("cd-base", "base") });
  assert.match(strip(onBase.stdout), /my-plan/);

  const noManifest = runEntry(payload(root), { claudeDir: claudeDirWithProfile("cd-nomanifest") });
  assert.match(strip(noManifest.stdout), /my-plan/, "an absent manifest must fail open");
});

// child.stdin is deliberately never end()ed - that is the condition under test. spawnSync's
// input option closes stdin for the caller, so it cannot reproduce a hang; only spawn can.
test("@important entry point: stdin that never closes still renders and exits", async () => {
  const root = dir("hang-guard");
  const child = spawn(process.execPath, [ENTRY], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: EMPTY_CLAUDE_DIR, CLAUDE_STATUSLINE_STDIN_MS: "50" },
    cwd: TMP,
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.write(payload(root));
  let out = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (c) => { out += c; });
  const code = await new Promise((resolve) => child.on("close", resolve));
  assert.equal(code, 0);
  assert.ok(strip(out).includes("hang-guard"), `got: ${JSON.stringify(out)}`);
});

test("@important paintContext: wraps the text in the colour and leads with the icon, outside it", () => {
  assert.equal(paintContext("12K/1M 12%", { colour: "32", icon: "" }), "\x1b[32m12K/1M 12%\x1b[0m");
  assert.equal(paintContext("12K/1M 12%", { colour: "31", icon: "💀" }), "💀 \x1b[31m12K/1M 12%\x1b[0m");
  assert.equal(paintContext("", { colour: "31", icon: "💀" }), "");
});

test("@important entry point: a full window is red and carries the skull", () => {
  const out = runEntry(payload(dir("proj-hot"), {
    context_window: { context_window_size: 200000, used_percentage: 96,
      current_usage: { input_tokens: 192000, cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0, output_tokens: 0 } },
  }), { claudeDir: dir("claude-hot") });
  assert.equal(out.status, 0);
  assert.ok(out.stdout.includes("\x1b[31m"), `no red: ${JSON.stringify(out.stdout)}`);
  assert.ok(out.stdout.includes("💀"), `no skull: ${JSON.stringify(out.stdout)}`);
});

test("@important entry point: an observed autocompact point makes the icon lead the colour", () => {
  const claudeDir = dir("claude-lead");
  write(join(claudeDir, "state", "autocompact.json"), JSON.stringify({
    models: { "claude-opus-5[1m]": { tokens: 600000, windowSize: 1000000 } },
  }));
  const out = runEntry(payload(dir("proj-lead"), {
    model: { id: "claude-opus-5[1m]", display_name: "Opus 5 (1M context)" },
    context_window: { context_window_size: 1000000, used_percentage: 32,
      current_usage: { input_tokens: 320000, cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0, output_tokens: 0 } },
  }), { claudeDir });
  assert.equal(out.status, 0);
  assert.ok(out.stdout.includes("\x1b[33m"), `expected yellow: ${JSON.stringify(out.stdout)}`);
  assert.ok(out.stdout.includes("💡"), `expected the lamp: ${JSON.stringify(out.stdout)}`);
});

test("@important entry point: a pending observation is promoted and cleared", () => {
  const claudeDir = dir("claude-promote");
  const statePath = join(claudeDir, "state", "autocompact.json");
  write(statePath, JSON.stringify({
    pending: { tokens: 400000, model: "claude-opus-5", at: "2026-07-30T18:00:00Z" },
  }));
  const out = runEntry(payload(dir("proj-promote"), {
    model: { id: "claude-opus-5[1m]", display_name: "Opus 5 (1M context)" },
    context_window: { context_window_size: 1000000, used_percentage: 10,
      current_usage: { input_tokens: 100000, cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0, output_tokens: 0 } },
  }), { claudeDir });
  assert.equal(out.status, 0);
  const after = JSON.parse(readFileSync(statePath, "utf8"));
  assert.equal(after.pending, undefined);
  assert.equal(after.models["claude-opus-5[1m]"].tokens, 400000);
});

/* ---------- gsd hook-patch alarm: only the states that need a human ---------- */

test("@important diverged is surfaced — upstream rewrote the line the patch reasons about", () => {
  const out = renderHookPatches({ "isolation-guard-decomposing-executor": "diverged" });
  assert.match(out, /gsd-patch/);
  assert.match(out, /diverged/);
});

test("@important the alarm segment reaches the rendered line", () => {
  const line = render({ model: "Opus", hookPatches: { x: "diverged" } });
  assert.match(line, /diverged/);
});
