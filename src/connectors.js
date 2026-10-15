import { element } from "./dom.js";
import { formatAge } from "./format.js";

const STORAGE_KEY = "eddy.connectors.selected";
const SNAPSHOT_STALE_MS = 60 * 60 * 1000;
const STATUS_INFO = {
  connected: { label: "Connecté", tone: "ok" },
  needs_auth: { label: "Connexion requise", tone: "warn" },
  failed: { label: "En échec", tone: "bad" },
  pending: { label: "En cours", tone: "warn" },
  disabled: { label: "Désactivé", tone: "muted" },
};
const KIND_LABELS = { connector: "Connecteur", plugin: "Plugin", other: "Intégré" };
const NO_SNAPSHOT_HINT = "Aucun instantané. Lancez /eddy-snapshot dans une session Claude pour lire l'état de vos connecteurs.";

const readSelection = () => {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    return Array.isArray(stored) ? stored : null;
  } catch {
    return null;
  }
};

const saveSelection = (names) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(names));
  } catch {
    return;
  }
};

const buildRow = ({ name, detail, state, toneName }) => {
  const row = element("li", "row");
  row.append(element("span", `row__dot row__dot--${toneName}`));
  const main = element("div", "row__main");
  main.append(element("div", "row__name", name), element("div", "row__detail", detail));
  row.append(main, element("span", "row__state", state));
  return row;
};

const connectorRow = (server) => {
  const info = STATUS_INFO[server.status] ?? { label: server.status, tone: "warn" };
  const tools = server.toolCount === null ? "" : `${server.toolCount} outil${server.toolCount > 1 ? "s" : ""} · `;
  return buildRow({ name: server.name.replace(/^plugin:[^:]+:/, ""), detail: `${tools}${KIND_LABELS[server.kind] ?? server.kind}`, state: info.label, toneName: info.tone });
};

const gitlabRow = (gitlab) => {
  if (gitlab.state === "ok") return buildRow({ name: "GitLab (API)", detail: `${gitlab.mergeRequests} merge request(s)${gitlab.user ? ` · ${gitlab.user}` : ""}`, state: "Connecté", toneName: "ok" });
  if (gitlab.state === "pending") return buildRow({ name: "GitLab (API)", detail: "Première lecture en cours", state: "En cours", toneName: "warn" });
  if (gitlab.state === "no-token") return buildRow({ name: "GitLab (API)", detail: "GITLAB_URL et GITLAB_TOKEN à renseigner dans .env", state: "Non configuré", toneName: "warn" });
  return buildRow({ name: "GitLab (API)", detail: gitlab.message || "Erreur de lecture", state: "En échec", toneName: "bad" });
};

const hooksRow = (sessions) =>
  buildRow({
    name: "Hooks Claude Code",
    detail: sessions.count > 0 ? `${sessions.count} session(s) détectée(s)` : "Aucune session détectée : installez les hooks",
    state: sessions.count > 0 ? "Actifs" : "En attente",
    toneName: sessions.count > 0 ? "ok" : "warn",
  });

export const createConnectorsPanel = ({ body, selector, chooseButton }) => {
  let selection = readSelection();
  let latest = { snapshot: null, sources: null, demo: false };

  const isSelected = (name) => selection === null || selection.includes(name);

  const drawSelector = () => {
    selector.replaceChildren();
    const servers = latest.snapshot?.servers ?? [];
    selector.append(element("p", "selector__hint", servers.length > 0 ? "Choisissez les connecteurs à afficher." : NO_SNAPSHOT_HINT));
    servers.forEach((server) => {
      const label = element("label", "check");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = isSelected(server.name);
      box.addEventListener("change", () => {
        const names = servers.map((candidate) => candidate.name).filter((name) => (name === server.name ? box.checked : isSelected(name)));
        selection = names;
        saveSelection(names);
        drawBody();
      });
      label.append(box, element("span", "", `${server.name.replace(/^plugin:[^:]+:/, "")} (${KIND_LABELS[server.kind] ?? server.kind})`));
      selector.append(label);
    });
  };

  const drawBody = () => {
    body.replaceChildren();
    const servers = (latest.snapshot?.servers ?? []).filter((server) => isSelected(server.name));
    if (!latest.snapshot) {
      body.append(element("p", "empty", NO_SNAPSHOT_HINT));
    } else if (servers.length === 0) {
      body.append(element("p", "empty", "Aucun connecteur sélectionné. Utilisez « Choisir »."));
    } else {
      const list = element("ul", "rows");
      servers.forEach((server) => list.append(connectorRow(server)));
      body.append(list);
      const age = Date.now() - latest.snapshot.updatedAt;
      const note = element("p", age > SNAPSHOT_STALE_MS ? "snapshot-note snapshot-note--warn" : "snapshot-note", latest.demo ? "Exemple de données" : `Instantané ${formatAge(age)}${age > SNAPSHOT_STALE_MS ? " : lancez /eddy-snapshot pour actualiser" : ""}`);
      body.append(note);
    }
    if (latest.sources) {
      body.append(element("p", "rows__title", "Sources du tableau de bord"));
      const sourceList = element("ul", "rows");
      sourceList.append(hooksRow(latest.sources.sessions), gitlabRow(latest.sources.gitlab));
      body.append(sourceList);
    }
  };

  chooseButton.addEventListener("click", () => {
    const opening = selector.hidden;
    selector.hidden = !opening;
    chooseButton.setAttribute("aria-expanded", String(opening));
    chooseButton.textContent = opening ? "Terminé" : "Choisir";
    if (opening) drawSelector();
  });

  const render = (data) => {
    latest = { demo: false, ...data };
    if (!selector.hidden) drawSelector();
    drawBody();
  };

  return { render };
};
