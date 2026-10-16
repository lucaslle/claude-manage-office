const DAY = 86400000;

export const GROUPINGS = [
  { id: "project", label: "Projet" },
  { id: "date", label: "Date" },
  { id: "state", label: "État" },
];

export const FILTERS = [
  { id: "all", label: "Toutes" },
  { id: "reply", label: "À répondre" },
  { id: "working", label: "En cours" },
  { id: "app", label: "App" },
  { id: "terminal", label: "Terminal" },
  { id: "archived", label: "Archivées" },
];

export const PINNED_GROUP = { id: "pinned", label: "Épinglées" };

const normalize = (text) => String(text ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export const matchesSearch = (entry, query) => {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = normalize([entry.title, entry.project, entry.branch, entry.firstPrompt, entry.lastMessage].join(" "));
  return terms.every((term) => haystack.includes(term));
};

const FILTER_TESTS = {
  all: (entry) => !entry.archived,
  reply: (entry) => entry.live === "needs_reply",
  working: (entry) => entry.live === "working",
  app: (entry) => entry.source === "app" && !entry.archived,
  terminal: (entry) => entry.source === "terminal" && !entry.archived,
  archived: (entry) => entry.archived,
};

export const filterEntries = (entries, filterId, query) => {
  const test = FILTER_TESTS[filterId] ?? FILTER_TESTS.all;
  return entries.filter((entry) => test(entry) && matchesSearch(entry, query));
};

export const countByFilter = (entries) => Object.fromEntries(FILTERS.map((filter) => [filter.id, entries.filter(FILTER_TESTS[filter.id]).length]));

const startOfDay = (timestamp) => {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

export const dateBucket = (updatedAt, now) => {
  const today = startOfDay(now);
  if (updatedAt >= today) return { id: "today", label: "Aujourd'hui", order: 0 };
  if (updatedAt >= today - DAY) return { id: "yesterday", label: "Hier", order: 1 };
  if (updatedAt >= today - 6 * DAY) return { id: "week", label: "Cette semaine", order: 2 };
  if (updatedAt >= today - 29 * DAY) return { id: "month", label: "Ce mois-ci", order: 3 };
  return { id: "older", label: "Plus ancien", order: 4 };
};

export const stateBucket = (entry, now) => {
  if (entry.archived) return { id: "archived", label: "Archivées", order: 5 };
  if (entry.live === "needs_reply") return { id: "reply", label: "À répondre", order: 0 };
  if (entry.live === "working") return { id: "working", label: "En cours", order: 1 };
  const age = now - entry.updatedAt;
  if (age < DAY) return { id: "recent", label: "Dernières 24 h", order: 2 };
  if (age < 7 * DAY) return { id: "week", label: "Cette semaine", order: 3 };
  return { id: "older", label: "Plus anciennes", order: 4 };
};

const bucketOf = (entry, grouping, now) => {
  if (grouping === "date") return dateBucket(entry.updatedAt, now);
  if (grouping === "state") return stateBucket(entry, now);
  return { id: `project:${entry.project}`, label: entry.project, order: 0 };
};

// Retourne des groupes { id, label, entries } ; les épinglées passent en premier, chaque discussion n'apparaît qu'une fois.
export const groupEntries = (entries, grouping, now, pinnedIds = new Set()) => {
  const groups = new Map();
  const add = (bucket, entry) => {
    if (!groups.has(bucket.id)) groups.set(bucket.id, { id: bucket.id, label: bucket.label, order: bucket.order, entries: [] });
    groups.get(bucket.id).entries.push(entry);
  };
  entries.forEach((entry) => add(pinnedIds.has(entry.id) ? { ...PINNED_GROUP, order: -1 } : bucketOf(entry, grouping, now), entry));
  const latest = (group) => Math.max(...group.entries.map((entry) => entry.updatedAt));
  return [...groups.values()].sort((first, second) => {
    if (first.order !== second.order) return first.order - second.order;
    return latest(second) - latest(first);
  });
};

export const liveLabel = (live) => ({ needs_reply: "À répondre", working: "En cours", idle: "Au repos", ended: "Terminée" })[live] ?? "";
