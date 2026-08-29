#!/usr/bin/env node
// PostToolUse guard (matcher: Bash). After a `git push`, inject a non-blocking reminder that the
// post-push prune is due: every test not tagged @critical or @important goes, then the
// empty-shell sweep, then the linter. Fires only while untagged tests actually remain, so the
// prune's own push does not re-raise it. The prune needs confirmation before anything is
// deleted, so this hook only raises it — it never deletes.
// Fail-open: any error => exit 0, no output.
// Never rename this to `test-*.mjs`: `node --test` treats that as a test file, runs the hook as
// one, and the stdin read below then hangs the whole suite.
import { readFileSync, existsSync, readdirSync, statSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isGitPush } from "./lib/git-command.mjs";

const SKIP_DIRS = new Set([
  ".git", "node_modules", "dist", "build", "out", "target", "vendor", "coverage",
  ".venv", "venv", "__pycache__", ".next", ".turbo", ".gradle", "bin", "obj",
]);
const TEST_FILE = /(\.(test|spec)\.[cm]?[jt]sx?$)|(^test_.*\.py$)|(_test\.py$)|(_test\.go$)|((Test|Tests|Spec)\.(kt|java|cs|swift)$)/;
// The call form requires a literal or a table right after `(`, so prose like "run it (the suite)"
// is not read as a declaration.
const TEST_DECL = /(^|[\s.;{(])(test|it)(\s*\.\s*\w+)*\s*\(\s*["'`[]|^\s*(async\s+)?def\s+test_|^\s*func\s+Test[A-Z_]|^\s*@Test\b|^\s*\[(Fact|Theory|Test|TestMethod)\b/;
export const TAG = /@(critical|important)\b/;
const MAX_DIRS = 400;
const MAX_FILES = 300;
const MAX_BYTES = 512 * 1024;

export function repoRoot(start) {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// A declaration is tagged when the tag sits on its own line or the one after it — annotation
// styles (@Test, [Fact]) carry the name on the following line.
export function hasUntaggedTest(source) {
  const lines = String(source).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!TEST_DECL.test(lines[i])) continue;
    if (TAG.test(lines[i]) || TAG.test(lines[i + 1] || "")) continue;
    return true;
  }
  return false;
}

export function findUntaggedTests(root) {
  const queue = [root];
  let dirs = 0, files = 0;
  while (queue.length && dirs < MAX_DIRS) {
    const dir = queue.shift();
    dirs++;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) queue.push(full);
        continue;
      }
      if (!TEST_FILE.test(e.name) || files >= MAX_FILES) continue;
      files++;
      try {
        if (statSync(full).size > MAX_BYTES) continue;
        if (hasUntaggedTest(readFileSync(full, "utf8"))) return true;
      } catch { /* unreadable file is not evidence */ }
    }
  }
  return false;
}

export const MESSAGE =
  "Pushed, and untagged tests remain. The post-push prune is due. Every test whose name does NOT " +
  "carry @critical or @important is deleted: @critical = a failure means a crash, data loss or " +
  "corruption, a security bypass, a money error, or a broken core workflow; @important = the test " +
  "asserts the behaviour of a function, procedure, computation or transformation (input -> " +
  "output), and the correct result is not obvious from reading the code. Everything else goes: " +
  "obvious mappings and passthroughs, cosmetic formatting, structural, wiring, registry and " +
  "documentation-consistency checks, and every @temp test whose feature is now pushed — @temp " +
  "needs no confirmation, the tag is the consent. Then sweep the residue: no test file left " +
  "empty, no empty describe/suite/class " +
  "block, no fixture, helper or import orphaned by the deletion. Then run the project's linter if " +
  "it configures one, re-run the surviving suite, and commit the prune. Delete nothing yet — list " +
  "the candidates, state what survives, and ask for confirmation first.";

function main() {
  let d = {};
  try { d = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { return; }
  const cmd = ((d.tool_input || {}).command) || "";
  if (!isGitPush(cmd)) return;
  const root = repoRoot(d.cwd || process.cwd());
  if (!root || !findUntaggedTests(root)) return;

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: MESSAGE },
  }));
}

// Symlink-robust entry-point check: Node realpaths import.meta.url, but process.argv[1] keeps the
// (possibly symlinked) invocation path — so a symlinked ~/.claude makes the naive equality FALSE
// and main() never runs. Match the raw OR the realpath'd argv[1].
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
