import { element } from "./dom.js";
import { formatAge } from "./format.js";
import { roomCenters } from "./layout.js";
import { BADGES, EVENT_LABELS, LEVELS, comboMultiplier, isComboActive, streakNow, todayPoints } from "../shared/scoring.js";

const REFRESH_MS = 30000;
const TOAST_MS = 4200;
const TOAST_LIMIT = 3;
const RECENT_LIMIT = 4;
const SCENE_CENTER = { x: 0, y: 2.5, z: 0 };
const CENTER_BURST = 90;
const LEVEL_BURST = 160;
const GAIN_BURST = 28;
const EMPTY_HINT = "Chaque réponse, relecture, réparation ou merge rapporte des points. Les enchaînements rapides les multiplient.";
const BADGE_ICONS = { first_merge: "⛩", merges_10: "🏁", quick_5: "⚡", repair_5: "🔧", inbox_zero: "📭", streak_5: "🔥", streak_20: "🏆", day_100: "💯", combo_4: "🔗" };
const EVENT_ICONS = { reply: "💬", quick_reply: "⚡", merge: "⛩", repair: "🔧", review: "👀", ready: "📝", inbox_zero: "📭" };

const badgeName = (id) => BADGES.find((badge) => badge.id === id)?.name ?? id;

const countActions = (score) => Object.values(score.totals).reduce((sum, count) => sum + count, 0);

const buildLevel = (score) => {
  const block = element("div", "score__level");
  const head = element("div", "score__head");
  const title = element("div", "score__name", score.level.name);
  const rank = element("span", "badge", `Niveau ${score.level.index + 1}`);
  head.append(title, rank);
  const track = element("div", "score__track");
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "100");
  track.setAttribute("aria-valuenow", String(Math.round(score.level.progress * 100)));
  const fill = element("div", "score__fill");
  fill.style.width = `${Math.round(score.level.progress * 100)}%`;
  track.append(fill);
  const nextLevel = LEVELS[score.level.index + 1];
  const foot = element("div", "score__foot", nextLevel ? `${score.xp} XP · encore ${score.level.next - score.xp} avant ${nextLevel.name}` : `${score.xp} XP · niveau maximal`);
  block.append(head, track, foot);
  return block;
};

const buildStat = (value, label, tone) => {
  const stat = element("div", tone ? `stat stat--${tone}` : "stat");
  stat.append(element("div", "stat__value", value), element("div", "stat__label", label));
  return stat;
};

const buildStats = (score, now) => {
  const row = element("div", "score__stats");
  const streak = streakNow(score.streak, now);
  const comboActive = isComboActive(score.combo, now);
  row.append(
    buildStat(`${streak} j`, "Série", streak > 0 ? "hot" : ""),
    buildStat(`+${todayPoints(score.today, now)}`, "Aujourd'hui", ""),
    buildStat(comboActive ? `×${comboMultiplier(score.combo.count).toFixed(2).replace(/\.?0+$/, "")}` : "×1", "Enchaînement", comboActive ? "hot" : ""),
  );
  return row;
};

const buildBadges = (score) => {
  const earned = new Set(score.badges.map((badge) => badge.id));
  const grid = element("div", "badges");
  BADGES.forEach((badge) => {
    const chip = element("div", earned.has(badge.id) ? "badge-chip" : "badge-chip badge-chip--locked");
    chip.title = badge.description;
    chip.append(element("span", "badge-chip__icon", BADGE_ICONS[badge.id] ?? "★"), element("span", "badge-chip__name", badge.name));
    grid.append(chip);
  });
  return grid;
};

const buildRecent = (score, now) => {
  const list = element("ul", "gains");
  score.events.slice(0, RECENT_LIMIT).forEach((event) => {
    const item = element("li", "gains__item");
    item.append(
      element("span", "gains__points", `+${event.points}`),
      element("span", "gains__label", `${EVENT_ICONS[event.type] ?? ""} ${EVENT_LABELS[event.type]} · ${event.name}`),
      element("span", "gains__age", formatAge(now - event.at)),
    );
    list.append(item);
  });
  return list;
};

export const createScorePanel = ({ body, meta }) => {
  let current = null;

  const draw = () => {
    const now = Date.now();
    body.replaceChildren();
    if (!current) {
      meta.textContent = "";
      body.append(element("p", "empty", EMPTY_HINT));
      return;
    }
    meta.textContent = `${countActions(current)} action(s)`;
    body.append(buildLevel(current), buildStats(current, now), buildBadges(current));
    if (current.events.length > 0) body.append(buildRecent(current, now));
    else body.append(element("p", "empty", EMPTY_HINT));
  };

  setInterval(draw, REFRESH_MS);

  const render = (score) => {
    current = score;
    draw();
  };

  return { render };
};

export const createScoreTracker = ({ panel, toasts, crowd, effects, log }) => {
  let lastEventId = null;
  let badgeIds = new Set();
  let levelIndex = 0;

  const toast = (text, tone) => {
    const node = element("div", `toast toast--${tone}`, text);
    toasts.append(node);
    while (toasts.children.length > TOAST_LIMIT) toasts.firstElementChild.remove();
    setTimeout(() => node.remove(), TOAST_MS);
  };

  const celebrateEvent = (event) => {
    const label = `${EVENT_ICONS[event.type] ?? ""} +${event.points} · ${EVENT_LABELS[event.type]} · ${event.name}`;
    toast(label, "gain");
    log(`+${event.points} points : ${EVENT_LABELS[event.type]} (${event.name}).`);
    const position = event.key ? crowd.positionOf(event.key) : null;
    if (position) {
      effects.gain({ x: position.x, y: position.y + 0.6, z: position.z }, `+${event.points}`);
      effects.burst(position, GAIN_BURST);
      return;
    }
    const reception = { x: roomCenters.acc.x, y: 1.5, z: roomCenters.acc.z };
    effects.gain({ ...reception, y: 2.6 }, `+${event.points}`, "wide");
    effects.burst(reception, CENTER_BURST);
  };

  const apply = (score) => {
    panel.render(score);
    if (!score) return;
    if (lastEventId !== null) {
      score.events
        .filter((event) => event.id > lastEventId)
        .reverse()
        .forEach(celebrateEvent);
      score.badges
        .filter((badge) => !badgeIds.has(badge.id))
        .forEach((badge) => {
          toast(`${BADGE_ICONS[badge.id] ?? "★"} Badge : ${badgeName(badge.id)}`, "badge");
          log(`Badge débloqué : ${badgeName(badge.id)}.`);
          effects.burst(SCENE_CENTER, CENTER_BURST);
        });
      if (score.level.index > levelIndex) {
        toast(`🎉 Niveau ${score.level.index + 1} : ${score.level.name}`, "level");
        log(`Niveau ${score.level.index + 1} atteint : ${score.level.name}.`);
        effects.burst(SCENE_CENTER, LEVEL_BURST);
      }
    }
    lastEventId = score.events[0]?.id ?? 0;
    badgeIds = new Set(score.badges.map((badge) => badge.id));
    levelIndex = score.level.index;
  };

  const reset = () => {
    lastEventId = null;
  };

  return { apply, reset };
};
