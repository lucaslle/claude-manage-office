import * as THREE from "three";

// Xefi : l'immeuble aux couleurs de l'entreprise. Rouge Xefi (#E10600), noir et blanc partout :
// liserés rouges, enseigne « XEFI » à l'accueil avec son logo qui tourne, signature de l'entreprise en salle de réunion.

const RED = 0xe10600;

const decor = ({ room, props: kit, animated, backWall }) => {
  const { box, placed, materials: M } = kit;

  const red = new THREE.MeshStandardMaterial({ color: RED, roughness: 0.35, emissive: RED, emissiveIntensity: 0.25 });
  const pedestal = placed(room("acc"), -4.2, -3.0);
  box(pedestal, 0.9, 0.12, 0.9, M.graphite, 0, 0.06, 0);
  box(pedestal, 0.7, 0.55, 0.7, M.white, 0, 0.4, 0);
  const logo = placed(pedestal, 0, 0, 0, 1.4);
  [Math.PI / 4, -Math.PI / 4].forEach((angle) => {
    const bar = box(logo, 0.17, 1.15, 0.17, red, 0, 0, 0);
    bar.rotation.z = angle;
  });
  animated.push((elapsed) => {
    logo.rotation.y = elapsed * 0.6;
  });

  kit.signPanel(room("meet"), { x: 0.6, y: 2.95, z: backWall, width: 3.4, height: 0.5, text: "La proximité informatique", accentColor: "#e10600" });
};

const FLOORS = {
  acc: { color: "#eceeef", kind: "tile" },
  open: { color: "#6a6e74", kind: "carpet" },
  rev: { color: "#5c6066", kind: "carpet" },
  draft: { color: "#d9dadc", kind: "carpet" },
  fix: { color: "#8a8d92", kind: "concrete" },
  arch: { color: "#55585d", kind: "carpet" },
  meet: { color: "#6a6e74", kind: "carpet" },
  bug: { color: "#3a3a3d", kind: "concrete" },
};

export const XEFI_STYLE = {
  id: "xefi",
  accentColor: RED,
  receptionSign: "XEFI",
  materials: {
    white: 0xf6f6f7,
    offWhite: 0xe4e5e7,
    graphite: 0x202020,
    black: 0x111111,
    navy: 0x3a3a3d,
    slate: 0x55585d,
    fog: 0xc9ccd0,
  },
  doorColors: [RED, 0x202020, 0xf6f6f7, 0x8a8d92],
  noteColors: [0xffffff, 0xf1c644, RED, 0xbfc3c8],
  ledColors: [0xff4a40, 0xffffff, 0xf1c644],
  floors: FLOORS,
  sign: { background: "#191919", color: "#ffffff", accent: "#e10600", weight: 800 },
  decor,
};
