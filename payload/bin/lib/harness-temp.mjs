import { tmpdir as osTmpdir } from "node:os";
import { join, basename } from "node:path";
export { harnessSessionDirs, activeSessionIds } from "./claude-cleanup-lib.mjs";

export function harnessTempRoot(env = process.env, platform = process.platform, tmp = osTmpdir(), uid = process.getuid?.()) {
  const base = env.CLAUDE_CODE_TMPDIR || tmp;
  const leaf = platform === "win32" ? "claude" : `claude-${uid}`;
  return basename(base).toLowerCase() === leaf.toLowerCase() ? base : join(base, leaf);
}
