import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPluginPlan, describeAction } from "./plugin-reconcile.mjs";

const MANAGED = { superpowers: "superpowers@m", gsd: "gsd@m", "context-mode": "cm@m", context7: "c7@m" };
const LITE = ["superpowers", "context-mode", "context7"];

test("@important surplus gsd: uninstall + disable when installed and enabled", () => {
  const { actions } = buildPluginPlan({ required: LITE, managed: MANAGED,
    enabledPlugins: { "superpowers@m": true, "gsd@m": true, "cm@m": true, "c7@m": true },
    installedIds: ["superpowers@m", "gsd@m", "cm@m", "c7@m"] });
  assert.deepEqual(actions, [
    { type: "uninstall", name: "gsd", id: "gsd@m" },
    { type: "disable",  name: "gsd", id: "gsd@m" },
  ]);
});

test("@important missing required: install + enable", () => {
  const { actions } = buildPluginPlan({ required: LITE, managed: MANAGED,
    enabledPlugins: { "superpowers@m": true }, installedIds: ["superpowers@m"] });
  assert.deepEqual(actions, [
    { type: "install", name: "context-mode", id: "cm@m" },
    { type: "enable",  name: "context-mode", id: "cm@m" },
    { type: "install", name: "context7", id: "c7@m" },
    { type: "enable",  name: "context7", id: "c7@m" },
  ]);
});

test("@important CLI unavailable: enabledPlugins edits still planned, install/uninstall become notes", () => {
  const { actions, notes } = buildPluginPlan({ required: LITE, managed: MANAGED,
    enabledPlugins: { "gsd@m": true }, installedIds: null });
  assert.ok(actions.every((a) => a.type === "enable" || a.type === "disable"));
  assert.ok(notes.some((n) => n.includes("claude plugin uninstall gsd@m")));
  assert.ok(notes.some((n) => n.includes("claude plugin install cm@m")));
});

test("@important unknown user plugins untouched; empty enabledPlugins object preserved semantics", () => {
  const { actions } = buildPluginPlan({ required: LITE, managed: MANAGED,
    enabledPlugins: { "my-own@x": true, "superpowers@m": true, "cm@m": true, "c7@m": true },
    installedIds: ["my-own@x", "superpowers@m", "cm@m", "c7@m"] });
  assert.deepEqual(actions, []);   // my-own@x invisible; nothing to do
});

test("@important required name absent from managed is skipped safely", () => {
  const { actions, notes } = buildPluginPlan({ required: ["ghost", ...LITE], managed: MANAGED,
    enabledPlugins: { "superpowers@m": true, "cm@m": true, "c7@m": true },
    installedIds: ["superpowers@m", "cm@m", "c7@m"] });
  assert.ok(actions.every((a) => a.name !== "ghost"));
  assert.ok(notes.every((n) => !n.includes("ghost")));
});

// keepInstalled: the ultrapowers fork replaces upstream superpowers in every profile, but
// upstream must stay INSTALLED so rollback is one command. Two enabled plugins sharing 14
// skill names is undocumented behaviour we do not run in production, so it is still disabled.
const FORKED = { ultrapowers: "ultrapowers@ultrapowers", superpowers: "superpowers@claude-plugins-official",
                 gsd: "gsd@m", "context-mode": "cm@m", context7: "c7@m" };

test("@critical upstream superpowers is disabled but never uninstalled", () => {
  const { actions } = buildPluginPlan({
    required: ["ultrapowers", "context-mode", "context7"], managed: FORKED,
    enabledPlugins: { "superpowers@claude-plugins-official": true },
    installedIds: ["superpowers@claude-plugins-official"],
    keepInstalled: ["superpowers"] });
  assert.ok(actions.some((a) => a.type === "disable" && a.id === "superpowers@claude-plugins-official"));
  assert.ok(!actions.some((a) => a.type === "uninstall"));
});

test("@important the fork is installed and enabled like any other managed plugin", () => {
  const { actions } = buildPluginPlan({
    required: ["ultrapowers"], managed: FORKED,
    enabledPlugins: {}, installedIds: [], keepInstalled: ["superpowers"] });
  assert.ok(actions.some((a) => a.type === "install" && a.id === "ultrapowers@ultrapowers"));
  assert.ok(actions.some((a) => a.type === "enable" && a.id === "ultrapowers@ultrapowers"));
});

// marketplace registration: `claude plugin install <id>` fails when the marketplace is unknown.
// The four pre-fork managed plugins live in marketplaces any machine that ran the bootstrap
// already has, so this gap never fired. ultrapowers@ultrapowers is the first managed plugin in a
// marketplace of our own, and on a fresh machine it will be missing.
const SOURCES = { ultrapowers: "axazolai/ultrapowers", "claude-plugins-official": "anthropics/claude-plugins-official" };

test("@important a required plugin whose marketplace is unknown gets it registered first", () => {
  const { actions } = buildPluginPlan({
    required: ["ultrapowers"], managed: FORKED, marketplaces: SOURCES, knownMarketplaces: [],
    enabledPlugins: {}, installedIds: [] });
  const kinds = actions.map((a) => a.type);
  assert.deepEqual(kinds, ["marketplace_add", "install", "enable"]);
  assert.equal(actions[0].source, "axazolai/ultrapowers");
});

