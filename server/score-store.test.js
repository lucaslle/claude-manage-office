import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createScore } from "../shared/scoring.js";
import { createScoreStore, scoreFilePath } from "./score-store.js";

const makeFilePath = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "eddy-score-")), "nested", "score.json");

describe("scoreFilePath", () => {
  it("place le score à côté du dossier des sessions", () => {
    const sessions = path.join("home", ".claude", "eddy-office", "sessions");
    assert.equal(scoreFilePath(sessions), path.join("home", ".claude", "eddy-office", "score.json"));
  });
});

describe("createScoreStore", () => {
  it("repart d'un score vierge quand le fichier manque", () => {
    const store = createScoreStore(makeFilePath());
    const loaded = store.load();
    assert.equal(loaded.version, 1);
    assert.equal(loaded.xp, 0);
    assert.deepEqual(loaded.events, []);
  });

  it("repart d'un score vierge quand le fichier est illisible ou d'une autre version", () => {
    const filePath = makeFilePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "pas du json");
    assert.equal(createScoreStore(filePath).load().xp, 0);
    fs.writeFileSync(filePath, JSON.stringify({ version: 99, xp: 500 }));
    assert.equal(createScoreStore(filePath).load().xp, 0);
  });

  it("relit ce qu'il a enregistré, même avec un BOM", () => {
    const filePath = makeFilePath();
    const store = createScoreStore(filePath);
    const score = { ...createScore(), xp: 120 };
    assert.equal(store.save(score), true);
    assert.equal(createScoreStore(filePath).load().xp, 120);
    fs.writeFileSync(filePath, `﻿${fs.readFileSync(filePath, "utf8")}`);
    assert.equal(createScoreStore(filePath).load().xp, 120);
  });

  it("crée le dossier et ne laisse pas de fichier temporaire", () => {
    const filePath = makeFilePath();
    createScoreStore(filePath).save(createScore());
    assert.deepEqual(fs.readdirSync(path.dirname(filePath)), ["score.json"]);
  });

  it("n'écrit pas deux fois le même contenu", () => {
    const filePath = makeFilePath();
    const store = createScoreStore(filePath);
    const score = createScore();
    assert.equal(store.save(score), true);
    assert.equal(store.save(structuredClone(score)), false);
    assert.equal(store.save({ ...score, xp: 10 }), true);
  });

  it("ne réécrit pas ce qu'il vient de charger", () => {
    const filePath = makeFilePath();
    createScoreStore(filePath).save({ ...createScore(), xp: 7 });
    const store = createScoreStore(filePath);
    assert.equal(store.save(store.load()), false);
  });
});
