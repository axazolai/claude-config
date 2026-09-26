#!/usr/bin/env node
// Runs `node --test` with every temp dir the tests create under
// <repo>/.claude/.scratchpad/test-tmp/<run>, then deletes that run's directory.
// Usage: node run-tests.mjs [node --test args...]
import { mkdirSync, rmSync, rmdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = dirname(fileURLToPath(import.meta.url));
const base = join(root, ".claude", ".scratchpad", "test-tmp");
const run = join(base, `run-${process.pid}-${Date.now()}`);
mkdirSync(run, { recursive: true });
// The ceiling keeps git inside a test's own temp project instead of finding this repository above it.
const env = { ...process.env, TMPDIR: run, TEMP: run, TMP: run, GIT_CEILING_DIRECTORIES: run };
const r = spawnSync(process.execPath, ["--test", ...process.argv.slice(2)], { stdio: "inherit", env, cwd: root });
rmSync(run, { recursive: true, force: true });
try { rmdirSync(base); } catch { /* another run still owns a directory here */ }
process.exit(r.status ?? 1);
