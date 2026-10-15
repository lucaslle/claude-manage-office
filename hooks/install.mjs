import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MARKER = "eddy-hook.mjs";
const EVENT_HOOKS = [
  { event: "UserPromptSubmit", mode: "prompt" },
  { event: "Stop", mode: "stop" },
  { event: "Notification", mode: "notify" },
  { event: "SessionStart", mode: "start" },
  { event: "SessionEnd", mode: "end" },
  { event: "PreToolUse", mode: "agent-start", matcher: "Task|Agent" },
  { event: "SubagentStop", mode: "agent-stop" },
  { event: "PreCompact", mode: "compact" },
  { event: "PostCompact", mode: "compacted" },
];

const STATUSLINE_MARKER = "eddy-statusline.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const hookScriptPath = path.join(scriptDirectory, MARKER).replace(/\\/g, "/");
const statuslineScriptPath = path.join(scriptDirectory, STATUSLINE_MARKER).replace(/\\/g, "/");
const nodeCommand = process.platform === "win32" ? "node" : `"${process.execPath}"`;
const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
const removeOnly = process.argv.includes("--remove");
const dryRun = process.argv.includes("--dry-run");
const withStatusline = process.argv.includes("--statusline");

const ownsStatusline = (config) => String(config?.command ?? "").includes(STATUSLINE_MARKER);

const readSettings = () => {
  if (!fs.existsSync(settingsPath)) return {};
  return JSON.parse(fs.readFileSync(settingsPath, "utf8"));
};

const withoutOurGroups = (groups) =>
  (groups ?? []).filter((group) => !(group.hooks ?? []).some((hook) => String(hook.command ?? "").includes(MARKER)));

const settings = readSettings();
settings.hooks = settings.hooks ?? {};

EVENT_HOOKS.forEach(({ event, mode, matcher }) => {
  const remaining = withoutOurGroups(settings.hooks[event]);
  if (!removeOnly) {
    const group = { hooks: [{ type: "command", command: `${nodeCommand} "${hookScriptPath}" ${mode}`, timeout: 10 }] };
    if (matcher) group.matcher = matcher;
    remaining.push(group);
  }
  if (remaining.length > 0) settings.hooks[event] = remaining;
  else delete settings.hooks[event];
});
if (Object.keys(settings.hooks).length === 0) delete settings.hooks;

if (removeOnly && ownsStatusline(settings.statusLine)) delete settings.statusLine;
if (withStatusline && !removeOnly) {
  if (settings.statusLine && !ownsStatusline(settings.statusLine)) {
    process.stderr.write("Une ligne d'état existe déjà dans vos réglages : elle n'est pas modifiée.\n");
  } else {
    settings.statusLine = { type: "command", command: `${nodeCommand} "${statuslineScriptPath}"` };
  }
}

const output = `${JSON.stringify(settings, null, 2)}\n`;
if (dryRun) {
  process.stdout.write(output);
} else {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  if (fs.existsSync(settingsPath)) fs.copyFileSync(settingsPath, `${settingsPath}.eddy-backup-${Date.now()}`);
  fs.writeFileSync(settingsPath, output);
  process.stdout.write(`${removeOnly ? "Hooks retirés de" : "Hooks installés dans"} ${settingsPath}\n`);
}