test("@important an unknown marketplace with no recorded source is a loud note, never a guessed repo", () => {
  const { actions, notes } = buildPluginPlan({
    required: ["ultrapowers"], managed: FORKED, marketplaces: {}, knownMarketplaces: [],
    enabledPlugins: {}, installedIds: [] });
  assert.ok(!actions.some((a) => a.type === "marketplace_add"));
  assert.ok(notes.some((n) => n.includes("ultrapowers") && /no recorded source/.test(n)));
});

// ---- partial consent ----
import { selectActions } from "./plugin-reconcile.mjs";

const PLAN = [
  { type: "marketplace_add", name: "up", id: "up@mk", marketplace: "mk", source: "o/mk" },
  { type: "install", name: "up", id: "up@mk" },
  { type: "enable", name: "up", id: "up@mk" },
  { type: "uninstall", name: "old", id: "old@other" },
  { type: "disable", name: "old", id: "old@other" },
];

test("@important accepting everything selects everything, in order", () => {
  const { selected, dropped } = selectActions(PLAN, () => true);
  assert.deepEqual(selected, PLAN);
  assert.deepEqual(dropped, []);
});

test("@important a single action can be taken while its neighbours are refused", () => {
  const { selected } = selectActions(PLAN, (a) => a.type === "disable");
  assert.deepEqual(selected.map((a) => a.type), ["disable"]);
});

// Installing from a marketplace the user just refused to register fails at the CLI, so the
// refusal has to carry the install with it rather than leaving a call that cannot work.
test("@important refusing a marketplace also drops the installs that need it, with the reason", () => {
  const { selected, dropped } = selectActions(PLAN, (a) => a.type !== "marketplace_add");
  assert.ok(!selected.some((a) => a.type === "install"), "install must not survive");
  assert.ok(selected.some((a) => a.type === "enable"), "enable is a local settings edit and survives");
  const why = dropped.find((d) => d.action.type === "install");
  assert.match(why.reason, /marketplace "mk"/);
});

// disable is an enabledPlugins edit; uninstall shells out. Refusing to remove the files must
// not silently leave the plugin enabled.
test("@important refusing an uninstall still allows the disable", () => {
  const { selected } = selectActions(PLAN, (a) => a.type !== "uninstall");
  assert.ok(selected.some((a) => a.type === "disable"));
});

/* ---------- forbidden plugins: never installed, removed on sight ---------- */

const FORBIDDEN = ["context7"];
const plan = (over = {}) => buildPluginPlan({
  required: [], managed: MANAGED, enabledPlugins: {}, installedIds: [],
  forbidden: FORBIDDEN, ...over,
});
const typesFor = (actions, id) => actions.filter((a) => a.id === id).map((a) => a.type).sort();

test("@critical a forbidden plugin found on disk is uninstalled, not merely disabled", () => {
  const { actions } = plan({ installedIds: ["c7@m"], enabledPlugins: { "c7@m": true } });
  assert.deepEqual(typesFor(actions, "c7@m"), ["disable", "uninstall"]);
  assert.ok(actions.filter((a) => a.id === "c7@m").every((a) => a.forbidden === true));
});

test("@important a forbidden plugin is never installed or enabled, even when a profile asks for it", () => {
  const { actions, notes } = plan({ required: ["context7", "context-mode"] });
  assert.deepEqual(typesFor(actions, "c7@m"), []);
  assert.ok(notes.some((n) => n.includes("context7") && /forbidden/i.test(n)),
    `expected a note explaining the refusal, got: ${JSON.stringify(notes)}`);
  // the rest of the profile is unaffected
  assert.ok(actions.some((a) => a.id === "cm@m" && a.type === "enable"));
});

test("@critical a forbidden plugin asked for AND present is still removed, not installed", () => {
  const { actions } = plan({ required: ["context7"], installedIds: ["c7@m"], enabledPlugins: { "c7@m": true } });
  assert.deepEqual(typesFor(actions, "c7@m"), ["disable", "uninstall"]);
});

test("@critical forbidden outranks keepInstalled", () => {
  const { actions } = plan({ keepInstalled: ["context7"], installedIds: ["c7@m"] });
  assert.deepEqual(typesFor(actions, "c7@m"), ["uninstall"]);
});

test("@important without the CLI a forbidden plugin still gets a manual uninstall instruction", () => {
  const { actions, notes } = plan({ installedIds: null, enabledPlugins: { "c7@m": true } });
  assert.deepEqual(typesFor(actions, "c7@m"), ["disable"]);
  assert.ok(notes.some((n) => n.includes("claude plugin uninstall c7@m")));
});

test("@important describeAction says why a forbidden plugin is being removed", () => {
  const { actions } = plan({ installedIds: ["c7@m"] });
  const uninstall = actions.find((a) => a.id === "c7@m" && a.type === "uninstall");
  assert.match(describeAction(uninstall), /forbidden/i);
  assert.match(describeAction(uninstall), /removes files/);
});
