import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import { createLibraryRoutes } from "./api.js";
import { createLibrary, projectDirectories, projectLabel } from "./library.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "eddy-library-"));
const stateDirectory = path.join(root, ".claude", "eddy-office", "sessions");
const projects = path.join(root, ".claude", "projects", "-work-app");
const appRoot = path.join(root, "app", "compte", "espace");
fs.mkdirSync(stateDirectory, { recursive: true });
fs.mkdirSync(projects, { recursive: true });
fs.mkdirSync(appRoot, { recursive: true });

const line = (entry) => JSON.stringify(entry);
const userLine = (text, extra = {}) => line({ type: "user", message: { role: "user", content: text }, cwd: "/work/app", gitBranch: "feat/login", entrypoint: "cli", ...extra });
const assistantLine = (text) => line({ type: "assistant", message: { model: "claude-sonnet-5-5", usage: { input_tokens: 10, cache_read_input_tokens: 99990 }, content: [{ type: "text", text }] } });

const writeTranscript = (id, lines, ageMs) => {
  const filePath = path.join(projects, `${id}.jsonl`);
  fs.writeFileSync(filePath, lines.join("\n"));
  const time = new Date(Date.now() - ageMs);
  fs.utimesSync(filePath, time, time);
  return filePath;
};

const terminalPath = writeTranscript("term-1", [userLine("Corrige le login"), assistantLine("Je lance les migrations ?"), line({ type: "summary", summary: "Correction du login" })], 3 * 3600 * 1000);
writeTranscript("app-1", [userLine("Prépare la release", { entrypoint: "claude-desktop", cwd: "C:\\src\\shop", gitBranch: "main" }), assistantLine("Release prête.")], 60 * 1000);
writeTranscript("empty-1", [line({ type: "queue-operation", operation: "enqueue" })], 1000);
writeTranscript("refresh-1", [userLine("[eddy-refresh] Mise à jour automatique"), assistantLine("Écrit.")], 1000);
fs.mkdirSync(path.join(projects, "term-1", "subagents"), { recursive: true });
fs.writeFileSync(path.join(projects, "term-1", "subagents", "agent-x.jsonl"), userLine("Sous-agent"));
fs.writeFileSync(
  path.join(appRoot, "local_abc-1.json"),
  JSON.stringify({ sessionId: "local_abc-1", cliSessionId: "app-1", title: "Release boutique", originCwd: "C:\\src\\shop", createdAt: Date.now() - 86400000, lastActivityAt: Date.now() - 30000, isArchived: true, model: "claude-sonnet-5-5", remoteMcpServersConfig: [{ name: "gros", tools: Array.from({ length: 400 }, (_, index) => ({ name: `outil-${index}`, description: "x".repeat(60) })) }] }),
);

const library = createLibrary({ directories: () => [stateDirectory], desktopRoots: () => [appRoot] });
const listed = library.list({ liveSessions: [{ sessionId: "term-1", state: "needs_reply", updatedAt: Date.now() - 4 * 3600 * 1000 }] });
const byId = (id) => listed.entries.find((entry) => entry.id === id);

