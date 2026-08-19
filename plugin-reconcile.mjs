// Pure plugin reconciliation plan (spec § 4). No fs/process access here — setup.mjs executes.
//
// `forbidden` is a stronger statement than "absent from this profile": the plugin must not exist
// on the machine at all, so it is removed on sight and can never be installed — not by a profile
// that names it, and not by keepInstalled. context7 is the case that motivated it: it is reached
// through its MCP server, and the marketplace plugin of the same name shadows that.
export function buildPluginPlan({ required, managed, enabledPlugins, installedIds, keepInstalled = [], forbidden = [], marketplaces, knownMarketplaces }) {
  const actions = [], notes = [];
  const enabled = enabledPlugins || {};
  const cli = Array.isArray(installedIds);
  const kept = new Set(keepInstalled);
  const banned = new Set(forbidden);
  const known = knownMarketplaces && new Set(knownMarketplaces);
  const registered = new Set();
  for (const name of required) {
    const id = managed[name];
    if (!id) continue;
    // Defensive: a profile naming a forbidden plugin is a config error the variants test catches,
    // but it must never be the thing that puts it back on the machine.
    if (banned.has(name)) {
      notes.push(`${name} (${id}) is forbidden and was ignored: it is reached through its MCP server, not as a plugin - drop "${name}" from the profile`);
      continue;
    }
    // `claude plugin install` fails outright when the marketplace is unknown, so it goes first.
    const marketplace = id.split("@")[1];
    if (known && marketplace && !known.has(marketplace) && !registered.has(marketplace)) {
      registered.add(marketplace);
      const source = (marketplaces || {})[marketplace];
      if (source) actions.push({ type: "marketplace_add", name, id, marketplace, source });
      else notes.push(`marketplace "${marketplace}" is required by ${id} but is not registered and has no recorded source - add it to variants.json marketplaces, then re-run`);
    }
    if (cli && !installedIds.includes(id)) actions.push({ type: "install", name, id });
    else if (!cli && !(id in enabled)) notes.push(`if not installed yet, run: claude plugin install ${id}`);
    else if (!cli) notes.push(`cannot verify install of ${id} (claude CLI unavailable) - if missing, run: claude plugin install ${id}`);
    if (!(id in enabled)) actions.push({ type: "enable", name, id });
  }
  for (const name of Object.keys(managed)) {
    const isBanned = banned.has(name);
    if (required.includes(name) && !isBanned) continue;
    const id = managed[name];
    const mark = isBanned ? { forbidden: true } : {};
    // keepInstalled: disabled, but left on disk so rollback stays one command. A forbidden plugin
    // is never kept - "keep it for rollback" and "it must not be here" cannot both hold.
    if (kept.has(name) && !isBanned) notes.push(`${id} stays installed on purpose (kept for rollback); it is only disabled`);
    else if (cli && installedIds.includes(id)) actions.push({ type: "uninstall", name, id, ...mark });
    else if (!cli && id in enabled) notes.push(`run manually: claude plugin uninstall ${id}`);
    if (id in enabled) actions.push({ type: "disable", name, id, ...mark });
  }
  return { actions, notes };
}

// Per-action consent. `isAccepted(action)` decides each one; the only cross-action rule is that
// `claude plugin install` fails outright against a marketplace that was never registered, so a
// refused marketplace_add carries its installs with it.
export function selectActions(actions, isAccepted) {
  const refusedMarkets = new Set();
  const selected = [], dropped = [];
  for (const a of actions) {
    if (a.type === "marketplace_add") {
      if (isAccepted(a)) selected.push(a);
      else { refusedMarkets.add(a.marketplace); dropped.push({ action: a, reason: "declined" }); }
      continue;
    }
    const marketplace = String(a.id || "").split("@")[1];
    if (a.type === "install" && refusedMarkets.has(marketplace)) {
      dropped.push({ action: a, reason: `needs marketplace "${marketplace}", which was declined` });
      continue;
    }
    if (isAccepted(a)) selected.push(a);
    else dropped.push({ action: a, reason: "declined" });
  }
  return { selected, dropped };
}

export function describeAction(a) {
  if (a.type === "marketplace_add") return `register marketplace ${a.source} (needed by ${a.id})`;
  if (a.type === "install") return `install ${a.id}`;
  if (a.type === "uninstall") return `uninstall ${a.id} (removes files${a.forbidden ? "; forbidden here - reached through its MCP server instead" : ""})`;
  if (a.type === "enable") return `enable ${a.id} (settings only)`;
  if (a.type === "disable") return `disable ${a.id} (settings only)`;
  return `${a.type} ${a.id}`;
}

export function formatPlan(actions, notes) {
  const lines = actions.map((a) => `  ${a.type.padEnd(9)} ${a.type === "marketplace_add" ? `${a.source} (marketplace "${a.marketplace}", needed by ${a.id})` : a.id}`);
  return [...lines, ...notes.map((n) => `  NOTE: ${n}`)].join("\n") || "  (plugins already match the variant)";
}
