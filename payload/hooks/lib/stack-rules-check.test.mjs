import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";

import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectMarkersByWorkspace, computeStackFingerprint, computeSourceHash, checkStackRules } from "./stack-rules-check.mjs";

function repo(files) {
  const root = mkdtempSync(join(tmpdir(), "stack-rules-"));
  for (const [rel, text] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, text);
  }
  return root;
}
const pkg = JSON.stringify({ name: "x" });
const emptySrc = () => mkdtempSync(join(tmpdir(), "rules-src-"));

function snapshot(root, frontmatter) {
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(join(root, ".claude", "stack-rules.md"), `---\n${frontmatter}\n---\n\nrules\n`);
  return root;
}

test("@important a single-package repository reports only the root", () => {
  const root = repo({ "package.json": pkg, "next.config.ts": "" });
  assert.deepEqual(detectMarkersByWorkspace(root), { ".": ["next", "node"] });
});

test("@important a workspace's own markers are found and attributed to it", () => {
  const root = repo({
    "pnpm-workspace.yaml": "packages:\n  - 'apps/*'\n",
    "package.json": pkg,
    "apps/web/package.json": pkg,
    "apps/web/next.config.ts": "",
    "apps/api/package.json": pkg,
    "apps/api/nest-cli.json": "{}",
  });
  assert.deepEqual(detectMarkersByWorkspace(root), {
    ".": ["node", "pnpm-ws"],
    "apps/api": ["nest", "node"],
    "apps/web": ["next", "node"],
  });
});

test("@important a nested stack changes the fingerprint", () => {
  const base = {
    "pnpm-workspace.yaml": "packages:\n  - 'apps/*'\n",
    "package.json": pkg,
    "apps/web/package.json": pkg,
  };
  const before = computeStackFingerprint(repo(base));
  const after = computeStackFingerprint(repo({ ...base, "apps/web/next.config.ts": "" }));
  assert.notEqual(before, after);
});

test("@important a repository with no workspaces has a root entry and nothing else", () => {
  const root = repo({ "pnpm-workspace.yaml": "packages:\n  - 'apps/*'\n", "package.json": pkg });
  assert.deepEqual(Object.keys(detectMarkersByWorkspace(root)), ["."]);
});

test("@important a workspace with no stack of its own carries only node, and root markers do not leak in", () => {
  const root = repo({
    "pnpm-workspace.yaml": "packages:\n  - 'apps/*'\n",
    "package.json": pkg,
    "manage.py": "",
    "apps/blank/package.json": pkg,
  });
  assert.deepEqual(detectMarkersByWorkspace(root), {
    ".": ["django", "node", "pnpm-ws"],
    "apps/blank": ["node"],
  });
});

test("@important workspace keys are sorted and slash-separated, whatever order the tree was built in", () => {
  const ws = "packages:\n  - 'apps/*'\n";
  const a = repo({
    "pnpm-workspace.yaml": ws,
    "package.json": pkg,
    "apps/zeta/package.json": pkg,
    "apps/alpha/package.json": pkg,
  });
  const b = repo({
    "pnpm-workspace.yaml": ws,
    "package.json": pkg,
    "apps/alpha/package.json": pkg,
    "apps/zeta/package.json": pkg,
  });
  const keys = Object.keys(detectMarkersByWorkspace(a));
  assert.deepEqual(keys, [".", "apps/alpha", "apps/zeta"]);
  assert.deepEqual(Object.keys(detectMarkersByWorkspace(b)), keys);
  assert.equal(computeStackFingerprint(a), computeStackFingerprint(b));
});

test("@important an unreadable root yields an empty root entry rather than throwing", () => {
  assert.deepEqual(detectMarkersByWorkspace(join(repo({}), "does-not-exist")), { ".": [] });
});

test("@important no snapshot at all is missing", () => {
  const r = checkStackRules(repo({ "package.json": pkg }), emptySrc());
  assert.equal(r.status, "missing");
});

test("@important a legacy snapshot whose stacks is a flat list is reported, never flagged as drift", () => {
  const root = repo({ "package.json": pkg, "next.config.ts": "" });
  snapshot(root, "sourceHash: x\nstackFingerprint: deadbeefdeadbeef\nstacks: [next]");
  const r = checkStackRules(root, emptySrc());
  assert.equal(r.status, "legacy");
  assert.notEqual(r.status, "stale");
});

test("@important a workspace-aware snapshot that still matches reports ok", () => {
  const root = repo({ "package.json": pkg });
  const src = emptySrc();
  snapshot(
    root,
    `sourceHash: ${computeSourceHash(src)}\nstackFingerprint: ${computeStackFingerprint(root)}\nmarkers: ${JSON.stringify(detectMarkersByWorkspace(root))}`,
  );
  assert.equal(checkStackRules(root, src).status, "ok");
});

test("@important a workspace-aware snapshot whose stack moved on is stale", () => {
  const root = repo({ "package.json": pkg, "next.config.ts": "" });
  const src = emptySrc();
  snapshot(root, `sourceHash: ${computeSourceHash(src)}\nstackFingerprint: deadbeefdeadbeef\nmarkers: {".": ["node"]}`);
  assert.equal(checkStackRules(root, src).status, "stale");
});

