import { element } from "./dom.js";
import { ROOM_NAMES } from "./data.js";
import { fetchSessionDetails } from "./api.js";

const DETAILS_POLL_MS = 4000;
const WARN_AT = 70;
const BAD_AT = 90;
const DEMO_NOTE = "Mode démo : exemple de contenu.";
const DIGEST_LABELS = { user: "Votre dernière demande", assistant: "Dernière réponse de Claude" };

const tone = (percent) => (percent >= BAD_AT ? "bad" : percent >= WARN_AT ? "warn" : "ok");

const formatTokens = (tokens) => (tokens >= 1000000 ? `${(tokens / 1000000).toFixed(1).replace(".0", "")} M` : `${Math.round(tokens / 1000)} k`);

const formatTime = (timestamp) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
};

const buildContext = (context) => {
  const block = element("div", context ? `meter meter--${tone(context.percent)}` : "meter");
  const head = element("div", "meter__head");
  const value = context ? `${context.percent} %` : "—";
  head.append(element("span", "meter__title", "Contexte utilisé"), element("span", "meter__value", value));
  const track = element("div", "meter__track");
  const fill = element("div", "meter__fill");
  fill.style.width = `${context ? context.percent : 0}%`;
  track.append(fill);
  block.append(head, track);
  if (context) block.title = `${formatTokens(context.tokens)} sur ${formatTokens(context.window)} (estimation d'après le dernier échange)`;
  return block;
};

const lastOfRole = (messages, role) => messages.findLast((message) => message.role === role);

const pickDigest = (messages) =>
  ["user", "assistant"]
    .map((role) => lastOfRole(messages, role))
    .filter(Boolean)
    .sort((first, second) => messages.indexOf(first) - messages.indexOf(second));

const describeFeature = (feature) => {
  const tasks = feature.total > 0 ? `${feature.done} tâche${feature.done > 1 ? "s" : ""} sur ${feature.total}` : "tâches pas encore générées";
  const clarifications = feature.clarifications > 0 ? `, ${feature.clarifications} point${feature.clarifications > 1 ? "s" : ""} à clarifier` : "";
  return `${feature.name} : ${tasks}${clarifications}`;
};

const buildFacts = (spec) => {
  const facts = element("dl", "facts");
  [
    ["Pourquoi ici", spec.why],
    ["Merge request", spec.mr],
    ...(spec.feature ? [["Fonctionnalité", describeFeature(spec.feature)]] : []),
    ["Action", spec.action],
  ].forEach(([label, value]) => facts.append(element("dt", "", label), element("dd", "", value)));
  return facts;
};

