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

  it("place un brouillon dans les brouillons, même bloqué", () => {
    assert.equal(classify({ draft: true }), "draft");
  });

  it("place une MR bloquée par une MR ouverte en salle d'attente", () => {
    const blocker = makeMergeRequest({ projectId: 2, iid: 2 });
    assert.equal(classify({ blockedBy: [blocker.key] }, [blocker]), "wait");
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

  it("archive une session au repos sans MR", () => {
    const [character] = buildCharacters({ sessions: [makeSession({ state: "idle" })], mergeRequests: [] });
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
