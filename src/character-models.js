import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { HIP_Y, buildClips, buildRobotModel } from "./robot-model.js";

// Le personnage d'une conversation change avec l'univers de la scène : robot, équipier d'Among Us, Steve, minifig…
// Tous reprennent le squelette du robot (mêmes noms de groupes), donc les mêmes animations. Le matériau « Main »
// prend la couleur de la conversation (combinaison, T-shirt…).

const CHARACTER_BY_STYLE = {
  amongus: "crewmate",
  minecraft: "steve",
  lego: "minifig",
  chef: "chef",
  cyber: "cyber",
  xefi: "xefi",
};

export const characterFor = (styleId) => CHARACTER_BY_STYLE[styleId] ?? "robot";

const standard = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: options.roughness ?? 0.6, metalness: options.metalness ?? 0.02, emissive: options.emissive ?? 0x000000, emissiveIntensity: options.emissiveIntensity ?? 1 });

const mainMaterial = (roughness = 0.5) => {
  const material = standard(0xffffff, { roughness });
  material.name = "Main";
  return material;
};

const mesh = (geometry, material, parent, x = 0, y = 0, z = 0) => {
  const node = new THREE.Mesh(geometry, material);
  node.position.set(x, y, z);
  parent.add(node);
  return node;
};

const group = (name, parent, x = 0, y = 0, z = 0) => {
  const node = new THREE.Group();
  node.name = name;
  node.position.set(x, y, z);
  parent.add(node);
  return node;
};

const finish = (scene) => {
  scene.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });
  return { scene, animations: buildClips() };
};

