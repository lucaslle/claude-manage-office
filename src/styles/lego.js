import * as THREE from "three";

// Lego : du plastique brillant aux couleurs primaires. Sols en plaques à tenons, murs en briques,
// arbres en briques empilées, des minifigs dans les coins et des tas de briques partout.

const PRIMARY = [0xd01f1f, 0xf2c200, 0x1f6fd1, 0x2faa4f, 0xf28c00];

const plastic = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.02 });

const studs = ({ cylinder }, parent, { width, depth, y, material, x = 0, z = 0, pitch = 0.4 }) => {
  const columns = Math.max(1, Math.round(width / pitch));
  const rows = Math.max(1, Math.round(depth / pitch));
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      cylinder(parent, 0.1, 0.1, 0.07, material, x + (column - (columns - 1) / 2) * pitch, y + 0.035, z + (row - (rows - 1) / 2) * pitch, 14);
    }
  }
};

const brick = (kit, parent, { x, y = 0, z, ry = 0, width = 0.8, depth = 0.4, height = 0.4, color }) => {
  const group = kit.placed(parent, x, z, ry, y);
  const material = plastic(color);
  kit.box(group, width, height, depth, material, 0, height / 2, 0);
  studs(kit, group, { width, depth, y: height, material });
  return group;
};

const minifig = (kit, parent, { x, z, ry = 0, torso, legs = 0x1f3a8a, scale = 1.25 }) => {
  const group = kit.placed(parent, x, z, ry);
  group.scale.setScalar(scale);
  const skin = plastic(0xf6d21c);
  const shirt = plastic(torso);
  const trousers = plastic(legs);
  const dark = plastic(0x14171c);
  [-0.09, 0.09].forEach((legX) => kit.box(group, 0.16, 0.34, 0.2, trousers, legX, 0.17, 0));
  kit.box(group, 0.36, 0.08, 0.2, trousers, 0, 0.38, 0);
  kit.box(group, 0.38, 0.4, 0.22, shirt, 0, 0.62, 0);
  [-0.25, 0.25].forEach((armX) => {
    kit.box(group, 0.1, 0.34, 0.12, shirt, armX, 0.6, 0);
    kit.box(group, 0.1, 0.08, 0.1, skin, armX, 0.4, 0);
  });
  kit.cylinder(group, 0.17, 0.17, 0.2, skin, 0, 0.93, 0, 20);
  kit.cylinder(group, 0.07, 0.07, 0.05, skin, 0, 1.06, 0, 14);
  [-0.06, 0.06].forEach((eyeX) => kit.box(group, 0.03, 0.04, 0.01, dark, eyeX, 0.96, 0.17, { shadow: false }));
  kit.box(group, 0.1, 0.02, 0.01, dark, 0, 0.89, 0.17, { shadow: false });
  return group;
};

const props = (kit) => {
  const { box, cylinder, placed, materials: M, seededRandom } = kit;
  const greens = [plastic(0x2faa4f), plastic(0x1f8a3a)];
  const trunk = plastic(0x6b4a2a);

  return {
    plant: (parent, { x, z, height = 1.5, kind = "ficus" }) => {
      const group = placed(parent, x, z);
      if (kind === "snake") {
        brick(kit, group, { x: 0, z: 0, width: 0.8, depth: 0.8, height: 0.32, color: 0xd01f1f });
        const random = seededRandom(x * 3 + z * 5);
        [-0.22, 0, 0.22].forEach((stemX, index) => {
          const stemHeight = 0.5 + random() * 0.3;
          box(group, 0.05, stemHeight, 0.05, greens[0], stemX, 0.32 + stemHeight / 2, 0);
          cylinder(group, 0.12, 0.12, 0.07, plastic(PRIMARY[(index + 1) % PRIMARY.length]), stemX, 0.35 + stemHeight, 0, 16);
        });
        return group;
      }
      cylinder(group, 0.14, 0.14, height - 0.7, trunk, 0, (height - 0.7) / 2 + 0.05, 0, 14);
      [[0.58, 0.45], [0.44, 0.75], [0.3, 1.05]].forEach(([radius, level], index) => {
        const y = (height - 1.3) + level;
        cylinder(group, radius, radius, 0.3, greens[index % 2], 0, y, 0, 24);
        studs(kit, group, { width: radius * 1.2, depth: radius * 1.2, y: y + 0.15, material: greens[index % 2], pitch: 0.4 });
      });
      return group;
    },
  };
};

