// Windows gives a console child its own window unless windowsHide is set, and Node's default for
// it is false. A hook that shells out to git or graphify therefore flashes a window at the user on
// every run, and a `detached` one leaves that window on screen for as long as the child lives -
// `graphify extract --global` at session start was the visible one. Every spawn in this bundle
// goes through here so the default is inverted exactly once, and spawn-hidden.test.mjs fails the
// build if anything imports node:child_process directly again.
//
// Same signatures as the functions they wrap, including the two-argument form where `args` is
// really the options object. An explicit windowsHide from the caller still wins.
import { spawn as nodeSpawn, spawnSync as nodeSpawnSync, execFileSync as nodeExecFileSync } from "node:child_process";

export const hidden = (options) => ({ windowsHide: true, ...(options || {}) });

export const spawn = (cmd, args, options) =>
  Array.isArray(args) ? nodeSpawn(cmd, args, hidden(options)) : nodeSpawn(cmd, hidden(args));

export const spawnSync = (cmd, args, options) =>
  Array.isArray(args) ? nodeSpawnSync(cmd, args, hidden(options)) : nodeSpawnSync(cmd, hidden(args));

export const execFileSync = (cmd, args, options) =>
  Array.isArray(args) ? nodeExecFileSync(cmd, args, hidden(options)) : nodeExecFileSync(cmd, hidden(args));
