import { OFFICE_STYLE } from "./office.js";

// Un style change l'aspect de la scène 3D : textures, matières, mobilier et décor.
// Les champs, tous facultatifs :
//   voxel       cylindres et sphères deviennent des cubes
//   grain       force (0 à 1) du grain de pixels posé sur les couleurs
//   materials   couleur ou { color, roughness, metalness, emissive… } par matériau de mobilier
//   surface     texture de pixels par matériau de mobilier
//   noteColors, doorColors, ledColors   palettes du mobilier
//   floorKinds  type de sol de remplacement (tile, carpet, concrete)
//   floors      sol par pièce : { color, kind }
//   walls       textures plaster, frame, ground, plinth ; frameGlow pour des cadres lumineux
//   sign        apparence des enseignes
//   ledgeIntensity   éclat du liseré au pied des murs
//   props(ctx)  renvoie des meubles qui remplacent ceux de props.js
//   decor(ctx)  ajoute des éléments à la scène une fois les pièces meublées

export { OFFICE_STYLE };

const loaders = {
  minecraft: () => import("./minecraft.js").then((module) => module.MINECRAFT_STYLE),
  amongus: () => import("./amongus.js").then((module) => module.AMONG_US_STYLE),
  chef: () => import("./chef.js").then((module) => module.CHEF_STYLE),
  cyber: () => import("./cyber.js").then((module) => module.CYBER_STYLE),
  lego: () => import("./lego.js").then((module) => module.LEGO_STYLE),
};

export const loadStyle = async (id) => (loaders[id] ? loaders[id]() : OFFICE_STYLE);
