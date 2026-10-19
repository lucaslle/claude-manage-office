import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createLibraryRoutes, createSessionRoutes } from "./api.js";
import { createLibrary } from "./library.js";
import { createGitlabClient } from "./gitlab.js";
import { loadConfig, rootDirectory } from "./config.js";
import { buildCharacters } from "./model.js";
import { readFeature } from "./speckit.js";
import { detectWindowsSessionDirectories, detectWslSessionDirectories, readRecentlyEnded, readSessions } from "./sessions.js";
import { readFreshestSnapshot, readFreshestUsage } from "./snapshots.js";
import { createUsageRefresher } from "./usage-cli.js";
import { isLocalHost } from "./api.js";
import { createScoreStore, scoreFilePath } from "./score-store.js";
import { advanceScore, publicScore } from "../shared/scoring.js";

const SESSION_REFRESH_MS = 2000;
const WSL_REFRESH_MS = 300000;
const KEEPALIVE_MS = 25000;
const MERGED_VISIBLE_MS = 120000;
const CLEARED_VISIBLE_MS = 120000;
const MIME_TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".bin": "application/octet-stream", ".png": "image/png", ".json": "application/json" };

const config = loadConfig();
const production = process.env.NODE_ENV === "production" || process.argv.includes("--production");
const hoursToMs = (hours) => hours * 3600 * 1000;

const detectOtherSystemDirectories = () => (config.detectWsl ? [...detectWslSessionDirectories(), ...detectWindowsSessionDirectories()] : []);

let wslDirectories = detectOtherSystemDirectories();
let sessions = [];
let cleared = [];
let usage = null;
let connectors = null;
let mergeRequests = [];
let recentlyMerged = [];
const scoreStore = createScoreStore(scoreFilePath(config.sessionDirectories[0]));
let score = scoreStore.load();
let scoreSaveFailed = false;
const gitlabConfigured = Boolean(config.gitlabToken && config.gitlabUrl);
const gitlabStatus = {
  state: gitlabConfigured ? "pending" : "no-token",
  message: gitlabConfigured ? "" : "GitLab non configuré (GITLAB_URL et GITLAB_TOKEN dans .env).",
  user: "",
};

const sessionDirectories = () => [...config.sessionDirectories, ...wslDirectories];

const library = createLibrary({ directories: sessionDirectories, contextWindow: config.contextWindow });
const libraryRoutes = createLibraryRoutes({ port: config.port, library, liveSessions: () => sessions });
const sessionRoutes = createSessionRoutes({
  port: config.port,
  config,
  findSession: (sessionId) => sessions.find((record) => record.sessionId === sessionId) ?? library.findRecord(sessionId),
});

// Bouton « Actualiser » des limites : la CLI Claude Code lit /usage sans consommer de tokens.
const refreshUsage = createUsageRefresher({
  baseDirectory: path.dirname(config.sessionDirectories[0]),
  readPrevious: () => usage,
  onUsage: (next) => {
    usage = next;
    publish();
  },
});

const readFeatures = () => new Map(sessions.map((session) => [session.sessionId, readFeature(session.cwd, session.branch)]).filter(([, feature]) => feature));
const buildCurrentCharacters = () => buildCharacters({ sessions, mergeRequests, features: readFeatures(), now: Date.now(), agentMaxAgeMs: config.agentMaxAgeMinutes * 60 * 1000, restMs: config.restMinutes * 60 * 1000 });

const composeState = (characters) => ({
  characters,
  mergedKeys: recentlyMerged.map((entry) => entry.key),
  clearedKeys: cleared.map((record) => `s:${record.sessionId}`),
  usage,
  connectors,
  score: publicScore(score),
  sources: {
    sessions: { count: sessions.length, directories: sessionDirectories().length },
    gitlab: { ...gitlabStatus, mergeRequests: mergeRequests.length },
  },
});

const clients = new Set();
let lastState = null;
let lastSerialized = "";

const currentState = () => lastState ?? composeState(buildCurrentCharacters());

const saveScore = () => {
  try {
    scoreStore.save(score);
    scoreSaveFailed = false;
  } catch (error) {
    if (!scoreSaveFailed) process.stderr.write(`Score non enregistré : ${error.message}\n`);
    scoreSaveFailed = true;
  }
};

const publish = () => {
  const characters = buildCurrentCharacters();
  const merged = recentlyMerged.map((entry) => ({ key: entry.key, name: entry.name }));
  score = advanceScore(score, { characters, merged, now: Date.now() }).score;
  saveScore();
  lastState = composeState(characters);
  const serialized = JSON.stringify(lastState);
  if (serialized === lastSerialized) return;
  lastSerialized = serialized;
  clients.forEach((response) => response.write(`data: ${serialized}\n\n`));
};

const refreshSessions = () => {
  sessions = readSessions(sessionDirectories(), { maxAgeMs: hoursToMs(config.sessionMaxAgeHours) });
  cleared = readRecentlyEnded(sessionDirectories(), { reason: "clear", maxAgeMs: CLEARED_VISIBLE_MS });
  usage = readFreshestUsage(sessionDirectories());
  connectors = readFreshestSnapshot(sessionDirectories(), "connectors.json");
  publish();
};

