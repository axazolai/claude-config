// Whether `node setup.mjs` should put CLAUDE_CODE_USE_POWERSHELL_TOOL into ~/.claude/settings.json
// on this machine. Pure decision only - setup.mjs runs pwsh, winget and the prompts.
//
// The key stays a recorded one-time decision rather than a value the installer keeps asserting,
// because the PowerShell tool is a preview whose commands are confirmed by hand even in an
// auto-approved session: re-deciding it on every run would flip that behaviour under a machine
// whose owner already chose. "0" is as final an answer as "1".

export const MIN_PWSH_MAJOR = 7;
export const ENV_KEY = "CLAUDE_CODE_USE_POWERSHELL_TOOL";

export function parsePwshMajor(stdout) {
  const m = /^(\d+)\.\d+/.exec(String(stdout ?? "").trim());
  return m ? Number(m[1]) : null;
}

export function powerShellToolPlan({ os, env = {}, flag = false, interactive = false, pwshMajor = null } = {}) {
  if (os !== "win32") return { action: "skip", reason: "not-windows" };
  if (env && ENV_KEY in env) return { action: "skip", reason: "already-decided" };
  const usable = typeof pwshMajor === "number" && pwshMajor >= MIN_PWSH_MAJOR;
  if (flag) return usable ? { action: "write", value: "1" } : { action: "blocked", reason: "no-pwsh" };
  if (!interactive) return { action: "skip", reason: "non-interactive" };
  return usable ? { action: "offer-enable" } : { action: "offer-install" };
}
