// payload/bin/lib/pnpm-workspace-yaml.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { addOptionalPeers } from "./pnpm-workspace-yaml.mjs";



test("@critical fail-safe on flow-style packageExtensions (no write)", () => {
  const flow = "packageExtensions: { '@a/b': { peerDependencies: { zod: '*' } } }\n";
  const r = addOptionalPeers(flow, new Map([["@a/b", ["yup"]]]));
  assert.equal(r.safe, false);
  assert.equal(r.text, flow); // unchanged
});
