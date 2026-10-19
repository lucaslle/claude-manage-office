// Lecture seule de GitLab pour une session Claude : le jeton vient de .env (GITLAB_URL, GITLAB_TOKEN), jamais de la conversation,
// et ce module n'émet que des requêtes GET.

const REQUEST_TIMEOUT_MS = 20000;
const PER_PAGE = 100;
const DEFAULT_TRACE_LINES = 80;
const DEFAULT_DIFF_CHARS = 12000;
const NOTE_PREVIEW_CHARS = 600;
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const MERGE_REQUEST_URL = /^https?:\/\/[^/]+\/(.+?)\/-\/merge_requests\/(\d+)/;
const SHORT_REFERENCE = /^(.+)!(\d+)$/;

const projectId = (reference) => (/^\d+$/.test(String(reference)) ? String(reference) : encodeURIComponent(String(reference)));

// « https://gitlab/groupe/projet/-/merge_requests/12 », « groupe/projet!12 » ou « groupe/projet 12 ».
export const parseMergeRequestReference = (args) => {
  const [first = "", second = ""] = args;
  const fromUrl = MERGE_REQUEST_URL.exec(first);
  if (fromUrl) return { project: fromUrl[1], iid: Number(fromUrl[2]) };
  const fromShort = SHORT_REFERENCE.exec(first);
  if (fromShort) return { project: fromShort[1], iid: Number(fromShort[2]) };
  if (first && /^\d+$/.test(second)) return { project: first, iid: Number(second) };
  return null;
};

const clip = (text, limit) => (text.length > limit ? `${text.slice(0, limit)}… (${text.length - limit} caractères de plus)` : text);

export const formatMergeRequest = (mr) => {
  const pipeline = mr.head_pipeline ?? mr.pipeline;
  const lines = [
    `!${mr.iid} ${mr.title}${mr.draft ? " [brouillon]" : ""}`,
    `État : ${mr.state} · fusion : ${mr.detailed_merge_status ?? "inconnue"}${mr.has_conflicts ? " · CONFLITS" : ""}`,
    `Branches : ${mr.source_branch} → ${mr.target_branch}`,
    `Auteur : ${mr.author?.username ?? "?"} · relecteurs : ${(mr.reviewers ?? []).map((reviewer) => reviewer.username).join(", ") || "aucun"}`,
    `Pipeline : ${pipeline ? `#${pipeline.id} ${pipeline.status}` : "aucun"}`,
    `Fichiers modifiés : ${mr.changes_count ?? "?"} · commentaires : ${mr.user_notes_count ?? 0}`,
    `Lien : ${mr.web_url}`,
  ];
  if (mr.description) lines.push("", clip(mr.description.trim(), NOTE_PREVIEW_CHARS * 3));
  return lines.join("\n");
};

export const formatMergeRequestList = (mergeRequests) =>
  mergeRequests.length === 0
    ? "Aucune merge request ouverte."
    : mergeRequests
        .map((mr) => `!${mr.iid} ${mr.projectPath || mr.repo} · ${mr.title}${mr.draft ? " [brouillon]" : ""} · ${mr.status}${mr.hasConflicts ? " · conflits" : ""} · ${mr.url}`)
        .join("\n");

