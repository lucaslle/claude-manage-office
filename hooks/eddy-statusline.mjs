import path from "node:path";
import { baseDirectory, readJson, usageFromStatusline, writeJsonAtomic } from "./snapshots.mjs";

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

const label = (window) => (window ? `${window.usedPercent} %` : "—");

const run = async () => {
  const raw = await readStdin();
  const payload = raw.trim() ? JSON.parse(raw) : {};
  const usageFile = path.join(baseDirectory(), "usage.json");
  const record = usageFromStatusline(payload, readJson(usageFile));
  if (record) writeJsonAtomic(usageFile, record);
  const parts = [];
  if (record) parts.push(`5 h ${label(record.fiveHour)}`, `hebdo ${label(record.sevenDay)}`);
  const contextPercent = payload.context_window?.used_percentage;
  if (typeof contextPercent === "number") parts.push(`contexte ${Math.round(contextPercent)} %`);
  process.stdout.write(parts.join(" · "));
};

run().catch(() => {});
