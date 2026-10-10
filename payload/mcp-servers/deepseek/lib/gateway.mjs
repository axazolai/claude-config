// Thin client for the corporate gateway's /v1/chat/completions. Gateway + key come from
// dsConfig() (machine-local setup, never this repo). Never throws: every failure becomes {ok:false}.
import { dsConfig } from "./config.mjs";
export const CAP_TOKENS = 100000;

export function splitThink(s) {
  const str = String(s ?? "");
  const i = str.lastIndexOf("</think>");
  return i === -1 ? { reasoning: "", text: str } : { reasoning: str.slice(0, i), text: str.slice(i + 8) };
}

export async function chat({ messages, maxTokens, thinking = false, timeoutMs = 120000, fetchImpl = fetch }) {
  const { gateway, key, model } = dsConfig();
  if (!gateway || !key) return { ok: false, reason: "unavailable" };
  let r;
  try {
    r = await fetchImpl(`${gateway}/v1/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, max_tokens: maxTokens, chat_template_kwargs: { thinking }, messages }),
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
