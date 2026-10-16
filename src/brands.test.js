import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BRANDS, DEFAULT_BRAND_ID, findBrand, scenePalette } from "./brands.js";
import { GRID } from "./layout.js";
import { OFFICE_STYLE, loadStyle } from "./styles/index.js";

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

  it("propose l'univers Xefi et ceux de Minecraft, Among Us, Chef, Cyberpunk et Lego", () => {
    ["xefi", "minecraft", "among-us", "chef", "cyberpunk", "lego"].forEach((id) => assert.equal(findBrand(id).id, id));
  });
});

describe("styles de scène", () => {
  const rooms = GRID.flat().filter(Boolean);

  it("charge le style de chaque thème, et le bureau d'origine quand il n'y en a pas", async () => {
    assert.equal(await loadStyle(undefined), OFFICE_STYLE);
    for (const brand of BRANDS.filter((entry) => entry.style)) {
      const style = await loadStyle(brand.style);
      assert.equal(style.id, brand.style, brand.id);
    }
  });

  it("ne décrit que des pièces qui existent", async () => {
    for (const brand of BRANDS.filter((entry) => entry.style)) {
      const style = await loadStyle(brand.style);
      Object.keys(style.floors ?? {}).forEach((roomId) => assert.ok(rooms.includes(roomId), `${brand.style} ${roomId}`));
    }
  });

  it("donne à chaque style les palettes qu'il utilise en entier", async () => {
    for (const brand of BRANDS.filter((entry) => entry.style)) {
      const style = await loadStyle(brand.style);
      ["doorColors", "noteColors", "ledColors"].forEach((key) => {
        if (style[key]) assert.ok(style[key].length >= 3, `${brand.style} ${key}`);
      });
    }
  });
});
