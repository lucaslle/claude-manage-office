import * as THREE from "three";

// Mobilier « entreprise tech » construit en primitives : verre, graphite, blanc, bois clair et LED.
// Repère de chaque objet : x vers la droite, z vers l'avant ; l'objet regarde vers +z, ry le fait pivoter.

const material = (color, options = {}) =>
  new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.6,
    metalness: options.metalness ?? 0.05,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 1,
    transparent: options.opacity !== undefined,
    opacity: options.opacity ?? 1,
    depthWrite: options.opacity === undefined,
  });

const seededRandom = (seed) => {
  let state = Math.floor(Math.abs(seed) * 1000) % 2147483647 || 7;
  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
};

const SCREEN_LINES = [0x6fe3a1, 0x8ec5ff, 0xffd37a, 0xc7a6ff];

export const createProps = ({ animated }) => {
  const M = {
    white: material(0xf4f6f9, { roughness: 0.35 }),
    offWhite: material(0xe6e9ee, { roughness: 0.5 }),
    graphite: material(0x2b3039, { roughness: 0.5 }),
    black: material(0x14171c, { roughness: 0.4 }),
    steel: material(0xaab3bf, { roughness: 0.3, metalness: 0.75 }),
    oak: material(0xd8bd92, { roughness: 0.7 }),
    navy: material(0x33466b, { roughness: 0.85 }),
    slate: material(0x56627a, { roughness: 0.85 }),
    fog: material(0xb4bdcb, { roughness: 0.9 }),
    pot: material(0xf2f3f5, { roughness: 0.5 }),
    soil: material(0x2d2a26, { roughness: 1 }),
    leaf: material(0x3c9d5b, { roughness: 0.8 }),
    leafDark: material(0x2a7a47, { roughness: 0.8 }),
    glass: material(0xd6ebf5, { roughness: 0.08, opacity: 0.28 }),
    screen: material(0x16202e, { emissive: 0x2c4d7a, emissiveIntensity: 0.85, roughness: 0.25 }),
    screenRed: material(0x2a1215, { emissive: 0xc42b2b, emissiveIntensity: 0.9, roughness: 0.25 }),
    screenWhite: material(0xeaf4ff, { emissive: 0x9ed0ff, emissiveIntensity: 0.55, roughness: 0.3 }),
    warm: material(0xfff0cf, { emissive: 0xffc46b, emissiveIntensity: 0.9 }),
    note: [0xffd95a, 0xff8fa3, 0x7fd6ff, 0xa6e88f].map((color) => material(color, { roughness: 0.9 })),
    door: [0x3566f0, 0x14b8a6, 0xf0a020, 0x8f6bff].map((color) => material(color, { roughness: 0.55 })),
  };
  const led = [0x2fe38a, 0x2fd0ff, 0xffb02f].map((color) => material(0x0a0d10, { emissive: color, emissiveIntensity: 1 }));
  const accentMaterials = new Map();
  const accent = (color, intensity = 0.9) => {
    const key = `${color}:${intensity}`;
    if (!accentMaterials.has(key)) accentMaterials.set(key, material(0x0d1117, { emissive: color, emissiveIntensity: intensity, roughness: 0.4 }));
    return accentMaterials.get(key);
  };
  animated.push((elapsed) => {
    led.forEach((entry, index) => {
      entry.emissiveIntensity = 0.35 + 0.65 * Math.max(0, Math.sin(elapsed * (2.2 + index * 1.3) + index * 2.1));
    });
  });

  const box = (parent, width, height, depth, mat, x, y, z, options = {}) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat);
    mesh.position.set(x, y, z);
    if (options.ry) mesh.rotation.y = options.ry;
    mesh.castShadow = options.shadow !== false;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const cylinder = (parent, radiusTop, radiusBottom, height, mat, x, y, z, segments = 20) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const sphere = (parent, radius, mat, x, y, z, scale = [1, 1, 1]) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 14, 10), mat);
    mesh.position.set(x, y, z);
    mesh.scale.set(...scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const placed = (parent, x, z, ry = 0, y = 0) => {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = ry;
    parent.add(group);
    return group;
  };

  const screenPanel = (group, width, height, x, y, z, mat = M.screen, seed = 1) => {
    box(group, width, height, 0.03, M.black, x, y, z);
    box(group, width - 0.06, height - 0.06, 0.01, mat, x, y, z + 0.018, { shadow: false });
    const random = seededRandom(seed * 17 + x * 31);
    for (let line = 0; line < 4; line += 1) {
      const lineWidth = (width - 0.2) * (0.3 + random() * 0.6);
      const color = SCREEN_LINES[Math.floor(random() * SCREEN_LINES.length)];
      box(group, lineWidth, 0.018, 0.004, accent(color, 0.7), x - (width - 0.2) / 2 + lineWidth / 2, y + height / 2 - 0.1 - line * (height / 5.5), z + 0.026, { shadow: false });
    }
  };

  const desk = (parent, { x, z, ry = 0, width = 2.6, depth = 1.1, monitors = 2, standing = false, screenMaterial = M.screen }) => {
    const group = placed(parent, x, z, ry);
    const height = standing ? 1.05 : 0.74;
    box(group, width, 0.05, depth, M.white, 0, height, 0);
    [-1, 1].forEach((side) => box(group, 0.05, height, depth * 0.78, M.graphite, side * (width / 2 - 0.14), height / 2, 0));
    box(group, width - 0.34, 0.34, 0.03, M.graphite, 0, height - 0.26, -depth / 2 + 0.12);
    for (let index = 0; index < monitors; index += 1) {
      const offset = (index - (monitors - 1) / 2) * 0.86;
      cylinder(group, 0.025, 0.025, 0.3, M.steel, offset, height + 0.17, -depth / 2 + 0.2, 10);
      box(group, 0.3, 0.012, 0.18, M.steel, offset, height + 0.03, -depth / 2 + 0.22);
      screenPanel(group, 0.8, 0.46, offset, height + 0.42, -depth / 2 + 0.2, screenMaterial, index + x + z);
    }
    box(group, 0.46, 0.014, 0.15, M.graphite, 0, height + 0.03, 0.2);
    box(group, 0.07, 0.02, 0.1, M.graphite, 0.4, height + 0.03, 0.2);
    cylinder(group, 0.04, 0.035, 0.09, M.white, width / 2 - 0.3, height + 0.07, 0.12, 14);
    return group;
  };

  const chair = (parent, { x, z, ry = 0, tone = M.slate }) => {
    const group = placed(parent, x, z, ry);
    cylinder(group, 0.3, 0.3, 0.03, M.graphite, 0, 0.05, 0);
    cylinder(group, 0.035, 0.035, 0.42, M.steel, 0, 0.26, 0, 10);
    box(group, 0.5, 0.08, 0.5, tone, 0, 0.5, 0);
    box(group, 0.46, 0.56, 0.07, tone, 0, 0.86, -0.24);
    box(group, 0.1, 0.34, 0.05, M.graphite, 0, 0.74, -0.2);
    return group;
  };

  const stool = (parent, { x, z, color = M.door[0] }) => {
    const group = placed(parent, x, z);
    cylinder(group, 0.035, 0.035, 0.55, M.steel, 0, 0.3, 0, 10);
    cylinder(group, 0.22, 0.22, 0.07, color, 0, 0.6, 0);
    cylinder(group, 0.26, 0.26, 0.025, M.graphite, 0, 0.02, 0);
    return group;
  };

  const sofa = (parent, { x, z, ry = 0, length = 2.4, tone = M.navy }) => {
    const group = placed(parent, x, z, ry);
    const seats = Math.max(1, Math.round(length / 0.85));
    box(group, length, 0.4, 0.92, M.graphite, 0, 0.22, 0);
    for (let seat = 0; seat < seats; seat += 1) {
      const width = (length - 0.36) / seats;
      box(group, width - 0.03, 0.14, 0.74, tone, -length / 2 + 0.18 + width * (seat + 0.5), 0.5, 0.06);
    }
    box(group, length, 0.52, 0.2, tone, 0, 0.74, -0.36);
    [-1, 1].forEach((side) => box(group, 0.18, 0.5, 0.92, tone, side * (length / 2 - 0.09), 0.5, 0));
    return group;
  };

  const roundTable = (parent, { x, z, radius = 0.55, height = 0.45, top = M.white }) => {
    const group = placed(parent, x, z);
    cylinder(group, radius, radius, 0.04, top, 0, height, 0, 28);
    cylinder(group, 0.04, 0.04, height, M.steel, 0, height / 2, 0, 10);
    cylinder(group, radius * 0.55, radius * 0.55, 0.025, M.graphite, 0, 0.015, 0, 24);
    return group;
  };

  const pouf = (parent, { x, z, color = M.door[1], radius = 0.3 }) => {
    const group = placed(parent, x, z);
    cylinder(group, radius, radius, 0.38, color, 0, 0.19, 0, 22);
    cylinder(group, radius * 0.95, radius * 0.95, 0.03, M.white, 0, 0.4, 0, 22);
    return group;
  };

  const beanBag = (parent, { x, z, color = M.slate, radius = 0.5 }) => {
    const group = placed(parent, x, z);
    sphere(group, radius, color, 0, radius * 0.5, 0, [1, 0.62, 1]);
    sphere(group, radius * 0.55, color, 0, radius * 0.72, -radius * 0.28, [1, 0.8, 0.8]);
    return group;
  };

  const plant = (parent, { x, z, height = 1.5, kind = "ficus" }) => {
    const group = placed(parent, x, z);
    cylinder(group, 0.25, 0.2, 0.46, M.pot, 0, 0.23, 0, 18);
    cylinder(group, 0.22, 0.22, 0.02, M.soil, 0, 0.47, 0, 18);
    const random = seededRandom(x * 13 + z * 7 + height * 3);
    if (kind === "snake") {
      for (let blade = 0; blade < 7; blade += 1) {
        const angle = (blade / 7) * Math.PI * 2;
        const bladeHeight = 0.6 + random() * 0.6;
        const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.07, bladeHeight, 5), blade % 2 ? M.leaf : M.leafDark);
        mesh.position.set(Math.cos(angle) * 0.09, 0.47 + bladeHeight / 2, Math.sin(angle) * 0.09);
        mesh.castShadow = true;
        group.add(mesh);
      }
      return group;
    }
    cylinder(group, 0.03, 0.045, height - 0.5, M.graphite, 0, 0.47 + (height - 0.5) / 2, 0, 8);
    for (let blob = 0; blob < 7; blob += 1) {
      const angle = random() * Math.PI * 2;
      const radius = 0.12 + random() * 0.22;
      sphere(group, 0.2 + random() * 0.12, blob % 2 ? M.leaf : M.leafDark, Math.cos(angle) * radius, height - 0.25 + random() * 0.4, Math.sin(angle) * radius, [1, 0.8, 1]);
    }
    return group;
  };

  const serverRack = (parent, { x, z, ry = 0 }) => {
    const group = placed(parent, x, z, ry);
    box(group, 0.8, 2.1, 0.9, M.black, 0, 1.05, 0);
    box(group, 0.74, 2.0, 0.02, M.graphite, 0, 1.05, 0.46);
    const random = seededRandom(x * 29 + z * 11);
    for (let unit = 0; unit < 9; unit += 1) {
      const y = 0.25 + unit * 0.2;
      box(group, 0.68, 0.14, 0.02, M.graphite, 0, y, 0.475, { shadow: false });
      box(group, 0.4, 0.012, 0.01, M.steel, -0.08, y + 0.02, 0.488, { shadow: false });
      box(group, 0.05, 0.05, 0.012, led[Math.floor(random() * led.length)], 0.26, y, 0.49, { shadow: false });
      box(group, 0.05, 0.05, 0.012, led[Math.floor(random() * led.length)], 0.18, y, 0.49, { shadow: false });
    }
    return group;
  };

  const counter = (parent, { x, z, ry = 0, width = 2.6, depth = 0.7, top = M.oak, body = M.graphite, light = 0x2fd0ff }) => {
    const group = placed(parent, x, z, ry);
    box(group, width, 0.92, depth, body, 0, 0.46, 0);
    box(group, width + 0.04, 0.05, depth + 0.06, top, 0, 0.95, 0.01);
    box(group, width - 0.1, 0.03, 0.02, accent(light, 1), 0, 0.12, depth / 2 + 0.005, { shadow: false });
    return group;
  };

  const coffeeBar = (parent, { x, z, ry = 0, width = 2.7 }) => {
    const group = placed(parent, x, z, ry);
    counter(group, { x: 0, z: 0, width, light: 0xffb02f });
    box(group, 0.5, 0.42, 0.4, M.steel, -width / 2 + 0.55, 1.2, -0.08);
    box(group, 0.46, 0.2, 0.02, M.black, -width / 2 + 0.55, 1.28, 0.13);
    box(group, 0.06, 0.06, 0.012, accent(0xff6b4a, 1), -width / 2 + 0.65, 1.2, 0.14, { shadow: false });
    [0.1, 0.3, 0.5].forEach((offset) => cylinder(group, 0.04, 0.032, 0.09, M.white, offset, 1.02, 0.08, 12));
    box(group, width - 0.2, 0.46, 0.34, M.white, 0, 2.05, -0.34);
    box(group, width - 0.3, 0.025, 0.02, accent(0xffd27a, 1), 0, 1.8, -0.16, { shadow: false });
    box(group, 0.8, 1.85, 0.72, M.steel, width / 2 + 0.55, 0.925, 0);
    box(group, 0.04, 0.5, 0.03, M.graphite, width / 2 + 0.2, 1.05, 0.38);
    return group;
  };

  const glassBoard = (parent, { x, y = 1.7, z, ry = 0, width = 2.6, height = 1.3, notes = true }) => {
    const group = placed(parent, x, z, ry);
    box(group, width + 0.1, height + 0.1, 0.05, M.graphite, 0, y, 0, { shadow: false });
    box(group, width, height, 0.02, M.screenWhite, 0, y, 0.03, { shadow: false });
    if (notes) {
      const random = seededRandom(x * 5 + z);
      for (let note = 0; note < 9; note += 1) {
        box(group, 0.2, 0.2, 0.006, M.note[note % M.note.length], -width / 2 + 0.3 + (note % 5) * 0.48 + random() * 0.08, y + 0.28 - Math.floor(note / 5) * 0.45, 0.045, { shadow: false, ry: (random() - 0.5) * 0.2 });
      }
      box(group, width - 0.5, 0.015, 0.004, accent(0x3566f0, 0.5), 0, y - 0.46, 0.043, { shadow: false });
    }
    return group;
  };

  const wallLedge = (parent, { x, z, ry = 0, width, color, intensity = 0.8, y = 0.04, depth = 0.07 }) => {
    const group = placed(parent, x, z, ry);
    box(group, width, 0.03, depth, accent(color, intensity), 0, y, 0, { shadow: false });
    return group;
  };

  const lockers = (parent, { x, z, ry = 0, count = 4 }) => {
    const group = placed(parent, x, z, ry);
    for (let index = 0; index < count; index += 1) {
      const offset = (index - (count - 1) / 2) * 0.46;
      box(group, 0.44, 1.7, 0.5, M.offWhite, offset, 0.85, 0);
      box(group, 0.4, 0.6, 0.02, M.door[index % M.door.length], offset, 1.35, 0.26);
      box(group, 0.4, 0.6, 0.02, M.graphite, offset, 0.55, 0.26);
      box(group, 0.03, 0.14, 0.03, M.steel, offset + 0.14, 1.0, 0.285, { shadow: false });
    }
    return group;
  };

  const bench = (parent, { x, z, ry = 0, length = 3, tone = M.slate }) => {
    const group = placed(parent, x, z, ry);
    box(group, length, 0.1, 0.7, M.oak, 0, 0.42, 0);
    box(group, length - 0.2, 0.08, 0.6, tone, 0, 0.5, 0);
    [-1, 1].forEach((side) => box(group, 0.06, 0.42, 0.6, M.graphite, side * (length / 2 - 0.15), 0.21, 0));
    return group;
  };

  const workbench = (parent, { x, z, ry = 0, width = 5 }) => {
    const group = placed(parent, x, z, ry);
    box(group, width, 0.07, 0.9, M.steel, 0, 0.92, 0);
    box(group, width - 0.2, 0.55, 0.8, M.graphite, 0, 0.55, 0);
    box(group, width - 0.2, 0.04, 0.8, M.graphite, 0, 0.2, 0);
    box(group, width, 1.1, 0.05, M.graphite, 0, 1.55, -0.42);
    for (let tool = 0; tool < 8; tool += 1) box(group, 0.07, 0.34 + (tool % 3) * 0.1, 0.03, M.steel, -width / 2 + 0.45 + tool * 0.38, 1.7, -0.38, { shadow: false });
    screenPanel(group, 0.9, 0.52, 0.6, 1.33, -0.25, M.screenRed, 3);
    box(group, 0.5, 0.2, 0.26, accent(0xd04a3a, 0.35), -1.2, 1.08, 0.05);
    box(group, 0.2, 0.012, 0.2, M.steel, -0.2, 0.96, 0.1);
    return group;
  };

  const meetingTable = (parent, { x, z, width = 3.4, depth = 1.5 }) => {
    const group = placed(parent, x, z);
    box(group, width, 0.06, depth, M.white, 0, 0.76, 0);
    box(group, width - 0.5, 0.7, 0.12, M.graphite, 0, 0.38, 0);
    box(group, 0.3, 0.02, 0.3, M.graphite, 0, 0.8, 0, { shadow: false });
    cylinder(group, 0.07, 0.07, 0.02, accent(0x14b8a6, 1), 0, 0.82, 0, 18);
    return group;
  };

  const rug = (parent, { x, z, width, depth, color, y = 0.012 }) => {
    const group = placed(parent, x, z);
    box(group, width, 0.02, depth, color, 0, y, 0, { shadow: false });
    return group;
  };

  const signPanel = (parent, { x, y, z, width, height, text, background = "#10151d", color = "#ffffff", accentColor = "#3566f0" }) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = Math.round(1024 * (height / width));
    const context = canvas.getContext("2d");
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = accentColor;
    context.fillRect(0, canvas.height - 14, canvas.width, 14);
    context.fillStyle = color;
    context.font = `700 ${Math.round(canvas.height * 0.4)}px "Inter", "Segoe UI", system-ui, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, canvas.width / 2, canvas.height / 2 - 4);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    const face = new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.4 });
    const group = placed(parent, x, z);
    box(group, width + 0.08, height + 0.08, 0.05, M.graphite, 0, y, 0, { shadow: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), face);
    mesh.position.set(0, y, 0.03);
    group.add(mesh);
    return group;
  };

  const partitionScreen = (parent, { x, z, ry = 0, width = 2, height = 1.5, tone = M.fog }) => {
    const group = placed(parent, x, z, ry);
    box(group, width, height, 0.06, tone, 0, height / 2 + 0.1, 0);
    [-1, 1].forEach((side) => box(group, 0.05, 0.1, 0.4, M.graphite, side * (width / 2 - 0.1), 0.05, 0));
    return group;
  };

  return { desk, chair, stool, sofa, roundTable, pouf, beanBag, plant, serverRack, counter, coffeeBar, glassBoard, wallLedge, lockers, bench, workbench, meetingTable, rug, signPanel, partitionScreen, box, cylinder, materials: M, accent };
};