const pixelFace = (paint) => {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  const context = canvas.getContext("2d");
  paint((color, x, y, width = 1, height = 1) => {
    context.fillStyle = color;
    context.fillRect(x, y, width, height);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
};

// Équipier d'Among Us : un haricot de la couleur de la conversation, une visière, un sac à dos, deux pattes courtes.
const buildCrewmate = () => {
  const main = mainMaterial(0.4);
  const visor = standard(0xa5dcf2, { roughness: 0.08, metalness: 0.2, emissive: 0x4aa6c9, emissiveIntensity: 0.35 });
  const shine = standard(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.8 });

  const scene = new THREE.Group();
  scene.name = "Crewmate";
  const body = group("Body", scene);
  const hips = group("Hips", body, 0, HIP_Y, 0);
  const leg = (name, side) => {
    const hip = group(`Leg${name}`, hips, side * 0.2, 0, 0);
    mesh(new THREE.CapsuleGeometry(0.14, 0.12, 6, 16), main, hip, 0, -0.13, 0);
    const shin = group(`Shin${name}`, hip, 0, -0.26, 0);
    mesh(new THREE.CapsuleGeometry(0.13, 0.06, 6, 16), main, shin, 0, -0.1, 0);
  };
  leg("L", -1);
  leg("R", 1);

  const torso = group("Torso", hips);
  const head = group("Head", torso, 0, 0.06, 0);
  const bean = mesh(new THREE.CapsuleGeometry(0.42, 0.5, 8, 24), main, head, 0, 0.4, 0);
  bean.scale.set(1, 1, 0.86);
  mesh(new RoundedBoxGeometry(0.26, 0.56, 0.5, 4, 0.1), main, head, 0, 0.36, -0.42);
  const visorMesh = mesh(new THREE.SphereGeometry(0.3, 24, 16), visor, head, 0, 0.62, 0.27);
  visorMesh.scale.set(1.3, 0.72, 0.62);
  const glint = mesh(new THREE.SphereGeometry(0.06, 12, 10), shine, head, -0.18, 0.72, 0.4);
  glint.scale.set(1.6, 0.7, 0.5);

  ["L", "R"].forEach((name, index) => {
    const shoulder = group(`Arm${name}`, head, (index ? 1 : -1) * 0.5, 0.52, 0);
    group(`Forearm${name}`, shoulder, 0, -0.22, 0);
  });
  return finish(scene);
};

// Humanoïde à membres carrés ou ronds : Steve et la minifig ne diffèrent que par les proportions et la tête.
const buildHumanoid = ({ name, torso: [torsoWidth, torsoHeight, torsoDepth], limb, legColor, skinColor, round = false, sleeves = false, makeHead }) => {
  const main = mainMaterial(0.55);
  const legMaterial = standard(legColor, { roughness: 0.6 });
  const skin = standard(skinColor, { roughness: 0.55 });
  const shape = (width, height, depth) => (round ? new RoundedBoxGeometry(width, height, depth, 3, Math.min(width, depth) * 0.22) : new THREE.BoxGeometry(width, height, depth));
  const segment = 0.27;

  const scene = new THREE.Group();
  scene.name = name;
  const body = group("Body", scene);
  const hips = group("Hips", body, 0, HIP_Y, 0);
  const leg = (side, label) => {
    const hip = group(`Leg${label}`, hips, side * limb * 0.55, 0, 0);
    mesh(shape(limb, segment, limb), legMaterial, hip, 0, -segment / 2, 0);
    const shin = group(`Shin${label}`, hip, 0, -segment, 0);
    mesh(shape(limb, segment, limb), legMaterial, shin, 0, -segment / 2, 0);
  };
  leg(-1, "L");
  leg(1, "R");

  const torso = group("Torso", hips);
  mesh(shape(torsoWidth, torsoHeight, torsoDepth), main, torso, 0, torsoHeight / 2, 0);
  const head = group("Head", torso, 0, torsoHeight, 0);
  makeHead({ head, skin, main });

  const armWidth = limb * 0.9;
  [-1, 1].forEach((side) => {
    const label = side < 0 ? "L" : "R";
    const shoulder = group(`Arm${label}`, torso, side * (torsoWidth / 2 + armWidth / 2), torsoHeight - armWidth * 0.5, 0);
    mesh(shape(armWidth, 0.3, armWidth), main, shoulder, 0, -0.14, 0);
    const forearm = group(`Forearm${label}`, shoulder, 0, -0.28, 0);
    mesh(shape(armWidth, 0.26, armWidth), sleeves ? main : skin, forearm, 0, -0.12, 0);
    if (round) mesh(new THREE.SphereGeometry(armWidth * 0.62, 14, 10), skin, forearm, 0, -0.27, 0);
  });
  return finish(scene);
};

const buildSteve = () => {
  const face = pixelFace((fill) => {
    fill("#c89a7a", 0, 0, 8, 8);
    fill("#4a3320", 0, 0, 8, 2);
    fill("#4a3320", 0, 2, 1, 2);
    fill("#4a3320", 7, 2, 1, 2);
    fill("#ffffff", 1, 4, 2, 1);
    fill("#3b3a8a", 2, 4);
    fill("#3b3a8a", 5, 4);
    fill("#ffffff", 6, 4);
    fill("#a8705a", 3, 5, 2, 1);
    fill("#7a4a3a", 2, 6, 4, 1);
  });
  return buildHumanoid({
    name: "Steve",
    torso: [0.5, 0.68, 0.28],
    limb: 0.24,
    legColor: 0x3a43a8,
    skinColor: 0xc89a7a,
    sleeves: false,
    makeHead: ({ head }) => mesh(new THREE.BoxGeometry(0.52, 0.52, 0.52), new THREE.MeshStandardMaterial({ map: face, roughness: 0.9 }), head, 0, 0.27, 0),
  });
};

const buildMinifig = () => {
  const dark = standard(0x14171c, { roughness: 0.5 });
  return buildHumanoid({
    name: "Minifig",
    torso: [0.5, 0.48, 0.3],
    limb: 0.21,
    legColor: 0x1f3a8a,
    skinColor: 0xf6d21c,
    round: true,
    sleeves: true,
    makeHead: ({ head, skin }) => {
      mesh(new THREE.CylinderGeometry(0.2, 0.21, 0.26, 24), skin, head, 0, 0.15, 0);
      mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 16), skin, head, 0, 0.31, 0);
      [-0.065, 0.065].forEach((eyeX) => mesh(new THREE.BoxGeometry(0.035, 0.05, 0.02), dark, head, eyeX, 0.19, 0.205));
      mesh(new THREE.BoxGeometry(0.12, 0.025, 0.02), dark, head, 0, 0.09, 0.205);
    },
  });
};

