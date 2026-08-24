const CHANGELOG_URL = "https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md";
const HEADING_RE = /^##\s+(\d+\.\d+\.\d+)\s*$/;
const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/;

export function parseVer(s) {
  const m = VERSION_RE.exec(String(s ?? "").trim());
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

export function compareVer(a, b) {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

export function parseChangelogSections(changelogText) {
  const lines = changelogText.split(/\r?\n/);
  const sections = [];
  let current = null;
  for (const line of lines) {
    const m = HEADING_RE.exec(line);
    if (m) { current = { version: m[1], bullets: [] }; sections.push(current); continue; }
    if (!current) continue;
    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) current.bullets.push(trimmed.slice(2).trim());
  }
  return sections;
}

export function sliceChangelogRange(changelogText, fromVersion, toVersion) {
  const from = parseVer(fromVersion);
  const to = parseVer(toVersion);
  return parseChangelogSections(changelogText).filter((s) => {
    const v = parseVer(s.version);
    if (!v) return false;
    if (to && compareVer(v, to) > 0) return false;
    if (from && compareVer(v, from) <= 0) return false;
    return true;
  });
}

export function formatChangelogSlice(entries) {
  if (!entries.length) return "";
  return entries.map((e) => `## ${e.version}\n${e.bullets.map((b) => `- ${b}`).join("\n")}`).join("\n\n");
}

export async function realFetchChangelogText() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(CHANGELOG_URL, { signal: ctrl.signal, headers: { "User-Agent": "claude-config-changelog-check" } });
    if (!res.ok) throw new Error(`GitHub returned ${res.status} for CHANGELOG.md`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

export async function fetchChangelogSlice(fromVersion, toVersion, fetchText = realFetchChangelogText) {
  const text = await fetchText();
  return sliceChangelogRange(text, fromVersion, toVersion);
}
