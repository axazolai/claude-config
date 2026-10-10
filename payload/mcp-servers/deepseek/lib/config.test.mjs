import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dsConfig } from "./config.mjs";

const saved = {};
for (const k of ["CLAUDE_CONFIG_DIR", "DS_GATEWAY", "DS_BACKEND", "DS_MODEL", "LLM_KEY"]) saved[k] = process.env[k];
afterEach(() => { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

function withDir(cfg) {
  const d = mkdtempSync(join(tmpdir(), "ds-cfg-"));
  if (cfg !== undefined) writeFileSync(join(d, "deepseek.config.json"), typeof cfg === "string" ? cfg : JSON.stringify(cfg));
  process.env.CLAUDE_CONFIG_DIR = d;
  for (const k of ["DS_GATEWAY", "DS_BACKEND", "DS_MODEL", "LLM_KEY"]) delete process.env[k];
  return { d, cleanup: () => rmSync(d, { recursive: true, force: true }) };
}

test("@important dsConfig: reads gateway/backend/key from the config file", () => {
  const t = withDir({ gateway: "http://gw", backend: "http://be", key: "sk-file" });
  try { const c = dsConfig(); assert.equal(c.gateway, "http://gw"); assert.equal(c.backend, "http://be"); assert.equal(c.key, "sk-file"); }
  finally { t.cleanup(); }
});

test("@important dsConfig: env overrides the file; LLM_KEY overrides the stored key", () => {
  const t = withDir({ gateway: "http://file-gw", key: "sk-file" });
  try { process.env.DS_GATEWAY = "http://env-gw"; process.env.LLM_KEY = "sk-env";
    const c = dsConfig(); assert.equal(c.gateway, "http://env-gw"); assert.equal(c.key, "sk-env"); }
  finally { t.cleanup(); }
});

test("@important dsConfig: no file and no env -> nulls (gateway/key), default model; never throws", () => {
  const t = withDir(undefined);
  try { const c = dsConfig(); assert.equal(c.gateway, null); assert.equal(c.key, null); assert.equal(c.model, "local/DeepSeek-V4.1-Flash"); }
  finally { t.cleanup(); }
});

test("@important normalizeGateway: bare IP gets http and the default port; IP:port keeps its port; a URL is kept", async () => {
  const { normalizeGateway } = await import("./config.mjs");
  assert.equal(normalizeGateway("10.81.0.13"), "http://10.81.0.13:4002");
  assert.equal(normalizeGateway(" 10.81.0.13:5000 "), "http://10.81.0.13:5000");
  assert.equal(normalizeGateway("https://gw.example/"), "https://gw.example");
  assert.equal(normalizeGateway("http://10.0.0.1:81"), "http://10.0.0.1:81");
  assert.equal(normalizeGateway(""), null);
  assert.equal(normalizeGateway(undefined), null);
});

test("@important dsConfig: a bare IP in the file resolves to the full gateway URL", () => {
  const t = withDir({ gateway: "10.81.0.13", key: "k" });
  try { assert.equal(dsConfig().gateway, "http://10.81.0.13:4002"); } finally { t.cleanup(); }
});
