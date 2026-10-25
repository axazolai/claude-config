// Renders the ultrapowers work segment: the slug of the phase in flight, read from
// `.ultrapowers/ROADMAP.md` (`current`, else the single `running` row); when no phase is in
// flight, the git branch name. One word, no counters.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";

const safe = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };
const read = (p) => safe(() => readFileSync(p, "utf8"), "") ?? "";

export function renderPhaseSegment(state) {
  return state && typeof state === "object" && state.name ? String(state.name) : "";
}

export function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(text ?? ""));
  return m ? m[1] : "";
}

// CR is a JS LineTerminator, so `(.+)$` under /m already stops before CRLF's \r.
export function fmField(fm, key) {
  const m = new RegExp(`^[ \t]*${key}[ \\t]*:[ \\t]*(.+)$`, "m").exec(fm);
  if (!m) return null;
  const v = m[1].trim().replace(/^["']|["']$/g, "");
  return v === "null" || v === "" ? null : v;
}

export function roadmapPhases(text) {
  return [...frontmatter(text).matchAll(/^\s*-\s*\{([^}]*)\}\s*$/gm)].map((m) => {
    const row = {};
    for (const pair of m[1].split(",")) {
      const i = pair.indexOf(":");
      if (i === -1) continue;
      row[pair.slice(0, i).trim()] = pair.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
    return row;
  });
}

// `.git` is a directory in a normal checkout and a `gitdir: <path>` file in a worktree.
export function branchName(root) {
  let dir = resolve(root);
  for (let i = 0; i < 16; i++) {
    const g = join(dir, ".git");
    if (existsSync(g)) {
      let gitdir = g;
      const pointer = safe(() => readFileSync(g, "utf8"), null);
      if (typeof pointer === "string" && /^gitdir:/.test(pointer)) {
        gitdir = resolve(dir, pointer.replace(/^gitdir:\s*/, "").trim());
      }
      const head = read(join(gitdir, "HEAD"));
      const m = /^ref:\s*refs\/heads\/(.+)$/m.exec(head);
      if (m) return m[1].trim();
      const sha = head.trim();
      return sha ? sha.slice(0, 7) : null;
    }
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

export function readPhaseState(root) {
  const tree = join(root, ".ultrapowers");
  const roadmap = read(join(tree, "ROADMAP.md"));
  if (roadmap) {
    const rows = roadmapPhases(roadmap);
    let id = fmField(frontmatter(roadmap), "current");
    if (!id) {
      const running = rows.filter((r) => r.status === "running");
      id = running.length === 1 ? running[0].phase : null;
    }
    if (id) {
      const row = rows.find((r) => r.phase === id);
      if (row && row.slug) return { id, name: row.slug };
      const dirs = safe(() => readdirSync(join(tree, "phases")), []) ?? [];
      const dirName = dirs.find((n) => n.startsWith(`${id}-`));
      if (dirName) return { id, name: dirName.slice(String(id).length + 1) };
    }
  }
  const branch = branchName(root);
  return branch ? { name: branch } : null;
}
