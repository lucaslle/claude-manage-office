import * as THREE from "three";

// Chef : une cuisine de restaurant. Carrelage blanc aux murs, damiers et carreaux de terre cuite au sol,
// inox partout, plantes en citronniers et en bacs d'aromates, casiers en frigos, atelier en piano de cuisson.

const props = ({ box, cylinder, sphere, placed, materials: M, accent, base, seededRandom, screenPanel }) => {
  const lemon = new THREE.MeshStandardMaterial({ color: 0xf2d233, roughness: 0.5 });
  const chalkBoard = new THREE.MeshStandardMaterial({ color: 0x24372d, roughness: 0.95 });

  return {
    plant: (parent, { x, z, height = 1.5, kind = "ficus" }) => {
      if (kind === "snake") {
        const group = placed(parent, x, z, ((x * 5 + z * 3) % 1) * 0.5);
        box(group, 0.9, 0.3, 0.32, M.oak, 0, 0.15, 0);
        box(group, 0.82, 0.03, 0.26, M.soil, 0, 0.31, 0);
        [-0.28, 0, 0.28].forEach((herbX, index) => {
          sphere(group, 0.15, index % 2 ? M.leaf : M.leafDark, herbX, 0.46, 0, [1, 0.9, 1]);
          sphere(group, 0.1, M.leaf, herbX + 0.06, 0.58, 0.04);
        });
        return group;
      }
      const group = base.plant(parent, { x, z, height, kind });
      const random = seededRandom(x * 3 + z * 11);
      for (let fruit = 0; fruit < 6; fruit += 1) {
        const angle = random() * Math.PI * 2;
        sphere(group, 0.06, lemon, Math.cos(angle) * 0.34, height - 0.5 + random() * 0.5, Math.sin(angle) * 0.34);
      }
      return group;
    },

    lockers: (parent, { x, z, ry = 0, count = 4 }) => {
      const group = placed(parent, x, z, ry);
      const units = Math.max(2, Math.round(count * 0.7));
      const width = 0.66;
      for (let unit = 0; unit < units; unit += 1) {
        const offset = (unit - (units - 1) / 2) * width;
        box(group, width - 0.03, 1.9, 0.62, M.white, offset, 0.95, 0);
        box(group, width - 0.1, 0.02, 0.01, M.black, offset, 1.15, 0.315, { shadow: false });
        box(group, 0.03, 0.5, 0.04, M.steel, offset + 0.22, 1.5, 0.34, { shadow: false });
        box(group, 0.03, 0.4, 0.04, M.steel, offset + 0.22, 0.78, 0.34, { shadow: false });
        box(group, 0.08, 0.03, 0.01, accent(0x2fe38a, 1), offset - 0.2, 1.75, 0.316, { shadow: false });
      }
      return group;
    },

    workbench: (parent, { x, z, ry = 0, width = 5 }) => {
      const group = placed(parent, x, z, ry);
      box(group, width, 0.07, 0.9, M.steel, 0, 0.92, 0);
      box(group, width - 0.2, 0.86, 0.8, M.white, 0, 0.43, 0);
      [-1.4, -0.5, 0.5, 1.4].forEach((burnerX) => {
        cylinder(group, 0.24, 0.24, 0.03, M.black, burnerX, 0.97, 0.15, 24);
        cylinder(group, 0.19, 0.19, 0.012, accent(0xff4a1f, 1.3), burnerX, 0.99, 0.15, 24);
      });
      [-0.5, 1.4].forEach((potX) => {
        cylinder(group, 0.2, 0.2, 0.24, M.steel, potX, 1.1, 0.15, 20);
        cylinder(group, 0.21, 0.21, 0.025, M.steel, potX, 1.235, 0.15, 20);
        box(group, 0.14, 0.03, 0.04, M.black, potX + 0.28, 1.12, 0.15);
      });
      box(group, width, 1.1, 0.05, M.steel, 0, 1.55, -0.42);
      box(group, width - 0.5, 0.45, 0.5, M.steel, 0, 2.15, -0.18);
      box(group, 0.5, 0.8, 0.4, M.steel, 0, 2.78, -0.25);
      for (let tool = 0; tool < 7; tool += 1) box(group, 0.05, 0.3 + (tool % 3) * 0.08, 0.02, M.steel, -width / 2 + 0.5 + tool * 0.34, 1.6, -0.38, { shadow: false });
      screenPanel(group, 0.7, 0.4, width / 2 - 0.7, 1.4, -0.38, M.screenRed, 5);
      return group;
    },

    glassBoard: (parent, { x, y = 1.7, z, ry = 0, width = 2.6, height = 1.3 }) => {
      const group = placed(parent, x, z, ry);
      box(group, width + 0.14, height + 0.14, 0.06, M.oak, 0, y, 0, { shadow: false });
      box(group, width, height, 0.02, chalkBoard, 0, y, 0.035, { shadow: false });
      const random = seededRandom(x * 5 + z);
      const chalk = accent(0xefece2, 0.2);
      box(group, width * 0.5, 0.06, 0.004, chalk, 0, y + height / 2 - 0.2, 0.05, { shadow: false });
      for (let line = 0; line < 6; line += 1) {
        const lineWidth = width * (0.35 + random() * 0.4);
        box(group, lineWidth, 0.025, 0.004, chalk, -width / 2 + 0.2 + lineWidth / 2, y + height / 2 - 0.45 - line * 0.14, 0.05, { shadow: false });
      }
      return group;
    },

    counter: (parent, options) => {
      const group = base.counter(parent, options);
      const width = options.width ?? 2.6;
      cylinder(group, 0.1, 0.1, 0.03, M.steel, width / 2 - 0.4, 0.99, 0.05, 18);
      sphere(group, 0.09, M.steel, width / 2 - 0.4, 1.03, 0.05, [1, 0.6, 1]);
      [-1, 1].forEach((side) => box(group, 0.03, 0.62, 0.03, M.steel, side * width * 0.32, 1.28, -0.2));
      box(group, width * 0.66, 0.025, 0.03, M.steel, 0, 1.6, -0.2);
      for (let ticket = 0; ticket < 7; ticket += 1) box(group, 0.11, 0.24, 0.005, M.note[ticket % M.note.length], (ticket - 3) * 0.2, 1.46, -0.18, { shadow: false });
      return group;
    },
  };
};

