import { buildSessionDetails } from "./details.js";

const SESSION_ROUTE = /^\/api\/session\/([\w-]+)$/;

const sendJson = (response, status, body) => {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
};

export const isLocalHost = (hostHeader, port) => hostHeader === `localhost:${port}` || hostHeader === `127.0.0.1:${port}`;

const LIBRARY_ROUTE = /^\/api\/library$/;

export const createLibraryRoutes = ({ port, library, liveSessions }) => async (request, response) => {
  const [pathname, query = ""] = request.url.split("?");
  if (!LIBRARY_ROUTE.test(pathname)) return false;
  if (!isLocalHost(request.headers.host, port)) {
    sendJson(response, 403, { error: "Hôte refusé." });
    return true;
  }
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Méthode non autorisée." });
    return true;
  }
  const limit = Number(new URLSearchParams(query).get("limit"));
  if (new URLSearchParams(query).get("refresh") === "1") library.refresh();
  sendJson(response, 200, library.list({ limit: limit > 0 ? limit : undefined, liveSessions: liveSessions() }));
  return true;
};

export const createSessionRoutes = ({ port, findSession, config }) => async (request, response) => {
  const match = SESSION_ROUTE.exec(request.url.split("?")[0]);
  if (!match) return false;
  if (!isLocalHost(request.headers.host, port)) {
    sendJson(response, 403, { error: "Hôte refusé." });
    return true;
  }
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Méthode non autorisée." });
    return true;
  }
  const record = findSession(match[1]);
  if (record) sendJson(response, 200, buildSessionDetails(record, { contextWindowOverride: config.contextWindow }));
  else sendJson(response, 404, { error: "Session introuvable." });
  return true;
};