export const createSessionModal = ({ isLive }) => {
  const dialog = document.getElementById("session-modal");
  const title = document.getElementById("modal-title");
  const badge = document.getElementById("modal-room");
  const factsBox = document.getElementById("modal-facts");
  const contextBox = document.getElementById("modal-context");
  const digest = document.getElementById("modal-digest");
  const footer = document.getElementById("modal-footer");
  const note = document.getElementById("modal-note");
  const link = document.getElementById("modal-link");
  const resumeBox = document.getElementById("modal-resume");
  const resumeCode = document.getElementById("modal-command");
  const copyButton = document.getElementById("modal-copy");
  const openAppLink = document.getElementById("modal-open-app");

  let currentSpec = null;
  let detailsTimer = null;
  let digestSignature = "";
  let expandedRoles = new Set();

  const setNote = (text, isError = false) => {
    note.textContent = text;
    note.classList.toggle("modal__note--error", isError);
  };

  const buildDigestItem = (message) => {
    const item = element("div", `digest digest--${message.role}`);
    const time = formatTime(message.timestamp);
    const text = element("p", "digest__text", message.text);
    item.classList.toggle("digest--open", expandedRoles.has(message.role));
    item.append(element("div", "digest__meta", `${DIGEST_LABELS[message.role]}${time ? ` · ${time}` : ""}`), text);
    const toggle = element("button", "digest__toggle");
    toggle.type = "button";
    toggle.hidden = true;
    toggle.addEventListener("click", () => {
      const open = item.classList.toggle("digest--open");
      if (open) expandedRoles.add(message.role);
      else expandedRoles.delete(message.role);
      toggle.textContent = open ? "Réduire" : "Voir tout";
    });
    item.append(toggle);
    return { item, text, toggle };
  };

  const renderDigest = (messages) => {
    const picked = pickDigest(messages);
    const signature = JSON.stringify(picked.map((message) => [message.role, message.text]));
    if (signature === digestSignature) return;
    digestSignature = signature;
    digest.replaceChildren();
    if (picked.length === 0) {
      digest.append(element("p", "empty", "Aucun message lisible pour cette session."));
      return;
    }
    const built = picked.map(buildDigestItem);
    built.forEach(({ item }) => digest.append(item));
    built.forEach(({ item, text, toggle }) => {
      const open = item.classList.contains("digest--open");
      if (open) item.classList.remove("digest--open");
      const overflows = text.scrollHeight > text.clientHeight + 1;
      if (open) item.classList.add("digest--open");
      toggle.hidden = !overflows && !open;
      toggle.textContent = open ? "Réduire" : "Voir tout";
    });
  };

  const stopPolling = () => {
    clearInterval(detailsTimer);
    detailsTimer = null;
  };

  const applyDetails = (details) => {
    contextBox.replaceChildren(buildContext(details.context));
    renderDigest(details.messages);
    resumeBox.hidden = !details.resume.command;
    resumeCode.textContent = details.resume.command;
    openAppLink.hidden = !details.resume.appUrl;
    if (details.resume.appUrl) openAppLink.href = details.resume.appUrl;
    setNote(details.resume.note);
  };

  const loadDetails = async () => {
    if (!currentSpec?.sessionId) return;
    try {
      applyDetails(await fetchSessionDetails(currentSpec.sessionId));
    } catch (error) {
      setNote(error.message, true);
    }
  };

  const showSections = (visible) => {
    contextBox.hidden = !visible;
    digest.hidden = !visible;
    footer.hidden = !visible;
  };

  const showDemo = (spec) => {
    showSections(true);
    contextBox.replaceChildren(buildContext({ percent: 42, tokens: 420000, window: 1000000 }));
    renderDigest([{ role: "assistant", text: spec.why, timestamp: null }]);
    resumeBox.hidden = true;
    openAppLink.hidden = true;
    setNote(DEMO_NOTE);
  };

  const open = ({ spec, room }) => {
    stopPolling();
    currentSpec = spec;
    digestSignature = "";
    expandedRoles = new Set();
    title.textContent = spec.title;
    badge.textContent = ROOM_NAMES[room] ?? "";
    badge.hidden = !badge.textContent;
    link.hidden = !spec.url;
    if (spec.url) link.href = spec.url;

    const isSession = spec.kind === "robot" && !spec.agent;
    factsBox.replaceChildren(isSession ? element("p", "modal__action", spec.action) : buildFacts(spec));
    if (!dialog.open) dialog.showModal();
    if (!isSession) {
      showSections(false);
    } else if (isLive() && spec.sessionId) {
      showSections(true);
      digest.replaceChildren(element("p", "empty", "Chargement…"));
      contextBox.replaceChildren();
      resumeBox.hidden = true;
      openAppLink.hidden = true;
      setNote("");
      loadDetails();
      detailsTimer = setInterval(loadDetails, DETAILS_POLL_MS);
    } else {
      showDemo(spec);
    }
  };

  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(resumeCode.textContent);
      copyButton.textContent = "Copié";
    } catch {
      copyButton.textContent = "Copie impossible";
    }
    setTimeout(() => {
      copyButton.textContent = "Copier";
    }, 1500);
  });
  document.getElementById("modal-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", stopPolling);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  return { open };
};
