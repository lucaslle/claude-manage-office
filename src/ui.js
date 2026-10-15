import { EVENTS, ROOM_NAMES, ROOM_ACTIONS, DEMO_SOURCES, buildDemoConnectors, buildDemoUsage } from "./data.js";

const DEMO_INTERVAL_MS = 6500;
const DEMO_START_DELAY_MS = 2500;
const LOG_LIMIT = 5;
const EMPTY_HINT = "Installez les hooks Claude Code (npm run hooks:install) et renseignez GITLAB_TOKEN dans .env.";
const DEMO_AGENT_TINTS = [0x4d8ef0, 0xe58a2f, 0x39b085, 0xb06ad8, 0xd8627f, 0x3fb7c9];

const cloneSpecs = (specs) => specs.map((spec) => ({ ...spec }));

export const createUi = ({ crowd, demoSpecs, onOverflow, usagePanel, connectorsPanel, hud }) => {
  const panelTitle = document.getElementById("panel-title");
  const panelRoom = document.getElementById("panel-room");
  const panelWhy = document.getElementById("panel-why");
  const panelMr = document.getElementById("panel-mr");
  const panelAction = document.getElementById("panel-action");
  const panelLink = document.getElementById("panel-link");
  const eventsContainer = document.getElementById("events");
  const eventsPanel = document.getElementById("events-panel");
  const logList = document.getElementById("log");
  const demoToggle = document.getElementById("demo-toggle");
  const demoState = document.getElementById("demo-state");
  const demoControls = document.getElementById("demo-controls");
  const sourceStatus = document.getElementById("source-status");
  const sourcePill = document.getElementById("source-pill");

  let selectedKey = null;
  let demoTimer = null;
  let demoStep = 0;
  let demoRunning = false;
  let liveMode = false;
  let currentDemoSpecs = cloneSpecs(demoSpecs);

  const log = (message) => {
    const item = document.createElement("li");
    item.textContent = message;
    logList.prepend(item);
    while (logList.children.length > LOG_LIMIT) logList.lastElementChild.remove();
  };

  const roomLabel = (state) => {
    if (state.gone) return "Parti (mergé)";
    if (state.walking && state.target) return `En route vers ${ROOM_NAMES[state.target]}`;
    if (state.walking) return "En route vers la sortie";
    return ROOM_NAMES[state.room];
  };

  const showEmptyPanel = () => {
    panelTitle.textContent = "Aucun personnage pour l'instant";
    panelRoom.textContent = "—";
    panelWhy.textContent = EMPTY_HINT;
    panelMr.textContent = "—";
    panelAction.textContent = "—";
    panelLink.hidden = true;
  };

  const refreshPanel = () => {
    const state = selectedKey ? crowd.describe(selectedKey) : null;
    if (!state) {
      showEmptyPanel();
      return;
    }
    const spec = state.spec;
    panelTitle.textContent = spec.title;
    panelRoom.textContent = roomLabel(state);
    panelWhy.textContent = state.moved && state.note ? state.note : spec.why;
    panelMr.textContent = spec.mr;
    if (state.gone) panelAction.textContent = "Aucune, la MR est mergée.";
    else if (!state.moved) panelAction.textContent = spec.action;
    else panelAction.textContent = ROOM_ACTIONS[state.target ?? state.room] ?? spec.action;
    panelLink.hidden = !spec.url;
    if (spec.url) panelLink.href = spec.url;
  };

  const select = (key) => {
    selectedKey = key;
    crowd.setSelected(key);
    refreshPanel();
  };

  const applyDemoSpecs = (mergedKeys = []) => {
    const { overflow } = crowd.sync(currentDemoSpecs, { mergedKeys });
    onOverflow?.(overflow);
    hud.update(currentDemoSpecs);
  };

  const agentKeyPrefix = (parentKey) => `demo-agent:${parentKey}:`;

  const demoActions = {
    move: (eventDefinition, spec) => {
      spec.room = eventDefinition.room;
      spec.why = eventDefinition.note;
      spec.action = ROOM_ACTIONS[eventDefinition.room];
      applyDemoSpecs();
    },
    exit: (eventDefinition) => {
      currentDemoSpecs = currentDemoSpecs.filter((candidate) => candidate.key !== eventDefinition.key);
      applyDemoSpecs([eventDefinition.key]);
    },
    agents: (eventDefinition, spec) => {
      spec.room = "meet";
      spec.why = eventDefinition.note;
      spec.action = ROOM_ACTIONS.meet;
      eventDefinition.agents.forEach((label, index) => {
        currentDemoSpecs.push({
          key: `${agentKeyPrefix(spec.key)}${index}`,
          kind: "robot",
          agent: true,
          room: "meet",
          name: label,
          title: `Agent : ${label}`,
          why: `Agent lancé par « ${spec.name} », en réunion avec les autres agents.`,
          mr: spec.mr,
          action: ROOM_ACTIONS.meet,
          url: "",
          tint: DEMO_AGENT_TINTS[(index + 1) % DEMO_AGENT_TINTS.length],
        });
      });
      applyDemoSpecs();
    },
    "agents-done": (eventDefinition, spec) => {
      currentDemoSpecs = currentDemoSpecs.filter((candidate) => !candidate.key.startsWith(agentKeyPrefix(spec.key)));
      spec.room = eventDefinition.room;
      spec.why = eventDefinition.note;
      spec.action = ROOM_ACTIONS[eventDefinition.room];
      applyDemoSpecs();
    },
  };

  const runEvent = (eventDefinition) => {
    const spec = currentDemoSpecs.find((candidate) => candidate.key === eventDefinition.key);
    if (!spec) {
      log("Ce personnage n'est plus dans la scène.");
      return;
    }
    demoActions[eventDefinition.type](eventDefinition, spec);
    log(eventDefinition.log);
    select(eventDefinition.key);
  };

  const resetDemo = () => {
    currentDemoSpecs = cloneSpecs(demoSpecs);
    crowd.clear();
    crowd.sync(currentDemoSpecs, { immediate: true });
    onOverflow?.({});
    hud.update(currentDemoSpecs);
    demoStep = 0;
    if (!crowd.describe(selectedKey)) select(demoSpecs[0].key);
    else refreshPanel();
  };

  const stopDemo = () => {
    demoRunning = false;
    clearInterval(demoTimer);
    demoToggle.textContent = "Reprendre la démo";
    demoState.textContent = "Démo en pause";
  };

  const demoTick = () => {
    if (demoStep < EVENTS.length) {
      runEvent(EVENTS[demoStep]);
      demoStep += 1;
    } else {
      resetDemo();
      log("Retour à la situation de départ.");
    }
  };

  const startDemo = () => {
    demoRunning = true;
    demoToggle.textContent = "Pause";
    demoState.textContent = "Démo automatique en cours";
    clearInterval(demoTimer);
    demoTimer = setInterval(demoTick, DEMO_INTERVAL_MS);
  };

  EVENTS.forEach((eventDefinition) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button";
    button.textContent = eventDefinition.label;
    button.addEventListener("click", () => {
      stopDemo();
      runEvent(eventDefinition);
    });
    eventsContainer.append(button);
  });

  demoToggle.addEventListener("click", () => {
    if (demoRunning) {
      stopDemo();
    } else {
      startDemo();
      demoTick();
    }
  });

  document.getElementById("reset-all").addEventListener("click", () => {
    stopDemo();
    resetDemo();
    log("Retour à la situation de départ.");
  });

  const setSourceStatus = (text, warning) => {
    sourceStatus.textContent = text;
    sourcePill.classList.toggle("status-pill--warn", warning);
  };

  const enterDemoMode = () => {
    liveMode = false;
    demoControls.hidden = false;
    eventsPanel.hidden = false;
    setSourceStatus("Mode démo : serveur local non joignable (npm run live)", true);
    usagePanel.render(buildDemoUsage());
    connectorsPanel.render({ snapshot: buildDemoConnectors(), sources: DEMO_SOURCES, demo: true });
    hud.update(currentDemoSpecs);
    crowd.sync(currentDemoSpecs, { immediate: true });
    select(demoSpecs[0].key);
    log("Situation de départ : 3 conversations attendent votre réponse.");
    setTimeout(() => {
      if (!liveMode && !demoRunning && demoStep === 0) startDemo();
    }, DEMO_START_DELAY_MS);
  };

  const describeSources = (sources) => {
    const parts = [`${sources.sessions.count} session(s)`];
    if (sources.gitlab.state === "ok") parts.push(`${sources.gitlab.mergeRequests} MR`);
    return `En direct · ${parts.join(" · ")}`;
  };

  const applyLiveState = (state) => {
    const { overflow } = crowd.sync(state.characters, { mergedKeys: state.mergedKeys });
    onOverflow?.(overflow);
    hud.update(state.characters);
    usagePanel.render(state.usage ?? null);
    connectorsPanel.render({ snapshot: state.connectors ?? null, sources: state.sources });
    const gitlab = state.sources.gitlab;
    const problem = gitlab.state === "ok" || gitlab.state === "pending" ? "" : gitlab.message;
    setSourceStatus(problem ? `${describeSources(state.sources)} · ${problem}` : describeSources(state.sources), Boolean(problem));
    if (!selectedKey || !crowd.describe(selectedKey)) select(crowd.keys()[0] ?? null);
    else refreshPanel();
  };

  const enterLiveMode = (initialState) => {
    liveMode = true;
    stopDemo();
    demoControls.hidden = true;
    eventsPanel.hidden = true;
    log("Connecté aux sessions Claude et à GitLab.");
    applyLiveState(initialState);
  };

  const markLiveLost = () => setSourceStatus("Connexion au serveur local perdue, nouvelle tentative…", true);

  return { select, refreshPanel, enterDemoMode, enterLiveMode, applyLiveState, markLiveLost, log, isLive: () => liveMode };
};