const gitlab = gitlabConfigured ? createGitlabClient({ baseUrl: config.gitlabUrl, token: config.gitlabToken }) : null;
let gitlabUserId = null;

const detectMerged = async (previous, current) => {
  const currentKeys = new Set(current.map((mergeRequest) => mergeRequest.key));
  const vanished = previous.filter((mergeRequest) => !currentKeys.has(mergeRequest.key));
  const checks = await Promise.all(
    vanished.map(async (mergeRequest) => {
      try {
        return (await gitlab.fetchMergeRequestState(mergeRequest.projectId, mergeRequest.iid)) === "merged" ? mergeRequest : null;
      } catch {
        return null;
      }
    }),
  );
  const now = Date.now();
  checks.filter(Boolean).forEach((mergeRequest) => recentlyMerged.push({ key: mergeRequest.key, name: `${mergeRequest.repo} !${mergeRequest.iid}`, at: now }));
};

const refreshGitlab = async () => {
  if (!gitlab) return;
  try {
    if (gitlabUserId === null) {
      const user = await gitlab.fetchCurrentUser();
      gitlabUserId = user.id;
      gitlabStatus.user = user.username;
    }
    const next = await gitlab.annotatePipelines(await gitlab.fetchOpenMergeRequests(gitlabUserId));
    await detectMerged(mergeRequests, next);
    mergeRequests = next;
    gitlabStatus.state = "ok";
    gitlabStatus.message = "";
  } catch (error) {
    gitlabStatus.state = "error";
    gitlabStatus.message = `GitLab : ${error.message}`;
  }
  recentlyMerged = recentlyMerged.filter((entry) => Date.now() - entry.at < MERGED_VISIBLE_MS);
  publish();
};

const sendJson = (response, body) => {
  response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
};

const handleApi = async (request, response) => {
  if (await sessionRoutes(request, response)) return undefined;
  if (await libraryRoutes(request, response)) return undefined;
  if (request.url.startsWith("/api/state")) return sendJson(response, currentState());
  if (request.url.startsWith("/api/stream")) {
    response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
    response.write(`data: ${JSON.stringify(currentState())}\n\n`);
    clients.add(response);
    request.on("close", () => clients.delete(response));
    return undefined;
  }
  if (request.url.split("?")[0] === "/api/usage/refresh") {
    if (!isLocalHost(request.headers.host, config.port)) {
      response.writeHead(403);
      response.end();
      return undefined;
    }
    if (request.method !== "POST") {
      response.writeHead(405);
      response.end();
      return undefined;
    }
    const result = await refreshUsage();
    return sendJson(response, result.ok ? { ok: true } : { ok: false, reason: result.reason });
  }
  if (request.url.startsWith("/api/refresh") && request.method === "POST") {
    refreshGitlab();
    refreshSessions();
    return sendJson(response, { ok: true });
  }
  response.writeHead(404);
  response.end();
  return undefined;
};

const serveStatic = (request, response) => {
  const distDirectory = path.join(rootDirectory, "dist");
  const requested = decodeURIComponent(request.url.split("?")[0]);
  const candidate = path.normalize(path.join(distDirectory, requested === "/" ? "index.html" : requested));
  const filePath = candidate.startsWith(distDirectory) && fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : path.join(distDirectory, "index.html");
  response.writeHead(200, { "Content-Type": MIME_TYPES[path.extname(filePath)] ?? "application/octet-stream" });
  fs.createReadStream(filePath).pipe(response);
};

const start = async () => {
  let viteServer = null;
  if (!production) {
    const { createServer } = await import("vite");
    viteServer = await createServer({ root: rootDirectory, server: { middlewareMode: true }, appType: "spa" });
  }

  const server = http.createServer((request, response) => {
    if (request.url.startsWith("/api/")) {
      return handleApi(request, response).catch(() => {
        if (!response.headersSent) response.writeHead(500);
        response.end();
      });
    }
    if (viteServer) return viteServer.middlewares(request, response);
    return serveStatic(request, response);
  });

  server.listen(config.port, "127.0.0.1", () => {
    process.stdout.write(`Bureaux Eddy : http://localhost:${config.port}\n`);
    process.stdout.write(`Sessions : ${sessionDirectories().length} dossier(s) surveillé(s). GitLab : ${gitlabStatus.state}.\n`);
  });

  refreshSessions();
  await refreshGitlab();
  setInterval(refreshSessions, SESSION_REFRESH_MS);
  setInterval(refreshGitlab, config.gitlabPollSeconds * 1000);
  setInterval(() => {
    wslDirectories = detectOtherSystemDirectories();
  }, WSL_REFRESH_MS);
  setInterval(() => clients.forEach((response) => response.write(": keepalive\n\n")), KEEPALIVE_MS);
};

start();
