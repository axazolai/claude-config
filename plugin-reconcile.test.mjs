import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPluginPlan, describeAction } from "./plugin-reconcile.mjs";

const MANAGED = { superpowers: "superpowers@m", gsd: "gsd@m", "context-mode": "cm@m", context7: "c7@m" };
const LITE = ["superpowers", "context-mode", "context7"];

test("surplus gsd: uninstall + disable when installed and enabled", () => {
  const { actions } = buildPluginPlan({ required: LITE, managed: MANAGED,
    enabledPlugins: { "superpowers@m": true, "gsd@m": true, "cm@m": true, "c7@m": true },
    installedIds: ["superpowers@m", "gsd@m", "cm@m", "c7@m"] });
  assert.deepEqual(actions, [
    { type: "uninstall", name: "gsd", id: "gsd@m" },
    { type: "disable",  name: "gsd", id: "gsd@m" },
  ]);
});

test("missing required: install + enable", () => {
  const { actions } = buildPluginPlan({ required: LITE, managed: MANAGED,
    enabledPlugins: { "superpowers@m": true }, installedIds: ["superpowers@m"] });
  assert.deepEqual(actions, [
    { type: "install", name: "context-mode", id: "cm@m" },
    { type: "enable",  name: "context-mode", id: "cm@m" },
    { type: "install", name: "context7", id: "c7@m" },
    { type: "enable",  name: "context7", id: "c7@m" },
  ]);
});

test("CLI unavailable: enabledPlugins edits still planned, install/uninstall become notes", () => {
  const { actions, notes } = buildPluginPlan({ required: LITE, managed: MANAGED,
    enabledPlugins: { "gsd@m": true }, installedIds: null });
  assert.ok(actions.every((a) => a.type === "enable" || a.type === "disable"));
  assert.ok(notes.some((n) => n.includes("claude plugin uninstall gsd@m")));
  assert.ok(notes.some((n) => n.includes("claude plugin install cm@m")));
});

test("unknown user plugins untouched; empty enabledPlugins object preserved semantics", () => {
  const { actions } = buildPluginPlan({ required: LITE, managed: MANAGED,
    enabledPlugins: { "my-own@x": true, "superpowers@m": true, "cm@m": true, "c7@m": true },
    installedIds: ["my-own@x", "superpowers@m", "cm@m", "c7@m"] });
  assert.deepEqual(actions, []);   // my-own@x invisible; nothing to do
});

test("CLI unavailable: enabled-but-unverifiable required plugin still gets a note", () => {
  const { actions, notes } = buildPluginPlan({ required: LITE, managed: MANAGED,
    enabledPlugins: { "superpowers@m": true, "cm@m": true, "c7@m": true }, installedIds: null });
  assert.deepEqual(actions, []);   // everything enabled, nothing to edit
  assert.equal(notes.filter((n) => n.includes("cannot verify install")).length, 3);
});

