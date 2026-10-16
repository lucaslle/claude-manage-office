import fs from "node:fs";

const TAIL_BYTES = 600000;
const QUESTION_PHRASES =
  /(veux-tu|voulez-vous|souhaites-tu|souhaitez-vous|dois-je|préfères-tu|préférez-vous|do you want|should i|would you like|want me to|which one|lequel|laquelle|quelle option)[^.!]*$/i;

export const readTailLines = (filePath, maxBytes = TAIL_BYTES) => {
  const descriptor = fs.openSync(filePath, "r");
  try {
    const { size } = fs.fstatSync(descriptor);
    const length = Math.min(size, maxBytes);
    const buffer = Buffer.alloc(length);
    fs.readSync(descriptor, buffer, 0, length, size - length);
    const lines = buffer.toString("utf8").split(/\r?\n/);
    if (size > length) lines.shift();
    return lines.filter((line) => line.length > 0);
  } finally {
    fs.closeSync(descriptor);
  }
};

export const readHeadLines = (filePath, maxLines = 60, maxBytes = 200000) => {
  const descriptor = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(maxBytes);
    const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
    return buffer.toString("utf8", 0, bytesRead).split(/\r?\n/).slice(0, maxLines).filter((line) => line.length > 0);
  } finally {
    fs.closeSync(descriptor);
  }
};

const parseLine = (line) => {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
};

const textFromContent = (content) => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part && part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
};

const stripMarkup = (text) =>
  text
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

export const excerpt = (text, maxLength) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > maxLength ? `${flat.slice(0, maxLength - 1).trimEnd()}…` : flat;
};

export const lastAssistantText = (lines) => {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const entry = parseLine(lines[index]);
    if (!entry || entry.type !== "assistant") continue;
    const text = textFromContent(entry.message?.content).trim();
    if (text) return text;
  }
  return "";
};

export const findTitle = (lines) => {
  let title = "";
  lines.forEach((line) => {
    const entry = parseLine(line);
    if (!entry) return;
    const candidate = entry.customTitle ?? entry.aiTitle ?? (entry.type === "summary" ? entry.summary : undefined);
    if (typeof candidate === "string" && candidate.trim()) title = candidate.trim();
  });
  return title;
};

export const firstUserPrompt = (lines) => {
  for (const line of lines) {
    const entry = parseLine(line);
    if (!entry || entry.type !== "user") continue;
    const text = stripMarkup(textFromContent(entry.message?.content));
    if (text) return text;
  }
  return "";
};

export const findWorkingContext = (lines) => {
  for (const line of lines) {
    const entry = parseLine(line);
    if (entry && typeof entry.cwd === "string" && entry.cwd) {
      return { cwd: entry.cwd, branch: typeof entry.gitBranch === "string" ? entry.gitBranch : "", entrypoint: typeof entry.entrypoint === "string" ? entry.entrypoint : "" };
    }
  }
  return { cwd: "", branch: "", entrypoint: "" };
};

export const findEntrypoint = (lines) => {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const entry = parseLine(lines[index]);
    if (entry && typeof entry.entrypoint === "string" && entry.entrypoint) return entry.entrypoint;
  }
  return "";
};

export const contextFromLines = (lines) => {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const entry = parseLine(lines[index]);
    const usage = entry?.type === "assistant" ? entry.message?.usage : null;
    if (!usage) continue;
    const tokens = (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
    if (tokens > 0) return { tokens, model: entry.message?.model ?? "" };
  }
  return null;
};

const stripSystemReminders = (text) => text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "").trim();

export const recentMessages = (lines, { limit = 8, maxLength = 4000 } = {}) => {
  const messages = [];
  for (let index = lines.length - 1; index >= 0 && messages.length < limit; index -= 1) {
    const entry = parseLine(lines[index]);
    if (!entry || (entry.type !== "user" && entry.type !== "assistant") || entry.isMeta || entry.isSidechain) continue;
    const text = stripSystemReminders(textFromContent(entry.message?.content));
    if (!text) continue;
    messages.unshift({ role: entry.type, text: text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text, timestamp: entry.timestamp ?? null });
  }
  return messages;
};

const REVIEW_COMMAND = /^\s*\/(?:[\w-]+:)?[\w-]*review\b/i;
const REVIEW_REQUEST = /^\s*(?:(?:peux-tu|pouvez-vous|can you|could you|please|stp|s'il te plaît)\s+)*(?:(?:fais|faire|fait|lance|lancer|do|run|start)(?:\s+|-)(?:moi\s+)?(?:une?\s+|a\s+)?)?(?:code[- ]?)?(?:review|relecture|revue|relis|relire)\b/i;

export const looksLikeReview = (prompt) => {
  if (typeof prompt !== "string") return false;
  const start = prompt.trim().slice(0, 120);
  return REVIEW_COMMAND.test(start) || REVIEW_REQUEST.test(start);
};

export const REFRESH_MARKER = "[eddy-refresh]";

const REFRESH_SCAN_LENGTH = 2000;

// L'app enveloppe le texte d'une tâche planifiée dans une introduction : le marqueur n'est pas au tout début du message.
export const looksLikeRefresh = (prompt) => typeof prompt === "string" && prompt.slice(0, REFRESH_SCAN_LENGTH).includes(REFRESH_MARKER);

export const looksLikeQuestion = (text) => {
  const tail = text.trim().slice(-500);
  if (!tail) return false;
  if (/\?[\s*_`)\]»"'’.]*$/.test(tail)) return true;
  return QUESTION_PHRASES.test(tail.slice(-250));
};
