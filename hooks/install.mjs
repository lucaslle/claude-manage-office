import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MARKER = "eddy-hook.mjs";
const EVENT_MODES = {
  UserPromptSubmit: "prompt",
  Stop: "stop",
  Notification: "notify",
  SessionStart: "start",
  SessionEnd: "end",
};

const hookScriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), MARKER).replace(/\\/g, "/");
const nodeCommand = process.platform === "win32" ? "node" : `"${process.execPath}"`;
const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
const removeOnly = process.argv.includes("--remove");
const dryRun = process.argv.includes("--dry-run");

const readSettings = () => {
  if (!fs.existsSync(settingsPath)) return {};
  return JSON.parse(fs.readFileSync(settingsPath, "utf8"));
};

const withoutOurGroups = (groups) =>
  (groups ?? []).filter((group) => !(group.hooks ?? []).some((hook) => String(hook.command ?? "").includes(MARKER)));

const settings = readSettings();
settings.hooks = settings.hooks ?? {};

Object.entries(EVENT_MODES).forEach(([eventName, mode]) => {
  const remaining = withoutOurGroups(settings.hooks[eventName]);
  if (!removeOnly) remaining.push({ hooks: [{ type: "command", command: `${nodeCommand} "${hookScriptPath}" ${mode}`, timeout: 10 }] });
  if (remaining.length > 0) settings.hooks[eventName] = remaining;
  else delete settings.hooks[eventName];
});
if (Object.keys(settings.hooks).length === 0) delete settings.hooks;

const output = `${JSON.stringify(settings, null, 2)}\n`;
if (dryRun) {
  process.stdout.write(output);
} else {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  if (fs.existsSync(settingsPath)) fs.copyFileSync(settingsPath, `${settingsPath}.eddy-backup-${Date.now()}`);
  fs.writeFileSync(settingsPath, output);
  process.stdout.write(`${removeOnly ? "Hooks retirés de" : "Hooks installés dans"} ${settingsPath}\n`);
}
