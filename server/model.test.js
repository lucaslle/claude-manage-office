import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { attachDependencies } from "./gitlab.js";
import { buildCharacters, classifyMergeRequest } from "./model.js";

const makeMergeRequest = (overrides) => ({
  key: `m:${overrides.projectId}:${overrides.iid}`,
  id: overrides.iid,
  projectId: 1,
  projectPath: "group/app/repo",
  repo: "repo",
  title: "Titre",
  description: "",
  url: "https://gitlab.example/mr",
  sourceBranch: "feature",
  targetBranch: "develop",
  draft: false,
  status: "not_approved",
  hasConflicts: false,
  blockedBy: [],
  ...overrides,
});

const makeSession = (overrides) => ({
  sessionId: "abc",
  cwd: "C:\\src\\app",
  branch: "",
  title: "Une session",
  state: "idle",
  lastMessage: "",
  updatedAt: Date.now(),
  ...overrides,
});

describe("attachDependencies", () => {
  const back = makeMergeRequest({ projectId: 10, iid: 75, repo: "planning-api", description: "Merge before planning-web!111." });
  const front = makeMergeRequest({ projectId: 11, iid: 111, repo: "planning-web", description: "Depends on planning-api!75 (403 on an unmanaged collaborator): merge after it." });

  it("relie un front à son back quand le front nomme sa dépendance", () => {
    const frontOnly = makeMergeRequest({ ...front });
    attachDependencies([back, frontOnly]);
    assert.deepEqual(frontOnly.blockedBy, [back.key]);
  });

  it("relie un front à son back quand le back nomme le front", () => {
    const backOnly = makeMergeRequest({ ...back, description: "Merge before planning-web!111." });
    const frontPlain = makeMergeRequest({ ...front, description: "" });
    attachDependencies([backOnly, frontPlain]);
    assert.deepEqual(frontPlain.blockedBy, [backOnly.key]);
  });

  it("comprend la formulation « Dépend de la MR back nom!N »", () => {
    const ordersApi = makeMergeRequest({ projectId: 20, iid: 261, repo: "orders-api" });
    const ordersWeb = makeMergeRequest({ projectId: 21, iid: 11, repo: "orders-web", description: "Dépend de la MR back orders-api!261: ne pas merger avant." });
    attachDependencies([ordersApi, ordersWeb]);
    assert.deepEqual(ordersWeb.blockedBy, [ordersApi.key]);
  });

  it("ignore une référence vers une MR qui n'est pas ouverte", () => {
    const alone = makeMergeRequest({ projectId: 30, iid: 5, description: "Depends on ghost-repo!99." });
    attachDependencies([alone]);
    assert.deepEqual(alone.blockedBy, []);
  });
});

describe("classifyMergeRequest", () => {
  const classify = (overrides, others = []) => {
    const subject = makeMergeRequest({ projectId: 1, iid: 1, ...overrides });
    return classifyMergeRequest(subject, new Map([subject, ...others].map((entry) => [entry.key, entry]))).room;
  };

  it("place un brouillon en relecture, même bloqué", () => {
    assert.equal(classify({ draft: true }), "rev");
  });

  it("place une MR bloquée par une MR ouverte en relecture, avec la raison", () => {
    const blocker = makeMergeRequest({ projectId: 2, iid: 2 });
    assert.equal(classify({ blockedBy: [blocker.key] }, [blocker]), "rev");
  });

  it("envoie un pipeline échoué ou un conflit à l'atelier", () => {
    assert.equal(classify({ status: "ci_must_pass" }), "fix");
    assert.equal(classify({ status: "conflict" }), "fix");
    assert.equal(classify({ hasConflicts: true }), "fix");
  });

  it("envoie une MR mergeable en salle de merge", () => {
    assert.equal(classify({ status: "mergeable" }), "mrg");
  });

  it("garde en relecture une MR qui attend une approbation ou un pipeline", () => {
    assert.equal(classify({ status: "not_approved" }), "rev");
    assert.equal(classify({ status: "ci_still_running" }), "rev");
  });
});

