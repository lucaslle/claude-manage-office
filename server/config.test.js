import assert from "node:assert/strict";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { loadConfig } from "./config.js";

const VARIABLES = ["GITLAB_URL", "GITLAB_TOKEN", "GITLAB_POLL_SECONDS", "EDDY_PORT", "EDDY_SESSION_MAX_AGE_HOURS", "EDDY_AGENT_MAX_AGE_MINUTES", "EDDY_CONTEXT_WINDOW", "EDDY_SESSION_DIRS", "EDDY_DETECT_WSL", "EDDY_STATE_DIR"];

let saved = {};

beforeEach(() => {
  saved = Object.fromEntries(VARIABLES.map((name) => [name, process.env[name]]));
});

afterEach(() => {
  VARIABLES.forEach((name) => {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  });
});

describe("loadConfig", () => {
  it("lit les variables d'environnement et convertit les nombres", () => {
    process.env.EDDY_PORT = "6100";
    process.env.GITLAB_POLL_SECONDS = "15";
    process.env.EDDY_SESSION_MAX_AGE_HOURS = "12";
    process.env.EDDY_AGENT_MAX_AGE_MINUTES = "5";
    process.env.EDDY_CONTEXT_WINDOW = "200000";
    const config = loadConfig();
    assert.equal(config.port, 6100);
    assert.equal(config.gitlabPollSeconds, 15);
    assert.equal(config.sessionMaxAgeHours, 12);
    assert.equal(config.agentMaxAgeMinutes, 5);
    assert.equal(config.contextWindow, 200000);
  });

  it("retire la barre oblique finale de l'adresse GitLab", () => {
    process.env.GITLAB_URL = "https://gitlab.example.com//";
    assert.equal(loadConfig().gitlabUrl, "https://gitlab.example.com");
  });

  it("ajoute les dossiers de sessions supplémentaires après le dossier principal", () => {
    process.env.EDDY_STATE_DIR = path.join("etat", "sessions");
    process.env.EDDY_SESSION_DIRS = " un ; ;deux";
    assert.deepEqual(loadConfig().sessionDirectories, [path.join("etat", "sessions"), "un", "deux"]);
  });

  it("ne désactive la détection WSL que sur la valeur false", () => {
    process.env.EDDY_DETECT_WSL = "false";
    assert.equal(loadConfig().detectWsl, false);
    process.env.EDDY_DETECT_WSL = "non";
    assert.equal(loadConfig().detectWsl, true);
  });
});
