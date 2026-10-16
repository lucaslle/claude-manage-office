import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BRANDS, DEFAULT_BRAND_ID, findBrand, scenePalette } from "./brands.js";

const SCENE_KEYS = ["background", "plaster", "frame", "ground", "plinth", "floorTint", "glazing", "light"];

describe("thèmes d'entreprise", () => {
  it("donne à chaque thème tous les réglages de scène, dans les deux modes", () => {
    BRANDS.forEach((brand) => {
      [false, true].forEach((dark) => {
        const palette = scenePalette(brand, dark);
        SCENE_KEYS.forEach((key) => assert.ok(palette[key] !== undefined && !Array.isArray(palette[key]), `${brand.id} ${key}`));
      });
    });
  });

  it("a des identifiants uniques et un thème par défaut qui existe", () => {
    assert.equal(new Set(BRANDS.map((brand) => brand.id)).size, BRANDS.length);
    assert.equal(findBrand(DEFAULT_BRAND_ID).id, DEFAULT_BRAND_ID);
  });

  it("retombe sur le thème par défaut pour un identifiant inconnu", () => {
    assert.equal(findBrand("inconnu").id, DEFAULT_BRAND_ID);
    assert.equal(findBrand(null).id, DEFAULT_BRAND_ID);
  });

  it("choisit la couleur claire ou sombre quand elle dépend du mode", () => {
    const eddy = findBrand("eddy");
    assert.equal(scenePalette(eddy, false).background, "#e3e9f1");
    assert.equal(scenePalette(eddy, true).background, "#2a3544");
  });

  it("ne propose que des modes connus", () => {
    BRANDS.forEach((brand) => assert.ok(["auto", "dark"].includes(brand.mode), brand.id));
  });
});
