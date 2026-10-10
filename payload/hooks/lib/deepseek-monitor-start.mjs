// SessionStart: keep the DeepSeek health monitor running while offload is in use. The monitor
// exits after two idle hours and /deep-model-effort is its only other starter.
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveLevel } from "./deepseek-mode.mjs";

export async function startMonitorIfUsed({ root, claudeDir, resolve = resolveLevel, ensure } = {}) {
  if (resolve(root, claudeDir) === "off") return false;
  const run = ensure || (await import(pathToFileURL(join(claudeDir, "bin", "deepseek-health.mjs")).href)).ensureMonitor;
  return Boolean(run(claudeDir));
}
