import { test } from "node:test";
import assert from "node:assert/strict";
import { commandsForMarkers } from "./stack-commands.mjs";

test("@important pnpm workspace → workspace-root script form", () => {
  assert.deepEqual(commandsForMarkers(["node", "pnpm-ws"]), { test: "pnpm -w test", build: "pnpm -w build" });
});
test("@important native beats co-present JS (kotlin + node → gradlew)", () => {
  assert.deepEqual(commandsForMarkers(["node", "kotlin"]), { test: "./gradlew test", build: "./gradlew build" });
});
test("@important unknown stack → nulls", () => {
  assert.deepEqual(commandsForMarkers(["docker", "ci"]), { test: null, build: null });
});
