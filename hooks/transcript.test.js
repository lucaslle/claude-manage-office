import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findTitle, firstUserPrompt, lastAssistantText, looksLikeQuestion } from "./transcript.mjs";

const hookPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "eddy-hook.mjs");

const assistantLine = (text) => JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text }] } });
const userLine = (text) => JSON.stringify({ type: "user", message: { role: "user", content: text } });

describe("looksLikeQuestion", () => {
  it("détecte un point d'interrogation final", () => {
    assert.equal(looksLikeQuestion("Voici le résultat.\n\nVeux-tu que je revérifie dans dix minutes ?"), true);
  });

  it("détecte une question suivie de mise en forme", () => {
    assert.equal(looksLikeQuestion("Je continue avec **l'option A** ?*"), true);
  });

  it("détecte une question sans point d'interrogation", () => {
    assert.equal(looksLikeQuestion("Dites-moi si vous voulez que je lance la migration, ou voulez-vous d'abord relire le plan"), true);
  });

  it("ne signale pas un compte rendu", () => {
    assert.equal(looksLikeQuestion("Les tests passent. La MR est prête."), false);
  });

  it("ne signale pas un texte vide", () => {
    assert.equal(looksLikeQuestion(""), false);
  });
});

describe("lecture du transcript", () => {
  it("retrouve le dernier texte de l'assistant en sautant les appels d'outil", () => {
    const toolOnly = JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash" }] } });
    const lines = [assistantLine("Premier message."), toolOnly, assistantLine("Dernier message ?"), toolOnly];
    assert.equal(lastAssistantText(lines), "Dernier message ?");
  });

  it("prend le dernier titre connu", () => {
    const lines = [JSON.stringify({ type: "ai-title", aiTitle: "Ancien" }), JSON.stringify({ type: "custom-title", customTitle: "Titre choisi" })];
    assert.equal(findTitle(lines), "Titre choisi");
  });

  it("utilise le premier message utilisateur sans balises", () => {
    const lines = [userLine("<system-reminder>bruit</system-reminder>Corrige le login"), assistantLine("ok")];
    assert.equal(firstUserPrompt(lines), "Corrige le login");
  });
});

describe("script de hook", () => {
  const runHook = (mode, payload, stateDirectory) =>
    execFileSync("node", [hookPath, mode], { input: JSON.stringify(payload), env: { ...process.env, EDDY_STATE_DIR: stateDirectory } }).toString();

  it("écrit un état needs_reply sans rien afficher quand Claude pose une question", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "eddy-hook-"));
    const transcriptPath = path.join(directory, "transcript.jsonl");
    fs.writeFileSync(transcriptPath, [userLine("Salut"), assistantLine("Je lance le déploiement ?")].join("\n"));
    const output = runHook("stop", { session_id: "s1", cwd: directory, transcript_path: transcriptPath }, directory);
    const record = JSON.parse(fs.readFileSync(path.join(directory, "s1.json"), "utf8"));
    assert.equal(output, "");
    assert.equal(record.state, "needs_reply");
    assert.equal(record.title, "Salut");
  });

  it("marque la session en cours quand un prompt est envoyé", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "eddy-hook-"));
    runHook("prompt", { session_id: "s2", cwd: directory, prompt: "Fais le ménage" }, directory);
    const record = JSON.parse(fs.readFileSync(path.join(directory, "s2.json"), "utf8"));
    assert.equal(record.state, "working");
    assert.equal(record.title, "Fais le ménage");
  });

  it("garde l'état précédent sur une notification d'inactivité", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "eddy-hook-"));
    runHook("prompt", { session_id: "s3", cwd: directory, prompt: "Tâche" }, directory);
    runHook("notify", { session_id: "s3", cwd: directory, message: "Claude is waiting for your input" }, directory);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "s3.json"), "utf8")).state, "working");
  });

  it("compte les sous-agents lancés puis terminés sans changer l'état", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "eddy-hook-"));
    const readRecord = () => JSON.parse(fs.readFileSync(path.join(directory, "s5.json"), "utf8"));
    runHook("prompt", { session_id: "s5", cwd: directory, prompt: "Lance des agents" }, directory);
    runHook("agent-start", { session_id: "s5", cwd: directory, tool_name: "Task", tool_use_id: "t1", tool_input: { description: "Explorer le code" } }, directory);
    runHook("agent-start", { session_id: "s5", cwd: directory, tool_name: "Agent", tool_use_id: "t2", tool_input: { description: "Écrire les tests" } }, directory);
    assert.deepEqual(readRecord().subagents.map((agent) => agent.label), ["Explorer le code", "Écrire les tests"]);
    assert.equal(readRecord().state, "working");
    runHook("agent-stop", { session_id: "s5", cwd: directory }, directory);
    assert.deepEqual(readRecord().subagents.map((agent) => agent.label), ["Écrire les tests"]);
    runHook("stop", { session_id: "s5", cwd: directory }, directory);
    assert.equal(readRecord().subagents.length, 1);
    assert.equal(readRecord().state, "idle");
  });

  it("ignore un outil qui n'est pas un agent", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "eddy-hook-"));
    runHook("agent-start", { session_id: "s6", cwd: directory, tool_name: "Bash", tool_input: { command: "ls" } }, directory);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, "s6.json"), "utf8")).subagents, []);
  });

  it("vide les sous-agents quand la session se termine", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "eddy-hook-"));
    runHook("agent-start", { session_id: "s7", cwd: directory, tool_name: "Task", tool_input: { description: "Tâche" } }, directory);
    runHook("end", { session_id: "s7", cwd: directory }, directory);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, "s7.json"), "utf8")).subagents, []);
  });

  it("passe en needs_reply sur une demande de permission", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "eddy-hook-"));
    runHook("notify", { session_id: "s4", cwd: directory, message: "Claude needs your permission to use Bash" }, directory);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "s4.json"), "utf8")).state, "needs_reply");
  });
});
