const ROOM_ACTIONS = {
  acc: "Répondre à Claude.",
  open: "Aucune, Claude travaille.",
  bug: "Aucune, Claude corrige le bug.",
  rev: "Relire la MR.",
  mrg: "Merger la MR.",
  fix: "Corriger la CI ou résoudre le conflit.",
  arch: "Aucune.",
  pause: "Aucune, la conversation est terminée.",
  meet: "Aucune, les agents travaillent ensemble.",
};

const REVIEW_ACTION = "Lire la review de Claude.";
const DEFAULT_REST_MS = 2 * 60 * 60 * 1000;
const PAUSE_SEATS = 9;

const MEETING_MIN_AGENTS = 2;
const MAX_AGENTS_PER_SESSION = 8;
const DEFAULT_AGENT_MAX_AGE_MS = 30 * 60 * 1000;
const COMPACTING_MAX_AGE_MS = 2 * 60 * 1000;
const AGENT_NAME_LENGTH = 18;

const TINTS = [0x4d8ef0, 0xe58a2f, 0x39b085, 0xb06ad8, 0xd8627f, 0x3fb7c9, 0xc9a227, 0x7f8de8];
const NAME_LENGTH = 22;
const WHY_LENGTH = 220;
const MAX_SESSIONS = 24;

const hashString = (text) => [...text].reduce((total, character) => (total * 31 + character.charCodeAt(0)) >>> 0, 7);

const truncate = (text, maxLength) => (text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text);