const decor = ({ room, props: kit }) => {
  const { box, cylinder, sphere, placed, materials: M, accent } = kit;
  const brick = new THREE.MeshStandardMaterial({ color: 0xb5654a, roughness: 0.9 });
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });

  const pizzaOven = (parent, { x, z, ry = 0 }) => {
    const group = placed(parent, x, z, ry);
    box(group, 1.7, 0.7, 1.5, brick, 0, 0.35, 0);
    sphere(group, 0.9, brick, 0, 0.8, 0, [1.05, 0.85, 0.95]);
    box(group, 0.62, 0.42, 0.04, M.black, 0, 0.98, 0.78, { shadow: false });
    box(group, 0.5, 0.18, 0.045, accent(0xff7a1f, 1.5), 0, 0.88, 0.79, { shadow: false });
    cylinder(group, 0.16, 0.2, 0.7, brick, -0.35, 1.8, -0.15, 14);
    return group;
  };
  pizzaOven(room("fix"), { x: -3.9, z: -3.9 });

  const panRack = (parent, { x, z }) => {
    const group = placed(parent, x, z);
    box(group, 0.05, 0.05, 3.2, M.steel, 0, 2.15, 0, { shadow: false });
    [-1.2, -0.4, 0.4, 1.2].forEach((panZ, index) => {
      const pan = cylinder(group, 0.17, 0.17, 0.05, M.black, 0.1, 1.9, panZ, 20);
      pan.rotation.z = Math.PI / 2;
      box(group, 0.04, 0.03, 0.3 + (index % 2) * 0.08, M.black, 0.1, 1.9, panZ + 0.28, { shadow: false });
      box(group, 0.01, 0.2, 0.01, M.steel, 0.03, 2.05, panZ, { shadow: false });
    });
    return group;
  };
  [["open", -4.78, -1.2], ["bug", -4.78, -1.2]].forEach(([roomId, rackX, rackZ]) => panRack(room(roomId), { x: rackX, z: rackZ }));

  const hat = (parent, { x, y, z }) => {
    const group = placed(parent, x, z, 0, y);
    cylinder(group, 0.17, 0.19, 0.3, white, 0, 0.15, 0, 20);
    [[0, 0.42, 0, 0.22], [0.14, 0.38, 0.06, 0.16], [-0.14, 0.38, -0.06, 0.16], [0.02, 0.38, -0.15, 0.16]].forEach(([hatX, hatY, hatZ, radius]) => sphere(group, radius, white, hatX, hatY, hatZ));
    return group;
  };
  hat(room("acc"), { x: 1.1, y: 0.975, z: -3.9 });

};

const FLOORS = {
  acc: { color: "#262626", kind: "checker" },
  open: { color: "#b5532e", kind: "quarry" },
  rev: { color: "#6b7b8a", kind: "tile" },
  mrg: { color: "#2f7d4f", kind: "checker" },
  pause: { color: "#d4a017", kind: "checker" },
  fix: { color: "#9aa0a6", kind: "concrete" },
  arch: { color: "#8b5a2b", kind: "wood" },
  meet: { color: "#8a1f1f", kind: "checker" },
  bug: { color: "#d97706", kind: "checker" },
};

export const CHEF_STYLE = {
  id: "chef",
  materials: {
    white: { color: 0xdde1e6, roughness: 0.22, metalness: 0.7 },
    offWhite: 0xcfd4da,
    graphite: 0x3a3e45,
    black: 0x1d1f23,
    oak: 0xc89b5e,
    navy: 0xa32a2a,
    slate: 0x6b7078,
    fog: 0xe9dfd0,
    pot: 0xb5654a,
    leaf: 0x4aa84a,
    leafDark: 0x2f8a3a,
  },
  doorColors: [0xc0392b, 0xf39c12, 0x27ae60, 0x2980b9],
  noteColors: [0xfff7d6, 0xffffff, 0xfff0e0, 0xe8f6ff],
  floors: FLOORS,
  walls: { plaster: "subway" },
  sign: { background: "#f6efe0", color: "#7a1818", font: 'Georgia, "Times New Roman", serif', weight: 800, emissive: 0.35 },
  props,
  decor,
};
