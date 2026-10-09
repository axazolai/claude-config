// Mechanical output checks only. Semantic "does this answer the question" is Claude's job.
export function validate(text, { needs = [], json = false } = {}) {
  const s = String(text ?? "");
  if (!s.trim()) return { ok: false, reason: "bad_output" };
  if (json) { try { JSON.parse(s); } catch { return { ok: false, reason: "bad_output" }; } }
  for (const n of needs) if (!s.includes(n)) return { ok: false, reason: "bad_output" };
  return { ok: true };
}
