import { element } from "./dom.js";
import { formatAge } from "./format.js";
import { FILTERS, GROUPINGS, PINNED_GROUP, countByFilter, filterEntries, groupEntries, liveLabel } from "./library-model.js";
import { fetchLibrary } from "./api.js";

const POLL_MS = 30000;
const PINNED_KEY = "eddy.library.pinned";
const GROUPING_KEY = "eddy.library.grouping";
const WARN_AT = 70;
const BAD_AT = 90;
const OFFLINE_MESSAGE = "La liste des discussions vient du serveur local : lancez npm run live, puis rechargez la page.";

const readStored = (key) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const store = (key, value) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    return;
  }
};

const readPinned = () => {
  try {
    const parsed = JSON.parse(readStored(PINNED_KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
};

const contextTone = (percent) => (percent >= BAD_AT ? "bad" : percent >= WARN_AT ? "warn" : "ok");

export const createLibraryView = ({ root, onOpenEntry, onCount }) => {
  const searchInput = root.querySelector("#library-search");
  const groupingBox = root.querySelector("#library-grouping");
  const filtersBox = root.querySelector("#library-filters");
  const summary = root.querySelector("#library-summary");
  const list = root.querySelector("#library-list");
  const refreshButton = root.querySelector("#library-refresh");

  let entries = [];
  let total = 0;
  let loaded = false;
  let failure = "";
  let visible = false;
  let timer = null;
  let filterId = "all";
  let grouping = GROUPINGS.some((item) => item.id === readStored(GROUPING_KEY)) ? readStored(GROUPING_KEY) : "project";
  let pinned = readPinned();

  const togglePin = (id) => {
    if (pinned.has(id)) pinned.delete(id);
    else pinned.add(id);
    store(PINNED_KEY, JSON.stringify([...pinned]));
    render();
  };

  const copyText = async (button, text) => {
    const label = button.textContent;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "Copié";
    } catch {
      button.textContent = "Copie impossible";
    }
    setTimeout(() => {
      button.textContent = label;
    }, 1500);
  };

  const buildMeta = (entry, now) => {
    const meta = element("span", "lib-row__meta");
    const pieces = [entry.project];
    if (entry.branch) pieces.push(entry.branch);
    pieces.push(`${entry.source === "app" ? "App" : "Terminal"} · ${entry.system}`);
    pieces.forEach((text, index) => {
      if (index > 0) meta.append(element("span", "lib-row__dot", "·"));
      meta.append(element("span", index === 0 ? "lib-row__project" : "", text));
    });
    const age = element("time", "lib-row__age", formatAge(Math.max(0, now - entry.updatedAt)));
    age.title = new Date(entry.updatedAt).toLocaleString("fr-FR");
    meta.append(element("span", "lib-row__dot", "·"), age);
    if (entry.contextPercent !== null) {
      meta.append(element("span", "lib-row__dot", "·"), element("span", `lib-row__context lib-row__context--${contextTone(entry.contextPercent)}`, `contexte ${entry.contextPercent} %`));
    }
    return meta;
  };

  const buildRow = (entry, now) => {
    const row = element("article", "lib-row");
    const main = element("button", "lib-row__main");
    main.type = "button";
    const top = element("span", "lib-row__top");
    top.append(element("span", "lib-row__title", entry.title));
    if (entry.live === "needs_reply" || entry.live === "working") top.append(element("span", `lib-state lib-state--${entry.live}`, liveLabel(entry.live)));
    if (entry.archived) top.append(element("span", "lib-state lib-state--archived", "Archivée"));
    main.append(top, buildMeta(entry, now));
    if (entry.lastMessage) main.append(element("span", "lib-row__preview", entry.lastMessage));
    main.addEventListener("click", () => onOpenEntry(entry));

    const actions = element("div", "lib-row__actions");
    const pin = element("button", "button button--icon button--small lib-row__pin", pinned.has(entry.id) ? "★" : "☆");
    pin.type = "button";
    pin.setAttribute("aria-pressed", String(pinned.has(entry.id)));
    pin.setAttribute("aria-label", pinned.has(entry.id) ? "Désépingler cette discussion" : "Épingler cette discussion");
    pin.title = pinned.has(entry.id) ? "Désépingler" : "Épingler en haut de la liste";
    pin.addEventListener("click", () => togglePin(entry.id));
    actions.append(pin);
    if (entry.resume.appUrl) {
      const open = element("a", "button button--small button--primary", "Ouvrir dans l'app");
      open.href = entry.resume.appUrl;
      actions.append(open);
    } else if (entry.resume.command) {
      const copy = element("button", "button button--small", "Copier la commande");
      copy.type = "button";
      copy.title = entry.resume.command;
      copy.addEventListener("click", () => copyText(copy, entry.resume.command));
      actions.append(copy);
    }
    row.append(main, actions);
    return row;
  };

  const buildGroup = (group, now) => {
    const section = element("details", grouping === "project" && group.id !== PINNED_GROUP.id ? "lib-group lib-group--project" : "lib-group");
    section.open = true;
    const heading = element("summary", "lib-group__title");
    heading.append(element("span", "lib-group__label", group.id === PINNED_GROUP.id ? `★ ${group.label}` : group.label), element("span", "lib-group__count", String(group.entries.length)));
    section.append(heading);
    const rows = element("div", "lib-group__rows");
    group.entries.forEach((entry) => rows.append(buildRow(entry, now)));
    section.append(rows);
    return section;
  };

  const renderControls = () => {
    const counts = countByFilter(entries);
    groupingBox.replaceChildren(
      ...GROUPINGS.map((item) => {
        const button = element("button", "chip", item.label);
        button.type = "button";
        button.setAttribute("aria-pressed", String(item.id === grouping));
        button.addEventListener("click", () => {
          grouping = item.id;
          store(GROUPING_KEY, grouping);
          render();
        });
        return button;
      }),
    );
    filtersBox.replaceChildren(
      ...FILTERS.map((item) => {
        const button = element("button", "chip");
        button.type = "button";
        button.setAttribute("aria-pressed", String(item.id === filterId));
        button.append(item.label, element("span", "chip__count", String(counts[item.id] ?? 0)));
        button.addEventListener("click", () => {
          filterId = item.id;
          render();
        });
        return button;
      }),
    );
  };

  function render() {
    renderControls();
    list.replaceChildren();
    if (failure) {
      summary.textContent = "";
      list.append(element("p", "empty", failure));
      return;
    }
    if (!loaded) {
      summary.textContent = "";
      list.append(element("p", "empty", "Chargement des discussions…"));
      return;
    }
    const now = Date.now();
    const shown = filterEntries(entries, filterId, searchInput.value);
    const more = total > entries.length ? ` · ${total - entries.length} plus anciennes non chargées` : "";
    summary.textContent = `${shown.length} discussion${shown.length > 1 ? "s" : ""} sur ${total}${more}`;
    if (shown.length === 0) {
      list.append(element("p", "empty", searchInput.value.trim() ? "Aucune discussion ne correspond à cette recherche." : "Aucune discussion dans cette catégorie."));
      return;
    }
    groupEntries(shown, grouping, now, pinned).forEach((group) => list.append(buildGroup(group, now)));
  }

  const load = async (refresh = false) => {
    try {
      const result = await fetchLibrary({ refresh });
      entries = result.entries;
      total = result.total;
      loaded = true;
      failure = "";
      onCount?.(total);
    } catch {
      failure = OFFLINE_MESSAGE;
    }
    if (visible) render();
  };

  const stopPolling = () => {
    clearInterval(timer);
    timer = null;
  };

  searchInput.addEventListener("input", render);
  refreshButton.addEventListener("click", () => load(true));
  document.addEventListener("visibilitychange", () => {
    if (visible && !document.hidden) load();
  });

  return {
    preload: () => load(),
    show: () => {
      visible = true;
      render();
      load();
      stopPolling();
      timer = setInterval(() => !document.hidden && load(), POLL_MS);
    },
    hide: () => {
      visible = false;
      stopPolling();
    },
  };
};