export const classifyMergeRequest = (mergeRequest, byKey) => {
  if (mergeRequest.draft) return { room: "rev", reason: "MR marquée Draft : pas encore prête.", action: "Finir le brouillon." };
  const blockers = mergeRequest.blockedBy.map((key) => byKey.get(key)).filter(Boolean);
  if (blockers.length > 0) {
    const names = blockers.map((blocker) => `${blocker.repo} !${blocker.iid}`).join(", ");
    return { room: "rev", reason: `Dépend de ${names}, pas encore mergée.`, action: "Attendre le merge de la MR dont elle dépend." };
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

// Une discussion qui corrige un bug travaille dans la salle des bugs plutôt qu'à l'open space.
// Le titre et le nom de branche suffisent : le dernier message de Claude parle trop souvent de « fix » sans que ce soit le sujet.
const BUG_PATTERN = /(?<![a-z])(bugs?|bugfix(es)?|hotfix(es)?|fix(es|ed)?|debug(ger|ging)?|correctifs?|corrig[a-z]*|erreurs?|crash(es)?|regressions?|anomalies?|plantages?|defauts?|dysfonctionnements?)(?![a-z])/;

const stripAccents = (text) => text.normalize("NFD").replace(/\p{M}/gu, "");

export const isBugFix = (session) => BUG_PATTERN.test(stripAccents(`${session.title ?? ""} ${(session.branch ?? "").replace(/[/_-]+/g, " ")}`).toLowerCase());

// Une discussion terminée sans MR ni question fait une pause avant d'aller aux archives.
export const isResting = (session, { linkedMergeRequest, agentCount, now, restMs }) =>
  restMs > 0 && !linkedMergeRequest && agentCount === 0 && session.state === "idle" && !isReview(session) && now - session.updatedAt < restMs;

const sessionRoom = (session, linkedMergeRequest, classification, agentCount, resting) => {
  if (session.state === "needs_reply") return "acc";
  if (isReview(session)) return "rev";
  if (agentCount >= MEETING_MIN_AGENTS) return "meet";
  if (agentCount > 0 || session.state === "working") return isBugFix(session) ? "bug" : "open";
  if (linkedMergeRequest) return classification.room;
  return resting ? "pause" : "arch";
};

const sessionWhy = (session, linkedMergeRequest, classification, agentCount, resting) => {
  if (session.state === "needs_reply") {
    return session.lastMessage ? `Claude attend votre réponse : ${truncate(session.lastMessage, WHY_LENGTH)}` : "Claude attend votre réponse.";
  }
  if (isReview(session)) return session.state === "working" ? "Vous avez demandé une review : Claude la fait, la conversation est en relecture." : "Vous avez demandé une review : la conversation reste en relecture.";
  if (agentCount >= MEETING_MIN_AGENTS) return `Claude a lancé ${agentCount} agents : ils se réunissent en salle de réunion.`;
  if (agentCount > 0) return "Claude a lancé un agent et attend son résultat.";
  if (session.state === "working") return isBugFix(session) ? "Claude corrige un bug : la discussion travaille dans la salle des bugs." : "Claude travaille sur la tâche en cours.";
  if (linkedMergeRequest) return classification.reason;
  if (resting) return "Terminée, sans question ni MR : elle fait une pause avant de passer aux archives.";
  return "Aucune question en attente, aucune MR ouverte.";
};

export const isCompacting = (session, now) => Number(session.compactingSince) > 0 && now - session.compactingSince <= COMPACTING_MAX_AGE_MS;

const sessionName = (session) => truncate(session.title || session.cwd.split(/[\\/]/).pop() || "Session", NAME_LENGTH);

export const buildCharacters = ({ sessions, mergeRequests, now = Date.now(), agentMaxAgeMs = DEFAULT_AGENT_MAX_AGE_MS, restMs = DEFAULT_REST_MS }) => {
  const byKey = new Map(mergeRequests.map((mergeRequest) => [mergeRequest.key, mergeRequest]));
  const byBranch = new Map();
  mergeRequests.forEach((mergeRequest) => {
    if (!byBranch.has(mergeRequest.sourceBranch)) byBranch.set(mergeRequest.sourceBranch, mergeRequest);
  });

  const linkedKeys = new Set();
  const characters = [];

  const visibleSessions = sessions.filter((session) => session.activity !== "refresh");

  const contexts = visibleSessions.slice(0, MAX_SESSIONS).map((session) => {
    const linked = session.branch ? byBranch.get(session.branch) : undefined;
    return { session, linked, classification: linked ? classifyMergeRequest(linked, byKey) : null, agents: activeAgents(session, now, agentMaxAgeMs) };
  });

  // La zone Pause n'a que quelques places : les discussions terminées les plus récentes d'abord, les autres vont aux archives.
  const restingIds = new Set(
    contexts
      .filter(({ session, linked, agents }) => isResting(session, { linkedMergeRequest: linked, agentCount: agents.length, now, restMs }))
      .sort((first, second) => second.session.updatedAt - first.session.updatedAt)
      .slice(0, PAUSE_SEATS)
      .map(({ session }) => session.sessionId),
  );

  contexts.forEach(({ session, linked, classification, agents }) => {
    const resting = restingIds.has(session.sessionId);
    const room = sessionRoom(session, linked, classification, agents.length, resting);
    if (linked) linkedKeys.add(linked.key);
    const mergeRequestLine = linked ? describeMergeRequest(linked) : session.branch ? `Branche ${session.branch}` : "Aucune";
    characters.push({
      key: `s:${session.sessionId}`,
      sessionId: session.sessionId,
      kind: "robot",
      room,
      name: sessionName(session),
      title: session.title || sessionName(session),
      why: sessionWhy(session, linked, classification, agents.length, resting),
      mr: mergeRequestLine,
      action: room === "rev" && isReview(session) ? REVIEW_ACTION : ROOM_ACTIONS[room],
      url: linked?.url ?? "",
      tint: TINTS[hashString(session.sessionId) % TINTS.length],
      compacting: isCompacting(session, now),
      compactedAt: Number(session.compactedAt) || 0,
    });
    const agentRoom = room === "rev" && isReview(session) ? "rev" : agents.length >= MEETING_MIN_AGENTS ? "meet" : room === "bug" ? "bug" : "open";
    agents.forEach((agent, index) => {
      const label = agent.label || `Agent ${index + 1}`;
      characters.push({
        key: `a:${session.sessionId}:${agent.id}`,
        kind: "robot",
        agent: true,
        room: agentRoom,
        name: truncate(label, AGENT_NAME_LENGTH),
        title: `Agent : ${label}`,
        why: `Agent lancé par « ${sessionName(session)} »${agentRoom === "meet" ? ", en réunion avec les autres agents" : agentRoom === "rev" ? ", pour la review" : agentRoom === "bug" ? ", pour corriger le bug" : ""}.`,
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
      action: classification.action ?? ROOM_ACTIONS[classification.room],
      draft: Boolean(mergeRequest.draft),
      url: mergeRequest.url,
      tint: 0,
    });
  });

  return characters;
};
