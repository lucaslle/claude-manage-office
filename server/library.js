import fs from "node:fs";
import path from "node:path";
import { contextFromLines, excerpt, findTitle, findWorkingContext, firstUserPrompt, lastAssistantText, looksLikeRefresh, readHeadLines, readTailLines } from "../hooks/transcript.mjs";
import { contextWindowFor, resumeInfo } from "./details.js";
import { desktopSessionRoots, listDesktopSessions } from "./desktop.js";

const HEAD_BYTES = 65536;
const HEAD_LINES = 80;
const TAIL_BYTES = 49152;
const DEFAULT_LIMIT = 300;
const MAX_LIMIT = 2000;
const INDEX_TTL_MS = 15000;
const TITLE_LENGTH = 90;
const PROMPT_LENGTH = 200;
const MESSAGE_LENGTH = 220;
const NO_PROJECT = "Sans projet";
const NO_FOLDER = "Sans dossier";
const NO_TITLE = "Sans titre";

const describedFiles = new Map();

// Les transcripts d'un système sont dans <dossier personnel>/.claude/projects ; les états des hooks, dans .claude/eddy-office/sessions.
export const projectDirectories = (stateDirectories) => {
  const found = stateDirectories.map((directory) => path.resolve(directory, "..", "..", "projects")).filter((candidate) => fs.existsSync(candidate));
  return [...new Set(found)];
};

const WORKTREE_SUFFIX = /[\\/]\.claude[\\/]worktrees[\\/].*$/;
const SCRATCH_FOLDER = /[\\/]scratch-workspaces[\\/]/;
const HOME_FOLDER = /^(?:[A-Za-z]:)?[\\/](?:home|Users)[\\/][^\\/]+[\\/]?$/;
const HOME_LABEL = "Dossier personnel";

// Un dossier de travail temporaire (worktree) ou une conversation sans dossier ne doit pas devenir un projet à part.
export const projectLabel = (cwd) => {
  const path = String(cwd ?? "").replace(WORKTREE_SUFFIX, "");
  if (SCRATCH_FOLDER.test(path)) return NO_FOLDER;
  if (path === "~" || HOME_FOLDER.test(path)) return HOME_LABEL;
  const segments = path.split(/[\\/]+/).filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : NO_PROJECT;
};

const systemOf = (filePath, platform = process.platform) => {
  if (platform === "win32") return /^\\\\wsl/i.test(filePath) ? "WSL" : "Windows";
  return filePath.startsWith("/mnt/") ? "Windows" : "WSL";
};