describe("agents", () => {
  const now = 1_000_000_000;
  const agent = (id, ageMs = 1000) => ({ id, label: `Agent ${id}`, startedAt: now - ageMs });

  it("envoie la session et ses agents en salle de réunion quand il y en a plusieurs", () => {
    const session = makeSession({ state: "working", subagents: [agent("a"), agent("b"), agent("c")] });
    const characters = buildCharacters({ sessions: [session], mergeRequests: [], now });
    assert.deepEqual(
      characters.map((character) => [character.agent === true, character.room]),
      [[false, "meet"], [true, "meet"], [true, "meet"], [true, "meet"]],
    );
  });

  it("n'archive jamais une session au repos tant que des agents travaillent", () => {
    const session = makeSession({ state: "idle", subagents: [agent("a"), agent("b")] });
    const [parent] = buildCharacters({ sessions: [session], mergeRequests: [], now });
    assert.equal(parent.room, "meet");
  });

  it("garde une session au repos avec un seul agent à l'open space, pas aux archives", () => {
    const session = makeSession({ state: "idle", subagents: [agent("a")] });
    const characters = buildCharacters({ sessions: [session], mergeRequests: [], now });
    assert.deepEqual(characters.map((character) => character.room), ["open", "open"]);
  });

  it("laisse l'accueil prioritaire quand la session attend une réponse", () => {
    const session = makeSession({ state: "needs_reply", subagents: [agent("a"), agent("b")] });
    const characters = buildCharacters({ sessions: [session], mergeRequests: [], now });
    assert.deepEqual(characters.map((character) => character.room), ["acc", "meet", "meet"]);
  });

  it("ignore les agents trop anciens et archive de nouveau la session", () => {
    const session = makeSession({ state: "idle", updatedAt: now - 3 * 3600 * 1000, subagents: [agent("a", 31 * 60 * 1000), agent("b", 40 * 60 * 1000)] });
    const characters = buildCharacters({ sessions: [session], mergeRequests: [], now });
    assert.deepEqual(characters.map((character) => character.room), ["arch"]);
  });
});

describe("discussion terminée", () => {
  const now = 1_000_000_000;
  const HOUR = 3600 * 1000;
  const build = (session, extra = {}) => buildCharacters({ sessions: [session], mergeRequests: [], now, ...extra })[0];

  it("fait une pause dans la zone Pause pendant le délai de repos", () => {
    const character = build(makeSession({ state: "idle", updatedAt: now - 30 * 60 * 1000 }));
    assert.equal(character.room, "pause");
    assert.equal(character.action, "Aucune, la conversation est terminée.");
    assert.match(character.why, /pause avant de passer aux archives/);
  });

  it("passe aux archives une fois le délai écoulé", () => {
    assert.equal(build(makeSession({ state: "idle", updatedAt: now - 3 * HOUR })).room, "arch");
  });

  it("respecte un délai de repos personnalisé, et un délai nul remet l'ancien comportement", () => {
    const session = makeSession({ state: "idle", updatedAt: now - 30 * 60 * 1000 });
    assert.equal(build(session, { restMs: 10 * 60 * 1000 }).room, "arch");
    assert.equal(build(session, { restMs: 0 }).room, "arch");
  });

  it("n'a que six places : les plus récentes d'abord, les autres vont aux archives, et l'open space reste libre", () => {
    const minutes = (count) => now - count * 60 * 1000;
    const sessions = [
      makeSession({ sessionId: "w1", state: "working", updatedAt: now }),
      ...[50, 5, 30, 10, 20, 40, 15, 25, 60].map((age) => makeSession({ sessionId: `t${age}`, state: "idle", updatedAt: minutes(age) })),
    ];
    const rooms = Object.fromEntries(buildCharacters({ sessions, mergeRequests: [], now }).map((character) => [character.sessionId, character.room]));
    assert.deepEqual(rooms, { w1: "open", t5: "pause", t10: "pause", t15: "pause", t20: "pause", t25: "pause", t30: "pause", t40: "arch", t50: "arch", t60: "arch" });
  });

  it("ne met pas en pause une discussion qui travaille, a une MR, une review ou une question", () => {
    const fresh = { updatedAt: now - 60 * 1000 };
    assert.equal(build(makeSession({ ...fresh, state: "working" })).room, "open");
    assert.equal(build(makeSession({ ...fresh, state: "idle", activity: "review" })).room, "rev");
    assert.equal(build(makeSession({ ...fresh, state: "needs_reply" })).room, "acc");
    const withMergeRequest = buildCharacters({ sessions: [makeSession({ ...fresh, state: "idle", branch: "claude/fix" })], mergeRequests: [makeMergeRequest({ projectId: 1, iid: 9, status: "mergeable", sourceBranch: "claude/fix" })], now })[0];
    assert.equal(withMergeRequest.room, "mrg");
  });
});

