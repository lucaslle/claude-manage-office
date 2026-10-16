// Lance tout le nécessaire en une commande : dépendances, fichier .env, serveur local, navigateur.
// Usage : npm start [-- --no-open] [-- --production]   (ou lancer.cmd / lancer.sh)

import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const MIN_NODE_MAJOR = 22;
const READY_TIMEOUT_MS = 60000;
const READY_POLL_MS = 300;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const openBrowserAfter = !args.includes("--no-open");

const say = (message) => process.stdout.write(`${message}\n`);

const fail = (message) => {
  process.stderr.write(`\n${message}\n`);
  process.exit(1);
};

if (Number(process.versions.node.split(".")[0]) < MIN_NODE_MAJOR) {
  fail(`Node.js ${MIN_NODE_MAJOR} ou plus est nécessaire (vous avez ${process.versions.node}). Installez-le depuis https://nodejs.org puis relancez.`);
}

process.chdir(root);

const exists = (...segments) => fs.existsSync(path.join(root, ...segments));
const isSourceCheckout = exists("src", "main.js");
const hasBuild = exists("dist", "index.html");

// Dans un dépôt, il faut les dépendances (Vite et three). Dans l'archive d'une release, la scène est déjà construite et rien n'est à installer.
if (isSourceCheckout && !exists("node_modules", "vite")) {
  say("Première fois : installation des dépendances (une minute environ)…");
  const install = spawnSync("npm", ["install"], { stdio: "inherit", shell: process.platform === "win32" });
  if (install.status !== 0) fail("L'installation des dépendances a échoué. Vérifiez votre connexion, puis relancez.");
}

if (!exists(".env") && exists(".env.example")) {
  fs.copyFileSync(path.join(root, ".env.example"), path.join(root, ".env"));
  say("Fichier .env créé. Il est facultatif : renseignez-y GITLAB_URL et GITLAB_TOKEN pour voir aussi vos merge requests.");
}

const production = args.includes("--production") || (!exists("node_modules", "vite") && hasBuild);
if (production && !hasBuild) fail("La scène n'est pas construite : lancez d'abord npm run build.");
if (production) process.argv.push("--production");

const { loadConfig } = await import("../server/config.js");
const { port } = loadConfig();
const url = `http://localhost:${port}`;

const isListening = (targetPort) =>
  new Promise((resolve) => {
    const socket = net.connect({ port: targetPort, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });

const openBrowser = (target) => {
  const isWsl = process.platform === "linux" && /microsoft/i.test(os.release());
  const command =
    process.platform === "win32" ? ["cmd", ["/c", "start", "", target]] : process.platform === "darwin" ? ["open", [target]] : isWsl ? ["cmd.exe", ["/c", "start", "", target]] : ["xdg-open", [target]];
  try {
    const child = spawn(command[0], command[1], { detached: true, stdio: "ignore" });
    child.on("error", () => say(`Ouvrez ${target} dans votre navigateur.`));
    child.unref();
  } catch {
    say(`Ouvrez ${target} dans votre navigateur.`);
  }
};

const hooksInstalled = () => {
  try {
    return fs.readFileSync(path.join(os.homedir(), ".claude", "settings.json"), "utf8").includes("eddy-hook.mjs");
  } catch {
    return false;
  }
};

if (await isListening(port)) {
  say(`Déjà lancé : ${url}`);
  if (openBrowserAfter) openBrowser(url);
  process.exit(0);
}

say(production ? "Démarrage (version construite)…" : "Démarrage…");
await import("../server/index.js");

const deadline = Date.now() + READY_TIMEOUT_MS;
while (!(await isListening(port))) {
  if (Date.now() > deadline) fail(`Le serveur ne répond pas sur ${url}. Regardez les messages ci-dessus.`);
  await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
}

say(`\nPrêt : ${url}`);
if (!hooksInstalled()) say("Pour voir vos vraies conversations Claude Code, lancez une fois : npm run hooks:install (sans cela, la scène reste vide).");
say("Ctrl+C pour arrêter.\n");
if (openBrowserAfter) openBrowser(url);
