import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { findFeatureDirectory, readFeature } from "./speckit.js";

describe("Spec Kit", () => {
  let project;

  const writeFeature = (name, { spec = "", tasks = null } = {}) => {
    const directory = path.join(project, "specs", name);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "spec.md"), spec);
    if (tasks !== null) fs.writeFileSync(path.join(directory, "tasks.md"), tasks);
    return directory;
  };

  before(() => {
    project = fs.mkdtempSync(path.join(os.tmpdir(), "eddy-speckit-"));
  });

  after(() => {
    fs.rmSync(project, { recursive: true, force: true });
  });

  it("compte les tâches cochées et ouvertes de tasks.md", () => {
    writeFeature("041-filtre", { tasks: "# Tâches\n- [x] T001 Créer le modèle\n- [X] T002 Écrire les tests\n- [ ] T003 Brancher l'écran\n  - [ ] sous-tâche\n* [ ] T004 Documenter\nTexte libre [ ] ignoré\n" });
    const feature = readFeature(project, "041-filtre");
    assert.deepEqual(feature, { name: "041-filtre", done: 2, total: 5, clarifications: 0 });
  });

  it("compte les points à clarifier de spec.md", () => {
    writeFeature("042-export", { spec: "Le format [NEEDS CLARIFICATION: CSV ou XLSX ?]\nLe droit [needs clarification: qui ?]\n", tasks: "- [ ] T001 Exporter\n" });
    assert.equal(readFeature(project, "042-export").clarifications, 2);
  });

  it("retrouve la fonctionnalité depuis un sous-dossier du projet", () => {
    const nested = path.join(project, "packages", "web");
    fs.mkdirSync(nested, { recursive: true });
    assert.equal(path.basename(findFeatureDirectory(nested, "041-filtre")), "041-filtre");
  });

  it("accepte un préfixe de branche comme feature/041-filtre", () => {
    assert.equal(readFeature(project, "feature/041-filtre").name, "041-filtre");
  });

  it("n'a pas de tâches avant que tasks.md existe", () => {
    writeFeature("043-nouvelle", { spec: "Une idée." });
    assert.deepEqual(readFeature(project, "043-nouvelle"), { name: "043-nouvelle", done: 0, total: 0, clarifications: 0 });
  });

  it("relit tasks.md quand il change", () => {
    const directory = writeFeature("044-live", { tasks: "- [ ] T001 A\n- [ ] T002 B\n" });
    assert.equal(readFeature(project, "044-live").done, 0);
    const tasksPath = path.join(directory, "tasks.md");
    fs.writeFileSync(tasksPath, "- [x] T001 A\n- [ ] T002 B\n");
    const later = new Date(Date.now() + 5000);
    fs.utimesSync(tasksPath, later, later);
    assert.equal(readFeature(project, "044-live").done, 1);
  });

  it("ignore les projets sans Spec Kit et les branches partagées", () => {
    assert.equal(readFeature(project, "main"), null);
    assert.equal(readFeature(project, "999-inconnue"), null);
    assert.equal(readFeature(project, ""), null);
    assert.equal(readFeature("", "041-filtre"), null);
    assert.equal(readFeature(os.tmpdir(), "041-filtre"), null);
  });
});
