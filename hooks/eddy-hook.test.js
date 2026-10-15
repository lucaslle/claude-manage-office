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

  it("n'écrit rien sans identifiant de session", () => {
    const stateDirectory = makeStateDirectory();
    runHook("end", { reason: "clear" }, stateDirectory);
    assert.deepEqual(fs.readdirSync(stateDirectory), []);
  });
});