test("required name absent from managed is skipped safely", () => {
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

test("upstream superpowers is disabled but never uninstalled", () => {
  const { actions } = buildPluginPlan({
    required: ["ultrapowers", "context-mode", "context7"], managed: FORKED,
    enabledPlugins: { "superpowers@claude-plugins-official": true },
    installedIds: ["superpowers@claude-plugins-official"],
    keepInstalled: ["superpowers"] });
  assert.ok(actions.some((a) => a.type === "disable" && a.id === "superpowers@claude-plugins-official"));
  assert.ok(!actions.some((a) => a.type === "uninstall"));
});

test("keepInstalled does not suppress uninstall for other managed plugins", () => {
  const { actions } = buildPluginPlan({
    required: ["ultrapowers"], managed: FORKED,
    enabledPlugins: { "gsd@m": true }, installedIds: ["gsd@m"], keepInstalled: ["superpowers"] });
  assert.ok(actions.some((a) => a.type === "uninstall" && a.id === "gsd@m"));
});

test("the fork is installed and enabled like any other managed plugin", () => {
  const { actions } = buildPluginPlan({
    required: ["ultrapowers"], managed: FORKED,
    enabledPlugins: {}, installedIds: [], keepInstalled: ["superpowers"] });
  assert.ok(actions.some((a) => a.type === "install" && a.id === "ultrapowers@ultrapowers"));
  assert.ok(actions.some((a) => a.type === "enable" && a.id === "ultrapowers@ultrapowers"));
});

test("with the CLI unavailable, keepInstalled suppresses the manual-uninstall note too", () => {
  const { notes } = buildPluginPlan({
    required: ["ultrapowers"], managed: FORKED,
    enabledPlugins: { "superpowers@claude-plugins-official": true, "gsd@m": true },
    installedIds: null, keepInstalled: ["superpowers"] });
  assert.ok(!notes.some((n) => n.includes("uninstall superpowers@claude-plugins-official")),
    "telling the human to uninstall it by hand defeats the point of keeping it installed");
  assert.ok(notes.some((n) => n.includes("uninstall gsd@m")));
});

// marketplace registration: `claude plugin install <id>` fails when the marketplace is unknown.
// The four pre-fork managed plugins live in marketplaces any machine that ran the bootstrap
// already has, so this gap never fired. ultrapowers@ultrapowers is the first managed plugin in a
// marketplace of our own, and on a fresh machine it will be missing.
const SOURCES = { ultrapowers: "axazolai/ultrapowers", "claude-plugins-official": "anthropics/claude-plugins-official" };

test("a required plugin whose marketplace is unknown gets it registered first", () => {
  const { actions } = buildPluginPlan({
    required: ["ultrapowers"], managed: FORKED, marketplaces: SOURCES, knownMarketplaces: [],
    enabledPlugins: {}, installedIds: [] });
  const kinds = actions.map((a) => a.type);
  assert.deepEqual(kinds, ["marketplace_add", "install", "enable"]);
  assert.equal(actions[0].source, "axazolai/ultrapowers");
});

test("an already-known marketplace is not re-added", () => {
  const { actions } = buildPluginPlan({
    required: ["ultrapowers"], managed: FORKED, marketplaces: SOURCES, knownMarketplaces: ["ultrapowers"],
    enabledPlugins: {}, installedIds: [] });
  assert.ok(!actions.some((a) => a.type === "marketplace_add"));
});

test("a marketplace needed by two plugins is added once", () => {
  const managed = { a: "a@shared", b: "b@shared" };
  const { actions } = buildPluginPlan({
    required: ["a", "b"], managed, marketplaces: { shared: "owner/shared" }, knownMarketplaces: [],
    enabledPlugins: {}, installedIds: [] });
  assert.equal(actions.filter((a) => a.type === "marketplace_add").length, 1);
});

test("an unknown marketplace with no recorded source is a loud note, never a guessed repo", () => {
  const { actions, notes } = buildPluginPlan({
    required: ["ultrapowers"], managed: FORKED, marketplaces: {}, knownMarketplaces: [],
    enabledPlugins: {}, installedIds: [] });
  assert.ok(!actions.some((a) => a.type === "marketplace_add"));
  assert.ok(notes.some((n) => n.includes("ultrapowers") && /no recorded source/.test(n)));
});

test("callers that pass no marketplace state plan exactly as they did before", () => {
  const { actions } = buildPluginPlan({
    required: ["ultrapowers"], managed: FORKED, enabledPlugins: {}, installedIds: [] });
  assert.deepEqual(actions.map((a) => a.type), ["install", "enable"]);
});

test("keepInstalled defaults to none, so callers that never heard of it are unchanged", () => {
  const { actions } = buildPluginPlan({ required: LITE, managed: MANAGED,
    enabledPlugins: { "gsd@m": true }, installedIds: ["gsd@m", "superpowers@m", "cm@m", "c7@m"] });
  assert.ok(actions.some((a) => a.type === "uninstall" && a.id === "gsd@m"));
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

test("accepting everything selects everything, in order", () => {
  const { selected, dropped } = selectActions(PLAN, () => true);
  assert.deepEqual(selected, PLAN);
  assert.deepEqual(dropped, []);
});

test("accepting nothing selects nothing", () => {
  const { selected } = selectActions(PLAN, () => false);
  assert.deepEqual(selected, []);
});

test("a single action can be taken while its neighbours are refused", () => {
  const { selected } = selectActions(PLAN, (a) => a.type === "disable");
  assert.deepEqual(selected.map((a) => a.type), ["disable"]);
});

// Installing from a marketplace the user just refused to register fails at the CLI, so the
// refusal has to carry the install with it rather than leaving a call that cannot work.
test("refusing a marketplace also drops the installs that need it, with the reason", () => {
  const { selected, dropped } = selectActions(PLAN, (a) => a.type !== "marketplace_add");
  assert.ok(!selected.some((a) => a.type === "install"), "install must not survive");
  assert.ok(selected.some((a) => a.type === "enable"), "enable is a local settings edit and survives");
  const why = dropped.find((d) => d.action.type === "install");
  assert.match(why.reason, /marketplace "mk"/);
});

test("an install from an already-registered marketplace is unaffected", () => {
  const plan = [{ type: "install", name: "x", id: "x@known" }];
  const { selected } = selectActions(plan, () => true);
  assert.deepEqual(selected, plan);
});

// disable is an enabledPlugins edit; uninstall shells out. Refusing to remove the files must
// not silently leave the plugin enabled.
test("refusing an uninstall still allows the disable", () => {
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

test("a forbidden plugin found on disk is uninstalled, not merely disabled", () => {
  const { actions } = plan({ installedIds: ["c7@m"], enabledPlugins: { "c7@m": true } });
  assert.deepEqual(typesFor(actions, "c7@m"), ["disable", "uninstall"]);
  assert.ok(actions.filter((a) => a.id === "c7@m").every((a) => a.forbidden === true));
});

test("a forbidden plugin that is nowhere produces no action at all", () => {
  const { actions } = plan();
  assert.deepEqual(actions.filter((a) => a.id === "c7@m"), []);
});

test("a forbidden plugin is never installed or enabled, even when a profile asks for it", () => {
  const { actions, notes } = plan({ required: ["context7", "context-mode"] });
  assert.deepEqual(typesFor(actions, "c7@m"), []);
  assert.ok(notes.some((n) => n.includes("context7") && /forbidden/i.test(n)),
    `expected a note explaining the refusal, got: ${JSON.stringify(notes)}`);
  // the rest of the profile is unaffected
  assert.ok(actions.some((a) => a.id === "cm@m" && a.type === "enable"));
});

test("a forbidden plugin asked for AND present is still removed, not installed", () => {
  const { actions } = plan({ required: ["context7"], installedIds: ["c7@m"], enabledPlugins: { "c7@m": true } });
  assert.deepEqual(typesFor(actions, "c7@m"), ["disable", "uninstall"]);
});

test("forbidden outranks keepInstalled", () => {
  const { actions } = plan({ keepInstalled: ["context7"], installedIds: ["c7@m"] });
  assert.deepEqual(typesFor(actions, "c7@m"), ["uninstall"]);
});

test("without the CLI a forbidden plugin still gets a manual uninstall instruction", () => {
  const { actions, notes } = plan({ installedIds: null, enabledPlugins: { "c7@m": true } });
  assert.deepEqual(typesFor(actions, "c7@m"), ["disable"]);
  assert.ok(notes.some((n) => n.includes("claude plugin uninstall c7@m")));
});

test("a merely-unrequired managed plugin is untouched by the forbidden path", () => {
  const { actions } = plan({ installedIds: ["gsd@m"], enabledPlugins: { "gsd@m": true } });
  const gsd = actions.filter((a) => a.id === "gsd@m");
  assert.deepEqual(gsd.map((a) => a.type).sort(), ["disable", "uninstall"]);
  assert.ok(gsd.every((a) => a.forbidden !== true));
});

test("describeAction says why a forbidden plugin is being removed", () => {
  const { actions } = plan({ installedIds: ["c7@m"] });
  const uninstall = actions.find((a) => a.id === "c7@m" && a.type === "uninstall");
  assert.match(describeAction(uninstall), /forbidden/i);
  assert.match(describeAction(uninstall), /removes files/);
});
