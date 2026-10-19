import { element } from "./dom.js";
import { formatAge, formatDuration } from "./format.js";

const REFRESH_MS = 30000;
const SNAPSHOT_STALE_MS = 30 * 60 * 1000;
const WARN_AT = 60;
const BAD_AT = 85;
const SOURCE_LABELS = { statusline: "ligne d'état", snapshot: "instantané", cli: "commande /usage", demo: "exemple" };
const MANUAL_SOURCES = new Set(["snapshot", "cli"]);
const FAILURE_VISIBLE_MS = 10000;
const EMPTY_HINT = "Aucune donnée pour l'instant. Cliquez sur Actualiser, installez la ligne d'état (npm run statusline:install) ou lancez /eddy-snapshot dans une session Claude.";

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

// Les limites par modèle ne se mettent à jour que par /eddy-snapshot : on affiche leur âge, en alerte quand il devient grand.
const buildModelRow = (model, now, detailsAt) => {
  const expired = isExpired(model, now);
  const percent = expired ? 0 : model.usedPercent;
  const row = element("div", `mini-meter meter--${tone(percent)}`);
  const label = element("span", "mini-meter__label", model.label);
  if (detailsAt !== null) {
    const age = now - detailsAt;
    label.append(element("small", age > SNAPSHOT_STALE_MS ? "mini-meter__age mini-meter__age--stale" : "mini-meter__age", formatAge(age)));
  }
  row.append(label, buildTrack(percent), element("span", "mini-meter__value", expired ? "—" : `${percent} %`));
  return row;
};

export const createUsagePanel = ({ body, meta, refreshButton = null }) => {
  let current = null;
  let failure = "";
  let refreshing = false;
  let failureTimer = null;

  const describeSource = (now) => {
    const age = now - current.updatedAt;
    const parts = [];
    if (current.plan) parts.push(`Plan ${current.plan}`);
    parts.push(current.source === "demo" ? "exemple" : `${SOURCE_LABELS[current.source] ?? "donnée"} ${formatAge(age)}`);
    return { text: parts.join(" · "), stale: MANUAL_SOURCES.has(current.source) && age > SNAPSHOT_STALE_MS };
  };

  const draw = () => {
    const now = Date.now();
    body.replaceChildren();
    meta.textContent = "";
    meta.classList.remove("snapshot-note--warn");
    if (!current) {
      body.append(element("p", "empty", EMPTY_HINT));
      if (failure) {
        meta.textContent = failure;
        meta.classList.add("snapshot-note--warn");
      }
      return;
    }
    const { text, stale } = describeSource(now);
    meta.textContent = failure || text;
    if (failure || stale) meta.classList.add("snapshot-note--warn");
    if (current.fiveHour) body.append(buildMeter("Session de 5 heures", current.fiveHour, now));
    if (current.sevenDay) body.append(buildMeter("Semaine, tous modèles", current.sevenDay, now));
    if (Array.isArray(current.models) && current.models.length > 0) {
      const models = element("div", "mini-meters");
      const detailsAt = current.detailsAt ?? (MANUAL_SOURCES.has(current.source) ? current.updatedAt : null);
      current.models.forEach((model) => models.append(buildModelRow(model, now, detailsAt)));
      body.append(models);
    }
  };

  const showFailure = (message) => {
    failure = message;
    clearTimeout(failureTimer);
    failureTimer = setTimeout(() => {
      failure = "";
      draw();
    }, FAILURE_VISIBLE_MS);
    draw();
  };

  // Le serveur lit /usage avec la CLI Claude Code (0 token) et pousse le nouvel état par le flux : on ne redessine qu'en cas d'échec.
  const refresh = async () => {
    if (refreshing || !refreshButton) return;
    refreshing = true;
    refreshButton.disabled = true;
    refreshButton.textContent = "Lecture…";
    try {
      const response = await fetch("/api/usage/refresh", { method: "POST" });
      const result = await response.json();
      if (result.ok) {
        failure = "";
        draw();
      } else showFailure(result.reason || "Lecture des limites impossible.");
    } catch {
      showFailure("Serveur local injoignable.");
    } finally {
      refreshing = false;
      refreshButton.disabled = false;
      refreshButton.textContent = "Actualiser";
    }
  };

  refreshButton?.addEventListener("click", refresh);
  setInterval(draw, REFRESH_MS);

  // Hors mode direct (démo), il n'y a pas de serveur à interroger : le bouton disparaît.
  const render = (usage, { live = false } = {}) => {
    current = usage;
    if (refreshButton) refreshButton.hidden = !live;
    draw();
  };

  return { render };
};
