import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SESSIONS_SUBPATH = ["Claude", "claude-code-sessions"];
const LOCAL_FILE = /^local_[A-Za-z0-9-]{1,64}\.json$/;
const APP_SESSION_ID = /^local_[A-Za-z0-9-]{1,64}$/;
const MAX_DEPTH = 3;

const knownFiles = new Map();

export const desktopSessionRoots = (platform = process.platform) => {
  if (platform === "win32") return process.env.APPDATA ? [path.join(process.env.APPDATA, ...SESSIONS_SUBPATH)] : [];
  if (platform === "darwin") return [path.join(os.homedir(), "Library", "Application Support", ...SESSIONS_SUBPATH)];
  return windowsUserDirectories().flatMap(windowsAppRoots).filter((candidate) => fs.existsSync(candidate));
};

const windowsUserDirectories = (usersRoot = "/mnt/c/Users") => {
  try {
    return fs.readdirSync(usersRoot).map((user) => path.join(usersRoot, user));
  } catch {
    return [];
  }
};

// L'app installée depuis le Microsoft Store est redirigée par Windows : vue de WSL, ses données sont dans Packages\Claude_*\LocalCache.
const windowsAppRoots = (userDirectory) => {
  const packages = path.join(userDirectory, "AppData", "Local", "Packages");
  let packaged = [];
  try {
    packaged = fs.readdirSync(packages).filter((name) => name.startsWith("Claude_")).map((name) => path.join(packages, name, "LocalCache", "Roaming", ...SESSIONS_SUBPATH));
  } catch {
    packaged = [];
  }
  return [...packaged, path.join(userDirectory, "AppData", "Roaming", ...SESSIONS_SUBPATH)];
};

const listLocalFiles = (directory, depth = 0) => {
  let entries = [];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return depth < MAX_DEPTH ? listLocalFiles(full, depth + 1) : [];
    return entry.isFile() && LOCAL_FILE.test(entry.name) ? [full] : [];
  });
};

const cliSessionIdOf = (filePath) => {
  try {
    const { mtimeMs } = fs.statSync(filePath);
    const cached = knownFiles.get(filePath);
    if (cached && cached.mtimeMs === mtimeMs) return cached.cliSessionId;
    const data = JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^﻿/, ""));
    const entry = { mtimeMs, cliSessionId: typeof data.cliSessionId === "string" ? data.cliSessionId : "", appSessionId: typeof data.sessionId === "string" ? data.sessionId : "" };
    knownFiles.set(filePath, entry);
    return entry.cliSessionId;
  } catch {
    return "";
  }
};

export const findDesktopSessionId = (cliSessionId, roots = desktopSessionRoots()) => {
  if (!cliSessionId) return "";
  for (const root of roots) {
    for (const filePath of listLocalFiles(root)) {
      if (cliSessionIdOf(filePath) !== cliSessionId) continue;
      const appSessionId = knownFiles.get(filePath)?.appSessionId ?? "";
      if (APP_SESSION_ID.test(appSessionId)) return appSessionId;
    }
  }
  return "";
};

export const desktopLink = (cliSessionId, roots) => {
  const appSessionId = findDesktopSessionId(cliSessionId, roots);
  return appSessionId ? `claude://code/continue?session=${appSessionId}` : "";
};
