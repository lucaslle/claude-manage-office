import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { createSessionRoutes } from "./api.js";
import { buildSessionDetails, contextWindowFor, resolveTranscriptPath, resumeInfo } from "./details.js";
import { desktopLink, findDesktopSessionId } from "./desktop.js";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "eddy-api-"));
const projects = path.join(directory, ".claude", "projects", "demo");
fs.mkdirSync(projects, { recursive: true });
const transcriptPath = path.join(projects, "s1.jsonl");
const line = (entry) => JSON.stringify(entry);
fs.writeFileSync(
  transcriptPath,
  [
    line({ type: "user", message: { role: "user", content: "Corrige le login" } }),
    line({ type: "assistant", message: { model: "claude-sonnet-5-5", usage: { input_tokens: 2, cache_read_input_tokens: 99000, cache_creation_input_tokens: 998 }, content: [{ type: "text", text: "Je lance les migrations ?" }] } }),
  ].join("\n"),
);

const records = {
  cli: { sessionId: "s1", title: "Login", state: "needs_reply", cwd: directory, branch: "", entrypoint: "cli", transcriptPath, updatedAt: 1 },
  desktop: { sessionId: "s2", title: "App", state: "needs_reply", cwd: directory, branch: "", entrypoint: "claude-desktop", transcriptPath, updatedAt: 1 },
  unknown: { sessionId: "s3", title: "Inconnue", state: "idle", cwd: directory, branch: "", entrypoint: "", transcriptPath, updatedAt: 1 },
};

const routesHolder = { handle: null };
const server = http.createServer(async (request, response) => {
  if (!(await routesHolder.handle(request, response))) {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
routesHolder.handle = createSessionRoutes({
  port,
  config: { contextWindow: 0 },
  findSession: (id) => Object.values(records).find((record) => record.sessionId === id),
});
after(() => server.close());

const call = async (method, pathname) => {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { method });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};

describe("détails de session", () => {
  it("calcule le contexte et lit les derniers messages", async () => {
    const { status, body } = await call("GET", "/api/session/s1");
    assert.equal(status, 200);
    assert.equal(body.context.tokens, 100000);
    assert.equal(body.context.percent, 10);
    assert.deepEqual(body.messages.map((message) => message.role), ["user", "assistant"]);
    assert.equal(body.messages[1].text, "Je lance les migrations ?");
  });

  it("propose la commande de reprise pour une session de terminal", async () => {
    const { body } = await call("GET", "/api/session/s1");
    assert.equal(body.resume.command, `cd "${directory}" && claude --resume s1`);
  });

  it("renvoie 404 pour une session inconnue", async () => {
    assert.equal((await call("GET", "/api/session/inconnue")).status, 404);
  });
});

describe("lecture seule", () => {
  it("refuse toute méthode autre que GET", async () => {
    assert.equal((await call("POST", "/api/session/s1")).status, 405);
    assert.equal((await call("POST", "/api/session/s1/reply")).status, 404);
  });

  it("refuse un en-tête Host qui n'est pas local", async () => {
    const statusCode = await new Promise((resolve) => {
      const request = http.request({ host: "127.0.0.1", port, path: "/api/session/s1", headers: { Host: "evil.example" } }, (incoming) => {
        incoming.resume();
        resolve(incoming.statusCode);
      });
      request.end();
    });
    assert.equal(statusCode, 403);
  });
});

describe("reprise de session", () => {
  it("renvoie à l'app pour une session de l'app Claude, sans commande", () => {
    const info = resumeInfo(records.desktop, "claude://code/continue?session=local_abc-123");
    assert.equal(info.command, "");
    assert.equal(info.appUrl, "claude://code/continue?session=local_abc-123");
    assert.match(info.note, /app Claude/);
  });

  it("n'invente pas de commande tant que le type de session est inconnu", () => {
    assert.equal(resumeInfo(records.unknown).command, "");
  });
});

describe("lien vers l'app Claude", () => {
  const appRoot = path.join(directory, "claude-code-sessions");
  const workspace = path.join(appRoot, "compte", "espace");
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(path.join(workspace, "local_abc-123.json"), `﻿${JSON.stringify({ sessionId: "local_abc-123", cliSessionId: "s2" })}`);
  fs.writeFileSync(path.join(workspace, "local_pirate.json"), JSON.stringify({ sessionId: "local_x/../y", cliSessionId: "s9" }));
  fs.writeFileSync(path.join(workspace, "notes.json"), JSON.stringify({ sessionId: "local_zzz", cliSessionId: "s8" }));

  it("retrouve l'identifiant de l'app depuis celui de la session", () => {
    assert.equal(findDesktopSessionId("s2", [appRoot]), "local_abc-123");
    assert.equal(desktopLink("s2", [appRoot]), "claude://code/continue?session=local_abc-123");
  });

  it("ignore une session inconnue, un identifiant suspect ou un fichier hors modèle", () => {
    assert.equal(desktopLink("inconnue", [appRoot]), "");
    assert.equal(desktopLink("s9", [appRoot]), "");
    assert.equal(desktopLink("s8", [appRoot]), "");
    assert.equal(desktopLink("s2", [path.join(directory, "absent")]), "");
  });

  it("expose le lien dans les détails d'une session de l'app, pas pour un terminal", () => {
    assert.equal(buildSessionDetails(records.desktop, { desktopRoots: [appRoot] }).resume.appUrl, "claude://code/continue?session=local_abc-123");
    assert.equal(buildSessionDetails(records.cli, { desktopRoots: [appRoot] }).resume.appUrl, "");
    assert.match(resumeInfo(records.desktop, "").note, /introuvable/);
  });
});

describe("outils de détails", () => {
  it("choisit une fenêtre de contexte selon le modèle", () => {
    assert.equal(contextWindowFor("claude-sonnet-5-5"), 1000000);
    assert.equal(contextWindowFor("claude-sonnet-4-5"), 200000);
    assert.equal(contextWindowFor("claude-sonnet-4-5[1m]"), 1000000);
    assert.equal(contextWindowFor("claude-sonnet-4-5", 500000), 500000);
  });

  it("n'accepte que les transcripts du dossier des projets Claude", () => {
    assert.equal(resolveTranscriptPath("/etc/passwd"), null);
    assert.equal(resolveTranscriptPath("/home/x/notes.jsonl"), null);
    assert.ok(resolveTranscriptPath(transcriptPath));
  });

  it("traduit un chemin Windows vers /mnt sous Linux", () => {
    assert.equal(resolveTranscriptPath("C:\\Users\\a\\.claude\\projects\\p\\s.jsonl", "linux"), path.resolve("/mnt/c/Users/a/.claude/projects/p/s.jsonl"));
  });
});
