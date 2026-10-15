import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createGitlabClient } from "./gitlab.js";
import { loadConfig, rootDirectory } from "./config.js";
import { buildCharacters } from "./model.js";
import { detectWindowsSessionDirectories, detectWslSessionDirectories, readSessions } from "./sessions.js";

const SESSION_REFRESH_MS = 2000;
const WSL_REFRESH_MS = 300000;
const KEEPALIVE_MS = 25000;
const MERGED_VISIBLE_MS = 120000;
const MIME_TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".bin": "application/octet-stream", ".png": "image/png", ".json": "application/json" };

const config = loadConfig();
const production = process.env.NODE_ENV === "production" || process.argv.includes("--production");
const hoursToMs = (hours) => hours * 3600 * 1000;

const detectOtherSystemDirectories = () => (config.detectWsl ? [...detectWslSessionDirectories(), ...detectWindowsSessionDirectories()] : []);

let wslDirectories = detectOtherSystemDirectories();
let sessions = [];
let mergeRequests = [];
let recentlyMerged = [];
const gitlabConfigured = Boolean(config.gitlabToken && config.gitlabUrl);
const gitlabStatus = {
  state: gitlabConfigured ? "pending" : "no-token",
  message: gitlabConfigured ? "" : "GitLab non configuré (GITLAB_URL et GITLAB_TOKEN dans .env).",
  user: "",
};

const sessionDirectories = () => [...config.sessionDirectories, ...wslDirectories];

const buildState = () => ({
  characters: buildCharacters({ sessions, mergeRequests, now: Date.now(), agentMaxAgeMs: config.agentMaxAgeMinutes * 60 * 1000 }),
  mergedKeys: recentlyMerged.map((entry) => entry.key),
  sources: {
    sessions: { count: sessions.length, directories: sessionDirectories().length },
    gitlab: { ...gitlabStatus, mergeRequests: mergeRequests.length },
  },
});

const clients = new Set();
let lastSerialized = "";

const publish = () => {
  const serialized = JSON.stringify(buildState());
  if (serialized === lastSerialized) return;
  lastSerialized = serialized;
  clients.forEach((response) => response.write(`data: ${serialized}\n\n`));
};

const refreshSessions = () => {
  sessions = readSessions(sessionDirectories(), { maxAgeMs: hoursToMs(config.sessionMaxAgeHours) });
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
        return (await gitlab.fetchMergeRequestState(mergeRequest.projectId, mergeRequest.iid)) === "merged" ? mergeRequest.key : null;
      } catch {
        return null;
      }
    }),
  );
  const now = Date.now();
  checks.filter(Boolean).forEach((key) => recentlyMerged.push({ key, at: now }));
};

const refreshGitlab = async () => {
  if (!gitlab) return;
  try {
    if (gitlabUserId === null) {
      const user = await gitlab.fetchCurrentUser();
      gitlabUserId = user.id;
      gitlabStatus.user = user.username;
    }
    const next = await gitlab.fetchOpenMergeRequests(gitlabUserId);
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

const handleApi = (request, response) => {
  if (request.url.startsWith("/api/state")) return sendJson(response, buildState());
  if (request.url.startsWith("/api/stream")) {
    response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
    response.write(`data: ${JSON.stringify(buildState())}\n\n`);
    clients.add(response);
    request.on("close", () => clients.delete(response));
    return undefined;
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
    if (request.url.startsWith("/api/")) return handleApi(request, response);
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