const listTranscripts = (projectsDirectory) => {
  let projects = [];
  try {
    projects = fs.readdirSync(projectsDirectory, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  } catch {
    return [];
  }
  return projects.flatMap((project) => {
    const directory = path.join(projectsDirectory, project.name);
    try {
      return fs
        .readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
        .map((entry) => {
          const filePath = path.join(directory, entry.name);
          const { mtimeMs, size, birthtimeMs } = fs.statSync(filePath);
          return { filePath, sessionId: entry.name.slice(0, -".jsonl".length), mtimeMs, size, birthtimeMs };
        });
    } catch {
      return [];
    }
  });
};

const describeTranscript = (file) => {
  const cached = describedFiles.get(file.filePath);
  if (cached && cached.mtimeMs === file.mtimeMs && cached.size === file.size) return cached.data;
  let data = null;
  try {
    const head = readHeadLines(file.filePath, HEAD_LINES, HEAD_BYTES);
    const tail = readTailLines(file.filePath, TAIL_BYTES);
    const usage = contextFromLines(tail);
    const rawPrompt = firstUserPrompt(head);
    data = {
      ...findWorkingContext(head),
      title: excerpt(findTitle(tail) || findTitle(head), TITLE_LENGTH),
      firstPrompt: excerpt(rawPrompt, PROMPT_LENGTH),
      refresh: looksLikeRefresh(rawPrompt),
      lastMessage: excerpt(lastAssistantText(tail), MESSAGE_LENGTH),
      usage,
    };
  } catch {
    data = null;
  }
  describedFiles.set(file.filePath, { mtimeMs: file.mtimeMs, size: file.size, data });
  return data;
};

const buildEntry = ({ sessionId, file, details, app, contextWindowOverride }) => {
  const entrypoint = details?.entrypoint || "";
  const source = app || entrypoint === "claude-desktop" ? "app" : "terminal";
  const cwd = details?.cwd || app?.cwd || "";
  const appUrl = app ? `claude://code/continue?session=${app.appSessionId}` : "";
  const updatedAt = Math.max(file?.mtimeMs ?? 0, app?.lastActivityAt ?? 0);
  const title = app?.title || details?.title || details?.firstPrompt || NO_TITLE;
  const window = details?.usage ? contextWindowFor(details.usage.model || app?.model || "", contextWindowOverride) : 0;
  const record = { sessionId, title, state: "idle", cwd, branch: details?.branch ?? "", entrypoint: source === "app" ? "claude-desktop" : entrypoint || "cli", transcriptPath: file?.filePath ?? "", updatedAt };
  return {
    record,
    projectPath: app?.cwd || cwd,
    appUrl,
    system: file ? systemOf(file.filePath) : "Windows",
    createdAt: app?.createdAt || file?.birthtimeMs || updatedAt,
    archived: app?.archived ?? false,
    model: details?.usage?.model || app?.model || "",
    firstPrompt: details?.firstPrompt ?? "",
    lastMessage: details?.lastMessage ?? "",
    contextPercent: details?.usage && window ? Math.min(100, Math.round((details.usage.tokens / window) * 100)) : null,
  };
};

const pickResume = (entry) => {
  const { command, appUrl } = resumeInfo(entry.record, entry.appUrl);
  return { command, appUrl };
};

const toPublic = (entry, live) => ({
  id: entry.record.sessionId,
  title: excerpt(entry.record.title, TITLE_LENGTH),
  project: projectLabel(entry.projectPath),
  cwd: entry.record.cwd,
  branch: entry.record.branch,
  source: entry.record.entrypoint === "claude-desktop" ? "app" : "terminal",
  system: entry.system,
  createdAt: entry.createdAt,
  updatedAt: Math.max(entry.record.updatedAt, live?.updatedAt ?? 0),
  archived: entry.archived,
  model: entry.model,
  firstPrompt: entry.firstPrompt,
  lastMessage: entry.lastMessage,
  contextPercent: entry.contextPercent,
  live: live ? live.state : null,
  resume: pickResume(entry),
});

export const createLibrary = ({ directories, desktopRoots = desktopSessionRoots, contextWindow = 0, now = Date.now }) => {
  let index = null;
  let builtAt = 0;

  const build = () => {
    const files = projectDirectories(directories()).flatMap(listTranscripts);
    const apps = new Map(listDesktopSessions(desktopRoots()).map((app) => [app.cliSessionId, app]));
    const byId = new Map();
    files.forEach((file) => {
      const current = byId.get(file.sessionId);
      if (!current || file.mtimeMs > current.mtimeMs) byId.set(file.sessionId, file);
    });
    const ids = new Set([...byId.keys(), ...apps.keys()]);
    const entries = [];
    ids.forEach((sessionId) => {
      const file = byId.get(sessionId);
      const app = apps.get(sessionId);
      const details = file ? describeTranscript(file) : null;
      if (details?.refresh) return;
      if (!app && !details?.firstPrompt && !details?.title) return;
      entries.push(buildEntry({ sessionId, file, details, app, contextWindowOverride: contextWindow }));
    });
    entries.sort((first, second) => second.record.updatedAt - first.record.updatedAt);
    index = entries;
    builtAt = now();
  };

  const ensureIndex = () => {
    if (!index || now() - builtAt > INDEX_TTL_MS) build();
    return index;
  };

  const list = ({ limit = DEFAULT_LIMIT, liveSessions = [] } = {}) => {
    const entries = ensureIndex();
    const liveById = new Map(liveSessions.map((record) => [record.sessionId, record]));
    const capped = Math.min(Math.max(1, Math.floor(limit) || DEFAULT_LIMIT), MAX_LIMIT);
    const items = entries.slice(0, capped).map((entry) => toPublic(entry, liveById.get(entry.record.sessionId)));
    items.sort((first, second) => second.updatedAt - first.updatedAt);
    return { generatedAt: builtAt, total: entries.length, entries: items };
  };

  const findRecord = (sessionId) => ensureIndex().find((entry) => entry.record.sessionId === sessionId)?.record;

  return { list, findRecord, refresh: () => (index = null) };
};
