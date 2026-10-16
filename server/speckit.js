import fs from "node:fs";
import path from "node:path";

// Spec Kit range chaque fonctionnalité dans specs/<branche>/ (spec.md, plan.md, tasks.md). La branche d'une session et son
// dossier de travail suffisent donc à retrouver l'avancement : cases cochées de tasks.md et points « NEEDS CLARIFICATION » de spec.md.

const MAX_PARENT_LEVELS = 8;
const SHARED_BRANCHES = new Set(["main", "master", "develop", "dev", "HEAD"]);
const CHECKED_TASK = /^\s*[-*]\s*\[[xX]\]/gm;
const OPEN_TASK = /^\s*[-*]\s*\[ \]/gm;
const CLARIFICATION = /\[NEEDS CLARIFICATION/gi;

const cache = new Map();

// Un serveur sous WSL lit les dossiers Windows par /mnt/<lecteur>/.
const toLocalPath = (cwd) => (process.platform === "linux" && /^[A-Za-z]:[\\/]/.test(cwd) ? `/mnt/${cwd[0].toLowerCase()}/${cwd.slice(3).replace(/\\/g, "/")}` : cwd);

const isDirectory = (candidate) => {
  try {
    return fs.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
};

const modifiedAt = (filePath) => {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
};

const readText = (filePath) => {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
};

const count = (text, pattern) => (text.match(pattern) ?? []).length;

export const findFeatureDirectory = (cwd, branch) => {
  const names = [...new Set([branch, branch.split("/").pop()])].filter((name) => name && !SHARED_BRANCHES.has(name));
  let directory = toLocalPath(cwd);
  for (let level = 0; level < MAX_PARENT_LEVELS; level += 1) {
    const found = names.map((name) => path.join(directory, "specs", name)).find(isDirectory);
    if (found) return found;
    const parent = path.dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
  return null;
};

export const readFeature = (cwd, branch) => {
  if (typeof cwd !== "string" || typeof branch !== "string" || !cwd || !branch) return null;
  const directory = findFeatureDirectory(cwd, branch);
  if (!directory) return null;
  const specPath = path.join(directory, "spec.md");
  const tasksPath = path.join(directory, "tasks.md");
  const stamp = `${modifiedAt(specPath)}:${modifiedAt(tasksPath)}`;
  const known = cache.get(directory);
  if (known?.stamp === stamp) return known.feature;
  const tasks = readText(tasksPath);
  const done = count(tasks, CHECKED_TASK);
  const feature = { name: path.basename(directory), done, total: done + count(tasks, OPEN_TASK), clarifications: count(readText(specPath), CLARIFICATION) };
  cache.set(directory, { stamp, feature });
  return feature;
};
