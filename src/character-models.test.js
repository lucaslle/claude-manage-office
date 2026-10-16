import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BRANDS } from "./brands.js";
import { buildCharacterModel, characterFor } from "./character-models.js";

const RIG = ["Body", "Hips", "Torso", "Head", "LegL", "LegR", "ShinL", "ShinR", "ArmL", "ArmR", "ForearmL", "ForearmR"];
const CLIPS = ["Idle", "Walking", "Storm", "Fume", "Wave", "Sitting", "Punch", "Dance", "Yes", "No", "ThumbsUp"];

const canvasStub = { width: 0, height: 0, getContext: () => ({ fillRect() {}, set fillStyle(value) {} }) };
globalThis.document ??= { createElement: () => canvasStub };

const CHARACTERS = ["robot", "crewmate", "steve", "minifig", "chef", "cyber", "xefi"];

describe("personnages par univers", () => {
  it("associe un personnage à chaque univers, et le robot aux autres thèmes", () => {
    assert.equal(characterFor("amongus"), "crewmate");
    assert.equal(characterFor("minecraft"), "steve");
    assert.equal(characterFor("lego"), "minifig");
    assert.equal(characterFor("chef"), "chef");
    assert.equal(characterFor("cyber"), "cyber");
    assert.equal(characterFor("xefi"), "xefi");
    assert.equal(characterFor(undefined), "robot");
    assert.equal(characterFor("office"), "robot");
    BRANDS.filter((brand) => brand.style).forEach((brand) => assert.ok(CHARACTERS.includes(characterFor(brand.style)), brand.id));
  });

  CHARACTERS.forEach((characterId) => {
    it(`${characterId} a le squelette, les animations et la couleur de conversation`, () => {
      const { scene, animations } = buildCharacterModel(characterId);
      RIG.forEach((name) => assert.ok(scene.getObjectByName(name), `${characterId} ${name}`));
      CLIPS.forEach((name) => assert.ok(animations.some((clip) => clip.name === name), `${characterId} ${name}`));
      const materials = new Set();
      scene.traverse((node) => node.isMesh && materials.add(node.material.name));
      assert.ok(materials.has("Main"), `${characterId} Main`);
    });
  });

  it("retombe sur le robot pour un personnage inconnu", () => {
    assert.equal(buildCharacterModel("inconnu").scene.name, "Robot");
  });
});
