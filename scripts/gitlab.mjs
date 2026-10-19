import { loadConfig } from "../server/config.js";
import {
  createGitlabReader,
  formatDiffs,
  formatDiscussions,
  formatJobs,
  formatMergeRequest,
  formatMergeRequestList,
  parseMergeRequestReference,
  tailTrace,
} from "../server/gitlab-read.js";

// Lecture seule de GitLab (jeton de .env). Sert à Claude comme à vous : `npm run gitlab -- aide`.

const USAGE = `Lecture seule de GitLab (GITLAB_URL et GITLAB_TOKEN de .env, jeton avec la portée read_api).

  npm run gitlab -- moi                         utilisateur du jeton
  npm run gitlab -- mrs [created|assigned|review]  merge requests ouvertes (toutes par défaut)
  npm run gitlab -- mr <réf>                    détail d'une MR
  npm run gitlab -- discussions <réf> [--all]   discussions ouvertes (ou toutes)
  npm run gitlab -- diff <réf> [--files] [--max-chars N]   fichiers et modifications
  npm run gitlab -- jobs <réf>                  jobs en échec du dernier pipeline
  npm run gitlab -- log <projet> <job> [--lines N]  fin du journal d'un job

<réf> : URL de la MR, « groupe/projet!12 » ou « groupe/projet 12 ».`;

const flagValue = (args, name, fallback) => {
  const index = args.indexOf(name);
  const value = index >= 0 ? Number(args[index + 1]) : NaN;
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const positional = (args) => args.filter((arg, index) => !arg.startsWith("--") && !(index > 0 && ["--max-chars", "--lines"].includes(args[index - 1])));

const requireReference = (args) => {
  const reference = parseMergeRequestReference(positional(args));
  if (!reference) throw new Error("référence de merge request invalide (URL, groupe/projet!12 ou groupe/projet 12)");
  return reference;
};

const run = async () => {
  const [command = "aide", ...args] = process.argv.slice(2);
  if (["aide", "help", "--help", "-h"].includes(command)) return USAGE;
  const config = loadConfig();
  if (!config.gitlabUrl || !config.gitlabToken) throw new Error("GITLAB_URL et GITLAB_TOKEN manquent : renseignez-les dans .env (ou ~/.claude/eddy-office/.env) avec un jeton de portée read_api");
  if (!/^https:\/\//.test(config.gitlabUrl)) process.stderr.write("Attention : GITLAB_URL n'est pas en https, le jeton circulerait en clair.\n");
  const gitlab = createGitlabReader({ baseUrl: config.gitlabUrl, token: config.gitlabToken });

  if (command === "moi") {
    const user = await gitlab.me();
    return `${user.name} (@${user.username})`;
  }
  if (command === "mrs") return formatMergeRequestList(await gitlab.openMergeRequests(positional(args)[0]));
  if (command === "mr") return formatMergeRequest(await gitlab.mergeRequest(requireReference(args)));
  if (command === "discussions") return formatDiscussions(await gitlab.discussions(requireReference(args)), { all: args.includes("--all") });
  if (command === "diff") return formatDiffs(await gitlab.diffs(requireReference(args)), { onlyNames: args.includes("--files"), maxChars: flagValue(args, "--max-chars", undefined) });
  if (command === "jobs") {
    const reference = requireReference(args);
    const mr = await gitlab.mergeRequest(reference);
    const pipeline = mr.head_pipeline ?? mr.pipeline;
    if (!pipeline) return "Cette merge request n'a pas de pipeline.";
    return `Pipeline #${pipeline.id} (${pipeline.status})\n${formatJobs(await gitlab.pipelineJobs(reference.project, pipeline.id, true))}`;
  }
  if (command === "log") {
    const [project, jobId] = positional(args);
    if (!project || !/^\d+$/.test(jobId ?? "")) throw new Error("usage : log <projet> <numéro du job>");
    return tailTrace(await gitlab.jobTrace(project, jobId), flagValue(args, "--lines", undefined));
  }
  throw new Error(`commande inconnue : ${command}\n\n${USAGE}`);
};

run()
  .then((output) => process.stdout.write(`${output}\n`))
  .catch((error) => {
    process.stderr.write(`GitLab : ${error.message}\n`);
    process.exitCode = 1;
  });
