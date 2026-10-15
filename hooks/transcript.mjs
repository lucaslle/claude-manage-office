import fs from "node:fs";

const TAIL_BYTES = 600000;
const QUESTION_PHRASES =
  /(veux-tu|voulez-vous|souhaites-tu|souhaitez-vous|dois-je|préfères-tu|préférez-vous|do you want|should i|would you like|want me to|which one|lequel|laquelle|quelle option)[^.!]*$/i;

export const readTailLines = (filePath) => {
  const descriptor = fs.openSync(filePath, "r");
  try {
    const { size } = fs.fstatSync(descriptor);
    const length = Math.min(size, TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    fs.readSync(descriptor, buffer, 0, length, size - length);
    const lines = buffer.toString("utf8").split(/\r?\n/);
    if (size > length) lines.shift();
    return lines.filter((line) => line.length > 0);
  } finally {
    fs.closeSync(descriptor);
  }
};

export const readHeadLines = (filePath, maxLines = 60) => {
  const descriptor = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(200000);
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

export const looksLikeQuestion = (text) => {
  const tail = text.trim().slice(-500);
  if (!tail) return false;
  if (/\?[\s*_`)\]»"'’.]*$/.test(tail)) return true;
  return QUESTION_PHRASES.test(tail.slice(-250));
};
