import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const baseDirectory = () => process.env.EDDY_BASE_DIR ?? path.join(os.homedir(), ".claude", "eddy-office");

export const readJson = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^﻿/, ""));
  } catch {
    return null;
  }
};

export const writeJsonAtomic = (filePath, data) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(data));
  fs.renameSync(temporaryPath, filePath);
};

const percent = (value) => (typeof value === "number" && Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : null);

const windowFromStatusline = (limit) => {
  const usedPercent = percent(limit?.used_percentage);
  if (usedPercent === null) return null;
  return { usedPercent, resetsAt: typeof limit.resets_at === "number" ? limit.resets_at * 1000 : null };
};

// Le plan et les limites par modèle ne viennent que de l'outil get_usage : on garde leur propre date (detailsAt) pour que
// la ligne d'état, qui renouvelle updatedAt, ne les fasse pas passer pour récents.
const detailsDate = (previous) => previous?.detailsAt ?? (previous?.source === "snapshot" ? previous.updatedAt : null) ?? null;

export const usageFromStatusline = (payload, previous, now = Date.now()) => {
  const fiveHour = windowFromStatusline(payload?.rate_limits?.five_hour);
  const sevenDay = windowFromStatusline(payload?.rate_limits?.seven_day);
  if (!fiveHour && !sevenDay) return null;
  return {
    updatedAt: now,
    detailsAt: detailsDate(previous),
    source: "statusline",
    plan: previous?.plan ?? "",
    fiveHour: fiveHour ?? previous?.fiveHour ?? null,
    sevenDay: sevenDay ?? previous?.sevenDay ?? null,
    models: previous?.models ?? [],
  };
};

const toMilliseconds = (isoDate) => {
  const parsed = Date.parse(isoDate);
  return Number.isNaN(parsed) ? null : parsed;
};

const toWindow = (entry) => ({ usedPercent: percent(entry.percentUsed) ?? 0, resetsAt: toMilliseconds(entry.resetsAt) });

export const usageFromPlan = (toolOutput, now = Date.now()) => {
  const plan = toolOutput?.plan;
  if (!plan || plan.status !== "ok" || !Array.isArray(plan.windows)) return null;
  const fiveHour = plan.windows.find((entry) => /5[- ]hour/i.test(entry.label));
  const sevenDay = plan.windows.find((entry) => /weekly/i.test(entry.label) && /all models/i.test(entry.label));
  const models = plan.windows
    .filter((entry) => entry !== fiveHour && entry !== sevenDay)
    .map((entry) => ({ label: entry.label.replace(/^Weekly\s*·\s*/i, ""), ...toWindow(entry) }));
  return {
    updatedAt: now,
    detailsAt: now,
    source: "snapshot",
    plan: plan.plan ?? "",
    fiveHour: fiveHour ? toWindow(fiveHour) : null,
    sevenDay: sevenDay ? toWindow(sevenDay) : null,
    models,
  };
};

export const connectorsFromStatus = (toolOutput, now = Date.now()) => {
  if (!Array.isArray(toolOutput?.servers)) return null;
  return {
    updatedAt: now,
    servers: toolOutput.servers.map((server) => ({
      name: String(server.name),
      kind: String(server.kind ?? "other"),
      status: String(server.status ?? "unknown"),
      toolCount: typeof server.tool_count === "number" ? server.tool_count : null,
    })),
  };
};
