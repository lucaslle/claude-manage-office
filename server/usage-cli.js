import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// La commande /usage de la CLI Claude Code affiche les limites sans appeler le moindre modèle (0 token) :
// `claude -p /usage` renvoie le texte, et ce module le convertit en instantané d'usage lu par le tableau de bord.

const RUN_TIMEOUT_MS = 30000;
const MIN_INTERVAL_MS = 5000;
// ENOENT : commande absente ; EACCES : un « claude » non exécutable (dossier, fichier) précède la vraie commande dans le PATH.
const NOT_RUNNABLE = new Set(["ENOENT", "EACCES"]);
const MONTHS =["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const LINE = /^Current (session|week)(?:\s*\(([^)]+)\))?:\s*(\d+(?:\.\d+)?)%\s*used(?:\s*·\s*resets\s+(.+))?$/i;
const RESET = /^(?:([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),\s*)?(\d{1,2})(?::(\d{2}))?\s*([ap])m(?:\s*\(([^)]+)\))?$/i;

const clampPercent = (value) => Math.min(100, Math.max(0, Math.round(value)));

const zonePartsAsUtc = (instant, timeZone) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, Number(part.value)]),
  );
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
};

// Heure murale d'un fuseau -> instant UTC (deux passes pour absorber le changement d'heure).
const wallTimeToInstant = (year, month, day, hour, minute, timeZone) => {
  const wall = Date.UTC(year, month, day, hour, minute);
  const first = wall - (zonePartsAsUtc(wall, timeZone) - wall);
  return wall - (zonePartsAsUtc(first, timeZone) - first);
};

const validTimeZone = (name) => {
  if (!name) return Intl.DateTimeFormat().resolvedOptions().timeZone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: name });
    return name;
  } catch {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
};

// « Oct 19, 1:30pm (Europe/Paris) » ou « 3am (Europe/Paris) » -> millisecondes, toujours dans le futur proche.
export const parseReset = (text, now = Date.now()) => {
  const match = RESET.exec(String(text ?? "").trim());
  if (!match) return null;
  const [, monthName, dayText, hourText, minuteText, meridiem, zoneName] = match;
  const timeZone = validTimeZone(zoneName);
  let hour = Number(hourText) % 12;
  if (meridiem.toLowerCase() === "p") hour += 12;
  const minute = minuteText ? Number(minuteText) : 0;
  const today = new Date(zonePartsAsUtc(now, timeZone));
  let year = today.getUTCFullYear();
  let month = today.getUTCMonth();
  let day = today.getUTCDate();
  if (monthName) {
    month = MONTHS.indexOf(monthName.toLowerCase());
    if (month < 0) return null;
    day = Number(dayText);
  }
  let instant = wallTimeToInstant(year, month, day, hour, minute, timeZone);
  if (!monthName && instant <= now) instant = wallTimeToInstant(year, month, day + 1, hour, minute, timeZone);
  if (monthName && instant < now - 36 * 3600 * 1000) instant = wallTimeToInstant(year + 1, month, day, hour, minute, timeZone);
  return instant;
};

export const parseUsageText = (text, now = Date.now()) => {
  const record = { fiveHour: null, sevenDay: null, models: [] };
  String(text ?? "")
    .split(/\r?\n/)
    .forEach((rawLine) => {
      const match = LINE.exec(rawLine.trim());
      if (!match) return;
      const [, kind, qualifier, percent, reset] = match;
      const window = { usedPercent: clampPercent(Number(percent)), resetsAt: reset ? parseReset(reset, now) : null };
      if (kind.toLowerCase() === "session") record.fiveHour = window;
      else if (!qualifier || /all models/i.test(qualifier)) record.sevenDay = window;
      else record.models.push({ label: qualifier.trim(), ...window });
    });
  return record.fiveHour || record.sevenDay ? record : null;
};

export const usageFromCli = (text, previous, now = Date.now()) => {
  const parsed = parseUsageText(text, now);
  if (!parsed) return null;
  return { updatedAt: now, detailsAt: now, source: "cli", plan: previous?.plan ?? "", ...parsed };
};

const candidateCommands = () => {
  const extension = process.platform === "win32" ? ".cmd" : "";
  return [process.env.CLAUDE_BIN, "claude", path.join(os.homedir(), ".local", "bin", "claude"), path.join(os.homedir(), ".claude", "local", "claude")]
    .filter(Boolean)
    .map((command) => (command === "claude" ? `claude${extension}` : command));
};

const execute = (command) =>
  new Promise((resolve, reject) => {
    execFile(command, ["-p", "/usage", "--output-format", "json", "--no-session-persistence"], { cwd: os.tmpdir(), timeout: RUN_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024, shell: process.platform === "win32" }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });

export const runUsageCommand = async (run = execute, commands = candidateCommands()) => {
  let lastError = null;
  for (const command of commands) {
    try {
      const stdout = await run(command);
      const payload = JSON.parse(stdout);
      return String(payload.result ?? "");
    } catch (error) {
      lastError = error;
      if (!NOT_RUNNABLE.has(error?.code) && !(error instanceof SyntaxError)) break;
    }
  }
  const missing = NOT_RUNNABLE.has(lastError?.code);
  throw new Error(missing ? "La commande « claude » est introuvable pour ce serveur (variable CLAUDE_BIN pour son chemin)." : `Lecture de /usage impossible : ${lastError?.message ?? "erreur inconnue"}`);
};

export const createUsageRefresher = ({ baseDirectory, readPrevious, onUsage, run = runUsageCommand, now = () => Date.now() }) => {
  let pending = null;
  let lastRun = 0;
  let lastResult = null;
  return () => {
    if (pending) return pending;
    if (lastResult && now() - lastRun < MIN_INTERVAL_MS) return Promise.resolve(lastResult);
    const attempt = async () => {
      try {
        const text = await run();
        const usage = usageFromCli(text, readPrevious(), now());
        if (!usage) return { ok: false, reason: "La commande /usage n'a renvoyé aucune limite lisible (connexion par abonnement requise)." };
        fs.mkdirSync(baseDirectory, { recursive: true });
        const file = path.join(baseDirectory, "usage.json");
        fs.writeFileSync(`${file}.tmp`, JSON.stringify(usage));
        fs.renameSync(`${file}.tmp`, file);
        onUsage(usage);
        return { ok: true, usage };
      } catch (error) {
        return { ok: false, reason: error.message };
      }
    };
    pending = attempt().then((result) => {
      lastResult = result;
      lastRun = now();
      pending = null;
      return result;
    });
    return pending;
  };
};
