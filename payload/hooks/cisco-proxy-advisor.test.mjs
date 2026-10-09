import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { decide, detectCisco } from "./cisco-proxy-advisor.mjs";

const HOOK = fileURLToPath(new URL("./cisco-proxy-advisor.mjs", import.meta.url));
const base = { platform: "win32", present: true, up: false, proxySet: false, proxyStr: "http://192.168.8.100:1099", launcher: "/h/.claude/bin/claude-tunnel.ps1", relaunch: "pwsh ...", remindWhenDown: true };

test("@important decide: non-win32 is always a silent no-op", () => {
  assert.equal(decide({ ...base, platform: "linux", up: true }).level, "noop");
  assert.equal(decide({ ...base, platform: "darwin", proxySet: true }).context, "");
});

test("@important decide: no Cisco adapter present is a silent no-op", () => {
  assert.equal(decide({ ...base, present: false, up: true }).level, "noop");
});

test("@important decide: proxy already set wins over adapter state", () => {
  const r = decide({ ...base, up: true, proxySet: true });
  assert.equal(r.level, "ok");
  assert.match(r.context, /routes through the tunnel proxy/);
  assert.match(r.context, /192\.168\.8\.100:1099/);
});

test("@critical decide: Cisco up and no proxy warns with the relaunch command", () => {
  const r = decide({ ...base, up: true, proxySet: false, relaunch: "pwsh -File x -Port 1099 -- a" });
  assert.equal(r.level, "warn");
  assert.match(r.context, /NOT on the tunnel proxy/);
  assert.match(r.context, /pwsh -File x -Port 1099/);
});

test("@important decide: Cisco present but down reminds only when remindWhenDown", () => {
  assert.equal(decide({ ...base, up: false, remindWhenDown: true }).level, "note");
  assert.equal(decide({ ...base, up: false, remindWhenDown: false }).level, "noop");
});

test("@important detectCisco: connected adapter parsed as present+up", () => {
  const csv = '"Ethernet","Realtek PCIe","AA-BB","\\Device\\Tcpip_{1}"\r\n"Ethernet 2","Cisco AnyConnect Virtual Miniport Adapter","00-05-9A","\\Device\\Tcpip_{2}"';
  assert.deepEqual(detectCisco("Cisco|AnyConnect", () => csv), { present: true, up: true });
});

test("@important detectCisco: disconnected adapter parsed as present+down", () => {
  const csv = '"Ethernet 2","Cisco AnyConnect Virtual Miniport Adapter","N/A","Media disconnected"';
  assert.deepEqual(detectCisco("Cisco|AnyConnect", () => csv), { present: true, up: false });
});

test("@important detectCisco: no matching adapter is absent", () => {
  const csv = '"Wi-Fi","Intel Wireless","CC-DD","\\Device\\Tcpip_{3}"';
  assert.deepEqual(detectCisco("Cisco|AnyConnect", () => csv), { present: false, up: false });
  assert.deepEqual(detectCisco("Cisco|AnyConnect", () => ""), { present: false, up: false });
});

test("@important hook emits valid SessionStart JSON and never errors", () => {
  const r = spawnSync(process.execPath, [HOOK], { input: "{}", encoding: "utf8", env: { ...process.env, CLAUDE_CISCO_PROXY: "0" } });
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, "SessionStart");
});
