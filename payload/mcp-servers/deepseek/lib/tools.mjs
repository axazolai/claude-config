// Prompt builders + call + mechanical validation. No MCP wiring here.
import { readFileSync } from "node:fs";
import { chat, CAP_TOKENS } from "./gateway.mjs";
import { validate } from "./validate.mjs";

const MAX_CHARS = CAP_TOKENS * 4; // ~4 chars/token, keeps a single call under the cap
const clamp = (s) => (s.length > MAX_CHARS ? s.slice(0, MAX_CHARS) : s);
const defaults = { chat, readFile: (p) => readFileSync(p, "utf8") };

export async function runSummarize({ path, text, maxWords = 200 }, deps = defaults) {
  let body = text;
  if (!body && path) { try { body = deps.readFile(path); } catch { return { ok: false, reason: "unavailable" }; } }
  if (!body) return { ok: false, reason: "bad_output" };
  const prompt = `${clamp(body)}\n\nSummarize the above in at most ${maxWords} words. Output only the summary.`;
  const r = await deps.chat({ messages: [{ role: "user", content: prompt }], maxTokens: 1500, thinking: false });
  if (!r.ok) return r;
  const v = validate(r.text, {}); return v.ok ? { ok: true, text: r.text } : v;
}

export async function runAsk({ question, paths = [] }, deps = defaults) {
  let dump = "";
  for (const p of paths) { try { dump += `// ${p}\n${deps.readFile(p)}\n\n`; } catch { return { ok: false, reason: "unavailable" }; } }
  const prompt = `${clamp(dump)}\n\nQuestion: ${question}\nAnswer concisely using only the code above.`;
  const r = await deps.chat({ messages: [{ role: "user", content: prompt }], maxTokens: 1200, thinking: false });
  if (!r.ok) return r;
  const v = validate(r.text, {}); return v.ok ? { ok: true, text: r.text } : v;
}

export async function runCommitMsg({ diff }, deps = defaults) {
  if (!diff || !String(diff).trim()) return { ok: false, reason: "bad_output" };
  const prompt = `${clamp(String(diff))}\n\nWrite a Conventional Commits message for this diff. Output only the message.`;
  const r = await deps.chat({ messages: [{ role: "user", content: prompt }], maxTokens: 300, thinking: false });
  if (!r.ok) return r;
  const v = validate(r.text, {}); return v.ok ? { ok: true, text: r.text } : v;
}

export async function runDraft({ spec }, deps = defaults) {
  if (!spec || !String(spec).trim()) return { ok: false, reason: "bad_output" };
  const prompt = `Task spec:\n${clamp(String(spec))}\n\nWrite the code/tests this spec asks for. Output only code.`;
  const r = await deps.chat({ messages: [{ role: "user", content: prompt }], maxTokens: 2000, thinking: false });
  if (!r.ok) return r;
  const v = validate(r.text, {}); return v.ok ? { ok: true, text: r.text } : v;
}
