// Pure planner for bundle-managed keys in settings.json. No fs/process access — setup.mjs executes.
export function buildSessionDefaultsPlan(settings, managed) {
  const changes = [];
  for (const [key, to] of Object.entries(managed)) {
    const from = settings?.[key];
    if (from === to) continue;
    changes.push({ key, from, to, conflict: from !== undefined });
  }
  return changes;
}

export const fmt = (v) => (typeof v === "string" ? v : JSON.stringify(v));
export const describeSessionChange = (c) => `${c.key}: ${c.conflict ? fmt(c.from) : "(unset)"} -> ${fmt(c.to)}`;
