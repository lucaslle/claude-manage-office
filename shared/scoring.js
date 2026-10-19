const QUICK_REPLY_MS = 5 * 60 * 1000;
const COMBO_WINDOW_MS = 3 * 60 * 1000;
const COMBO_STEP = 0.25;
const MAX_COMBO_MULTIPLIER = 2;
const EVENT_HISTORY = 30;
const MERGED_HISTORY = 200;
const DAY_MS = 24 * 60 * 60 * 1000;
const REPAIRED_ROOMS = new Set(["rev"]);

export const POINTS = { reply: 10, quick_reply: 25, merge: 40, repair: 20, review: 15, ready: 5, inbox_zero: 30, task: 3, feature: 60 };

export const EVENT_LABELS = {
  reply: "Réponse",
  quick_reply: "Réponse éclair",
  merge: "Merge",
  repair: "Réparation",
  review: "Relecture",
  ready: "Brouillon terminé",
  inbox_zero: "Accueil vide",
  task: "Tâche cochée",
  feature: "Fonctionnalité terminée",
};

export const LEVELS = [
  { name: "Stagiaire", at: 0 },
  { name: "Junior", at: 100 },
  { name: "Confirmé", at: 300 },
  { name: "Senior", at: 700 },
  { name: "Lead", at: 1500 },
  { name: "Architecte", at: 3000 },
  { name: "Directeur", at: 6000 },
  { name: "Légende", at: 12000 },
];

export const BADGES = [
  { id: "first_merge", name: "Premier merge", description: "Une MR a été mergée.", earned: (score) => score.totals.merge >= 1 },
  { id: "merges_10", name: "Dix merges", description: "Dix MR mergées.", earned: (score) => score.totals.merge >= 10 },
  { id: "quick_5", name: "Réflexe", description: "Cinq réponses en moins de cinq minutes.", earned: (score) => score.totals.quick_reply >= 5 },
  { id: "repair_5", name: "Réparateur", description: "Cinq MR sorties de l'atelier.", earned: (score) => score.totals.repair >= 5 },
  { id: "feature_1", name: "Fonctionnalité livrée", description: "Toutes les tâches d'une fonctionnalité Spec Kit sont cochées.", earned: (score) => score.totals.feature >= 1 },
  { id: "features_5", name: "Cinq fonctionnalités", description: "Cinq fonctionnalités Spec Kit terminées.", earned: (score) => score.totals.feature >= 5 },
  { id: "tasks_50", name: "Cinquante tâches", description: "Cinquante tâches cochées.", earned: (score) => score.totals.task >= 50 },
  { id: "inbox_zero", name: "Accueil vide", description: "Plus personne n'attend votre réponse.", earned: (score) => score.totals.inbox_zero >= 1 },
  { id: "streak_5", name: "Cinq jours d'affilée", description: "Au moins une action cinq jours de suite.", earned: (score) => score.streak.days >= 5 },
  { id: "streak_20", name: "Vingt jours d'affilée", description: "Au moins une action vingt jours de suite.", earned: (score) => score.streak.days >= 20 },
  { id: "day_100", name: "Grosse journée", description: "Cent points dans la même journée.", earned: (score) => score.today.points >= 100 },
  { id: "combo_4", name: "Enchaînement", description: "Quatre actions en moins de trois minutes.", earned: (score) => score.combo.best >= 4 },
];

const emptyTotals = () => Object.fromEntries(Object.keys(POINTS).map((type) => [type, 0]));

export const createScore = () => ({
  version: 1,
  xp: 0,
  totals: emptyTotals(),
  streak: { days: 0, lastDay: null },
  today: { day: null, points: 0 },
  combo: { count: 0, lastAt: 0, best: 0 },
  badges: [],
  events: [],
  nextEventId: 1,
  presence: {},
  scoredMerges: [],
});

export const isScore = (candidate) => Boolean(candidate) && candidate.version === 1 && typeof candidate.xp === "number" && typeof candidate.totals === "object";

