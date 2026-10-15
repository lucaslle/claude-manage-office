const ROOM_ACTIONS = {
  acc: "Répondre à Claude.",
  open: "Aucune, Claude travaille.",
  rev: "Relire la MR.",
  mrg: "Merger la MR.",
  wait: "Attendre la MR dont elle dépend.",
  draft: "Finir le brouillon.",
  fix: "Corriger la CI ou résoudre le conflit.",
  arch: "Aucune.",
  meet: "Aucune, les agents travaillent ensemble.",
};

const REVIEW_ACTION = "Lire la review de Claude.";

const MEETING_MIN_AGENTS = 2;
const MAX_AGENTS_PER_SESSION = 8;
const DEFAULT_AGENT_MAX_AGE_MS = 30 * 60 * 1000;
const AGENT_NAME_LENGTH = 18;

const TINTS = [0x4d8ef0, 0xe58a2f, 0x39b085, 0xb06ad8, 0xd8627f, 0x3fb7c9, 0xc9a227, 0x7f8de8];
const NAME_LENGTH = 22;
const WHY_LENGTH = 220;
const MAX_SESSIONS = 24;

const hashString = (text) => [...text].reduce((total, character) => (total * 31 + character.charCodeAt(0)) >>> 0, 7);

const truncate = (text, maxLength) => (text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text);

export const classifyMergeRequest = (mergeRequest, byKey) => {
  if (mergeRequest.draft) return { room: "draft", reason: "MR marquée Draft." };
  const blockers = mergeRequest.blockedBy.map((key) => byKey.get(key)).filter(Boolean);
  if (blockers.length > 0) {
    const names = blockers.map((blocker) => `${blocker.repo} !${blocker.iid}`).join(", ");
    return { room: "wait", reason: `Dépend de ${names}, pas encore mergée.` };
  }
  if (mergeRequest.hasConflicts || mergeRequest.status === "conflict") return { room: "fix", reason: "Conflit avec la branche cible." };
  if (mergeRequest.status === "need_rebase") return { room: "fix", reason: "La branche doit être rebasée." };
  if (mergeRequest.status === "ci_must_pass" || mergeRequest.status === "broken_status") return { room: "fix", reason: "Le pipeline a échoué." };
  if (mergeRequest.status === "mergeable") return { room: "mrg", reason: "Prête à merger : aucun blocage." };
  if (mergeRequest.status === "ci_still_running") return { room: "rev", reason: "Pipeline en cours, à relire en attendant." };
  if (mergeRequest.status === "discussions_not_resolved") return { room: "rev", reason: "Des fils de discussion restent ouverts." };
  if (mergeRequest.status === "requested_changes") return { room: "rev", reason: "Des modifications ont été demandées." };
  if (mergeRequest.status === "not_approved") return { room: "rev", reason: "En attente d'approbation." };
  return { room: "rev", reason: "En attente de relecture." };
};

const describeMergeRequest = (mergeRequest) => `${mergeRequest.repo} !${mergeRequest.iid} vers ${mergeRequest.targetBranch}`;

export const activeAgents = (session, now, maxAgeMs = DEFAULT_AGENT_MAX_AGE_MS) =>
  (Array.isArray(session.subagents) ? session.subagents : []).filter((agent) => now - agent.startedAt <= maxAgeMs).slice(0, MAX_AGENTS_PER_SESSION);

const isReview = (session) => session.activity === "review";

const sessionRoom = (session, linkedMergeRequest, classification, agentCount) => {
  if (session.state === "needs_reply") return "acc";
  if (isReview(session)) return "rev";
  if (agentCount >= MEETING_MIN_AGENTS) return "meet";
  if (agentCount > 0 || session.state === "working") return "open";
  return linkedMergeRequest ? classification.room : "arch";
};

