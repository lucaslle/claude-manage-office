import * as THREE from "three";
import { applyBoxUv } from "../textures.js";

// Cyberpunk : une tour de bureaux de nuit. Murs sombres cernés de néon, sols quadrillés dans la couleur de chaque pièce,
// mobilier noir à liserés lumineux, hologramme sur la table de réunion et, derrière, la ville et ses fenêtres allumées.

const NEON = [0xff2bd6, 0x00e5ff, 0xffe600, 0x7a2bff, 0x00ffa3];

const makeWindowTextures = () => {
  const size = 128;
  const colorCanvas = document.createElement("canvas");
  colorCanvas.width = size;
  colorCanvas.height = size;
  const emissiveCanvas = document.createElement("canvas");
  emissiveCanvas.width = size;
  emissiveCanvas.height = size;
  const colorContext = colorCanvas.getContext("2d");
  const emissiveContext = emissiveCanvas.getContext("2d");
  colorContext.fillStyle = "#0c0a1a";
  colorContext.fillRect(0, 0, size, size);
  emissiveContext.fillStyle = "#000000";
  emissiveContext.fillRect(0, 0, size, size);
  let state = 17;
  const random = () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
  for (let row = 0; row < 16; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      if (random() < 0.45) continue;
      const lit = `#${NEON[Math.floor(random() * NEON.length)].toString(16).padStart(6, "0")}`;
      emissiveContext.fillStyle = lit;
      emissiveContext.globalAlpha = 0.35 + random() * 0.65;
      emissiveContext.fillRect(column * 16 + 3, row * 8 + 2, 10, 4);
    }
  }
  emissiveContext.globalAlpha = 1;
  const build = (canvas) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  };
  return { map: build(colorCanvas), emissiveMap: build(emissiveCanvas) };
};

const props = ({ box, cylinder, placed, materials: M, accent, base, animated }) => {
  const holo = new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 1.2, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
  const ringMaterial = new THREE.MeshStandardMaterial({ color: 0xff2bd6, emissive: 0xff2bd6, emissiveIntensity: 1.5, transparent: true, opacity: 0.7, depthWrite: false });

  return {
    desk: (parent, options) => {
      const group = base.desk(parent, options);
      const width = options.width ?? 2.6;
      const depth = options.depth ?? 1.1;
      box(group, width - 0.1, 0.025, 0.025, accent(0x00e5ff, 1.8), 0, 0.12, depth / 2 - 0.02, { shadow: false });
      return group;
    },

    meetingTable: (parent, options) => {
      const group = base.meetingTable(parent, options);
      const cone = cylinder(group, 0.05, 0.55, 1.1, holo, 0, 1.4, 0, 28);
      cone.castShadow = false;
      cone.renderOrder = 2;
      const ring = cylinder(group, 0.5, 0.5, 0.03, ringMaterial, 0, 1.4, 0, 32);
      ring.castShadow = false;
      ring.renderOrder = 2;
      animated.push((elapsed) => {
        ring.position.y = 1.05 + ((elapsed * 0.35) % 1) * 0.8;
        ring.scale.setScalar(0.4 + ((elapsed * 0.35) % 1) * 0.6);
        cone.rotation.y = elapsed * 0.8;
      });
      return group;
    },
  };
};

const decor = ({ world, props: kit, centerX, centerZ }) => {
  const { accent } = kit;

  const windows = makeWindowTextures();
  const skyline = new THREE.Group();
  world.add(skyline);
  let state = 5;
  const random = () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
  const tower = (x, z) => {
    const width = 4 + random() * 5;
    const depth = 4 + random() * 5;
    const height = 10 + random() * 38;
    const material = new THREE.MeshStandardMaterial({ color: 0x14112a, map: windows.map, emissive: 0xffffff, emissiveMap: windows.emissiveMap, emissiveIntensity: 1.1, roughness: 0.6 });
    const geometry = new THREE.BoxGeometry(width, height, depth);
    applyBoxUv(geometry, width, height, depth, 8);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, height / 2 - 1, z);
    skyline.add(mesh);
    const colorHex = NEON[Math.floor(random() * NEON.length)];
    const cap = new THREE.Mesh(new THREE.BoxGeometry(width + 0.2, 0.3, depth + 0.2), accent(colorHex, 2));
    cap.position.set(x, height - 1, z);
    skyline.add(cap);
  };
  for (let index = 0; index < 22; index += 1) tower(centerX - 40 + index * 4.6 + random() * 2, centerZ - 32 - random() * 22);
  for (let index = 0; index < 16; index += 1) tower(centerX - 40 - random() * 14 - 6, centerZ - 28 + index * 4.4 + random() * 2);
  for (let index = 0; index < 8; index += 1) tower(centerX + 44 + random() * 16, centerZ - 28 + index * 5 + random() * 2);

};

const FLOORS = {
  acc: "#1a1233",
  open: "#10172e",
  rev: "#161233",
  mrg: "#0f2230",
  pause: "#221420",
  fix: "#25101a",
  arch: "#121425",
  meet: "#0f1f2b",
  bug: "#2a1410",
};

export const CYBER_STYLE = {
  id: "cyber",
  materials: {
    white: { color: 0x2a2545, roughness: 0.3, metalness: 0.3 },
    offWhite: 0x3a3560,
    graphite: 0x120f1f,
    black: 0x07050d,
    steel: { color: 0x8f8bc4, roughness: 0.25, metalness: 0.9 },
    oak: 0x3b2457,
    navy: 0x1d2150,
    slate: 0x2d2b5a,
    fog: 0x44407a,
    pot: 0x1a1630,
    soil: 0x0a0812,
    leaf: { color: 0x00d1a0, emissive: 0x00e5b0, emissiveIntensity: 0.4 },
    leafDark: { color: 0x7a2bff, emissive: 0x5a1bd0, emissiveIntensity: 0.45 },
    screen: { color: 0x07141c, emissive: 0x00e5ff, emissiveIntensity: 1.1 },
    screenRed: { color: 0x1a0715, emissive: 0xff2bd6, emissiveIntensity: 1.1 },
    screenWhite: { color: 0x14233a, emissive: 0x66e0ff, emissiveIntensity: 0.8 },
    warm: { color: 0x2a1030, emissive: 0xff9de6, emissiveIntensity: 1.1 },
  },
  doorColors: [0xff2bd6, 0x00e5ff, 0xffe600, 0x7a2bff],
  noteColors: [0xffe600, 0xff2bd6, 0x00e5ff, 0x7dff6a],
  ledColors: [0x00ffa3, 0x00e5ff, 0xff2bd6],
  floors: Object.fromEntries(Object.entries(FLOORS).map(([roomId, color]) => [roomId, { color, kind: "neon" }])),
  walls: { plaster: { texture: "panel", color: "#1b1634", accent: "#ff2bd6" }, frameGlow: 0xff2bd6, frameGlowIntensity: 0.9 },
  ledgeIntensity: 2.4,
  sign: { background: "#07050f", color: "#7df9ff", glow: "#00e5ff", font: 'Consolas, "Courier New", monospace', weight: 800, emissive: 1.1 },
  props,
  decor,
};
