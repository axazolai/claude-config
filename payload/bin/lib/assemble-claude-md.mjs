// Assembles the curated ~/.claude/CLAUDE.md from the fragments in payload/claude-md/.
// Self-contained (only node:* imports) so setup.mjs can import it directly.
//
// Fragments are `NN-stem.md`, emitted in NN order. A leading `---…---` frontmatter block is
// stripped. Output always starts with the CURATED:NOEDIT marker (installer invariant) - never
// hand-edit the assembled file.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const HEADER = "<!-- CURATED:NOEDIT -->\n";

export function parseFragment(text) {
  // Normalize line endings FIRST: the repo has core.autocrlf=true, so a fresh Windows checkout
  // materializes payload/claude-md/*.md with CRLF even though they're authored/stored as LF.
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const m = text.match(/^---\n[\s\S]*?\n---\n?/);
  const body = (m ? text.slice(m[0].length) : text).replace(/^\n+/, "");
  return { body };
}

export function assembleClaudeMd(fragmentsDir) {
  const files = readdirSync(fragmentsDir).filter((f) => /^\d\d-[a-z0-9-]+\.md$/.test(f)).sort();
  const parts = files.map((f) => parseFragment(readFileSync(join(fragmentsDir, f), "utf8")).body.trimEnd());
  return HEADER + "\n" + parts.join("\n\n") + "\n";
}
