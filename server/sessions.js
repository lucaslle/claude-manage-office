import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const STATE_SUBPATH = [".claude", "eddy-office", "sessions"];

const decodeWslList = (buffer) =>
  buffer
    .toString("utf16le")
    .replace(/\u0000/g, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

export const detectWslSessionDirectories = () => {
  if (process.platform !== "win32") return [];
  let distributions = [];
  try {
    distributions = decodeWslList(execFileSync("wsl.exe", ["-l", "-q"], { timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }));
  } catch {
    return [];
  }
  const directories = [];
  distributions.forEach((distribution) => {
    const homeRoot = `\\\\wsl.localhost\\${distribution}\\home`;
    try {
      fs.readdirSync(homeRoot).forEach((user) => {
        const candidate = path.join(homeRoot, user, ...STATE_SUBPATH);
        if (fs.existsSync(candidate)) directories.push(candidate);
      });
    } catch {
      return;
    }
  });
  return directories;
};

export const detectWindowsSessionDirectories = () => {
  const usersRoot = "/mnt/c/Users";
  if (process.platform !== "linux" || !fs.existsSync(usersRoot)) return [];
  try {
    return fs
      .readdirSync(usersRoot)
      .map((user) => path.join(usersRoot, user, ...STATE_SUBPATH))
      .filter((candidate) => fs.existsSync(candidate));
  } catch {
    return [];
  }
};

const readSessionFile = (filePath) => {
  try {
    const record = JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^﻿/, ""));
    if (!record.sessionId || typeof record.updatedAt !== "number") return null;
    return record;
  } catch {
    return null;
  }
};

const readRecords = (directories) =>
  directories.flatMap((directory) => {
    let fileNames = [];
    try {
      fileNames = fs.readdirSync(directory).filter((fileName) => fileName.endsWith(".json"));
    } catch {
      return [];
    }
    return fileNames.map((fileName) => readSessionFile(path.join(directory, fileName))).filter(Boolean);
  });

const freshestBySession = (records) => {
  const bySession = new Map();
  records.forEach((record) => {
    const known = bySession.get(record.sessionId);
    if (!known || known.updatedAt < record.updatedAt) bySession.set(record.sessionId, record);
  });
  return [...bySession.values()];
};

export const readSessions = (directories, { maxAgeMs, now = Date.now() }) =>
  freshestBySession(readRecords(directories).filter((record) => record.state !== "ended" && now - record.updatedAt <= maxAgeMs)).sort((first, second) => second.updatedAt - first.updatedAt);

export const readRecentlyEnded = (directories, { reason, maxAgeMs, now = Date.now() }) =>
  freshestBySession(readRecords(directories).filter((record) => record.state === "ended" && record.endReason === reason && now - record.updatedAt <= maxAgeMs));