describe("conversation de review", () => {
  const now = 1_000_000_000;
  const agent = (id) => ({ id, label: `Agent ${id}`, startedAt: now - 1000 });

  it("envoie en relecture une conversation où vous faites une review", () => {
    const [working] = buildCharacters({ sessions: [makeSession({ state: "working", activity: "review" })], mergeRequests: [], now });
    const [idle] = buildCharacters({ sessions: [makeSession({ state: "idle", activity: "review" })], mergeRequests: [], now });
    assert.equal(working.room, "rev");
    assert.equal(idle.room, "rev");
    assert.equal(working.action, "Lire la review de Claude.");
    assert.match(working.why, /review/);
  });

  it("emmène les agents de la review avec elle, sans passer par la salle de réunion", () => {
    const session = makeSession({ state: "working", activity: "review", subagents: [agent("a"), agent("b")] });
    const characters = buildCharacters({ sessions: [session], mergeRequests: [], now });
    assert.deepEqual(characters.map((character) => character.room), ["rev", "rev", "rev"]);
  });

  it("laisse l'accueil prioritaire quand la review pose une question", () => {
    const [character] = buildCharacters({ sessions: [makeSession({ state: "needs_reply", activity: "review" })], mergeRequests: [], now });
    assert.equal(character.room, "acc");
  });

  it("masque la session qui rafraîchit l'usage et les connecteurs", () => {
    const sessions = [makeSession({ sessionId: "r", state: "working", activity: "refresh" }), makeSession({ sessionId: "v", state: "working" })];
    assert.deepEqual(buildCharacters({ sessions, mergeRequests: [], now }).map((character) => character.sessionId), ["v"]);
  });

  it("ne change rien pour une conversation sans review", () => {
    const [character] = buildCharacters({ sessions: [makeSession({ state: "working", activity: "" })], mergeRequests: [], now });
    assert.equal(character.room, "open");
  });
});

