import { element } from "./dom.js";
import { formatAge, formatDuration } from "./format.js";

const REFRESH_MS = 30000;
const SNAPSHOT_STALE_MS = 30 * 60 * 1000;
const WARN_AT = 60;
const BAD_AT = 85;
const SOURCE_LABELS = { statusline: "ligne d'état", snapshot: "instantané", demo: "exemple" };
const EMPTY_HINT = "Aucune donnée pour l'instant. Installez la ligne d'état (npm run statusline:install) ou lancez /eddy-snapshot dans une session Claude.";

const tone = (percent) => (percent >= BAD_AT ? "bad" : percent >= WARN_AT ? "warn" : "ok");

const buildTrack = (percent) => {
  const track = element("div", "meter__track");
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "100");
  track.setAttribute("aria-valuenow", String(percent));
  const fill = element("div", "meter__fill");
  fill.style.width = `${percent}%`;
  track.append(fill);
  return track;
};

const isExpired = (window, now) => window.resetsAt !== null && window.resetsAt <= now;

const buildMeter = (title, window, now) => {
  const expired = isExpired(window, now);
  const percent = expired ? 0 : window.usedPercent;
  const meter = element("div", expired ? "meter" : `meter meter--${tone(percent)}`);
  const head = element("div", "meter__head");
  head.append(element("span", "meter__title", title), element("span", "meter__value", expired ? "—" : `${percent} %`));
  const foot = element("div", "meter__foot");
  if (window.resetsAt === null) foot.textContent = "Date de réinitialisation inconnue";
  else if (expired) foot.textContent = "Fenêtre renouvelée : actualisez les données";
  else foot.textContent = `Se réinitialise dans ${formatDuration(window.resetsAt - now)}`;
  meter.append(head, buildTrack(percent), foot);
  return meter;
};

const buildModelRow = (model, now) => {
  const expired = isExpired(model, now);
  const percent = expired ? 0 : model.usedPercent;
  const row = element("div", `mini-meter meter--${tone(percent)}`);
  row.append(element("span", "", model.label), buildTrack(percent), element("span", "mini-meter__value", expired ? "—" : `${percent} %`));
  return row;
};

export const createUsagePanel = ({ body, meta }) => {
  let current = null;

  const draw = () => {
    const now = Date.now();
    body.replaceChildren();
    meta.textContent = "";
    meta.classList.remove("snapshot-note--warn");
    if (!current) {
      body.append(element("p", "empty", EMPTY_HINT));
      return;
    }
    const age = now - current.updatedAt;
    const stale = current.source === "snapshot" && age > SNAPSHOT_STALE_MS;
    const parts = [];
    if (current.plan) parts.push(`Plan ${current.plan}`);
    parts.push(current.source === "demo" ? "exemple" : `${SOURCE_LABELS[current.source] ?? "donnée"} ${formatAge(age)}`);
    meta.textContent = parts.join(" · ");
    if (stale) meta.classList.add("snapshot-note--warn");
    if (current.fiveHour) body.append(buildMeter("Session de 5 heures", current.fiveHour, now));
    if (current.sevenDay) body.append(buildMeter("Semaine, tous modèles", current.sevenDay, now));
    if (Array.isArray(current.models) && current.models.length > 0) {
      const models = element("div", "mini-meters");
      current.models.forEach((model) => models.append(buildModelRow(model, now)));
      body.append(models);
    }
  };

  setInterval(draw, REFRESH_MS);

  const render = (usage) => {
    current = usage;
    draw();
  };

  return { render };
};
