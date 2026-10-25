// Shared `git <subcommand>` recognition for Bash-matcher hooks (ci-watch-nudge.mjs,
// prune-tests-nudge.mjs), so neither imports the other.

// First non-flag token after `git`, honouring the value-taking globals `-C <path>` / `-c <kv>`.
export function gitSubcommand(tokens) {
  let i = 1;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t === "-C" || t === "-c") { i += 2; continue; }
    if (t.startsWith("-")) { i++; continue; }
    return t;
  }
  return null;
}

export function isGitSubcommand(cmd, subcommand) {
  for (const seg of String(cmd || "").split(/&&|\|\||;|\|/)) {
    const tokens = seg.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    if (tokens[0] !== "git" && tokens[0] !== "git.exe") continue;
    if (gitSubcommand(tokens) === subcommand) return true;
  }
  return false;
}

export const isGitPush = (cmd) => isGitSubcommand(cmd, "push");
