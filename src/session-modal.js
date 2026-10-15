import { element } from "./dom.js";
import { ROOM_NAMES } from "./data.js";
import { fetchSessionDetails } from "./api.js";

const DETAILS_POLL_MS = 4000;
const WARN_AT = 70;
const BAD_AT = 90;
const DEMO_NOTE = "Mode démo : exemple de contenu.";

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
  head.append(element("span", "meter__title", "Contexte de la conversation"), element("span", "meter__value", context ? `${context.percent} %` : "—"));
  const track = element("div", "meter__track");
  const fill = element("div", "meter__fill");
  fill.style.width = `${context ? context.percent : 0}%`;
  track.append(fill);
  const foot = element("div", "meter__foot", context ? `${formatTokens(context.tokens)} sur ${formatTokens(context.window)} (estimation d'après le dernier échange)` : "Pas encore d'échange mesuré");
  block.append(head, track, foot);
  return block;
};

const buildBubble = (message) => {
  const bubble = element("div", `bubble-chat bubble-chat--${message.role}`);
  const time = formatTime(message.timestamp);
  bubble.append(element("div", "bubble-chat__meta", `${message.role === "user" ? "Vous" : "Claude"}${time ? ` · ${time}` : ""}`), element("div", "bubble-chat__text", message.text));
  return bubble;
};

const buildFacts = (spec) => {
  const facts = element("dl", "facts");
  [
    ["Pourquoi ici", spec.why],
    ["Merge request", spec.mr],
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
  const chat = document.getElementById("modal-chat");
  const footer = document.getElementById("modal-footer");
  const note = document.getElementById("modal-note");
  const link = document.getElementById("modal-link");
  const resumeBox = document.getElementById("modal-resume");
  const resumeCode = document.getElementById("modal-command");
  const copyButton = document.getElementById("modal-copy");
  const openAppLink = document.getElementById("modal-open-app");

  let currentSpec = null;
  let detailsTimer = null;
  let lastMessageCount = 0;

  const setNote = (text, isError = false) => {
    note.textContent = text;
    note.classList.toggle("modal__note--error", isError);
  };

  const renderChat = (messages) => {
    const nearBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 80;
    chat.replaceChildren();
    if (messages.length === 0) chat.append(element("p", "empty", "Aucun message lisible pour cette session."));
    messages.forEach((message) => chat.append(buildBubble(message)));
    if (nearBottom || messages.length !== lastMessageCount) chat.scrollTop = chat.scrollHeight;
    lastMessageCount = messages.length;
  };

  const stopPolling = () => {
    clearInterval(detailsTimer);
    detailsTimer = null;
  };

  const applyDetails = (details) => {
    contextBox.replaceChildren(buildContext(details.context));
    renderChat(details.messages);
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
    chat.hidden = !visible;
    footer.hidden = !visible;
  };

  const showDemo = (spec) => {
    showSections(true);
    contextBox.replaceChildren(buildContext({ percent: 42, tokens: 420000, window: 1000000 }));
    renderChat([{ role: "assistant", text: spec.why, timestamp: null }]);
    resumeBox.hidden = true;
    openAppLink.hidden = true;
    setNote(DEMO_NOTE);
  };

  const open = ({ spec, room }) => {
    stopPolling();
    currentSpec = spec;
    lastMessageCount = 0;
    title.textContent = spec.title;
    badge.textContent = ROOM_NAMES[room] ?? "";
    factsBox.replaceChildren(buildFacts(spec));
    link.hidden = !spec.url;
    if (spec.url) link.href = spec.url;

    const isSession = spec.kind === "robot" && !spec.agent;
    if (!isSession) {
      showSections(false);
    } else if (isLive() && spec.sessionId) {
      showSections(true);
      chat.replaceChildren(element("p", "empty", "Chargement…"));
      contextBox.replaceChildren();
      resumeBox.hidden = true;
      openAppLink.hidden = true;
      setNote("");
      loadDetails();
      detailsTimer = setInterval(loadDetails, DETAILS_POLL_MS);
    } else {
      showDemo(spec);
    }
    if (!dialog.open) dialog.showModal();
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
