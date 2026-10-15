import fs from "node:fs";
import path from "node:path";

const readJson = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^﻿/, ""));
  } catch {
    return null;
  }
};

export const readFreshestSnapshot = (sessionDirectories, fileName) => {
  let freshest = null;
  sessionDirectories.forEach((sessionDirectory) => {
    const snapshot = readJson(path.join(path.dirname(sessionDirectory), fileName));
    if (!snapshot || typeof snapshot.updatedAt !== "number") return;
    if (!freshest || snapshot.updatedAt > freshest.updatedAt) freshest = snapshot;
  });
  return freshest;
};