const decor = ({ room, props: kit }) => {
  const piles = [
    ["acc", -4.0, -4.2, [[0.8, 0.4, 0xd01f1f], [0.8, 0.4, 0xf2c200]]],
    ["open", 4.3, 2.6, [[0.8, 0.4, 0x1f6fd1]]],
    ["draft", 4.0, 2.8, [[0.8, 0.4, 0x2faa4f], [0.8, 0.4, 0xd01f1f], [0.8, 0.4, 0xf2c200]]],
    ["fix", -4.2, 3.0, [[0.8, 0.4, 0xf28c00], [0.8, 0.4, 0x1f6fd1]]],
    ["meet", -4.3, 3.0, [[0.8, 0.4, 0xd01f1f]]],
    ["pause", -4.2, 2.8, [[0.8, 0.4, 0x2faa4f], [0.8, 0.4, 0xf2c200]]],
  ];
  piles.forEach(([roomId, pileX, pileZ, layers]) => {
    layers.forEach(([width, height, color], layer) => brick(kit, room(roomId), { x: pileX + layer * 0.06, z: pileZ, y: layer * height, ry: layer * 0.35, width, height, color }));
  });

  [
    ["acc", -0.3, -4.55, 0, 0xd01f1f],
    ["rev", -4.2, -3.0, Math.PI / 2, 0x2faa4f],
    ["draft", 4.2, -1.0, -Math.PI / 2, 0xf2c200],
    ["pause", 4.2, 2.6, 0, 0x1f6fd1],
    ["fix", -4.2, -0.4, Math.PI / 2, 0xf28c00],
    ["bug", -3.6, -4.3, 0, 0xd01f1f],
  ].forEach(([roomId, figX, figZ, figRy, torso]) => minifig(kit, room(roomId), { x: figX, z: figZ, ry: figRy, torso }));

};

const FLOORS = {
  acc: "#e03b3b",
  open: "#2f6fe0",
  rev: "#f2c200",
  draft: "#f2b134",
  pause: "#f28c00",
  fix: "#a82020",
  arch: "#8a8f98",
  meet: "#14a89c",
  bug: "#ff6a2a",
};

export const LEGO_STYLE = {
  id: "lego",
  materials: {
    white: { color: 0xf7f7f7, roughness: 0.28 },
    offWhite: 0xe9e9e9,
    graphite: 0x3a3a3a,
    black: 0x1a1a1a,
    steel: 0xbfc5cc,
    oak: 0xffd23f,
    navy: 0xd01f1f,
    slate: 0x1f6fd1,
    fog: 0x8fd16a,
    pot: 0xf2c200,
    leaf: 0x2faa4f,
    leafDark: 0x1f8a3a,
    soil: 0x5a3a22,
  },
  doorColors: [0xd01f1f, 0xf2c200, 0x1f6fd1, 0x2faa4f],
  noteColors: [0xf2c200, 0xd01f1f, 0x1f6fd1, 0x2faa4f],
  floors: Object.fromEntries(Object.entries(FLOORS).map(([roomId, color]) => [roomId, { color, kind: "studs" }])),
  walls: { plaster: { texture: "brick", color: "#f6f1e4" }, ground: { texture: "studs", color: "#3da35d" }, plinth: { texture: "brick", color: "#1f6fd1" } },
  sign: { background: "#d01f1f", color: "#ffffff", font: '"Arial Black", "Trebuchet MS", sans-serif', weight: 900, accent: "#f2c200", emissive: 0.4 },
  props,
  decor,
};
