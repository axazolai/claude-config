#!/usr/bin/env node
// SessionStart hook (win32-only effect, silent no-op everywhere else).
//
// Purpose: a running Claude Code session cannot be rerouted (HTTPS_PROXY is read once, at
// process start), so this hook only DETECTS and ADVISES. When the Cisco corporate VPN is up and
// the current session is NOT going through the home-tunnel proxy, api.anthropic.com can be
// blocked by the corporate egress (ECONNRESET). The hook surfaces that and prints the exact
// relaunch command. Enforcement itself lives in the launcher (bin/claude-tunnel.ps1).
//
// Personal-use context only (see project memory `cisco-proxy-authorization`): this concerns the
// user's own machine, router and tunnel, for their own Claude Code use.
//
// Config (optional): <CLAUDE_CONFIG_DIR>/cisco-proxy.json
//   { "proxyHost": "192.168.8.100", "proxyPort": 1099, "proxyUser": null,
//     "vpnMatch": "Cisco|AnyConnect", "remindWhenDown": true }
// Master switch: CLAUDE_CISCO_PROXY=0 disables the hook entirely. Never blocks the session.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "./lib/spawn-hidden.mjs";

const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");

function emit(ctx) {
  try {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: ctx || "" },
    }));
  } catch { /* ignore */ }
  process.exit(0);
}

function loadConfig() {
  try {
    const raw = readFileSync(join(CLAUDE_DIR, "cisco-proxy.json"), "utf8").replace(/^﻿/, "");
    return JSON.parse(raw);
  } catch { return {}; }
}

// Best-effort, fast adapter probe via getmac (lists disconnected-but-enabled adapters too).
// Returns { present, up }. A fully DISABLED adapter may be invisible here — that's acceptable,
// the launcher re-checks thoroughly with Get-NetAdapter at launch.
export function detectCisco(match = "Cisco|AnyConnect", runner = defaultGetmac) {
  const out = runner();
  if (!out) return { present: false, up: false };
  const re = new RegExp(match, "i");
  for (const line of out.split(/\r?\n/)) {
    // CSV: "Connection Name","Network Adapter","Physical Address","Transport Name"
    const cols = line.split(",").map((c) => c.replace(/^"|"$/g, ""));
    if (cols.length < 4) continue;
    if (!re.test(cols[0]) && !re.test(cols[1])) continue;
    const transport = cols[3] || "";
    const up = /\\Device|Tcpip/i.test(transport); // a real transport binding = connected
    return { present: true, up };
  }
  return { present: false, up: false };
}

function defaultGetmac() {
  try {
    const r = spawnSync("getmac", ["/v", "/fo", "csv", "/nh"], { encoding: "utf8", timeout: 5000 });
    return r.status === 0 ? (r.stdout || "") : "";
  } catch { return ""; }
}

// Pure decision table — unit-tested. `s` carries the resolved state.
export function decide(s) {
  if (s.platform !== "win32" || !s.present) return { level: "noop", context: "" };
  if (s.proxySet) {
    return { level: "ok", context: `[cisco-proxy] OK: this session routes through the tunnel proxy ${s.proxyStr}; the Cisco corporate egress is bypassed.` };
  }
  if (s.up) {
    return { level: "warn", context: `[cisco-proxy] WARNING: the Cisco VPN is connected but this Claude Code session is NOT on the tunnel proxy. api.anthropic.com may be blocked by the corporate egress (ECONNRESET / stalled requests). To route around Cisco, exit and relaunch:\n    ${s.relaunch}` };
  }
  if (s.remindWhenDown) {
    return { level: "note", context: `[cisco-proxy] Note: the Cisco VPN adapter is present but not connected. If you connect it during this session, relaunch Claude Code via ${s.launcher} so its traffic uses your home tunnel instead of the corporate egress.` };
  }
  return { level: "noop", context: "" };
}

function main() {
  if (process.env.CLAUDE_CISCO_PROXY === "0") emit("");
  if (process.platform !== "win32") emit("");

  const cfg = loadConfig();
  const match = cfg.vpnMatch || "Cisco|AnyConnect";
  const { present, up } = detectCisco(match);
  const proxySet = !!(process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy);

  const host = cfg.proxyHost || "192.168.8.100";
  const port = cfg.proxyPort || null;
  const launcher = `${CLAUDE_DIR.replace(/\\/g, "/")}/bin/claude-tunnel.ps1`;
  const portArg = port ? ` -Port ${port}` : " -Port <port>";
  const relaunch = `pwsh -File "${launcher}"${portArg} -- <your claude args>`;
  const proxyStr = port ? `http://${host}:${port}` : `http://${host}`;

  const { context } = decide({
    platform: process.platform,
    present, up, proxySet, proxyStr, launcher, relaunch,
    remindWhenDown: cfg.remindWhenDown !== false,
  });
  emit(context);
}

function isMain() {
  const a = process.argv[1];
  if (!a) return false;
  try { return import.meta.url === pathToFileURL(a).href; } catch { return false; }
}

if (isMain()) main();
