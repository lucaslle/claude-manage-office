import { buildSessionDetails } from "./details.js";

const SESSION_ROUTE = /^\/api\/session\/([\w-]+)$/;

const sendJson = (response, status, body) => {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
};

export const isLocalHost = (hostHeader, port) => hostHeader === `localhost:${port}` || hostHeader === `127.0.0.1:${port}`;

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
