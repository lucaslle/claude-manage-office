const ROOM_ACTIONS = {
  acc: "Répondre à Claude.",
  open: "Aucune, Claude travaille.",
  rev: "Relire la MR.",
  mrg: "Merger la MR.",
  wait: "Attendre la MR dont elle dépend.",
  draft: "Finir le brouillon.",
  fix: "Corriger la CI ou résoudre le conflit.",
  arch: "Aucune.",
};

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

const sessionRoom = (session, linkedMergeRequest, classification) => {
  if (session.state === "needs_reply") return "acc";
  if (session.state === "working") return "open";
  return linkedMergeRequest ? classification.room : "arch";
};

const sessionWhy = (session, linkedMergeRequest, classification) => {
  if (session.state === "needs_reply") {
    return session.lastMessage ? `Claude attend votre réponse : ${truncate(session.lastMessage, WHY_LENGTH)}` : "Claude attend votre réponse.";
  }
  if (session.state === "working") return "Claude travaille sur la tâche en cours.";
  if (linkedMergeRequest) return classification.reason;
  return "Aucune question en attente, aucune MR ouverte.";
};

const sessionName = (session) => truncate(session.title || session.cwd.split(/[\\/]/).pop() || "Session", NAME_LENGTH);

export const buildCharacters = ({ sessions, mergeRequests }) => {
  const byKey = new Map(mergeRequests.map((mergeRequest) => [mergeRequest.key, mergeRequest]));
  const byBranch = new Map();
  mergeRequests.forEach((mergeRequest) => {
    if (!byBranch.has(mergeRequest.sourceBranch)) byBranch.set(mergeRequest.sourceBranch, mergeRequest);
  });

  const linkedKeys = new Set();
  const characters = [];

  sessions.slice(0, MAX_SESSIONS).forEach((session) => {
    const linked = session.branch ? byBranch.get(session.branch) : undefined;
    const classification = linked ? classifyMergeRequest(linked, byKey) : null;
    const room = sessionRoom(session, linked, classification);
    if (linked) linkedKeys.add(linked.key);
    characters.push({
      key: `s:${session.sessionId}`,
      kind: "robot",
      room,
      name: sessionName(session),
      title: session.title || sessionName(session),
      why: sessionWhy(session, linked, classification),
      mr: linked ? describeMergeRequest(linked) : session.branch ? `Branche ${session.branch}` : "Aucune",
      action: ROOM_ACTIONS[room],
      url: linked?.url ?? "",
      tint: TINTS[hashString(session.sessionId) % TINTS.length],
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
