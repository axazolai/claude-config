// Thin client for the corporate gateway's /v1/chat/completions. Key only from env LLM_KEY.
// Never throws: every failure becomes {ok:false, reason}.
const GW = process.env.DS_GATEWAY || "http://10.81.0.13:4002";
const MODEL = process.env.DS_MODEL || "local/DeepSeek-V4.1-Flash";
export const CAP_TOKENS = 100000;

export function splitThink(s) {
  const str = String(s ?? "");
  const i = str.lastIndexOf("</think>");
  return i === -1 ? { reasoning: "", text: str } : { reasoning: str.slice(0, i), text: str.slice(i + 8) };
}

export async function chat({ messages, maxTokens, thinking = false, timeoutMs = 120000, fetchImpl = fetch }) {
  const key = process.env.LLM_KEY;
  if (!key) return { ok: false, reason: "unavailable" };
  let r;
  try {
    r = await fetchImpl(`${GW}/v1/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, chat_template_kwargs: { thinking }, messages }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    return { ok: false, reason: e.name === "TimeoutError" ? "timeout" : "unavailable" };
  }
  if (r.status !== 200) return { ok: false, reason: "http", status: r.status };
  let j;
  try { j = await r.json(); } catch { return { ok: false, reason: "bad_output" }; }
  const raw = j.choices?.[0]?.message?.content ?? "";
  const { text } = splitThink(raw);
  return { ok: true, text: text.trim() || raw, usage: j.usage ?? {} };
}
