import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./claude-cleanup.mjs";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "claude-cleanup.mjs");

test("@important parseArgs: scan with excludes + temp-root", () => {
  const { cmd, opts } = parseArgs(["scan", "--temp-root", "C:/t", "--exclude-session", "u1", "--exclude-session", "u2"]);
  assert.equal(cmd, "scan"); assert.equal(opts.tempRoot, "C:/t");
  assert.deepEqual(opts.excludeSession, ["u1", "u2"]);
});
test("@important parseArgs: restore --ts", () => {
  const { cmd, opts } = parseArgs(["restore", "--ts", "T1"]);
  assert.equal(cmd, "restore"); assert.equal(opts.ts, "T1");
});
test("@important parseArgs: bare command defaults to scan", () => {
  assert.equal(parseArgs([]).cmd, "scan");
});
test("@important scan reports an unreadable session registry in the plan and on stderr", () => {
  const d = mkdtempSync(join(tmpdir(), "ccl-"));
  const config = join(d, "config"), tempRoot = join(d, "temp");
  mkdirSync(config); mkdirSync(tempRoot);
  const scan = () => spawnSync(process.execPath, [CLI, "scan", "--temp-root", tempRoot], { encoding: "utf8",
    env: { ...process.env, CLAUDE_CONFIG_DIR: config } });
  let r = scan();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).registry, "unavailable");
  assert.match(r.stderr, /registry: unavailable/);
  mkdirSync(join(config, "sessions"));
  r = scan();
  assert.equal(JSON.parse(r.stdout).registry, "ok");
  assert.doesNotMatch(r.stderr, /registry/);
  rmSync(d, { recursive: true, force: true });
});
