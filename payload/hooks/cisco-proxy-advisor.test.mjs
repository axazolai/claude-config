import { test } from "node:test";
import assert from "node:assert/strict";
import { decide } from "./cisco-proxy-advisor.mjs";

const base = { platform: "win32", present: true, up: false, proxySet: false, proxyStr: "http://192.168.8.100:1099", launcher: "/h/.claude/bin/claude-tunnel.ps1", relaunch: "pwsh ...", remindWhenDown: true };




test("@critical decide: Cisco up and no proxy warns with the relaunch command", () => {
  const r = decide({ ...base, up: true, proxySet: false, relaunch: "pwsh -File x -Port 1099 -- a" });
  assert.equal(r.level, "warn");
  assert.match(r.context, /NOT on the tunnel proxy/);
  assert.match(r.context, /pwsh -File x -Port 1099/);
});