const GHOST_TOP = 1.06;
const GHOST_HEM = -0.5;
const GHOST_PROFILE = [[0.5, GHOST_HEM], [0.54, -0.28], [0.52, 0.05], [0.5, 0.38], [0.44, 0.72], [0.31, 0.95], [0.14, 1.04], [0, GHOST_TOP]];
const GHOST_COLORS = { hem: new THREE.Color(0x6f7dff), top: new THREE.Color(0xd6e8ff) };
const GHOST_ORANGE = 0xfc6d26;

// Corps de fantôme : une surface de révolution dont l'ourlet ondule, avec un dégradé de transparence (très léger en bas, plus dense en haut).
const ghostBodyGeometry = () => {
  const points = new THREE.SplineCurve(GHOST_PROFILE.map(([radius, height]) => new THREE.Vector2(radius, height))).getPoints(28);
  const geometry = new THREE.LatheGeometry(points, 48);
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 4);
  const tint = new THREE.Color();
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    const height = positions.getY(index);
    const lift = (height - GHOST_HEM) / (GHOST_TOP - GHOST_HEM);
    const hem = Math.max(0, 1 - lift * 5);
    positions.setY(index, height - hem * (0.5 + 0.5 * Math.sin(Math.atan2(x, z) * 5)) * 0.14);
    tint.lerpColors(GHOST_COLORS.hem, GHOST_COLORS.top, Math.min(1, lift * 1.4));
    colors.set([tint.r, tint.g, tint.b, 0.3 + 0.55 * Math.min(1, lift * 1.6)], index * 4);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 4));
  geometry.computeVertexNormals();
  return geometry;
};

// Une merge request : un fantôme translucide avec le symbole de fusion de GitLab sur le ventre. Même squelette que les robots (les jambes sont vides, il flotte).
const buildMergeRequest = () => {
  const glass = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, depthWrite: false, roughness: 0.35, metalness: 0, emissive: 0x2a4fc2, emissiveIntensity: 0.55, side: THREE.DoubleSide });
  const limb = new THREE.MeshStandardMaterial({ color: 0xb4c9ff, transparent: true, opacity: 0.78, depthWrite: false, roughness: 0.35, emissive: 0x2a4fc2, emissiveIntensity: 0.55 });
  const ink = standard(0x182550, { roughness: 0.4 });
  const blush = new THREE.MeshStandardMaterial({ color: 0xff9ab8, transparent: true, opacity: 0.55, depthWrite: false, roughness: 0.8 });
  const shine = standard(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.9 });
  const orange = standard(GHOST_ORANGE, { roughness: 0.35, emissive: GHOST_ORANGE, emissiveIntensity: 0.9 });

  const scene = new THREE.Group();
  scene.name = "MergeRequest";
  const body = group("Body", scene);
  const hips = group("Hips", body, 0, HIP_Y, 0);
  ["L", "R"].forEach((label) => {
    const hip = group(`Leg${label}`, hips, 0, 0, 0);
    group(`Shin${label}`, hip, 0, -0.26, 0);
  });

  const torso = group("Torso", hips);
  mesh(ghostBodyGeometry(), glass, torso);

  const emblem = group("Merge", torso, 0, 0.3, 0.505);
  emblem.rotation.x = -0.12;
  const node = (x, y) => mesh(new THREE.SphereGeometry(0.052, 16, 12), orange, emblem, x, y, 0);
  const link = (fromX, fromY, toX, toY) => {
    const length = Math.hypot(toX - fromX, toY - fromY);
    const bar = mesh(new THREE.CylinderGeometry(0.017, 0.017, length, 8), orange, emblem, (fromX + toX) / 2, (fromY + toY) / 2, 0);
    bar.rotation.z = Math.atan2(toX - fromX, toY - fromY) * -1;
  };
  node(-0.11, 0.1);
  node(0.11, 0.1);
  node(0, -0.1);
  link(-0.11, 0.1, 0, -0.1);
  link(0.11, 0.1, 0, -0.1);

  const head = group("Head", torso, 0, 0.06, 0);
  [-1, 1].forEach((side) => {
    mesh(new THREE.SphereGeometry(0.075, 16, 12), ink, head, side * 0.17, 0.58, 0.45).scale.set(0.8, 1.35, 0.5);
    mesh(new THREE.SphereGeometry(0.02, 8, 6), shine, head, side * 0.17 + 0.02, 0.63, 0.478);
    mesh(new THREE.CircleGeometry(0.06, 16), blush, head, side * 0.3, 0.49, 0.4).rotation.y = side * 0.55;
  });
  const smile = mesh(new THREE.TorusGeometry(0.05, 0.011, 8, 16, Math.PI), ink, head, 0, 0.52, 0.47);
  smile.rotation.z = Math.PI;
  smile.rotation.x = -0.1;

  ["L", "R"].forEach((label, index) => {
    const side = index ? 1 : -1;
    const shoulder = group(`Arm${label}`, torso, side * 0.5, 0.58, 0);
    mesh(new THREE.CapsuleGeometry(0.075, 0.2, 6, 14), limb, shoulder, 0, -0.14, 0);
    const forearm = group(`Forearm${label}`, shoulder, 0, -0.26, 0);
    mesh(new THREE.SphereGeometry(0.085, 14, 10), limb, forearm, 0, -0.1, 0);
  });

  scene.traverse((object) => {
    if (object.isMesh) object.renderOrder = 2;
  });
  return { scene, animations: buildClips() };
};

