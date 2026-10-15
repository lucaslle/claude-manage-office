import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { excerpt, findEntrypoint, findTitle, firstUserPrompt, lastAssistantText, looksLikeQuestion, readHeadLines, readTailLines } from "./transcript.mjs";

const MODE_STATES = { prompt: "working", stop: "idle", notify: "needs_reply", start: "idle", end: "ended", "agent-start": "working", "agent-stop": "working" };
const AGENT_TOOL_NAMES = new Set(["Task", "Agent"]);
const TITLE_LENGTH = 70;
const MESSAGE_LENGTH = 320;
const AGENT_LABEL_LENGTH = 60;

const stateDirectory = () => process.env.EDDY_STATE_DIR ?? path.join(os.homedir(), ".claude", "eddy-office", "sessions");

const readStdin = () =>
  new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
  });

const readPrevious = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
};

const currentBranch = (workingDirectory) => {
  if (!workingDirectory) return "";
  try {
    return execFileSync("git", ["-C", workingDirectory, "rev-parse", "--abbrev-ref", "HEAD"], { timeout: 1500, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
};

const safeLines = (reader, filePath) => {
  if (!filePath) return [];
  try {
    return reader(filePath);
  } catch {
    return [];
  }
};

const nextSubagents = (mode, payload, previous, now) => {
  const current = Array.isArray(previous?.subagents) ? previous.subagents : [];
  if (mode === "agent-start") {
    if (payload.tool_name && !AGENT_TOOL_NAMES.has(payload.tool_name)) return current;
    const input = payload.tool_input ?? {};
    const label = excerpt(String(input.description ?? input.subagent_type ?? ""), AGENT_LABEL_LENGTH);
    return [...current, { id: payload.tool_use_id ?? `${now}-${current.length}`, label, startedAt: now }];
  }
  if (mode === "agent-stop") {
    const matchingIndex = payload.agent_id ? current.findIndex((agent) => agent.id === payload.agent_id) : -1;
    const removedIndex = matchingIndex >= 0 ? matchingIndex : 0;
    return current.filter((_, position) => position !== removedIndex);
  }
  if (mode === "start" || mode === "end") return [];
  return current;
};

const resolveState = (mode, payload, previous, lastText) => {
  if (mode === "agent-stop") return previous?.state ?? "working";
  if (mode === "stop") return looksLikeQuestion(lastText) ? "needs_reply" : "idle";
  if (mode !== "notify") return MODE_STATES[mode];
  const message = String(payload.message ?? "").toLowerCase();
  if (message.includes("permission")) return "needs_reply";
  return previous?.state ?? "idle";
};

const run = async () => {
  const mode = process.argv[2];
  if (!MODE_STATES[mode]) return;
  const raw = await readStdin();
  const payload = raw.trim() ? JSON.parse(raw) : {};
  const sessionId = payload.session_id;
  if (!sessionId) return;

  const directory = stateDirectory();
  fs.mkdirSync(directory, { recursive: true });
  const filePath = path.join(directory, `${sessionId}.json`);
  const previous = readPrevious(filePath);
  const tailLines = safeLines(readTailLines, payload.transcript_path);
  const lastText = lastAssistantText(tailLines);

  let title = findTitle(tailLines) || previous?.title || "";
  if (!title) {
    const prompt = typeof payload.prompt === "string" ? payload.prompt : firstUserPrompt(safeLines(readHeadLines, payload.transcript_path));
    title = excerpt(prompt, TITLE_LENGTH);
  }

  const now = Date.now();
  const record = {
    sessionId,
    cwd: payload.cwd ?? previous?.cwd ?? "",
    branch: currentBranch(payload.cwd) || previous?.branch || "",
    title,
    state: resolveState(mode, payload, previous, lastText),
    lastMessage: excerpt(lastText || previous?.lastMessage || "", MESSAGE_LENGTH),
    transcriptPath: payload.transcript_path ?? previous?.transcriptPath ?? "",
    entrypoint: findEntrypoint(tailLines) || previous?.entrypoint || "",
    platform: process.platform,
    subagents: nextSubagents(mode, payload, previous, now),
    startedAt: previous?.startedAt ?? now,
    updatedAt: now,
  };

  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(record));
  fs.renameSync(temporaryPath, filePath);
};

run().catch(() => {});
