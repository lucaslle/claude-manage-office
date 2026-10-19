import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { readFreshestSnapshot, readFreshestUsage } from "./snapshots.js";

const makeBase = () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "eddy-snap-"));
  fs.mkdirSync(path.join(base, "sessions"));
  return base;
};

describe("readFreshestUsage", () => {
  it("garde les limites les plus récentes et les modèles du dernier vrai relevé", () => {
    const windows = makeBase();
    const linux = makeBase();
    fs.writeFileSync(path.join(windows, "usage.json"), JSON.stringify({ updatedAt: 500, detailsAt: 100, source: "statusline", plan: "Team", fiveHour: { usedPercent: 9 }, models: [{ label: "Fable", usedPercent: 10 }] }));
    fs.writeFileSync(path.join(linux, "usage.json"), JSON.stringify({ updatedAt: 300, detailsAt: 300, source: "cli", plan: "", fiveHour: { usedPercent: 7 }, models: [{ label: "Fable", usedPercent: 35 }] }));
    const usage = readFreshestUsage([path.join(windows, "sessions"), path.join(linux, "sessions")]);
    assert.equal(usage.fiveHour.usedPercent, 9);
    assert.equal(usage.models[0].usedPercent, 35);
    assert.equal(usage.detailsAt, 300);
    assert.equal(usage.plan, "Team");
  });

  it("renvoie l'instantané tel quel quand il est aussi le plus détaillé", () => {
    const base = makeBase();
    fs.writeFileSync(path.join(base, "usage.json"), JSON.stringify({ updatedAt: 10, source: "snapshot", models: [] }));
    assert.equal(readFreshestUsage([path.join(base, "sessions")]).updatedAt, 10);
  });
});

describe("readFreshestSnapshot", () => {
  it("lit le fichier voisin du dossier de sessions", () => {
    const base = makeBase();
    fs.writeFileSync(path.join(base, "usage.json"), JSON.stringify({ updatedAt: 10, fiveHour: { usedPercent: 49 } }));
    assert.equal(readFreshestSnapshot([path.join(base, "sessions")], "usage.json").fiveHour.usedPercent, 49);
  });

  it("garde l'instantané le plus récent entre plusieurs systèmes", () => {
    const windows = makeBase();
    const linux = makeBase();
    fs.writeFileSync(path.join(windows, "usage.json"), JSON.stringify({ updatedAt: 10, source: "ancien" }));
    fs.writeFileSync(path.join(linux, "usage.json"), JSON.stringify({ updatedAt: 20, source: "récent" }));
    assert.equal(readFreshestSnapshot([path.join(windows, "sessions"), path.join(linux, "sessions")], "usage.json").source, "récent");
  });

  it("renvoie null quand le fichier est absent ou invalide", () => {
    const base = makeBase();
    assert.equal(readFreshestSnapshot([path.join(base, "sessions")], "usage.json"), null);
    fs.writeFileSync(path.join(base, "usage.json"), "pas du json");
    assert.equal(readFreshestSnapshot([path.join(base, "sessions")], "usage.json"), null);
  });

  it("ignore un instantané sans date de mise à jour (usage)", () => {
    const base = makeBase();
    fs.writeFileSync(path.join(base, "usage.json"), JSON.stringify({ fiveHour: { usedPercent: 3 } }));
    assert.equal(readFreshestUsage([path.join(base, "sessions")]), null);
  });

  it("ignore un instantané sans date de mise à jour", () => {
    const base = makeBase();
    fs.writeFileSync(path.join(base, "connectors.json"), JSON.stringify({ servers: [] }));
    assert.equal(readFreshestSnapshot([path.join(base, "sessions")], "connectors.json"), null);
  });
});