// Seules les discussions ouvertes (résolvables et non résolues) intéressent une relecture.
export const formatDiscussions = (discussions, { all = false } = {}) => {
  const selected = discussions.filter((discussion) => all || discussion.notes?.some((note) => note.resolvable && !note.resolved));
  if (selected.length === 0) return all ? "Aucune discussion." : "Aucune discussion ouverte.";
  return selected
    .map((discussion) => {
      const [first, ...replies] = discussion.notes.filter((note) => !note.system);
      if (!first) return null;
      const place = first.position ? ` (${first.position.new_path ?? first.position.old_path}:${first.position.new_line ?? first.position.old_line ?? "?"})` : "";
      const head = `${first.author?.username ?? "?"}${place} : ${clip(first.body.trim(), NOTE_PREVIEW_CHARS)}`;
      const tail = replies.map((reply) => `  ↳ ${reply.author?.username ?? "?"} : ${clip(reply.body.trim(), NOTE_PREVIEW_CHARS)}`);
      return [head, ...tail].join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
};

export const formatDiffs = (diffs, { maxChars = DEFAULT_DIFF_CHARS, onlyNames = false } = {}) => {
  const files = diffs.map((diff) => {
    const state = diff.new_file ? "ajouté" : diff.deleted_file ? "supprimé" : diff.renamed_file ? `renommé depuis ${diff.old_path}` : "modifié";
    return { diff, label: `${diff.new_path} (${state})` };
  });
  const summary = files.map((file) => `- ${file.label}`).join("\n");
  if (onlyNames) return summary || "Aucune modification.";
  let budget = maxChars;
  const patches = [];
  files.forEach(({ diff, label }) => {
    if (budget <= 0) return;
    const patch = clip(diff.diff ?? "", budget);
    budget -= patch.length;
    patches.push(`### ${label}\n${patch}`);
  });
  const skipped = files.length - patches.length;
  return [summary, "", ...patches, skipped > 0 ? `\n(${skipped} fichier(s) non affichés : limite de ${maxChars} caractères, option --max-chars pour l'augmenter)` : ""].join("\n").trim();
};

export const formatJobs = (jobs) =>
  jobs.length === 0 ? "Aucun job." : jobs.map((job) => `#${job.id} ${job.name} · étape ${job.stage} · ${job.status}${job.failure_reason ? ` (${job.failure_reason})` : ""}${job.allow_failure ? " · échec autorisé" : ""}`).join("\n");

export const tailTrace = (trace, lines = DEFAULT_TRACE_LINES) => {
  const clean = trace.replace(ANSI, "").replace(/\r/g, "\n").split("\n").filter((line) => line.trim().length > 0);
  const kept = clean.slice(-lines);
  return clean.length > kept.length ? [`… (${clean.length - kept.length} lignes plus haut)`, ...kept].join("\n") : kept.join("\n");
};

export const createGitlabReader = ({ baseUrl, token, fetchImpl = fetch }) => {
  const get = async (pathAndQuery, { text = false } = {}) => {
    const response = await fetchImpl(`${baseUrl}/api/v4${pathAndQuery}`, { method: "GET", headers: { "PRIVATE-TOKEN": token }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (response.status === 401) throw new Error("jeton refusé (401)");
    if (response.status === 403) throw new Error("droits insuffisants (403) : le jeton doit avoir la portée read_api");
    if (response.status === 404) throw new Error("introuvable (404) : vérifiez le projet, le numéro et les droits du jeton");
    if (!response.ok) throw new Error(`réponse ${response.status}`);
    return text ? response.text() : response.json();
  };

  const me = () => get("/user");

  const openMergeRequests = async (scope = "all") => {
    const user = await me();
    const base = `state=opened&order_by=updated_at&per_page=${PER_PAGE}`;
    const queries = { created: [`scope=created_by_me&${base}`], assigned: [`scope=assigned_to_me&${base}`], review: [`reviewer_id=${user.id}&${base}`] };
    queries.all = [...queries.created, ...queries.assigned, ...queries.review];
    const lists = await Promise.all((queries[scope] ?? queries.all).map((query) => get(`/merge_requests?${query}`)));
    const byId = new Map();
    lists.flat().forEach((raw) => {
      const reference = raw.references?.full ?? "";
      const projectPath = reference.includes("!") ? reference.slice(0, reference.lastIndexOf("!")) : "";
      byId.set(raw.id, { iid: raw.iid, projectPath, repo: projectPath.split("/").pop() ?? "", title: raw.title, draft: Boolean(raw.draft), status: raw.detailed_merge_status ?? "unchecked", hasConflicts: Boolean(raw.has_conflicts), url: raw.web_url });
    });
    return [...byId.values()];
  };

  const mergeRequest = ({ project, iid }) => get(`/projects/${projectId(project)}/merge_requests/${iid}`);
  const discussions = ({ project, iid }) => get(`/projects/${projectId(project)}/merge_requests/${iid}/discussions?per_page=${PER_PAGE}`);
  const diffs = ({ project, iid }) => get(`/projects/${projectId(project)}/merge_requests/${iid}/diffs?per_page=${PER_PAGE}`);
  const pipelineJobs = (project, pipelineId, failedOnly) => get(`/projects/${projectId(project)}/pipelines/${pipelineId}/jobs?per_page=${PER_PAGE}${failedOnly ? "&scope[]=failed" : ""}`);
  const jobTrace = (project, jobId) => get(`/projects/${projectId(project)}/jobs/${jobId}/trace`, { text: true });

  return { me, openMergeRequests, mergeRequest, discussions, diffs, pipelineJobs, jobTrace };
};
