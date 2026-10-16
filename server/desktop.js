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

const text = (value) => (typeof value === "string" ? value : "");
const timestamp = (value) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

const HEAD_BYTES = 8192;
const LARGE_SECTION = '"remoteMcpServersConfig"';

// Les champs utiles sont au début du fichier ; la suite (liste d'outils des connecteurs) est lourde et inutile ici.
const readHeadObject = (filePath) => {
  const descriptor = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(HEAD_BYTES);
    const bytesRead = fs.readSync(descriptor, buffer, 0, HEAD_BYTES, 0);
    const head = buffer.toString("utf8", 0, bytesRead).replace(/^﻿/, "");
    const cut = head.indexOf(LARGE_SECTION);
    if (cut > 0) return JSON.parse(`${head.slice(0, cut).replace(/,\s*$/, "")}}`);
  } catch {
    // le début n'est pas exploitable : lecture complète ci-dessous
  } finally {
    fs.closeSync(descriptor);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^﻿/, ""));
};

const readEntry = (filePath) => {
  try {
    const { mtimeMs } = fs.statSync(filePath);
    const cached = knownFiles.get(filePath);
    if (cached && cached.mtimeMs === mtimeMs) return cached;
    const data = readHeadObject(filePath);
    const entry = {
      mtimeMs,
      cliSessionId: text(data.cliSessionId),
      appSessionId: text(data.sessionId),
      title: text(data.title),
      cwd: text(data.originCwd) || text(data.cwd),
      model: text(data.model),
      archived: data.isArchived === true,
      createdAt: timestamp(data.createdAt),
      lastActivityAt: timestamp(data.lastActivityAt),
    };
    knownFiles.set(filePath, entry);
    return entry;
  } catch {
    return null;
  }
};

export const findDesktopSessionId = (cliSessionId, roots = desktopSessionRoots()) => {
  if (!cliSessionId) return "";
  for (const root of roots) {
    for (const filePath of listLocalFiles(root)) {
      const entry = readEntry(filePath);
      if (entry?.cliSessionId === cliSessionId && APP_SESSION_ID.test(entry.appSessionId)) return entry.appSessionId;
    }
  }
  return "";
};

export const listDesktopSessions = (roots = desktopSessionRoots()) =>
  roots
    .flatMap((root) => listLocalFiles(root))
    .map(readEntry)
    .filter((entry) => entry && entry.cliSessionId && APP_SESSION_ID.test(entry.appSessionId));

export const desktopLink = (cliSessionId, roots) => {
  const appSessionId = findDesktopSessionId(cliSessionId, roots);
  return appSessionId ? `claude://code/continue?session=${appSessionId}` : "";
};
