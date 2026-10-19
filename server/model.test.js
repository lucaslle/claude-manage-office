import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { attachDependencies } from "./gitlab.js";
import { buildCharacters, classifyMergeRequest, diagnoseMergeRequest } from "./model.js";

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

  it("place un brouillon dans sa salle, même bloqué, en conflit ou avec une CI rouge", () => {
    assert.equal(classify({ draft: true }), "draft");
    const blocker = makeMergeRequest({ projectId: 2, iid: 2 });
    assert.equal(classify({ draft: true, blockedBy: [blocker.key] }, [blocker]), "draft");
    ["ci_must_pass", "conflict", "need_rebase", "requested_changes"].forEach((status) => assert.equal(classify({ draft: true, status }), "draft", status));
    assert.equal(classify({ draft: true, hasConflicts: true, pipeline: { id: 1, status: "failed", failedJobs: [] } }), "draft");
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

  it("envoie à l'atelier tout ce que l'auteur doit corriger, même si la MR est bloquée", () => {
    ["need_rebase", "requested_changes", "discussions_not_resolved", "jira_association_missing", "locked_paths", "title_regex"].forEach((status) => assert.equal(classify({ status }), "fix", status));
    const blocker = makeMergeRequest({ projectId: 2, iid: 2 });
    assert.equal(classify({ status: "conflict", blockedBy: [blocker.key] }, [blocker]), "fix");
  });

  it("n'envoie pas à l'atelier une MR qui attend seulement quelqu'un d'autre", () => {
    ["not_approved", "ci_still_running", "checking", "unchecked", "blocked_status"].forEach((status) => assert.equal(classify({ status }), "rev", status));
  });

  it("garde en relecture une MR mergeable et la marque prête à merger", () => {
    const subject = makeMergeRequest({ projectId: 1, iid: 1, status: "mergeable" });
    const result = classifyMergeRequest(subject, new Map([[subject.key, subject]]));
    assert.equal(result.room, "rev");
    assert.equal(result.ready, true);
    assert.equal(result.action, "Merger la MR.");
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

  it("n'a que neuf places : les plus récentes d'abord, les autres vont aux archives, et l'open space reste libre", () => {
    const minutes = (count) => now - count * 60 * 1000;
    const sessions = [
      makeSession({ sessionId: "w1", state: "working", updatedAt: now }),
      ...[5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90, 100].map((age) => makeSession({ sessionId: `t${age}`, state: "idle", updatedAt: minutes(age) })),
    ];
    const rooms = Object.fromEntries(buildCharacters({ sessions, mergeRequests: [], now }).map((character) => [character.sessionId, character.room]));
    assert.deepEqual(rooms, { w1: "open", ...Object.fromEntries([5, 10, 15, 20, 25, 30, 35, 40, 45].map((age) => [`t${age}`, "pause"])), ...Object.fromEntries([50, 55, 60, 65, 70, 75, 80, 90, 100].map((age) => [`t${age}`, "arch"])) });
  });

  it("ne met pas en pause une discussion qui travaille, a une MR, une review ou une question", () => {
    const fresh = { updatedAt: now - 60 * 1000 };
    assert.equal(build(makeSession({ ...fresh, state: "working" })).room, "open");
    assert.equal(build(makeSession({ ...fresh, state: "idle", activity: "review" })).room, "rev");
    assert.equal(build(makeSession({ ...fresh, state: "needs_reply" })).room, "acc");
    const withMergeRequest = buildCharacters({ sessions: [makeSession({ ...fresh, state: "idle", branch: "claude/fix" })], mergeRequests: [makeMergeRequest({ projectId: 1, iid: 9, status: "mergeable", sourceBranch: "claude/fix" })], now })[0];
    assert.equal(withMergeRequest.room, "rev");
    assert.equal(withMergeRequest.ready, true);
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

describe("diagnoseMergeRequest", () => {
  it("nomme la cause : conflit, rebase, modifications, discussions", () => {
    assert.deepEqual(
      ["conflict", "need_rebase", "requested_changes", "discussions_not_resolved", "jira_association_missing"].map((status) => diagnoseMergeRequest(makeMergeRequest({ projectId: 1, iid: 1, status })).code),
      ["conflict", "rebase", "changes", "discussions", "blocked"],
    );
    assert.equal(diagnoseMergeRequest(makeMergeRequest({ projectId: 1, iid: 1, hasConflicts: true, status: "ci_must_pass" })).code, "conflict");
  });

  it("liste les jobs en échec quand le pipeline est connu", () => {
    const jobs = ["lint", "test", "build", "deploy", "e2e"].map((name) => ({ name, stage: "ci" }));
    const problem = diagnoseMergeRequest(makeMergeRequest({ projectId: 1, iid: 1, status: "ci_must_pass", pipeline: { id: 9, status: "failed", failedJobs: jobs } }));
    assert.equal(problem.reason, "Pipeline en échec : lint, test, build et 2 autres.");
    assert.equal(problem.action, "Corriger le job lint, puis relancer.");
    assert.equal(diagnoseMergeRequest(makeMergeRequest({ projectId: 1, iid: 1, status: "ci_must_pass", pipeline: { id: 9, status: "canceled", failedJobs: [] } })).label, "Pipeline annulé");
    assert.equal(diagnoseMergeRequest(makeMergeRequest({ projectId: 1, iid: 1, status: "ci_must_pass" })).reason, "Le pipeline a échoué.");
  });

  it("voit une CI rouge même quand GitLab laisse la MR mergeable", () => {
    const failed = { id: 9, status: "failed", failedJobs: [{ name: "phpunit", stage: "test" }] };
    assert.equal(diagnoseMergeRequest(makeMergeRequest({ projectId: 1, iid: 1, status: "mergeable", pipeline: failed })).reason, "Pipeline en échec : phpunit.");
    assert.equal(classifyMergeRequest(makeMergeRequest({ projectId: 1, iid: 1, status: "mergeable", pipeline: failed }), new Map()).room, "fix");
    assert.equal(diagnoseMergeRequest(makeMergeRequest({ projectId: 1, iid: 1, status: "mergeable", pipeline: { id: 10, status: "running", failedJobs: [] } })), null);
  });

  it("ne voit aucun problème dans une MR saine", () => {
    ["mergeable", "not_approved", "ci_still_running"].forEach((status) => assert.equal(diagnoseMergeRequest(makeMergeRequest({ projectId: 1, iid: 1, status })), null));
  });
});

describe("buildCharacters", () => {
  it("expose la cause du problème sur la MR et sur la session qui la suit", () => {
    const broken = makeMergeRequest({ projectId: 1, iid: 5, status: "conflict", sourceBranch: "claude/x" });
    const alone = makeMergeRequest({ projectId: 1, iid: 6, status: "need_rebase", sourceBranch: "autre" });
    const healthy = makeMergeRequest({ projectId: 1, iid: 7, status: "mergeable", sourceBranch: "sain" });
    const characters = buildCharacters({ sessions: [makeSession({ state: "idle", branch: "claude/x" })], mergeRequests: [broken, alone, healthy] });
    assert.deepEqual(characters.find((character) => character.kind === "robot").problem, { code: "conflict", label: "Conflit" });
    assert.deepEqual(characters.find((character) => character.key === alone.key).problem, { code: "rebase", label: "À rebaser" });
    assert.equal(characters.find((character) => character.key === healthy.key).problem, undefined);
  });

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
    assert.equal(character.room, "rev");
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
      [["mr", "draft"]],
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

describe("fonctionnalités Spec Kit", () => {
  const now = 1_000_000_000;
  const feature = (overrides = {}) => ({ name: "041-filtre", done: 7, total: 12, clarifications: 0, ...overrides });
  const build = (sessionOverrides, featureValue, mergeRequests = []) =>
    buildCharacters({ sessions: [makeSession({ updatedAt: now, ...sessionOverrides })], mergeRequests, features: new Map([["abc", featureValue]]), now })[0];

  it("envoie à l'atelier une discussion au repos dont la fonctionnalité n'est pas terminée", () => {
    const character = build({ state: "idle" }, feature());
    assert.equal(character.room, "fix");
    assert.match(character.why, /n'est pas terminée \(7 tâches sur 12\)/);
    assert.equal(character.action, "Continuer la fonctionnalité (7 tâches sur 12).");
    assert.deepEqual(character.feature, { name: "041-filtre", done: 7, total: 12, clarifications: 0 });
  });

  it("garde à l'atelier une fonctionnalité dont les tâches ne sont pas encore générées", () => {
    const character = build({ state: "idle" }, feature({ done: 0, total: 0 }));
    assert.equal(character.room, "fix");
    assert.match(character.why, /tâches pas encore générées/);
  });

  it("laisse la discussion suivre son chemin habituel une fois toutes les tâches cochées", () => {
    assert.equal(build({ state: "idle" }, feature({ done: 12 })).room, "pause");
    assert.equal(build({ state: "idle", updatedAt: now - 3 * 3600 * 1000 }, feature({ done: 12 })).room, "arch");
  });

  it("ne dérange pas une discussion qui travaille, qui pose une question ou qui est en review", () => {
    assert.equal(build({ state: "working" }, feature()).room, "open");
    assert.equal(build({ state: "needs_reply" }, feature()).room, "acc");
    assert.equal(build({ state: "idle", activity: "review" }, feature()).room, "rev");
  });

  it("envoie à l'accueil une spec qui a des points à clarifier", () => {
    const character = build({ state: "idle" }, feature({ clarifications: 2 }));
    assert.equal(character.room, "acc");
    assert.match(character.why, /2 points à clarifier/);
    assert.equal(character.action, "Répondre aux points à clarifier de la spec.");
  });

  it("garde la MR liée prioritaire sur l'atelier", () => {
    const mergeRequest = makeMergeRequest({ projectId: 1, iid: 3, status: "mergeable", sourceBranch: "041-filtre" });
    assert.equal(build({ state: "idle", branch: "041-filtre" }, feature(), [mergeRequest]).room, "rev");
  });

  it("ne prend pas de place en Pause tant que la fonctionnalité n'est pas terminée", () => {
    const sessions = [makeSession({ sessionId: "abc", state: "idle", updatedAt: now }), makeSession({ sessionId: "xyz", state: "idle", updatedAt: now - 1000 })];
    const rooms = buildCharacters({ sessions, mergeRequests: [], features: new Map([["abc", feature()]]), now }).map((character) => character.room);
    assert.deepEqual(rooms, ["fix", "pause"]);
  });

  it("ne change rien sans Spec Kit", () => {
    const [character] = buildCharacters({ sessions: [makeSession({ state: "idle", updatedAt: now })], mergeRequests: [], now });
    assert.equal(character.room, "pause");
    assert.equal(character.feature, undefined);
  });
});
