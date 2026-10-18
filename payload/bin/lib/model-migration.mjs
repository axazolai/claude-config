// Deploy-time old-model migrator. One pure, value-compare function — same non-clobber ethos as the
// §6.1 frontmatter setter: only a KNOWN-old value ever moves; anything the user chose deliberately
// is returned unchanged. No I/O here; the caller (setup.mjs) owns reads/writes/prompts.

// ---- session model (settings.json "model") ----
// Tier-preserving: an old opus id -> claude-opus-5-5, an old sonnet id -> claude-sonnet-5-5, an old
// haiku id -> claude-haiku-5-5. Explicit per-family prefixes (not a "not in current allowlist"
// heuristic) so a future claude-opus-6 is never mis-flagged and no migration crosses tiers.
// `exact` ids match with any `[...]` suffix stripped: claude-opus-5 and claude-sonnet-5 are prefixes
// of claude-opus-5-5 / claude-sonnet-5-5 and of any later -5-N, so they cannot be prefix entries.
// `opus[1m]` is the one alias that migrates: Opus 5.5 already serves a 1M window by default, so the
// suffix buys nothing, and it makes the string invalid under CLAUDE_CODE_DISABLE_1M_CONTEXT. Bare
// `opus` and every other alias still pass through untouched.
const SUPERSEDED_MODEL_FAMILIES = [
  { target: "claude-opus-5-5", prefixes: ["claude-opus-4", "claude-3-opus", "opus[1m]"], exact: ["claude-opus-5"] },
  { target: "claude-sonnet-5-5", prefixes: ["claude-sonnet-4", "claude-3-5-sonnet", "claude-3-7-sonnet"], exact: ["claude-sonnet-5"] },
  { target: "claude-haiku-5-5", prefixes: ["claude-haiku-4", "claude-3-5-haiku", "claude-3-haiku"] },
];

export function migrateSettingsModel(model) {
  if (typeof model !== "string" || !model) return { value: model, changed: false };
  const bare = model.replace(/\[[^\]]*\]$/, "");
  for (const fam of SUPERSEDED_MODEL_FAMILIES) {
    if (fam.prefixes.some((p) => model.startsWith(p)) || fam.exact?.includes(bare)) {
      return { value: fam.target, changed: true, from: model };
    }
  }
  return { value: model, changed: false };
}