export const buildMergeRequestModel = buildMergeRequest;

const buildChef = () =>
  buildRobotModel({
    antenna: false,
    decorate: ({ head, mesh: add, materials }) => {
      const white = standard(0xffffff, { roughness: 0.8 });
      add(new THREE.CylinderGeometry(0.34, 0.38, 0.26, 28), white, head, 0, 1.0, 0);
      [[0, 1.3, 0, 0.32], [0.24, 1.22, 0.04, 0.22], [-0.24, 1.22, -0.04, 0.22], [0.04, 1.22, -0.24, 0.22], [-0.04, 1.22, 0.24, 0.2]].forEach(([x, y, z, radius]) => add(new THREE.SphereGeometry(radius, 20, 14), white, head, x, y, z));
      add(new RoundedBoxGeometry(0.36, 0.07, 0.05, 2, 0.02), materials.ink, head, 0, 0.44, 0.325);
      add(new RoundedBoxGeometry(0.72, 0.4, 0.04, 3, 0.02), white, head, 0, 0.12, 0.33);
      add(new THREE.BoxGeometry(0.86, 0.07, 0.5), standard(0xc62828, { roughness: 0.7 }), head, 0, 0.0, 0);
    },
  });

const buildCyber = () =>
  buildRobotModel({
    antenna: false,
    clay: 0x1c1736,
    ink: 0x07050d,
    cream: 0xff2bd6,
    metalness: 0.7,
    decorate: ({ head, mesh: add, materials }) => {
      materials.cream.emissive.set(0xff2bd6);
      materials.cream.emissiveIntensity = 1.4;
      const cyan = standard(0x00e5ff, { emissive: 0x00e5ff, emissiveIntensity: 1.6 });
      add(new RoundedBoxGeometry(0.7, 0.11, 0.06, 3, 0.03), cyan, head, 0, 0.6, 0.335);
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8), materials.ink, head, 0.3, 1.05, 0);
      add(new THREE.SphereGeometry(0.06, 12, 10), standard(0xff2bd6, { emissive: 0xff2bd6, emissiveIntensity: 1.8 }), head, 0.3, 1.22, 0);
      add(new THREE.BoxGeometry(1.0, 0.04, 0.64), cyan, head, 0, 0.02, 0);
    },
  });

const buildXefi = () =>
  buildRobotModel({
    clay: 0xe10600,
    ink: 0x111111,
    cream: 0xffffff,
    decorate: ({ head, mesh: add, materials }) => {
      add(new RoundedBoxGeometry(0.46, 0.46, 0.03, 3, 0.04), standard(0x191919, { roughness: 0.5 }), head, 0, 0.27, 0.322);
      [Math.PI / 4, -Math.PI / 4].forEach((angle) => {
        const bar = add(new THREE.BoxGeometry(0.4, 0.07, 0.02), materials.cream, head, 0, 0.27, 0.345);
        bar.rotation.z = angle;
      });
    },
  });

const BUILDERS = {
  robot: () => buildRobotModel(),
  crewmate: buildCrewmate,
  steve: buildSteve,
  minifig: buildMinifig,
  chef: buildChef,
  cyber: buildCyber,
  xefi: buildXefi,
};

export const buildCharacterModel = (characterId) => (BUILDERS[characterId] ?? BUILDERS.robot)();
