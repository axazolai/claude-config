#!/usr/bin/env node
// Mode-B translator: Anthropic Messages API -> OpenAI /v1/chat/completions, for the corp gateway
// (whose native /v1/messages is broken). The pure toOpenAI/fromOpenAI are the tested core; the
// HTTP server is a thin wrapper proven out in the phase-25 spike.
// Env: LLM_KEY (required), DS_PORT (4100), DS_THINKING (1=on), DS_EMIT_THINKING (1=emit thinking blocks).
import http from "node:http";
import { splitThink } from "./lib/gateway.mjs";
import { dsConfig } from "./lib/config.mjs";

const STOP = { stop: "end_turn", length: "max_tokens", tool_calls: "tool_use" };

export const textOf = (c) => (typeof c === "string" ? c : (c ?? []).map((b) => (b.type === "text" ? b.text : "")).join(""));

export function toOpenAI(req, { model = "local/DeepSeek-V4.1-Flash", thinking = false } = {}) {
  const msgs = [];
  const sys = textOf(req.system);
  if (sys) msgs.push({ role: "system", content: sys });
  for (const m of req.messages ?? []) {
    const blocks = typeof m.content === "string" ? [{ type: "text", text: m.content }] : (m.content ?? []);
    if (m.role === "assistant") {
      const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("");
      const calls = blocks.filter((b) => b.type === "tool_use").map((b) => ({ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
      msgs.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      const parts = [];
      for (const b of blocks) {
        if (b.type === "tool_result") {
          const c = typeof b.content === "string" ? b.content : textOf(b.content);
          msgs.push({ role: "tool", tool_call_id: b.tool_use_id, content: (b.is_error ? "ERROR: " : "") + (c || "(empty)") });
        } else if (b.type === "text") parts.push({ type: "text", text: b.text });
        else if (b.type === "image" && b.source?.type === "base64") parts.push({ type: "image_url", image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } });
      }
      if (parts.length) msgs.push({ role: "user", content: parts.length === 1 && parts[0].type === "text" ? parts[0].text : parts });
    }
  }
  const body = { model, messages: msgs, max_tokens: req.max_tokens, stream: !!req.stream, chat_template_kwargs: { thinking: !!thinking } };
  if (req.stream) body.stream_options = { include_usage: true };
  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (req.stop_sequences) body.stop = req.stop_sequences;
  if (req.tools?.length) {
    body.tools = req.tools.filter((t) => t.input_schema).map((t) => ({ type: "function", function: { name: t.name, description: t.description ?? "", parameters: t.input_schema } }));
    const tc = req.tool_choice;
    if (tc?.type === "any") body.tool_choice = "required";
    else if (tc?.type === "tool") body.tool_choice = { type: "function", function: { name: tc.name } };
    else if (tc?.type === "none") body.tool_choice = "none";
  }
  return body;
}

// Non-stream OpenAI choice -> Anthropic content blocks + stop_reason. Reasoning (before the last
// </think>) becomes a thinking block only when emitThinking is set.
export function fromOpenAI(choice, { emitThinking = false } = {}) {
  const msg = choice.message ?? {};
  const { reasoning, text } = splitThink(msg.content ?? "");
  const content = [];
  if (reasoning && emitThinking) content.push({ type: "thinking", thinking: reasoning, signature: "" });
  if (text && text.trim()) content.push({ type: "text", text });
  for (const c of msg.tool_calls ?? []) {
    let input = {};
    try { input = JSON.parse(c.function.arguments || "{}"); } catch { input = {}; }
    content.push({ type: "tool_use", id: c.id, name: c.function.name, input });
  }
  return { content, stop_reason: STOP[choice.finish_reason] ?? "end_turn" };
}

// Streaming reasoning/answer splitter. Buffers while inside a think block and only commits the
// reasoning once "</think>" is seen (one-shot), so a stream that NEVER closes the tag flushes its
// whole buffer as the ANSWER at end() — matching the non-stream lastIndexOf behaviour, instead of
// stranding the answer inside a thinking block.
export function createThinkSplitter({ thinking }) {
  let inThink = !!thinking, buf = "";
  return {
    push(s) {
      if (!inThink) return s ? [{ type: "text", text: s }] : [];
      buf += s ?? "";
      const i = buf.indexOf("</think>");
      if (i === -1) return [];
      const ev = [];
      const reasoning = buf.slice(0, i);
      if (reasoning) ev.push({ type: "thinking", text: reasoning });
      inThink = false;
      const rest = buf.slice(i + 8); buf = "";
      if (rest) ev.push({ type: "text", text: rest });
      return ev;
    },
    // A tool call means the buffered content so far was reasoning; commit it and leave think mode.
    toolStart() { const ev = inThink && buf ? [{ type: "thinking", text: buf }] : []; buf = ""; inThink = false; return ev; },
    // Stream end: a non-empty buffer only survives when no "</think>" was ever seen, so it is the answer.
    end() { if (!buf) return []; const ev = [{ type: "text", text: buf }]; buf = ""; return ev; },
  };
}

// ---- thin HTTP server (not unit-tested; exercised end-to-end) ----
function cfg() {
  const { gateway, model, key } = dsConfig();
  return { gateway, model, key, thinking: process.env.DS_THINKING === "1", emitThinking: process.env.DS_EMIT_THINKING === "1" };
}

async function handleNonStream(req, res, oa, gateway, key, emitThinking) {
  const r = await fetch(`${gateway}/v1/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(oa) });
  const j = await r.json();
  if (r.status !== 200) return fail(res, r.status, j);
  const { content, stop_reason } = fromOpenAI(j.choices[0], { emitThinking });
  const out = { id: j.id || `msg_${Date.now()}`, type: "message", role: "assistant", model: req.model, content, stop_reason, stop_sequence: null,
    usage: { input_tokens: j.usage?.prompt_tokens ?? 0, output_tokens: j.usage?.completion_tokens ?? 0 } };
  res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(out));
}

async function handleStream(req, res, oa, gateway, key, emitThinking) {
  const r = await fetch(`${gateway}/v1/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(oa) });
  if (r.status !== 200) return fail(res, r.status, await r.json().catch(() => ({})));
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  ev("message_start", { message: { id: `msg_${Date.now()}`, type: "message", role: "assistant", model: req.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } });
  let idx = -1, open = null;
  const close = () => { if (open) { ev("content_block_stop", { index: idx }); open = null; } };
  const openBlock = (kind, block) => { close(); idx++; open = kind; ev("content_block_start", { index: idx, content_block: block }); };
  let finish = "stop", usage = {};
  const emitText = (s) => { if (!s) return; if (open !== "text") openBlock("text", { type: "text", text: "" }); ev("content_block_delta", { index: idx, delta: { type: "text_delta", text: s } }); };
  const emitThink = (s) => { if (!s || !emitThinking) return; if (open !== "thinking") openBlock("thinking", { type: "thinking", thinking: "" }); ev("content_block_delta", { index: idx, delta: { type: "thinking_delta", thinking: s } }); };
  const splitter = createThinkSplitter({ thinking: process.env.DS_THINKING === "1" });
  const pump = (events) => { for (const e of events) (e.type === "thinking" ? emitThink : emitText)(e.text); };
  const dec = new TextDecoder(); let pending = "";
  for await (const chunk of r.body) {
    pending += dec.decode(chunk, { stream: true });
    let nl;
    while ((nl = pending.indexOf("\n")) !== -1) {
      const line = pending.slice(0, nl).trim(); pending = pending.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      let j; try { j = JSON.parse(data); } catch { continue; }
      if (j.usage) usage = j.usage;
      const ch = j.choices?.[0]; if (!ch) continue;
      if (ch.delta?.content) pump(splitter.push(ch.delta.content));
      for (const tc of ch.delta?.tool_calls ?? []) {
        if (tc.function?.name) {
          pump(splitter.toolStart());
          openBlock("tool", { type: "tool_use", id: tc.id ?? `toolu_${Date.now()}_${tc.index}`, name: tc.function.name, input: {} });
        }
        if (tc.function?.arguments) ev("content_block_delta", { index: idx, delta: { type: "input_json_delta", partial_json: tc.function.arguments } });
      }
      if (ch.finish_reason) finish = ch.finish_reason;
    }
  }
  pump(splitter.end());
  close();
  ev("message_delta", { delta: { stop_reason: STOP[finish] ?? "end_turn", stop_sequence: null }, usage: { input_tokens: usage.prompt_tokens ?? 0, output_tokens: usage.completion_tokens ?? 0 } });
  ev("message_stop", {});
  res.end();
}

function fail(res, status, body) {
  res.writeHead(status >= 400 ? status : 502, { "Content-Type": "application/json" })
    .end(JSON.stringify({ type: "error", error: { type: status === 429 ? "rate_limit_error" : "api_error", message: JSON.stringify(body).slice(0, 500) } }));
}

export function startServer(port = Number(process.env.DS_PORT) || 4100) {
  const server = http.createServer(async (rq, res) => {
    const url = rq.url.split("?")[0];
    let raw = ""; for await (const c of rq) raw += c;
    const { gateway, model, key, thinking, emitThinking } = cfg();
    try {
      if (rq.method === "POST" && url === "/v1/messages/count_tokens")
        return res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ input_tokens: Math.ceil(raw.length / 3.5) }));
      if (rq.method === "POST" && url === "/v1/messages") {
        if (!gateway || !key) return fail(res, 401, { error: "DeepSeek gateway/key not configured (run node setup.mjs)" });
        const req = JSON.parse(raw), oa = toOpenAI(req, { model, thinking });
        return req.stream ? await handleStream(req, res, oa, gateway, key, emitThinking) : await handleNonStream(req, res, oa, gateway, key, emitThinking);
      }
      res.writeHead(200, { "Content-Type": "application/json" }).end("{}");
    } catch (e) {
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({ type: "error", error: { type: "api_error", message: String(e) } }));
      else res.end();
    }
  });
  server.listen(port, "127.0.0.1", () => console.log(`translator on http://127.0.0.1:${port} thinking=${process.env.DS_THINKING === "1"} emitThinking=${process.env.DS_EMIT_THINKING === "1"}`));
  return server;
}

import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
function isMain() {
  const a = process.argv[1]; if (!a) return false;
  const self = fileURLToPath(import.meta.url);
  try { return a === self || realpathSync(a) === self; } catch { return a === self; }
}
if (isMain()) {
  const { gateway, key } = dsConfig();
  if (!gateway || !key) { console.error("DeepSeek gateway/key not configured — run node setup.mjs"); process.exit(2); }
  startServer();
}
