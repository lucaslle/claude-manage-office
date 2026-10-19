const PER_PAGE = 100;
const REQUEST_TIMEOUT_MS = 15000;
const PIPELINE_CACHE_MS = 3 * 60 * 1000;
const MAX_PIPELINE_LOOKUPS = 30;

const AFTER_PATTERN =
  /(?:dépend(?:ant)?e? de|depends on|à merger après|merger après|merge after|bloquée? par|blocked by)\s+(?:[^\s!,.;:()]+\s+){0,4}?([\w./-]*)\s?!(\d+)/gi;
const BEFORE_PATTERN =
  /(?:à merger avant|merger avant|merge before|à fusionner avant|fusionner avant)\s+(?:[^\s!,.;:()]+\s+){0,4}?([\w./-]*)\s?!(\d+)/gi;

export const mergeRequestKey = (projectId, iid) => `m:${projectId}:${iid}`;

const normalize = (raw) => {
  const reference = raw.references?.full ?? "";
  const projectPath = reference.includes("!") ? reference.slice(0, reference.lastIndexOf("!")) : "";
  return {
    key: mergeRequestKey(raw.project_id, raw.iid),
    id: raw.id,
    iid: raw.iid,
    projectId: raw.project_id,
    projectPath,
    repo: projectPath.split("/").pop() ?? "",
    title: raw.title,
    description: raw.description ?? "",
    url: raw.web_url,
    sourceBranch: raw.source_branch,
    targetBranch: raw.target_branch,
    draft: Boolean(raw.draft),
    status: raw.detailed_merge_status ?? "unchecked",
    hasConflicts: Boolean(raw.has_conflicts),
    updatedAt: raw.updated_at,
    pipeline: null,
    blockedBy: [],
  };
};

const extractReferences = (description, pattern) =>
  [...description.matchAll(pattern)].map((match) => ({ repo: match[1].replace(/^.*\//, ""), iid: Number(match[2]) }));

const resolveReference = (reference, owner, mergeRequests) =>
  mergeRequests.find(
    (candidate) =>
      candidate.key !== owner.key &&
      candidate.iid === reference.iid &&
      (reference.repo ? candidate.repo === reference.repo : candidate.projectId === owner.projectId),
  );

export const attachDependencies = (mergeRequests) => {
  mergeRequests.forEach((owner) => {
    extractReferences(owner.description, AFTER_PATTERN).forEach((reference) => {
      const blocker = resolveReference(reference, owner, mergeRequests);
      if (blocker && !owner.blockedBy.includes(blocker.key)) owner.blockedBy.push(blocker.key);
    });
    extractReferences(owner.description, BEFORE_PATTERN).forEach((reference) => {
      const dependent = resolveReference(reference, owner, mergeRequests);
      if (dependent && !dependent.blockedBy.includes(owner.key)) dependent.blockedBy.push(owner.key);
    });
  });
  return mergeRequests;
};

export const createGitlabClient = ({ baseUrl, token, fetchImpl = fetch, now = Date.now }) => {
  const request = async (pathAndQuery) => {
    const response = await fetchImpl(`${baseUrl}/api/v4${pathAndQuery}`, {
      headers: { "PRIVATE-TOKEN": token },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 401) throw new Error("jeton refusé (401)");
    if (!response.ok) throw new Error(`réponse ${response.status}`);
    return response.json();
  };

  const fetchCurrentUser = () => request("/user");

  const fetchOpenMergeRequests = async (userId) => {
    const base = `state=opened&order_by=updated_at&per_page=${PER_PAGE}`;
    const lists = await Promise.all([
      request(`/merge_requests?scope=created_by_me&${base}`),
      request(`/merge_requests?scope=assigned_to_me&${base}`),
      request(`/merge_requests?reviewer_id=${userId}&${base}`),
    ]);
    const byId = new Map();
    lists.flat().filter((raw) => (raw.state ?? "opened") === "opened").forEach((raw) => byId.set(raw.id, normalize(raw)));
    return attachDependencies([...byId.values()]);
  };

  const fetchMergeRequestState = async (projectId, iid) => {
    const raw = await request(`/projects/${projectId}/merge_requests/${iid}`);
    return raw.state;
  };

  // Le dernier pipeline d'une MR et ses jobs en échec : c'est la cause à afficher quand la CI est rouge.
  const fetchPipelineDetail = async (projectId, iid) => {
    const pipelines = await request(`/projects/${projectId}/merge_requests/${iid}/pipelines?per_page=5`);
    const latest = pipelines.reduce((best, pipeline) => (!best || pipeline.id > best.id ? pipeline : best), null);
    if (!latest) return null;
    const jobs = latest.status === "failed" ? await request(`/projects/${projectId}/pipelines/${latest.id}/jobs?scope[]=failed&per_page=${PER_PAGE}`) : [];
    return { id: latest.id, status: latest.status, failedJobs: jobs.filter((job) => !job.allow_failure).map((job) => ({ name: job.name, stage: job.stage })) };
  };

  const pipelineCache = new Map();

  // Lit le dernier pipeline de chaque MR (sauf celles en conflit, déjà à l'atelier), au plus une fois par MR et par PIPELINE_CACHE_MS tant qu'elle n'a pas changé.
  const annotatePipelines = async (mergeRequests) => {
    const candidates = mergeRequests.filter((mergeRequest) => !mergeRequest.draft && !mergeRequest.hasConflicts && mergeRequest.status !== "conflict").slice(0, MAX_PIPELINE_LOOKUPS);
    const current = now();
    await Promise.all(
      candidates.map(async (mergeRequest) => {
        const cached = pipelineCache.get(mergeRequest.key);
        if (cached && cached.updatedAt === mergeRequest.updatedAt && current - cached.at < PIPELINE_CACHE_MS) {
          mergeRequest.pipeline = cached.pipeline;
          return;
        }
        try {
          const pipeline = await fetchPipelineDetail(mergeRequest.projectId, mergeRequest.iid);
          pipelineCache.set(mergeRequest.key, { updatedAt: mergeRequest.updatedAt, at: current, pipeline });
          mergeRequest.pipeline = pipeline;
        } catch {
          mergeRequest.pipeline = cached?.pipeline ?? null;
        }
      }),
    );
    const openKeys = new Set(mergeRequests.map((mergeRequest) => mergeRequest.key));
    [...pipelineCache.keys()].forEach((key) => openKeys.has(key) || pipelineCache.delete(key));
    return mergeRequests;
  };

  return { fetchCurrentUser, fetchOpenMergeRequests, fetchMergeRequestState, annotatePipelines };
};
