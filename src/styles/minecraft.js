import * as THREE from "three";
import { pixelTexture } from "../textures.js";

// Minecraft : tout est cube, texturé en pixels. Les cylindres et les sphères deviennent des blocs,
// les plantes des pousses d'arbre et des cactus, les casiers des coffres, les canapés des lits.

const block = (name, options = {}) => new THREE.MeshStandardMaterial({ map: pixelTexture(name), roughness: 1, metalness: 0, ...options });

const props = ({ box, placed, materials: M, base, accent }) => {
  const log = block("log");
  const cactus = block("grass");
  const cobble = block("cobble");
  const gold = new THREE.MeshStandardMaterial({ color: 0xf5c518, metalness: 0.6, roughness: 0.3 });
  const darkWood = block("planks", { color: 0xb08a5a });

  const chest = (group, x, y) => {
    box(group, 0.56, 0.5, 0.46, M.oak, x, y + 0.25, 0);
    box(group, 0.58, 0.06, 0.48, darkWood, x, y + 0.36, 0);
    box(group, 0.08, 0.14, 0.04, gold, x, y + 0.36, 0.25, { shadow: false });
  };

  const furnace = (group, x, y) => {
    box(group, 0.55, 0.55, 0.55, cobble, x, y + 0.275, 0);
    box(group, 0.34, 0.2, 0.02, M.black, x, y + 0.2, 0.28, { shadow: false });
    box(group, 0.3, 0.1, 0.02, accent(0xff8a1f, 1.4), x, y + 0.17, 0.285, { shadow: false });
  };

  return {
    plant: (parent, { x, z, height = 1.5, kind = "ficus" }) => {
      const group = placed(parent, x, z);
      box(group, 0.5, 0.36, 0.5, M.pot, 0, 0.18, 0);
      box(group, 0.4, 0.04, 0.4, M.soil, 0, 0.37, 0);
      if (kind === "snake") {
        box(group, 0.3, 1.0, 0.3, cactus, 0, 0.88, 0);
        box(group, 0.3, 0.16, 0.16, cactus, 0.22, 0.95, 0);
        box(group, 0.16, 0.34, 0.16, cactus, 0.3, 1.1, 0);
        box(group, 0.16, 0.14, 0.3, cactus, 0, 0.78, 0.22);
        return group;
      }
      box(group, 0.2, height - 0.9, 0.2, log, 0, 0.37 + (height - 0.9) / 2, 0);
      box(group, 0.95, 0.5, 0.95, M.leaf, 0, height - 0.55, 0);
      box(group, 0.6, 0.4, 0.6, M.leaf, 0, height - 0.15, 0);
      return group;
    },

    lockers: (parent, { x, z, ry = 0, count = 4 }) => {
      const group = placed(parent, x, z, ry);
      for (let index = 0; index < count; index += 1) {
        const offset = (index - (count - 1) / 2) * 0.62;
        [0, 0.52, 1.04].forEach((level) => chest(group, offset, level));
      }
      return group;
    },

    sofa: (parent, { x, z, ry = 0, length = 2.4, tone = M.navy }) => {
      const group = placed(parent, x, z, ry);
      box(group, length, 0.28, 0.95, M.oak, 0, 0.14, 0);
      box(group, length - 0.12, 0.2, 0.88, tone, 0.04, 0.38, 0);
      box(group, 0.5, 0.14, 0.7, M.white, -length / 2 + 0.4, 0.55, 0);
      box(group, 0.12, 0.6, 0.97, M.oak, -length / 2 + 0.05, 0.3, 0);
      return group;
    },

    workbench: (parent, options) => {
      const group = base.workbench(parent, options);
      const top = 0.96;
      box(group, 0.6, 0.6, 0.6, M.oak, -1.6, top + 0.3, 0.05);
      box(group, 0.62, 0.04, 0.62, darkWood, -1.6, top + 0.62, 0.05);
      furnace(group, 1.7, top);
      box(group, 0.34, 0.12, 0.34, M.steel, 0.2, top + 0.06, 0.1);
      box(group, 0.56, 0.16, 0.3, M.steel, 0.2, top + 0.2, 0.1);
      return group;
    },
  };
};