describe("buildCharacters", () => {
  it("met à l'accueil une session qui attend une réponse, même si sa MR est prête", () => {
    const mergeRequest = makeMergeRequest({ projectId: 1, iid: 1766, status: "mergeable", sourceBranch: "041-filter" });
    const session = makeSession({ state: "needs_reply", branch: "041-filter", lastMessage: "Je ferme la MR ?" });
    const characters = buildCharacters({ sessions: [session], mergeRequests: [mergeRequest] });
    assert.equal(characters.length, 1);
    assert.equal(characters[0].room, "acc");
    assert.equal(characters[0].kind, "robot");
  });

  it("suit la MR liée quand la session est au repos", () => {
    const mergeRequest = makeMergeRequest({ projectId: 1, iid: 114, status: "mergeable", sourceBranch: "claude/fix" });
    const session = makeSession({ state: "idle", branch: "claude/fix" });
    const [character] = buildCharacters({ sessions: [session], mergeRequests: [mergeRequest] });
    assert.equal(character.room, "mrg");
  });

  it("archive une session au repos sans MR une fois le délai de repos écoulé", () => {
    const [character] = buildCharacters({ sessions: [makeSession({ state: "idle", updatedAt: Date.now() - 3 * 3600 * 1000 })], mergeRequests: [] });
    assert.equal(character.room, "arch");
  });

  it("ajoute un personnage MR pour chaque MR sans session", () => {
    const mergeRequest = makeMergeRequest({ projectId: 1, iid: 7, draft: true });
    const characters = buildCharacters({ sessions: [], mergeRequests: [mergeRequest] });
    assert.deepEqual(
      characters.map((character) => [character.kind, character.room]),
      [["mr", "rev"]],
    );
  });
});

describe("compactage", () => {
  const now = 1_000_000_000;

  it("publie un compactage en cours seulement s'il est récent, et la date du dernier compactage", () => {
    const [fresh] = buildCharacters({ sessions: [makeSession({ compactingSince: now - 5000, compactedAt: now - 60000 })], mergeRequests: [], now });
    assert.equal(fresh.compacting, true);
    assert.equal(fresh.compactedAt, now - 60000);
    const [stale] = buildCharacters({ sessions: [makeSession({ compactingSince: now - 10 * 60 * 1000 })], mergeRequests: [], now });
    assert.equal(stale.compacting, false);
    assert.equal(stale.compactedAt, 0);
  });
});

describe("salle des bugs", () => {
  const now = 1_000_000_000;
  const agent = (id) => ({ id, label: `Agent ${id}`, startedAt: now - 1000 });
  const room = (overrides) => buildCharacters({ sessions: [makeSession({ updatedAt: now, ...overrides })], mergeRequests: [], now })[0].room;

  it("envoie à la salle des bugs une discussion de correction qui travaille", () => {
    assert.equal(room({ state: "working", title: "Corriger le bug de connexion" }), "bug");
    assert.equal(room({ state: "working", title: "Crash au démarrage" }), "bug");
    assert.equal(room({ state: "working", title: "Régression sur le portail" }), "bug");
  });

  it("reconnaît un fix d'après le nom de branche", () => {
    assert.equal(room({ state: "working", branch: "fix/login-page" }), "bug");
    assert.equal(room({ state: "working", branch: "bugfix_PRJ-12" }), "bug");
  });

  it("laisse à l'open space une discussion qui ne parle pas de bug", () => {
    assert.equal(room({ state: "working", title: "Migration de l'API" }), "open");
    assert.equal(room({ state: "working", title: "Ajouter un prefix aux routes" }), "open");
  });

  it("garde l'accueil prioritaire quand le fix pose une question", () => {
    assert.equal(room({ state: "needs_reply", title: "Fix du bug de login" }), "acc");
  });

  it("n'y garde pas une discussion de fix terminée", () => {
    assert.equal(room({ state: "idle", title: "Fix du bug de login" }), "pause");
  });

  it("garde un agent seul avec sa session dans la salle des bugs", () => {
    const session = makeSession({ state: "working", updatedAt: now, title: "Fix du bug de login", subagents: [agent("a")] });
    const characters = buildCharacters({ sessions: [session], mergeRequests: [], now });
    assert.deepEqual(characters.map((character) => character.room), ["bug", "bug"]);
  });

  it("préfère la salle de réunion quand plusieurs agents cherchent le bug", () => {
    const session = makeSession({ state: "working", updatedAt: now, title: "Fix du bug de login", subagents: [agent("a"), agent("b")] });
    assert.deepEqual(buildCharacters({ sessions: [session], mergeRequests: [], now }).map((character) => character.room), ["meet", "meet", "meet"]);
  });
});
