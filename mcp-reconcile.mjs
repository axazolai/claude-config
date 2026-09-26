// Pure MCP reconciliation plan. No fs/process access here — setup.mjs executes.
const quote = (s) => (/[\s[\]"]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s);

export function buildMcpPlan({ required, managed, configured, env, hasCommand }) {
  const actions = [], notes = [];
  for (const name of required) {
    const def = managed[name];
    if (!def || configured.includes(name)) continue;
    if (def.requires && !hasCommand(def.requires)) {
      notes.push(`${name}: "${def.requires}" not on PATH - install uv, then re-run setup`);
      continue;
    }
    const headers = {}, missing = [];
    for (const [h, v] of Object.entries(def.headerFromEnv || {}))
      env[v] ? (headers[h] = env[v]) : missing.push(v);
    if (missing.length && def.missingEnvNote) notes.push(`${name}: ${def.missingEnvNote}`);
    actions.push({ type: "add", name, def, headers });
  }
  for (const name of Object.keys(managed))
    if (!required.includes(name) && configured.includes(name)) actions.push({ type: "remove", name });
  return { actions, notes };
}

export function mcpAddArgs(a) {
  const d = a.def, head = ["mcp", "add", "--scope", "user"];
  // --header is variadic in the CLI, so it must come after the name and URL.
  if (d.type === "http") return [...head, "--transport", "http", a.name, d.url,
    ...Object.entries(a.headers).flatMap(([h, v]) => ["--header", `${h}: ${v}`])];
  return [...head, a.name, "--", d.command, ...(d.args || [])];
}

export const mcpRemoveArgs = (a) => ["mcp", "remove", "--scope", "user", a.name];

// The command run after a successful add (Scrapling's browser download), or null.
export const postAddArgv = (a) => (a.type === "add" && a.def.postAdd ? [a.def.postAdd.command, ...a.def.postAdd.args] : null);

export function describeMcpAction(a) {
  if (a.type === "remove") return `claude ${mcpRemoveArgs(a).join(" ")}`;
  const masked = Object.fromEntries(Object.keys(a.headers).map((h) => [h, "***"]));
  return `claude ${mcpAddArgs({ ...a, headers: masked }).map(quote).join(" ")}`;
}

export const describePostAdd = (a) => postAddArgv(a)?.map(quote).join(" ") ?? null;

export function formatMcpPlan(actions, notes) {
  const lines = actions.flatMap((a) => [`  ${a.type.padEnd(6)} ${describeMcpAction(a)}`,
    ...(postAddArgv(a) ? [`  then   ${describePostAdd(a)}`] : [])]);
  return [...lines, ...notes.map((n) => `  NOTE: ${n}`)].join("\n") || "  (MCP servers already match the variant)";
}

// cmd.exe argument for an npm `claude.cmd` shim, which only runs through a shell.
export const quoteForCmd = (s) => (/^[\w@.:/=+-]+$/.test(s) ? s : `"${s.replace(/"/g, '""')}"`);

export function redactValues(text, values) {
  return values.filter(Boolean).reduce((t, v) => t.split(v).join("***"), String(text || ""));
}
