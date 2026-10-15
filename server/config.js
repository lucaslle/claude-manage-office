import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const readEnvFile = () => {
  const filePath = path.join(rootDirectory, ".env");
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        const value = line.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
        return [line.slice(0, separatorIndex).trim(), value];
      }),
  );
};

export const loadConfig = () => {
  const fileValues = readEnvFile();
  const value = (name, fallback) => process.env[name] ?? fileValues[name] ?? fallback;
  const extraDirectories = value("EDDY_SESSION_DIRS", "")
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return {
    port: Number(value("EDDY_PORT", "5174")),
    gitlabUrl: value("GITLAB_URL", "").replace(/\/+$/, ""),
    gitlabToken: value("GITLAB_TOKEN", ""),
    gitlabPollSeconds: Number(value("GITLAB_POLL_SECONDS", "60")),
    sessionMaxAgeHours: Number(value("EDDY_SESSION_MAX_AGE_HOURS", "36")),
    sessionDirectories: [value("EDDY_STATE_DIR", path.join(os.homedir(), ".claude", "eddy-office", "sessions")), ...extraDirectories],
    detectWsl: value("EDDY_DETECT_WSL", "true") !== "false",
  };
};
