import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const hookPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "eddy-hook.mjs");

const makeStateDirectory = () => fs.mkdtempSync(path.join(os.tmpdir(), "eddy-hook-"));

const runHook = (mode, payload, stateDirectory) =>
  execFileSync(process.execPath, [hookPath, mode], { input: JSON.stringify(payload), env: { ...process.env, EDDY_STATE_DIR: stateDirectory }, timeout: 15000 });

const readRecord = (stateDirectory, sessionId) => JSON.parse(fs.readFileSync(path.join(stateDirectory, `${sessionId}.json`), "utf8"));

describe("eddy-hook", () => {
  it("enregistre la raison de fin quand la conversation est vidée", () => {
    const stateDirectory = makeStateDirectory();
    runHook("prompt", { session_id: "s1", prompt: "Corrige le login" }, stateDirectory);
    assert.equal(readRecord(stateDirectory, "s1").state, "working");
    assert.equal(readRecord(stateDirectory, "s1").endReason, "");
    runHook("end", { session_id: "s1", reason: "clear" }, stateDirectory);
    const record = readRecord(stateDirectory, "s1");
    assert.equal(record.state, "ended");
    assert.equal(record.endReason, "clear");
    assert.equal(record.title, "Corrige le login");
  });

  it("oublie la raison de fin quand la session redémarre", () => {
    const stateDirectory = makeStateDirectory();
    runHook("end", { session_id: "s2", reason: "clear" }, stateDirectory);
    runHook("start", { session_id: "s2", source: "clear" }, stateDirectory);
    const record = readRecord(stateDirectory, "s2");
    assert.equal(record.state, "idle");
    assert.equal(record.endReason, "");
  });

  it("marque la session remplacée comme vidée quand une nouvelle démarre après /clear", () => {
    const stateDirectory = makeStateDirectory();
    runHook("prompt", { session_id: "old", cwd: "/projet", prompt: "Corrige le login" }, stateDirectory);
    runHook("start", { session_id: "new", cwd: "/projet", source: "clear" }, stateDirectory);
    const replaced = readRecord(stateDirectory, "old");
    assert.equal(replaced.state, "ended");
    assert.equal(replaced.endReason, "clear");
    assert.equal(replaced.title, "Corrige le login");
    assert.equal(readRecord(stateDirectory, "new").state, "idle");
  });

  it("ne vide que la session la plus récente du même dossier", () => {
    const stateDirectory = makeStateDirectory();
    runHook("prompt", { session_id: "elsewhere", cwd: "/autre", prompt: "Autre projet" }, stateDirectory);
    runHook("prompt", { session_id: "older", cwd: "/projet", prompt: "Ancienne" }, stateDirectory);
    runHook("prompt", { session_id: "latest", cwd: "/projet", prompt: "Récente" }, stateDirectory);
    runHook("start", { session_id: "new", cwd: "/projet", source: "clear" }, stateDirectory);
    assert.equal(readRecord(stateDirectory, "latest").endReason, "clear");
    assert.equal(readRecord(stateDirectory, "older").state, "working");
    assert.equal(readRecord(stateDirectory, "elsewhere").state, "working");
  });

  it("laisse tranquille une session déjà terminée et un démarrage ordinaire", () => {
    const stateDirectory = makeStateDirectory();
    runHook("prompt", { session_id: "live", cwd: "/projet", prompt: "En cours" }, stateDirectory);
    runHook("start", { session_id: "resumed", cwd: "/projet", source: "resume" }, stateDirectory);
    assert.equal(readRecord(stateDirectory, "live").state, "working");
    runHook("end", { session_id: "live", cwd: "/projet", reason: "other" }, stateDirectory);
    runHook("start", { session_id: "new", cwd: "/projet", source: "clear" }, stateDirectory);
    assert.equal(readRecord(stateDirectory, "live").endReason, "other");
  });

  it("n'écrit rien sans identifiant de session", () => {
    const stateDirectory = makeStateDirectory();
    runHook("end", { reason: "clear" }, stateDirectory);
    assert.deepEqual(fs.readdirSync(stateDirectory), []);
  });
});

describe("eddy-hook : compactage", () => {
  it("note le compactage en cours puis terminé, sans changer l'état de la session", () => {
    const stateDirectory = makeStateDirectory();
    runHook("prompt", { session_id: "c1", prompt: "Refais le menu" }, stateDirectory);
    runHook("compact", { session_id: "c1", trigger: "manual", custom_instructions: null }, stateDirectory);
    const compacting = readRecord(stateDirectory, "c1");
    assert.equal(compacting.state, "working");
    assert.ok(compacting.compactingSince > 0);
    assert.equal(compacting.compactedAt, 0);
    runHook("compacted", { session_id: "c1", trigger: "manual", compact_summary: "Résumé" }, stateDirectory);
    const compacted = readRecord(stateDirectory, "c1");
    assert.equal(compacted.state, "working");
    assert.equal(compacted.compactingSince, 0);
    assert.ok(compacted.compactedAt >= compacting.compactingSince);
  });

  it("garde l'état et les agents, et ne compte le compactage qu'une fois, quand la session redémarre après compactage", () => {
    const stateDirectory = makeStateDirectory();
    runHook("prompt", { session_id: "c2", prompt: "Explore le code" }, stateDirectory);
    runHook("agent-start", { session_id: "c2", tool_name: "Agent", tool_use_id: "t1", tool_input: { description: "Explorer" } }, stateDirectory);
    runHook("compacted", { session_id: "c2", trigger: "auto" }, stateDirectory);
    const { compactedAt } = readRecord(stateDirectory, "c2");
    runHook("start", { session_id: "c2", source: "compact" }, stateDirectory);
    const record = readRecord(stateDirectory, "c2");
    assert.equal(record.state, "working");
    assert.equal(record.subagents.length, 1);
    assert.equal(record.compactedAt, compactedAt);
  });

  it("compte un compactage signalé seulement par le redémarrage de la session", () => {
    const stateDirectory = makeStateDirectory();
    runHook("stop", { session_id: "c3" }, stateDirectory);
    runHook("start", { session_id: "c3", source: "compact" }, stateDirectory);
    const record = readRecord(stateDirectory, "c3");
    assert.equal(record.state, "idle");
    assert.ok(record.compactedAt > 0);
  });
});
