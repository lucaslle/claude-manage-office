import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { connectorsFromStatus, usageFromPlan, usageFromStatusline } from "./snapshots.mjs";

const hooksDirectory = path.dirname(fileURLToPath(import.meta.url));
const run = (script, args, input, baseDirectory) =>
  execFileSync("node", [path.join(hooksDirectory, script), ...args], { input, env: { ...process.env, EDDY_BASE_DIR: baseDirectory } }).toString();

const planOutput = {
  plan: {
    status: "ok",
    plan: "Team",
    windows: [
      { label: "5-hour limit", percentUsed: 49, resetsAt: "2026-10-15T17:00:00.212Z" },
      { label: "Weekly · all models", percentUsed: 25, resetsAt: "2026-10-21T01:00:00.212Z" },
      { label: "Weekly · Fable", percentUsed: 11, resetsAt: "2026-10-21T01:00:00.212Z" },
    ],
  },
};

describe("usageFromPlan", () => {
  it("sépare la limite de 5 heures, la limite hebdomadaire et les modèles", () => {
    const usage = usageFromPlan(planOutput, 1000);
    assert.equal(usage.fiveHour.usedPercent, 49);
    assert.equal(usage.fiveHour.resetsAt, Date.parse("2026-10-15T17:00:00.212Z"));
    assert.equal(usage.sevenDay.usedPercent, 25);
    assert.deepEqual(usage.models.map((model) => [model.label, model.usedPercent]), [["Fable", 11]]);
    assert.equal(usage.plan, "Team");
    assert.equal(usage.detailsAt, 1000);
  });

  it("renvoie null quand les limites ne s'appliquent pas", () => {
    assert.equal(usageFromPlan({ plan: { status: "not_applicable" } }), null);
  });
});

describe("usageFromStatusline", () => {
  const payload = { rate_limits: { five_hour: { used_percentage: 48.6, resets_at: 1790000000 }, seven_day: { used_percentage: 25, resets_at: 1790500000 } } };

  it("convertit les pourcentages et les secondes en millisecondes", () => {
    const usage = usageFromStatusline(payload, null, 5);
    assert.equal(usage.fiveHour.usedPercent, 49);
    assert.equal(usage.fiveHour.resetsAt, 1790000000 * 1000);
    assert.equal(usage.source, "statusline");
  });

  it("conserve les modèles de l'instantané précédent", () => {
    const usage = usageFromStatusline(payload, { plan: "Team", models: [{ label: "Fable", usedPercent: 11 }] }, 5);
    assert.deepEqual(usage.models, [{ label: "Fable", usedPercent: 11 }]);
    assert.equal(usage.plan, "Team");
  });

  it("garde la date du dernier relevé des modèles, sans la renouveler", () => {
    const fromPlan = usageFromStatusline(payload, { source: "snapshot", updatedAt: 100, detailsAt: 100, plan: "Team", models: [] }, 5000);
    assert.equal(fromPlan.updatedAt, 5000);
    assert.equal(fromPlan.detailsAt, 100);
    const fromOldSnapshot = usageFromStatusline(payload, { source: "snapshot", updatedAt: 200, models: [] }, 5000);
    assert.equal(fromOldSnapshot.detailsAt, 200);
    const chained = usageFromStatusline(payload, fromPlan, 9000);
    assert.equal(chained.detailsAt, 100);
    assert.equal(usageFromStatusline(payload, null, 5).detailsAt, null);
  });

  it("ignore un message sans limites", () => {
    assert.equal(usageFromStatusline({ model: { display_name: "X" } }, null), null);
  });
});

describe("connectorsFromStatus", () => {
  it("garde le nom, le type, l'état et le nombre d'outils", () => {
    const record = connectorsFromStatus({ servers: [{ name: "Gitlab", id: "x", kind: "connector", status: "connected", tool_count: 161 }] }, 7);
    assert.deepEqual(record.servers, [{ name: "Gitlab", kind: "connector", status: "connected", toolCount: 161 }]);
    assert.equal(record.updatedAt, 7);
  });

  it("refuse une sortie inattendue", () => {
    assert.equal(connectorsFromStatus({ error: "x" }), null);
  });
});

describe("scripts", () => {
  it("la ligne d'état écrit usage.json et affiche un résumé", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "eddy-status-"));
    const payload = { context_window: { used_percentage: 72 }, rate_limits: { five_hour: { used_percentage: 49, resets_at: 1790000000 }, seven_day: { used_percentage: 25, resets_at: 1790500000 } } };
    const output = run("eddy-statusline.mjs", [], JSON.stringify(payload), base);
    assert.equal(output, "5 h 49 % · hebdo 25 % · contexte 72 %");
    assert.equal(JSON.parse(fs.readFileSync(path.join(base, "usage.json"), "utf8")).sevenDay.usedPercent, 25);
  });

  it("la ligne d'état n'écrit rien quand aucune limite n'est fournie", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "eddy-status-"));
    run("eddy-statusline.mjs", [], JSON.stringify({ model: { display_name: "X" } }), base);
    assert.equal(fs.existsSync(path.join(base, "usage.json")), false);
  });

  it("write-snapshot écrit les connecteurs depuis la sortie de l'outil", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "eddy-status-"));
    run("write-snapshot.mjs", ["connectors"], JSON.stringify({ servers: [{ name: "Gitlab", kind: "connector", status: "connected", tool_count: 1 }] }), base);
    assert.equal(JSON.parse(fs.readFileSync(path.join(base, "connectors.json"), "utf8")).servers[0].name, "Gitlab");
  });

  it("write-snapshot écrit les limites depuis la sortie de get_usage", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "eddy-status-"));
    run("write-snapshot.mjs", ["usage"], JSON.stringify(planOutput), base);
    assert.equal(JSON.parse(fs.readFileSync(path.join(base, "usage.json"), "utf8")).fiveHour.usedPercent, 49);
  });
});
