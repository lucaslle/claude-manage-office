import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { readRecentlyEnded, readSessions } from "./sessions.js";

const HOUR = 3600 * 1000;
const NOW = 1_800_000_000_000;

const makeDirectory = () => fs.mkdtempSync(path.join(os.tmpdir(), "eddy-sessions-"));

const writeRecord = (directory, fileName, record) => {
  fs.writeFileSync(path.join(directory, fileName), typeof record === "string" ? record : JSON.stringify(record));
};

const read = (directories) => readSessions(directories, { maxAgeMs: 36 * HOUR, now: NOW });

describe("readSessions", () => {
  it("lit les sessions et les trie de la plus récente à la plus ancienne", () => {
    const directory = makeDirectory();
    writeRecord(directory, "a.json", { sessionId: "a", updatedAt: NOW - 2 * HOUR, state: "working" });
    writeRecord(directory, "b.json", { sessionId: "b", updatedAt: NOW - HOUR, state: "idle" });
    assert.deepEqual(
      read([directory]).map((record) => record.sessionId),
      ["b", "a"],
    );
  });

  it("ignore les sessions terminées, trop anciennes ou illisibles", () => {
    const directory = makeDirectory();
    writeRecord(directory, "ended.json", { sessionId: "ended", updatedAt: NOW, state: "ended" });
    writeRecord(directory, "old.json", { sessionId: "old", updatedAt: NOW - 40 * HOUR, state: "idle" });
    writeRecord(directory, "broken.json", "{pas du json");
    writeRecord(directory, "nodate.json", { sessionId: "nodate", state: "idle" });
    writeRecord(directory, "notes.txt", { sessionId: "txt", updatedAt: NOW, state: "idle" });
    writeRecord(directory, "ok.json", { sessionId: "ok", updatedAt: NOW - HOUR, state: "idle" });
    assert.deepEqual(
      read([directory]).map((record) => record.sessionId),
      ["ok"],
    );
  });

  it("garde la version la plus récente d'une session présente dans deux dossiers", () => {
    const windows = makeDirectory();
    const linux = makeDirectory();
    writeRecord(windows, "s.json", { sessionId: "s", updatedAt: NOW - 2 * HOUR, title: "ancien" });
    writeRecord(linux, "s.json", { sessionId: "s", updatedAt: NOW - HOUR, title: "récent" });
    const records = read([windows, linux]);
    assert.equal(records.length, 1);
    assert.equal(records[0].title, "récent");
  });

  it("accepte un fichier écrit avec un BOM", () => {
    const directory = makeDirectory();
    writeRecord(directory, "bom.json", `﻿${JSON.stringify({ sessionId: "bom", updatedAt: NOW, state: "idle" })}`);
    assert.equal(read([directory])[0].sessionId, "bom");
  });

  it("ignore un dossier qui n'existe pas", () => {
    const directory = makeDirectory();
    writeRecord(directory, "a.json", { sessionId: "a", updatedAt: NOW, state: "idle" });
    assert.equal(read([path.join(directory, "absent"), directory]).length, 1);
  });
});

describe("readRecentlyEnded", () => {
  const readCleared = (directories) => readRecentlyEnded(directories, { reason: "clear", maxAgeMs: 2 * 60 * 1000, now: NOW });

  it("renvoie les sessions vidées récemment, et seulement elles", () => {
    const directory = makeDirectory();
    writeRecord(directory, "cleared.json", { sessionId: "cleared", updatedAt: NOW - 30 * 1000, state: "ended", endReason: "clear" });
    writeRecord(directory, "logout.json", { sessionId: "logout", updatedAt: NOW - 30 * 1000, state: "ended", endReason: "logout" });
    writeRecord(directory, "stale.json", { sessionId: "stale", updatedAt: NOW - 10 * 60 * 1000, state: "ended", endReason: "clear" });
    writeRecord(directory, "alive.json", { sessionId: "alive", updatedAt: NOW, state: "working" });
    writeRecord(directory, "legacy.json", { sessionId: "legacy", updatedAt: NOW, state: "ended" });
    assert.deepEqual(
      readCleared([directory]).map((record) => record.sessionId),
      ["cleared"],
    );
  });

  it("ne mélange pas les sessions vidées et les sessions vivantes", () => {
    const directory = makeDirectory();
    writeRecord(directory, "cleared.json", { sessionId: "cleared", updatedAt: NOW, state: "ended", endReason: "clear" });
    assert.deepEqual(read([directory]), []);
  });
});
