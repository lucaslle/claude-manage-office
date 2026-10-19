import fs from "node:fs";
import path from "node:path";

const readJson = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^﻿/, ""));
  } catch {
    return null;
  }
};

const readSnapshots = (sessionDirectories, fileName) =>
  sessionDirectories
    .map((sessionDirectory) => readJson(path.join(path.dirname(sessionDirectory), fileName)))
    .filter((snapshot) => snapshot && typeof snapshot.updatedAt === "number");

export const readFreshestSnapshot = (sessionDirectories, fileName) =>
  readSnapshots(sessionDirectories, fileName).reduce((freshest, snapshot) => (!freshest || snapshot.updatedAt > freshest.updatedAt ? snapshot : freshest), null);

// Date du dernier relevé du plan et des limites par modèle (la ligne d'état renouvelle updatedAt sans les relire).
const detailsTime = (snapshot) => snapshot.detailsAt ?? (snapshot.source === "snapshot" || snapshot.source === "cli" ? snapshot.updatedAt : 0);

// Plusieurs dossiers peuvent porter un usage.json (Windows et WSL) : les limites viennent du plus récent,
// le plan et les modèles du relevé le plus récent qui les a vraiment lus.
export const readFreshestUsage = (sessionDirectories) => {
  const snapshots = readSnapshots(sessionDirectories, "usage.json");
  const freshest = snapshots.reduce((best, snapshot) => (!best || snapshot.updatedAt > best.updatedAt ? snapshot : best), null);
  if (!freshest) return null;
  const donor = snapshots.reduce((best, snapshot) => (detailsTime(snapshot) > detailsTime(best) ? snapshot : best), freshest);
  if (donor === freshest || detailsTime(donor) === 0) return freshest;
  return { ...freshest, plan: donor.plan || freshest.plan, models: donor.models ?? freshest.models, detailsAt: detailsTime(donor) };
};