export const dayKey = (now) => {
  const date = new Date(now);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

export const levelFor = (xp) => {
  let index = 0;
  LEVELS.forEach((level, levelIndex) => {
    if (xp >= level.at) index = levelIndex;
  });
  const floor = LEVELS[index].at;
  const next = LEVELS[index + 1]?.at ?? null;
  return { index, name: LEVELS[index].name, floor, next, progress: next === null ? 1 : (xp - floor) / (next - floor) };
};

export const comboMultiplier = (count) => Math.min(MAX_COMBO_MULTIPLIER, 1 + COMBO_STEP * Math.max(0, count - 1));

export const isComboActive = (combo, now) => combo.count > 0 && now - combo.lastAt <= COMBO_WINDOW_MS;

export const streakNow = (streak, now) => {
  if (!streak.lastDay) return 0;
  const today = dayKey(now);
  const yesterday = dayKey(now - DAY_MS);
  return streak.lastDay === today || streak.lastDay === yesterday ? streak.days : 0;
};

export const todayPoints = (today, now) => (today.day === dayKey(now) ? today.points : 0);

const isSession = (character) => character.kind === "robot" && !character.agent;

const waitingSessions = (entries) => entries.filter((entry) => entry.session && entry.room === "acc").length;

// Une tâche cochée entre deux observations rapporte des points (autant d'événements que de tâches, regroupés en un seul),
// et la dernière tâche cochée termine la fonctionnalité. Sans mesure précédente (premier passage), rien n'est attribué.
const featureEvents = (previous, character) => {
  const feature = character.feature;
  if (!feature || previous.tasksDone === undefined) return [];
  const events = [];
  const delta = feature.done - previous.tasksDone;
  if (delta > 0) events.push({ type: "task", key: character.key, name: delta > 1 ? `${character.name} (×${delta})` : character.name, times: delta });
  if (feature.total > 0 && feature.done >= feature.total && previous.taskTotal > 0 && previous.tasksDone < previous.taskTotal) events.push({ type: "feature", key: character.key, name: character.name });
  return events;
};

export const detectTransitions = ({ presence, characters, merged, scoredMerges, now }) => {
  const events = [];
  characters.forEach((character) => {
    const previous = presence[character.key];
    if (!previous) return;
    const name = character.name;
    events.push(...featureEvents(previous, character));
    if (previous.draft && character.draft !== true) {
      events.push({ type: "ready", key: character.key, name });
      return;
    }
    if (character.ready === true && !previous.ready) events.push({ type: "review", key: character.key, name });
    if (previous.room === character.room) return;
    if (previous.room === "acc" && isSession(character)) {
      events.push({ type: now - previous.since <= QUICK_REPLY_MS ? "quick_reply" : "reply", key: character.key, name });
    } else if (previous.room === "fix" && REPAIRED_ROOMS.has(character.room)) {
      events.push({ type: "repair", key: character.key, name });
    }
  });
  const alreadyScored = new Set(scoredMerges);
  merged.forEach((entry) => {
    if (alreadyScored.has(entry.key)) return;
    alreadyScored.add(entry.key);
    events.push({ type: "merge", key: entry.key, name: entry.name || presence[entry.key]?.name || entry.key });
  });
  const replied = events.some((event) => event.type === "reply" || event.type === "quick_reply");
  const wasWaiting = waitingSessions(Object.values(presence)) > 0;
  const stillWaiting = characters.some((character) => isSession(character) && character.room === "acc");
  if (replied && wasWaiting && !stillWaiting) events.push({ type: "inbox_zero", key: "", name: "Accueil" });
  return events;
};

const nextPresence = (presence, characters, now) =>
  Object.fromEntries(
    characters.map((character) => {
      const previous = presence[character.key];
      const since = previous && previous.room === character.room ? previous.since : now;
      return [character.key, { room: character.room, since, name: character.name, session: isSession(character), draft: character.draft === true, ready: character.ready === true, tasksDone: character.feature?.done, taskTotal: character.feature?.total }];
    }),
  );

const advanceStreak = (streak, now) => {
  const today = dayKey(now);
  if (streak.lastDay === today) return streak;
  const yesterday = dayKey(now - DAY_MS);
  return { days: streak.lastDay === yesterday ? streak.days + 1 : 1, lastDay: today };
};

export const applyEvents = (score, events, now) => {
  const next = structuredClone(score);
  const today = dayKey(now);
  if (next.today.day !== today) next.today = { day: today, points: 0 };
  const scored = events.map((event) => {
    const chained = isComboActive(next.combo, now);
    const count = chained ? next.combo.count + 1 : 1;
    next.combo = { count, lastAt: now, best: Math.max(next.combo.best, count) };
    const times = event.times ?? 1;
    const points = Math.round(POINTS[event.type] * times * comboMultiplier(count));
    next.xp += points;
    next.totals[event.type] = (next.totals[event.type] ?? 0) + times;
    next.today.points += points;
    const entry = { id: next.nextEventId, type: event.type, key: event.key, name: event.name, points, combo: count, at: now };
    next.nextEventId += 1;
    next.events.unshift(entry);
    return entry;
  });
  next.events = next.events.slice(0, EVENT_HISTORY);
  if (scored.length > 0) next.streak = advanceStreak(next.streak, now);
  const known = new Set(next.badges.map((badge) => badge.id));
  const unlocked = BADGES.filter((badge) => !known.has(badge.id) && badge.earned(next)).map((badge) => ({ id: badge.id, at: now }));
  next.badges.push(...unlocked);
  const before = levelFor(score.xp);
  const after = levelFor(next.xp);
  return { score: next, events: scored, badges: unlocked.map((badge) => badge.id), levelUp: after.index > before.index ? after : null };
};

export const advanceScore = (score, { characters, merged = [], now = Date.now() }) => {
  const detected = detectTransitions({ presence: score.presence, characters, merged, scoredMerges: score.scoredMerges, now });
  const applied = detected.length > 0 ? applyEvents(score, detected, now) : { score: structuredClone(score), events: [], badges: [], levelUp: null };
  applied.score.presence = nextPresence(score.presence, characters, now);
  const mergedKeys = merged.map((entry) => entry.key).filter((key) => !applied.score.scoredMerges.includes(key));
  applied.score.scoredMerges = [...applied.score.scoredMerges, ...mergedKeys].slice(-MERGED_HISTORY);
  return applied;
};

export const publicScore = (score) => ({
  xp: score.xp,
  level: levelFor(score.xp),
  totals: score.totals,
  streak: score.streak,
  today: score.today,
  combo: score.combo,
  badges: score.badges,
  events: score.events,
});
