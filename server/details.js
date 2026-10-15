import path from "node:path";
import { contextFromLines, readTailLines, recentMessages } from "../hooks/transcript.mjs";
import { desktopLink } from "./desktop.js";

const DEFAULT_WINDOW = 200000;
const LARGE_WINDOW = 1000000;
const PROJECTS_MARKER = `${path.sep}.claude${path.sep}projects${path.sep}`;

export const contextWindowFor = (model, override = 0) => {
  if (override > 0) return override;
  return /\[1m\]/i.test(model) || /-5-/.test(model) ? LARGE_WINDOW : DEFAULT_WINDOW;
};

export const resolveTranscriptPath = (rawPath, platform = process.platform) => {
  if (typeof rawPath !== "string" || !rawPath.endsWith(".jsonl")) return null;
  const windowsPath = /^([A-Za-z]):[\\/](.*)$/.exec(rawPath);
  const candidate = windowsPath && platform === "linux" ? `/mnt/${windowsPath[1].toLowerCase()}/${windowsPath[2].replace(/\\/g, "/")}` : rawPath;
  const resolved = path.resolve(candidate);
  return resolved.includes(PROJECTS_MARKER) ? resolved : null;
};

export const resumeInfo = (record, appUrl = "") => {
  if (record.entrypoint === "claude-desktop") {
    return {
      command: "",
      appUrl,
      note: appUrl ? "Session de l'app Claude : ouvrez-la dans l'app pour répondre." : "Session de l'app Claude : continuez la conversation dans l'app (lien direct introuvable).",
    };
  }
  if (!record.entrypoint || !record.sessionId) {
    return { command: "", appUrl: "", note: "Type de session pas encore connu : il sera détecté à la prochaine activité de la session." };
  }
  return {
    command: `cd "${record.cwd}" && claude --resume ${record.sessionId}`,
    appUrl: "",
    note: "Pour répondre, reprenez la session dans un terminal. Si elle y est encore ouverte, répondez-y directement.",
  };
};

const readLines = (record) => {
  const transcriptPath = resolveTranscriptPath(record.transcriptPath);
  if (!transcriptPath) return [];
  try {
    return readTailLines(transcriptPath);
  } catch {
    return [];
  }
};

export const buildSessionDetails = (record, { contextWindowOverride = 0, desktopRoots } = {}) => {
  const lines = readLines(record);
  const appUrl = record.entrypoint === "claude-desktop" ? desktopLink(record.sessionId, desktopRoots) : "";
  const usage = contextFromLines(lines);
  const window = usage ? contextWindowFor(usage.model, contextWindowOverride) : 0;
  return {
    sessionId: record.sessionId,
    title: record.title,
    state: record.state,
    cwd: record.cwd,
    branch: record.branch,
    entrypoint: record.entrypoint ?? "",
    context: usage ? { tokens: usage.tokens, window, percent: Math.min(100, Math.round((usage.tokens / window) * 100)), estimated: true } : null,
    messages: recentMessages(lines),
    resume: resumeInfo(record, appUrl),
    updatedAt: record.updatedAt,
  };
};