const sessionWhy = (session, linkedMergeRequest, classification, agentCount) => {
  if (session.state === "needs_reply") {
    return session.lastMessage ? `Claude attend votre réponse : ${truncate(session.lastMessage, WHY_LENGTH)}` : "Claude attend votre réponse.";
  }
  if (isReview(session)) return session.state === "working" ? "Vous avez demandé une review : Claude la fait, la conversation est en relecture." : "Vous avez demandé une review : la conversation reste en relecture.";
  if (agentCount >= MEETING_MIN_AGENTS) return `Claude a lancé ${agentCount} agents : ils se réunissent en salle de réunion.`;
  if (agentCount > 0) return "Claude a lancé un agent et attend son résultat.";
  if (session.state === "working") return "Claude travaille sur la tâche en cours.";
  if (linkedMergeRequest) return classification.reason;
  return "Aucune question en attente, aucune MR ouverte.";
};

const sessionName = (session) => truncate(session.title || session.cwd.split(/[\\/]/).pop() || "Session", NAME_LENGTH);

export const buildCharacters = ({ sessions, mergeRequests, now = Date.now(), agentMaxAgeMs = DEFAULT_AGENT_MAX_AGE_MS }) => {
  const byKey = new Map(mergeRequests.map((mergeRequest) => [mergeRequest.key, mergeRequest]));
  const byBranch = new Map();
  mergeRequests.forEach((mergeRequest) => {
    if (!byBranch.has(mergeRequest.sourceBranch)) byBranch.set(mergeRequest.sourceBranch, mergeRequest);
  });

  const linkedKeys = new Set();
  const characters = [];

  const visibleSessions = sessions.filter((session) => session.activity !== "refresh");

  visibleSessions.slice(0, MAX_SESSIONS).forEach((session) => {
    const linked = session.branch ? byBranch.get(session.branch) : undefined;
    const classification = linked ? classifyMergeRequest(linked, byKey) : null;
    const agents = activeAgents(session, now, agentMaxAgeMs);
    const room = sessionRoom(session, linked, classification, agents.length);
    if (linked) linkedKeys.add(linked.key);
    const mergeRequestLine = linked ? describeMergeRequest(linked) : session.branch ? `Branche ${session.branch}` : "Aucune";
    characters.push({
      key: `s:${session.sessionId}`,
      sessionId: session.sessionId,
      kind: "robot",
      room,
      name: sessionName(session),
      title: session.title || sessionName(session),
      why: sessionWhy(session, linked, classification, agents.length),
      mr: mergeRequestLine,
      action: room === "rev" && isReview(session) ? REVIEW_ACTION : ROOM_ACTIONS[room],
      url: linked?.url ?? "",
      tint: TINTS[hashString(session.sessionId) % TINTS.length],
    });
    const agentRoom = room === "rev" && isReview(session) ? "rev" : agents.length >= MEETING_MIN_AGENTS ? "meet" : "open";
    agents.forEach((agent, index) => {
      const label = agent.label || `Agent ${index + 1}`;
      characters.push({
        key: `a:${session.sessionId}:${agent.id}`,
        kind: "robot",
        agent: true,
        room: agentRoom,
        name: truncate(label, AGENT_NAME_LENGTH),
        title: `Agent : ${label}`,
        why: `Agent lancé par « ${sessionName(session)} »${agentRoom === "meet" ? ", en réunion avec les autres agents" : agentRoom === "rev" ? ", pour la review" : ""}.`,
        mr: mergeRequestLine,
        action: agentRoom === "rev" ? REVIEW_ACTION : ROOM_ACTIONS[agentRoom],
        url: "",
        tint: TINTS[hashString(`${session.sessionId}${agent.id}`) % TINTS.length],
      });
    });
  });

  mergeRequests.forEach((mergeRequest) => {
    if (linkedKeys.has(mergeRequest.key)) return;
    const classification = classifyMergeRequest(mergeRequest, byKey);
    characters.push({
      key: mergeRequest.key,
      kind: "mr",
      room: classification.room,
      name: `${mergeRequest.repo} !${mergeRequest.iid}`,
      title: mergeRequest.title,
      why: classification.reason,
      mr: describeMergeRequest(mergeRequest),
      action: ROOM_ACTIONS[classification.room],
      url: mergeRequest.url,
      tint: 0,
    });
  });

  return characters;
};
