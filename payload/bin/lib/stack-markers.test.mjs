import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

import { detect, detectStacks } from "./stack-markers.mjs";

function tmp(files) {
  const d = mkdtempSync(join(tmpdir(), "sm-"));
  for (const [rel, content] of Object.entries(files)) {
    const p = join(d, ...rel.split("/"));
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  return d;
}

test("@important react-native wins over react (RN pulls react in)", () => {
  const d = tmp({ "package.json": JSON.stringify({ dependencies: { react: "18", "react-native": "0.74" } }) });
  const s = detect(d);
  assert.ok(s.includes("react-native") && !s.includes("react"), s.join(","));
});

test("@important bare node fallback fires only when no framework matched", () => {
  const d = tmp({ "package.json": JSON.stringify({ dependencies: { lodash: "4" } }) });
  const s = detect(d);
  assert.deepEqual(s, ["node"]);
});

test("@important bare node fallback is suppressed when a framework matched", () => {
  const d = tmp({ "package.json": JSON.stringify({ dependencies: { next: "14" } }) });
  const s = detect(d);
  assert.ok(s.includes("next") && !s.includes("node"), s.join(","));
});

test("@important android is gated on AndroidManifest.xml, not bare kotlin files", () => {
  const d = tmp({ "app/build.gradle.kts": "" });
  const s = detect(d);
  assert.ok(s.includes("kotlin") && !s.includes("android"), s.join(","));
});

test("@important dart checked before swift: Flutter's vendored ios/ project does not false-positive as swift", () => {
  const d = tmp({
    "pubspec.yaml": "name: app",
    "ios/Runner.xcodeproj/project.pbxproj": "",
  });
  const s = detect(d);
  assert.ok(s.includes("dart") && !s.includes("swift"), s.join(","));
});

test("@important csharp subtypes are mutually exclusive: WPF from <UseWPF>", () => {
  const d = tmp({ "App.csproj": "<Project><PropertyGroup><UseWPF>true</UseWPF></PropertyGroup></Project>" });
  const s = detect(d);
  assert.ok(s.includes("wpf") && !s.includes("aspnet") && !s.includes("csharp-cli"), s.join(","));
});

test("@important PRUNE excludes node_modules/.git/etc from marker walks", () => {
  const d = tmp({ "node_modules/pkg/Foo.kt": "", ".git/hooks/pre-commit.kts": "" });
  const s = detect(d);
  assert.deepEqual(s, []);
});

test("@important kitchen sink: multi-stack repo returns ids in insertion order, deduped", () => {
  const d = tmp({
    "package.json": JSON.stringify({ dependencies: { next: "14" } }),
    "pyproject.toml": "[project]\ndependencies = ['fastapi']",
    "turbo.json": "{}",
    "schema.sql": "select 1;",
  });
  const s = detect(d);
  assert.deepEqual(s, ["next", "fastapi", "turbo", "sql"]);
});

test("@important detectStacks({root}) wraps detect(root)", () => {
  const d = tmp({ "package.json": JSON.stringify({ dependencies: { next: "14" } }) });
  assert.deepEqual(detectStacks({ root: d }), detect(d));
});
