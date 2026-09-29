import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRecord } from "./rung-usage-log.mjs";

const HOOK = fileURLToPath(new URL("./rung-usage-log.mjs", import.meta.url));
const NOW = new Date("2026-09-29T00:00:00Z");
const entry = (model, usage) => ({ type: "assistant", message: { model, usage } });
const ENTRIES = [
  entry("claude-sonnet-5-5-20260901", { input_tokens: 5, output_tokens: 100, cache_read_input_tokens: 1000, cache_creation_input_tokens: 20 }),
  { type: "user", message: {} },
  entry("claude-sonnet-5-5", { input_tokens: 7, output_tokens: 50 }),
];

function run(input, env = {}) {
  const dir = mkdtempSync(join(tmpdir(), "cc-rung-log-"));
  const r = spawnSync(process.execPath, [HOOK], { input, encoding: "utf8", env: { ...process.env, CLAUDE_CONFIG_DIR: dir, ...env } });
  const log = join(dir, "state", "token-usage.jsonl");
  return { r, log, dir, lines: existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : [] };
}

test("@important a rung agent's usage is summed, the model loses its date suffix, effort comes from the name", () => {
  const rec = buildRecord({ agent_type: "rung-sonnet-high", session_id: "s1" }, ENTRIES, NOW);
  assert.deepEqual(rec, {
    date: "2026-09-29T00:00:00.000Z", session_id: "s1", agent: "rung-sonnet-high", model: "claude-sonnet-5-5", effort: "high",
    input_tokens: 12, output_tokens: 150, cache_read_tokens: 1000, cache_creation_tokens: 20,
  });
});

test("@important agents that are not effort-bearing rungs log effort null", () => {
  for (const agent of ["general-purpose", "rung-haiku", "rung-sonnet-max"]) assert.equal(buildRecord({ agent_type: agent }, ENTRIES, NOW).effort, null, agent);
  assert.equal(buildRecord({ agent_type: "rung-opus-medium" }, ENTRIES, NOW).effort, "medium");
});

test("@important a transcript with no usage-bearing assistant entry yields no record", () => {
  assert.equal(buildRecord({ agent_type: "rung-opus-high" }, [{ type: "user" }, { type: "assistant", message: {} }], NOW), null);
});

test("@important stdin that is null, empty or not JSON exits 0 and writes nothing", () => {
  for (const input of ["null", "", "not json"]) {
    const { r, log, dir } = run(input);
    assert.equal(r.status, 0, input);
    assert.equal(existsSync(log), false, `wrote a log for stdin ${JSON.stringify(input)}`);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("@important a SubagentStop with no or an unreadable transcript path exits 0 and writes nothing", () => {
  for (const extra of [{}, { agent_transcript_path: join(tmpdir(), "cc-rung-log-does-not-exist.jsonl") }]) {
    const { r, log, dir } = run(JSON.stringify({ hook_event_name: "SubagentStop", agent_type: "rung-opus-high", ...extra }));
    assert.equal(r.status, 0);
    assert.equal(existsSync(log), false);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("@important a SubagentStop from a rung agent appends one record to the config dir's log", () => {
  const tdir = mkdtempSync(join(tmpdir(), "cc-rung-tr-"));
  const transcript = join(tdir, "agent.jsonl");
  writeFileSync(transcript, ENTRIES.map((e) => JSON.stringify(e)).join("\n") + "\n");
  const { r, lines, dir } = run(JSON.stringify({ hook_event_name: "SubagentStop", agent_type: "rung-sonnet-medium", session_id: "s9", agent_transcript_path: transcript }));
  assert.equal(r.status, 0);
  assert.equal(lines.length, 1);
  const rec = JSON.parse(lines[0]);
  assert.equal(rec.agent, "rung-sonnet-medium");
  assert.equal(rec.effort, "medium");
  assert.equal(rec.output_tokens, 150);
  assert.equal("task" in rec, false);
  rmSync(dir, { recursive: true, force: true });
  rmSync(tdir, { recursive: true, force: true });
});