const decor = ({ world, room, props: kit, animated, backWall, edge }) => {
  const { box, placed } = kit;
  const log = block("log");
  const flame = new THREE.MeshStandardMaterial({ color: 0xffb02f, emissive: 0xff8a1f, emissiveIntensity: 1.4 });
  animated.push((elapsed) => {
    flame.emissiveIntensity = 1.15 + Math.sin(elapsed * 9) * 0.25 + Math.sin(elapsed * 23) * 0.1;
  });

  const torch = (parent, x, z) => {
    const group = placed(parent, x, z);
    box(group, 0.1, 0.9, 0.1, log, 0, 0.45, 0);
    box(group, 0.16, 0.2, 0.16, flame, 0, 0.98, 0, { shadow: false });
    return group;
  };

  const creeper = (parent, { x, z, ry = 0 }) => {
    const skin = block("leaves", { color: 0xa6e28f });
    const group = placed(parent, x, z, ry);
    [-0.12, 0.12].forEach((legX) => [-0.18, 0.18].forEach((legZ) => box(group, 0.22, 0.32, 0.22, skin, legX, 0.16, legZ)));
    box(group, 0.5, 0.7, 0.28, skin, 0, 0.67, 0);
    box(group, 0.5, 0.5, 0.5, block("creeper"), 0, 1.27, 0);
    return group;
  };

  const bookshelf = (parent, { x, y, z }) => box(parent, 0.98, 0.98, 0.5, block("bookshelf"), x, y, z);

  const exitDoorZ = room("acc").position.z + 3;
  torch(world, edge(0) - 0.7, exitDoorZ - 1.9);
  torch(world, edge(0) - 0.7, exitDoorZ + 1.9);

  const bugRoom = room("bug");
  creeper(bugRoom, { x: 4.3, z: -1.8, ry: -Math.PI / 2 });
  creeper(bugRoom, { x: -4.2, z: 0.7, ry: Math.PI / 2 });
  const tnt = block("tnt");
  [[-4.1, -4.2], [-3.3, -4.2]].forEach(([tntX, tntZ]) => box(bugRoom, 0.8, 0.8, 0.8, tnt, tntX, 0.4, tntZ));
  box(bugRoom, 0.8, 0.8, 0.8, tnt, -3.7, 1.2, -4.2);

  const reviewRoom = room("rev");
  [0, 1].forEach((column) => [0, 1].forEach((row) => bookshelf(reviewRoom, { x: -3.6 + column, y: 0.5 + row, z: backWall + 0.3 })));


  const cloud = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
  const clouds = new THREE.Group();
  world.add(clouds);
  [[-38, 8, -30], [-18, 9, -42], [8, 8, -38], [30, 9, -44], [-52, 8, -8], [46, 9, -22]].forEach(([cloudX, cloudY, cloudZ], index) => {
    const puff = new THREE.Group();
    [[0, 0, 0, 7, 1.4, 4], [1.5, 0.9, 0.3, 4, 1.2, 3], [-2, 0.6, -0.6, 3.5, 1, 2.6]].forEach(([offsetX, offsetY, offsetZ, width, height, depth]) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), cloud);
      mesh.position.set(offsetX, offsetY, offsetZ);
      puff.add(mesh);
    });
    puff.position.set(cloudX, cloudY, cloudZ);
    clouds.add(puff);
    animated.push((elapsed) => {
      puff.position.x = ((cloudX + 70 + elapsed * (0.35 + index * 0.05)) % 140) - 70;
    });
  });
};

export const MINECRAFT_STYLE = {
  id: "minecraft",
  voxel: true,
  grain: 0.1,
  woodKind: "planks",
  materials: {
    black: 0x6a6a72,
    navy: 0x3e5fb0,
    slate: 0x7a8696,
    fog: 0xc8c8d0,
    leafDark: 0xb4c8a4,
    pot: 0xb5654a,
  },
  surface: {
    oak: "planks",
    white: "quartz",
    offWhite: "quartz",
    graphite: "deepslate",
    black: "deepslate",
    steel: "iron",
    soil: "dirt",
    leaf: "leaves",
    leafDark: "leaves",
    navy: "wool",
    slate: "wool",
    fog: "wool",
  },
  doorColors: [0x3b5bdb, 0x74c043, 0xf08c00, 0xae3ec9],
  ledColors: [0xff2a2a, 0x4dff7a, 0xffd23f],
  floors: {
    acc: { kind: "quartz" },
    open: { kind: "planks" },
    rev: { kind: "stoneBrick" },
    draft: { kind: "quartz" },
    pause: { kind: "planks" },
    fix: { kind: "cobble" },
    arch: { kind: "deepslate" },
    meet: { kind: "planks" },
    bug: { kind: "netherrack" },
  },
  walls: { plaster: "stoneBrick", frame: "log", ground: "grass", plinth: "cobble" },
  sign: { background: "#a07a48", color: "#2a1a08", font: '"Consolas", "Courier New", monospace', weight: 800, accent: "#5a4220", emissive: 0.3 },
  props,
  decor,
};
