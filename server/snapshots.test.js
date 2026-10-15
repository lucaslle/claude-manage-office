import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { readFreshestSnapshot } from "./snapshots.js";

const makeBase = () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "eddy-snap-"));
  fs.mkdirSync(path.join(base, "sessions"));
  return base;
};

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

  it("ignore un instantané sans date de mise à jour", () => {
    const base = makeBase();
    fs.writeFileSync(path.join(base, "connectors.json"), JSON.stringify({ servers: [] }));
    assert.equal(readFreshestSnapshot([path.join(base, "sessions")], "connectors.json"), null);
  });
});