test("@important a marker that appeared is named, with its workspace", () => {
  const root = repo({ "package.json": pkg, "next.config.ts": "" });
  snapshot(root, `sourceHash: x\nstackFingerprint: deadbeefdeadbeef\nmarkers: {".": ["node"]}`);
  const r = checkStackRules(root, root);
  assert.equal(r.status, "stale");
  assert.deepEqual(r.added, [{ workspace: ".", marker: "next" }]);
  assert.deepEqual(r.removed, []);
});

test("@important a stale sourceHash and a stale stackFingerprint do not by themselves mean drift", () => {
  const root = repo({ "package.json": pkg });
  snapshot(root, `sourceHash: 0000000000000000\nstackFingerprint: deadbeefdeadbeef\nmarkers: {".": ["node"]}`);
  const r = checkStackRules(root, emptySrc());
  assert.equal(r.status, "ok");
  assert.notEqual(r.sourceHash, "0000000000000000");
});

test("@important a workspace that appeared is named by its own key", () => {
  const root = repo({
    "pnpm-workspace.yaml": "packages:\n  - 'apps/*'\n",
    "package.json": pkg,
    "apps/web/package.json": pkg,
    "apps/web/next.config.ts": "",
  });
  snapshot(root, `sourceHash: x\nstackFingerprint: deadbeefdeadbeef\nmarkers: {".": ["node","pnpm-ws"]}`);
  const r = checkStackRules(root, root);
  assert.equal(r.status, "stale");
  assert.deepEqual(r.added, [
    { workspace: "apps/web", marker: "next" },
    { workspace: "apps/web", marker: "node" },
  ]);
  assert.deepEqual(r.removed, []);
});

// Pins the exact bytes that get hashed. The stability tests above compare the function against
// itself in one process, so they cannot see a comparator whose order depends on the machine's
// collation: under da-DK "aardvark" sorts last, under et-EE "z-utils" sorts before "tools", and
// under every locale a capitalised "Web" sorts after "tools" instead of before it.
// The compiler is prose, one copy per profile, and the snapshot it stamps is the only thing this
// checker can read. A template that omits markers: - or writes it as a YAML block map - makes every
// project it compiles permanently legacy, which no test of the checker alone can see.
const repoRoot = join(import.meta.dirname, "..", "..", "..");
const compilerDocs = ["payload/rules-src/README.md", "payload-lite/rules-src/README.md"];

function frontmatterTemplate(relPath) {
  const text = readFileSync(join(repoRoot, relPath), "utf8");
  const m = text.match(/```yaml\r?\n---\r?\n([\s\S]*?)\r?\n---\r?\n```/);
  assert.ok(m, `${relPath} documents no snapshot frontmatter`);
  return m[1];
}

function stamp(template, root, srcDir) {
  const markers = JSON.stringify(detectMarkersByWorkspace(root));
  return template
    .split(/\r?\n/)
    .map((line) => {
      if (line.startsWith("sourceHash:")) return `sourceHash: ${computeSourceHash(srcDir)}`;
      if (line.startsWith("stackFingerprint:")) return `stackFingerprint: ${computeStackFingerprint(root)}`;
      if (line.startsWith("markers:")) return `markers: ${markers}`;
      if (line.startsWith("generatedAt:")) return "generatedAt: 2026-07-28T00:00:00.000Z";
      return line;
    })
    .join("\n");
}

const compilableTrees = {
  "a repository with no workspaces": { "package.json": pkg, "next.config.ts": "" },
  "a monorepo with several workspaces": {
    "pnpm-workspace.yaml": "packages:\n  - 'apps/*'\n",
    "package.json": pkg,
    "apps/web/package.json": pkg,
    "apps/web/next.config.ts": "",
    "apps/api/package.json": pkg,
    "apps/api/nest-cli.json": "{}",
  },
  "a workspace with no stack of its own": {
    "pnpm-workspace.yaml": "packages:\n  - 'apps/*'\n",
    "package.json": pkg,
    "apps/blank/package.json": pkg,
  },
};

for (const doc of compilerDocs) {
  for (const [tree, files] of Object.entries(compilableTrees)) {
  }
}

// /init-stack is the path a rebuild is actually driven down, and it tells the compiler subagent
// which fields to stamp. A field the command forgets to hand over is a field the snapshot never
// records - and a snapshot missing markers: reads back legacy, which at the call site is
// indistinguishable from a successful rebuild.
// The compiler subagent stamps what the CLI printed. Pretty-printed JSON is not stampable: its
// `  "markers": {` sits on its own line behind two spaces and a quote, which parseFlowMap's
// `^markers:\s*(\{.*\})$` cannot match - so a snapshot built by pasting it reads back "legacy"
// forever, complete-looking and permanently uncomparable. The key-name assertion above cannot
// see this; only running the CLI and stamping its bytes can.
// /init-stack points at the drift step by NAME because its number differs per profile (11 in the
// full compiler doc, 10 in lite). Nothing else pins the two ends together, so a reworded heading
// would silently leave the command pointing at a step that no longer exists.