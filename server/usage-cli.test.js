import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createUsageRefresher, parseReset, parseUsageText, runUsageCommand, usageFromCli } from "./usage-cli.js";

const SAMPLE = [
  "You are currently using your subscription to power your Claude Code usage",
  "",
  "Current session: 11% used · resets Oct 19, 1:30pm (Europe/Paris)",
  "Current week (all models): 51% used · resets Oct 21, 3am (Europe/Paris)",
  "Current week (Fable): 35% used · resets Oct 21, 3am (Europe/Paris)",
  "",
  "What's contributing to your limits usage?",
].join("\n");

const NOW = Date.parse("2026-10-19T08:00:00Z");

describe("parseReset", () => {
  it("convertit l'heure murale d'un fuseau en instant UTC (heure d'été)", () => {
    assert.equal(parseReset("Oct 19, 1:30pm (Europe/Paris)", NOW), Date.parse("2026-10-19T11:30:00Z"));
    assert.equal(parseReset("Oct 21, 3am (Europe/Paris)", NOW), Date.parse("2026-10-21T01:00:00Z"));
  });

  it("gère midi, minuit et l'heure d'hiver", () => {
    assert.equal(parseReset("Dec 2, 12pm (Europe/Paris)", NOW), Date.parse("2026-12-02T11:00:00Z"));
    assert.equal(parseReset("Dec 2, 12am (Europe/Paris)", NOW), Date.parse("2026-12-01T23:00:00Z"));
  });

  it("passe à l'année suivante quand la date serait loin dans le passé", () => {
    assert.equal(parseReset("Jan 5, 9am (Europe/Paris)", NOW), Date.parse("2027-01-05T08:00:00Z"));
  });

  it("prend le prochain passage d'une heure sans date", () => {
    assert.equal(parseReset("3pm (Europe/Paris)", NOW), Date.parse("2026-10-19T13:00:00Z"));
    assert.equal(parseReset("9am (Europe/Paris)", NOW), Date.parse("2026-10-20T07:00:00Z"));
  });

  it("renvoie null quand le texte n'est pas une date", () => {
    assert.equal(parseReset("bientôt", NOW), null);
  });
});

describe("parseUsageText", () => {
  it("lit la session, la semaine et les modèles", () => {
    const usage = parseUsageText(SAMPLE, NOW);
    assert.equal(usage.fiveHour.usedPercent, 11);
    assert.equal(usage.fiveHour.resetsAt, Date.parse("2026-10-19T11:30:00Z"));
    assert.equal(usage.sevenDay.usedPercent, 51);
    assert.deepEqual(usage.models.map((model) => [model.label, model.usedPercent]), [["Fable", 35]]);
  });

  it("garde une limite sans date de réinitialisation", () => {
    const usage = parseUsageText("Current session: 4% used", NOW);
    assert.deepEqual(usage.fiveHour, { usedPercent: 4, resetsAt: null });
  });

  it("renvoie null quand aucune limite n'est affichée", () => {
    assert.equal(parseUsageText("/usage isn't available in this environment.", NOW), null);
    assert.equal(parseUsageText("", NOW), null);
  });
});

describe("usageFromCli", () => {
  it("garde le plan précédent et date le relevé des modèles", () => {
    const usage = usageFromCli(SAMPLE, { plan: "Team" }, NOW);
    assert.equal(usage.source, "cli");
    assert.equal(usage.plan, "Team");
    assert.equal(usage.updatedAt, NOW);
    assert.equal(usage.detailsAt, NOW);
  });
});

describe("runUsageCommand", () => {
  it("essaie la commande suivante quand la première est introuvable", async () => {
    const tried = [];
    const run = async (command) => {
      tried.push(command);
      if (command === "absent") throw Object.assign(new Error("not found"), { code: "ENOENT" });
      return JSON.stringify({ result: SAMPLE });
    };
    assert.equal(await runUsageCommand(run, ["absent", "present"]), SAMPLE);
    assert.deepEqual(tried, ["absent", "present"]);
  });

  it("passe aussi à la commande suivante quand la première n'est pas exécutable", async () => {
    const run = async (command) => {
      if (command === "dossier") throw Object.assign(new Error("denied"), { code: "EACCES" });
      return JSON.stringify({ result: SAMPLE });
    };
    assert.equal(await runUsageCommand(run, ["dossier", "claude"]), SAMPLE);
  });

  it("explique quand aucune commande n'existe", async () => {
    const run = async () => {
      throw Object.assign(new Error("not found"), { code: "ENOENT" });
    };
    await assert.rejects(() => runUsageCommand(run, ["a", "b"]), /introuvable/);
  });
});

describe("createUsageRefresher", () => {
  const makeRefresher = (run, overrides = {}) => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "eddy-usage-"));
    const published = [];
    let clock = NOW;
    const refresh = createUsageRefresher({ baseDirectory: base, readPrevious: () => ({ plan: "Team" }), onUsage: (usage) => published.push(usage), run, now: () => clock, ...overrides });
    return { base, published, refresh, advance: (ms) => (clock += ms) };
  };

  it("écrit usage.json et publie le relevé", async () => {
    const { base, published, refresh } = makeRefresher(async () => SAMPLE);
    const result = await refresh();
    assert.equal(result.ok, true);
    assert.equal(published.length, 1);
    assert.equal(JSON.parse(fs.readFileSync(path.join(base, "usage.json"), "utf8")).fiveHour.usedPercent, 11);
  });

  it("ne relance pas la commande en double ni dans les cinq secondes", async () => {
    let calls = 0;
    const { refresh, advance } = makeRefresher(async () => {
      calls += 1;
      return SAMPLE;
    });
    await Promise.all([refresh(), refresh()]);
    await refresh();
    assert.equal(calls, 1);
    advance(6000);
    await refresh();
    assert.equal(calls, 2);
  });

  it("rapporte l'échec sans écrire de fichier", async () => {
    const { base, published, refresh } = makeRefresher(async () => {
      throw new Error("CLI absente");
    });
    const result = await refresh();
    assert.deepEqual(result, { ok: false, reason: "CLI absente" });
    assert.equal(published.length, 0);
    assert.equal(fs.existsSync(path.join(base, "usage.json")), false);
  });

  it("refuse un texte sans limite lisible", async () => {
    const { refresh } = makeRefresher(async () => "Rien à afficher");
    const result = await refresh();
    assert.equal(result.ok, false);
  });
});
