import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createGitlabClient } from "./gitlab.js";

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

const broken = (iid, overrides = {}) => ({ key: `m:1:${iid}`, projectId: 1, iid, status: "ci_must_pass", hasConflicts: false, updatedAt: "t0", pipeline: null, ...overrides });

const makeClient = (handler, clock = { value: 0 }) => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return handler(url);
  };
  return { calls, clock, client: createGitlabClient({ baseUrl: "https://gitlab.test", token: "t", fetchImpl, now: () => clock.value }) };
};

const pipelineRoutes = (url) => {
  if (url.includes("/merge_requests/") && url.includes("/pipelines")) return json([{ id: 3, status: "success" }, { id: 8, status: "failed" }]);
  if (url.includes("/pipelines/8/jobs")) return json([{ name: "lint", stage: "test", allow_failure: false }, { name: "flaky", stage: "test", allow_failure: true }]);
  return json([]);
};

describe("annotatePipelines", () => {
  it("lit le dernier pipeline de chaque MR, même mergeable, et garde les jobs en échec non tolérés", async () => {
    const { client, calls } = makeClient(pipelineRoutes);
    const list = [broken(4), broken(5, { status: "mergeable" }), broken(6, { hasConflicts: true })];
    await client.annotatePipelines(list);
    assert.deepEqual(list[0].pipeline, { id: 8, status: "failed", failedJobs: [{ name: "lint", stage: "test" }] });
    assert.deepEqual(list[1].pipeline, list[0].pipeline);
    assert.equal(list[2].pipeline, null);
    assert.equal(calls.filter((url) => url.includes("/pipelines/8/jobs")).length, 2);
  });

  it("ne relit pas une MR inchangée avant l'expiration du cache", async () => {
    const { client, calls, clock } = makeClient(pipelineRoutes);
    await client.annotatePipelines([broken(4)]);
    const first = calls.length;
    await client.annotatePipelines([broken(4)]);
    assert.equal(calls.length, first);
    await client.annotatePipelines([broken(4, { updatedAt: "t1" })]);
    assert.ok(calls.length > first);
    const second = calls.length;
    clock.value = 10 * 60 * 1000;
    await client.annotatePipelines([broken(4, { updatedAt: "t1" })]);
    assert.ok(calls.length > second);
  });

  it("n'interrompt pas la liste si GitLab refuse la lecture des pipelines", async () => {
    const { client } = makeClient(() => json({}, 403));
    const list = [broken(4)];
    await client.annotatePipelines(list);
    assert.equal(list[0].pipeline, null);
  });

  it("ne cherche pas de jobs quand le dernier pipeline n'a pas échoué", async () => {
    const { client, calls } = makeClient((url) => (url.includes("/merge_requests/") ? json([{ id: 9, status: "canceled" }]) : json([])));
    const list = [broken(4)];
    await client.annotatePipelines(list);
    assert.deepEqual(list[0].pipeline, { id: 9, status: "canceled", failedJobs: [] });
    assert.equal(calls.some((url) => url.includes("/jobs")), false);
  });
});

describe("fetchOpenMergeRequests", () => {
  const raw = (id, overrides = {}) => ({ id, iid: id, project_id: 1, title: `MR ${id}`, references: { full: `g/p!${id}` }, web_url: `u${id}`, state: "opened", ...overrides });

  it("n'affiche jamais une MR close ou mergée, même si GitLab la renvoie", async () => {
    const { client } = makeClient((url) => (url.includes("scope=created_by_me") ? json([raw(1), raw(2, { state: "closed" }), raw(3, { state: "merged" })]) : json([])));
    const list = await client.fetchOpenMergeRequests(5);
    assert.deepEqual(list.map((mergeRequest) => mergeRequest.iid), [1]);
  });

  it("ne lit pas le pipeline d'un brouillon", async () => {
    const { client, calls } = makeClient(pipelineRoutes);
    await client.annotatePipelines([broken(4, { draft: true })]);
    assert.equal(calls.length, 0);
  });
});

