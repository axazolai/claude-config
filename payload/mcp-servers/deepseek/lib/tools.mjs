// Prompt builders + call + mechanical validation. No MCP wiring here.
import { readFileSync } from "node:fs";
import { chat, CAP_TOKENS } from "./gateway.mjs";
import { validate } from "./validate.mjs";
import { createLimiter } from "./limit.mjs";

const MAX_CHARS = CAP_TOKENS * 4; // ~4 chars/token, keeps a single call under the cap
const clamp = (s) => (s.length > MAX_CHARS ? s.slice(0, MAX_CHARS) : s);
// Spec §6: <=2-3 concurrent calls to the shared backend, refuse after 30 s.
const limiter = createLimiter(3, 30000);
const defaults = { chat, readFile: (p) => readFileSync(p, "utf8") };

// One prompt -> limited, timed chat call -> mechanical validation. Never throws.
async function callChat(deps, content, { maxTokens, timeoutMs }) {
  let r;
  try { r = await limiter(() => deps.chat({ messages: [{ role: "user", content }], maxTokens, thinking: false, timeoutMs })); }
  catch { return { ok: false, reason: "timeout" }; } // queue refusal
  if (!r.ok) return r;
  const v = validate(r.text, {});
  return v.ok ? { ok: true, text: r.text } : v;
}

// Per-tool timeouts (spec §6): ask 60 s; the heavier writers get headroom for large inputs.
export async function runSummarize({ path, text, maxWords = 200 }, deps = defaults) {
  let body = text;
  if (!body && path) { try { body = deps.readFile(path); } catch { return { ok: false, reason: "unavailable" }; } }
  if (!body) return { ok: false, reason: "bad_output" };
  const prompt = `${clamp(body)}\n\nSummarize the above in at most ${maxWords} words. Output only the summary.`;
  return callChat(deps, prompt, { maxTokens: 1500, timeoutMs: 120000 });
}

export async function runAsk({ question, paths = [] }, deps = defaults) {
  let dump = "";
  for (const p of paths) { try { dump += `// ${p}\n${deps.readFile(p)}\n\n`; } catch { return { ok: false, reason: "unavailable" }; } }
  const prompt = `${clamp(dump)}\n\nQuestion: ${question}\nAnswer concisely using only the code above.`;
  return callChat(deps, prompt, { maxTokens: 1200, timeoutMs: 60000 });
}

export async function runCommitMsg({ diff }, deps = defaults) {
  if (!diff || !String(diff).trim()) return { ok: false, reason: "bad_output" };
  const prompt = `${clamp(String(diff))}\n\nWrite a Conventional Commits message for this diff. Output only the message.`;
  return callChat(deps, prompt, { maxTokens: 300, timeoutMs: 60000 });
}

export async function runDraft({ spec }, deps = defaults) {
  if (!spec || !String(spec).trim()) return { ok: false, reason: "bad_output" };
  const prompt = `Task spec:\n${clamp(String(spec))}\n\nWrite the code/tests this spec asks for. Output only code.`;
  return callChat(deps, prompt, { maxTokens: 2000, timeoutMs: 120000 });
}