describe("bibliothèque de discussions", () => {
  it("déduit les dossiers de transcripts depuis les dossiers d'état des hooks", () => {
    assert.deepEqual(projectDirectories([stateDirectory, path.join(root, "absent", "a", "b")]), [path.join(root, ".claude", "projects")]);
  });

  it("liste les discussions, la plus récente d'abord, sans les sessions vides ni de rafraîchissement ni les sous-agents", () => {
    assert.deepEqual(listed.entries.map((entry) => entry.id), ["app-1", "term-1"]);
    assert.equal(listed.total, 2);
  });

  it("décrit une discussion de terminal", () => {
    const entry = byId("term-1");
    assert.equal(entry.title, "Correction du login");
    assert.equal(entry.project, "app");
    assert.equal(entry.branch, "feat/login");
    assert.equal(entry.source, "terminal");
    assert.equal(entry.firstPrompt, "Corrige le login");
    assert.equal(entry.lastMessage, "Je lance les migrations ?");
    assert.equal(entry.contextPercent, 10);
    assert.equal(entry.live, "needs_reply");
    assert.equal(entry.resume.command, `cd "/work/app" && claude --resume term-1`);
    assert.equal(entry.resume.appUrl, "");
  });

  it("complète une discussion de l'app avec les données de l'app", () => {
    const entry = byId("app-1");
    assert.equal(entry.title, "Release boutique");
    assert.equal(entry.source, "app");
    assert.equal(entry.archived, true);
    assert.equal(entry.project, "shop");
    assert.equal(entry.resume.appUrl, "claude://code/continue?session=local_abc-1");
    assert.equal(entry.resume.command, "");
    assert.equal(entry.live, null);
  });

  it("n'expose jamais le chemin du transcript", () => {
    listed.entries.forEach((entry) => {
      assert.equal("transcriptPath" in entry, false);
      assert.equal(JSON.stringify(entry).includes(terminalPath), false);
    });
  });

  it("retrouve l'enregistrement d'une discussion pour la route de détails", () => {
    assert.equal(library.findRecord("term-1").transcriptPath, terminalPath);
    assert.equal(library.findRecord("inconnue"), undefined);
  });

  it("remonte une discussion dont les hooks viennent de signaler une activité", () => {
    const fresh = library.list({ liveSessions: [{ sessionId: "term-1", state: "working", updatedAt: Date.now() }] });
    assert.equal(fresh.entries[0].id, "term-1");
    assert.equal(fresh.entries[0].live, "working");
  });

  it("respecte la limite demandée", () => {
    assert.equal(library.list({ limit: 1 }).entries.length, 1);
    assert.equal(library.list({ limit: 1 }).total, 2);
  });
});

describe("route /api/library", () => {
  const server = http.createServer(async (request, response) => {
    if (!(await routes(request, response))) {
      response.writeHead(404);
      response.end();
    }
  });
  let routes = null;
  let port = 0;

  before(async () => {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = server.address().port;
    routes = createLibraryRoutes({ port, library, liveSessions: () => [] });
  });
  after(() => server.close());

  const call = (method, pathname, host) =>
    new Promise((resolve) => {
      const request = http.request({ host: "127.0.0.1", port, path: pathname, method, headers: host ? { Host: host } : {} }, (incoming) => {
        let body = "";
        incoming.on("data", (chunk) => (body += chunk));
        incoming.on("end", () => resolve({ status: incoming.statusCode, body: body ? JSON.parse(body) : {} }));
      });
      request.end();
    });

  it("renvoie la liste en lecture seule", async () => {
    const { status, body } = await call("GET", "/api/library?limit=1");
    assert.equal(status, 200);
    assert.equal(body.entries.length, 1);
    assert.equal(body.total, 2);
  });

  it("refuse une autre méthode et un hôte qui n'est pas local", async () => {
    assert.equal((await call("POST", "/api/library")).status, 405);
    assert.equal((await call("GET", "/api/library", "evil.example")).status, 403);
  });
});

describe("projectLabel", () => {
  it("garde le dernier dossier d'un chemin Windows ou Linux", () => {
    assert.equal(projectLabel("C:\\Users\\a\\Desktop\\eddy-office-3d"), "eddy-office-3d");
    assert.equal(projectLabel("/home/a/projet/"), "projet");
    assert.equal(projectLabel(""), "Sans projet");
  });

  it("rattache un worktree à son projet et regroupe les conversations sans dossier", () => {
    assert.equal(projectLabel("/home/a/eddy-webapp/.claude/worktrees/feat-login-1f2e"), "eddy-webapp");
    assert.equal(projectLabel("C:\\src\\shop\\.claude\\worktrees\\fix-cart"), "shop");
    assert.equal(projectLabel("C:\\Users\\a\\AppData\\Roaming\\Claude\\scratch-workspaces\\x\\scratch-2026-10-15"), "Sans dossier");
    assert.equal(projectLabel("~"), "Dossier personnel");
    assert.equal(projectLabel("/home/llaliche"), "Dossier personnel");
    assert.equal(projectLabel("C:\\Users\\l.laliche\\"), "Dossier personnel");
    assert.equal(projectLabel("/home/llaliche/projet"), "projet");
  });
});
