import fs from "node:fs";
import path from "node:path";
import { createScore, isScore } from "../shared/scoring.js";

const readJson = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^﻿/, ""));
  } catch {
    return null;
  }
};

export const scoreFilePath = (sessionDirectory) => path.join(path.dirname(sessionDirectory), "score.json");

export const createScoreStore = (filePath) => {
  let lastWritten = "";

  const load = () => {
    const stored = readJson(filePath);
    if (!isScore(stored)) return createScore();
    lastWritten = JSON.stringify(stored);
    return stored;
  };

  const save = (score) => {
    const serialized = JSON.stringify(score);
    if (serialized === lastWritten) return false;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.tmp`;
    fs.writeFileSync(temporaryPath, serialized);
    fs.renameSync(temporaryPath, filePath);
    lastWritten = serialized;
    return true;
  };

  return { load, save };
};
