import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createGitlabReader, formatDiffs, formatDiscussions, formatJobs, formatMergeRequest, formatMergeRequestList, parseMergeRequestReference, tailTrace } from "./gitlab-read.js";

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });

const makeReader = (handler) => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return handler(url, options);
  };
  return { calls, reader: createGitlabReader({ baseUrl: "https://gitlab.test", token: "secret-token", fetchImpl }) };
};

describe("parseMergeRequestReference", () => {
  it("accepte une URL, la forme courte et deux arguments", () => {
    assert.deepEqual(parseMergeRequestReference(["https://gitlab.test/groupe/sous/projet/-/merge_requests/12"]), { project: "groupe/sous/projet", iid: 12 });
    assert.deepEqual(parseMergeRequestReference(["groupe/projet!7"]), { project: "groupe/projet", iid: 7 });
    assert.deepEqual(parseMergeRequestReference(["42", "9"]), { project: "42", iid: 9 });
  });

  it("refuse une référence incomplète", () => {
    assert.equal(parseMergeRequestReference(["groupe/projet"]), null);
    assert.equal(parseMergeRequestReference([]), null);
  });
});

describe("createGitlabReader", () => {
  it("n'émet que des GET avec le jeton dans l'en-tête, jamais dans l'URL", async () => {
    const { calls, reader } = makeReader(async () => json({ iid: 3 }));
    await reader.mergeRequest({ project: "groupe/projet", iid: 3 });
    assert.equal(calls[0].options.method, "GET");
    assert.equal(calls[0].options.headers["PRIVATE-TOKEN"], "secret-token");
    assert.equal(calls[0].url, "https://gitlab.test/api/v4/projects/groupe%2Fprojet/merge_requests/3");
    assert.equal(calls[0].url.includes("secret-token"), false);
  });

  it("garde un identifiant numérique tel quel", async () => {
    const { calls, reader } = makeReader(async () => json([]));
    await reader.diffs({ project: "55", iid: 1 });
    assert.match(calls[0].url, /\/projects\/55\/merge_requests\/1\/diffs/);
  });

  it("explique les refus sans révéler le jeton", async () => {
    for (const [status, pattern] of [[401, /401/], [403, /read_api/], [404, /introuvable/], [500, /500/]]) {
      const { reader } = makeReader(async () => json({}, status));
      await assert.rejects(
        () => reader.me(),
        (error) => pattern.test(error.message) && !error.message.includes("secret-token"),
      );
    }
  });

  it("réunit les MR créées, assignées et à relire sans doublon", async () => {
    const raw = (id, iid) => ({ id, iid, title: `MR ${iid}`, references: { full: `groupe/projet!${iid}` }, web_url: `https://gitlab.test/${iid}` });
    const { calls, reader } = makeReader(async (url) => {
      if (url.endsWith("/user")) return json({ id: 5 });
      if (url.includes("scope=created_by_me")) return json([raw(1, 1), raw(2, 2)]);
      if (url.includes("scope=assigned_to_me")) return json([raw(2, 2)]);
      return json([raw(3, 3)]);
    });
    const list = await reader.openMergeRequests();
    assert.deepEqual(list.map((mr) => mr.iid).sort(), [1, 2, 3]);
    assert.equal(calls.some((call) => call.url.includes("reviewer_id=5")), true);
  });

  it("limite la liste au périmètre demandé", async () => {
    const { calls, reader } = makeReader(async (url) => (url.endsWith("/user") ? json({ id: 5 }) : json([])));
    await reader.openMergeRequests("review");
    assert.equal(calls.filter((call) => call.url.includes("merge_requests?")).length, 1);
  });

  it("filtre les jobs en échec", async () => {
    const { calls, reader } = makeReader(async () => json([]));
    await reader.pipelineJobs("groupe/projet", 8, true);
    assert.match(calls[0].url, /scope\[\]=failed/);
  });
});

describe("formats", () => {
  it("résume une merge request", () => {
    const text = formatMergeRequest({ iid: 4, title: "Ajouter X", draft: true, state: "opened", detailed_merge_status: "ci_must_pass", has_conflicts: true, source_branch: "a", target_branch: "main", author: { username: "lucas" }, reviewers: [], head_pipeline: { id: 9, status: "failed" }, changes_count: "3", user_notes_count: 2, web_url: "https://gitlab.test/4", description: "Détails" });
    assert.match(text, /!4 Ajouter X \[brouillon\]/);
    assert.match(text, /CONFLITS/);
    assert.match(text, /Pipeline : #9 failed/);
    assert.match(text, /relecteurs : aucun/);
  });

  it("liste les merge requests ou le dit quand il n'y en a pas", () => {
    assert.equal(formatMergeRequestList([]), "Aucune merge request ouverte.");
    assert.match(formatMergeRequestList([{ iid: 1, projectPath: "g/p", title: "T", draft: false, status: "mergeable", hasConflicts: false, url: "u" }]), /!1 g\/p · T · mergeable · u/);
  });

  it("ne garde que les discussions ouvertes, avec leur position et leurs réponses", () => {
    const open = { notes: [{ author: { username: "ana" }, body: "À revoir", resolvable: true, resolved: false, position: { new_path: "src/a.js", new_line: 12 } }, { author: { username: "lucas" }, body: "Corrigé" }] };
    const closed = { notes: [{ author: { username: "bob" }, body: "OK", resolvable: true, resolved: true }] };
    const system = { notes: [{ author: { username: "bot" }, body: "a poussé", system: true, resolvable: false }] };
    const text = formatDiscussions([open, closed, system]);
    assert.match(text, /ana \(src\/a\.js:12\) : À revoir/);
    assert.match(text, /↳ lucas : Corrigé/);
    assert.equal(text.includes("bob"), false);
    assert.equal(formatDiscussions([closed]), "Aucune discussion ouverte.");
    assert.match(formatDiscussions([closed], { all: true }), /bob/);
  });

  it("liste les fichiers puis les modifications dans la limite demandée", () => {
    const diffs = [
      { new_path: "a.js", diff: "+a".repeat(40), new_file: true },
      { new_path: "b.js", diff: "+b".repeat(40), old_path: "old.js", renamed_file: true },
    ];
    assert.equal(formatDiffs(diffs, { onlyNames: true }), "- a.js (ajouté)\n- b.js (renommé depuis old.js)");
    const text = formatDiffs(diffs, { maxChars: 50 });
    assert.match(text, /### a\.js/);
    assert.match(text, /non affichés/);
  });

  it("décrit les jobs en échec", () => {
    assert.match(formatJobs([{ id: 7, name: "lint", stage: "test", status: "failed", failure_reason: "script_failure" }]), /#7 lint · étape test · failed \(script_failure\)/);
    assert.equal(formatJobs([]), "Aucun job.");
  });

  it("garde la fin du journal d'un job sans les codes de couleur", () => {
    const trace = ["début", "\u001b[31mrouge\u001b[0m", "", "milieu", "fin"].join("\r\n");
    assert.equal(tailTrace(trace, 2), "… (2 lignes plus haut)\nmilieu\nfin");
    assert.equal(tailTrace(trace, 10).includes("\u001b"), false);
  });
});
