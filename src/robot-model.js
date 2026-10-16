import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export const HIP_Y = 0.54;
export const ARM_REST = 0.14;
const TURN = Math.PI * 2;

const CHANNELS = {
  "Body.rotation[y]": 0,
  "Hips.position[y]": HIP_Y,
  "Torso.rotation[x]": 0,
  "Head.rotation[x]": 0,
  "Head.rotation[y]": 0,
  "Head.rotation[z]": 0,
  "LegL.rotation[x]": 0,
  "LegR.rotation[x]": 0,
  "ShinL.rotation[x]": 0,
  "ShinR.rotation[x]": 0,
  "ArmL.rotation[x]": 0,
  "ArmL.rotation[z]": -ARM_REST,
  "ArmR.rotation[x]": 0,
  "ArmR.rotation[z]": ARM_REST,
  "ForearmL.rotation[x]": 0,
  "ForearmL.rotation[z]": 0,
  "ForearmR.rotation[x]": 0,
  "ForearmR.rotation[z]": 0,
};

const spread = (duration, values) => ({
  times: values.map((_, index) => (duration * index) / (values.length - 1)),
  values,
});

const hold = (value) => ({ times: [0], values: [value] });

const clip = (name, duration, tracks) =>
  new THREE.AnimationClip(
    name,
    duration,
    Object.entries(CHANNELS).map(([path, rest]) => {
      const custom = tracks[path];
      return custom ? new THREE.NumberKeyframeTrack(path, custom.times, custom.values) : new THREE.NumberKeyframeTrack(path, [0], [rest]);
    }),
  );

// Tous les personnages partagent ce squelette (Body, Hips, Torso, Head, LegL/R, ShinL/R, ArmL/R, ForearmL/R) : les clips s'appliquent à n'importe quel modèle qui le respecte.
export const buildClips = () => [
  clip("Idle", 3.2, {
    "Hips.position[y]": spread(3.2, [HIP_Y, HIP_Y + 0.02, HIP_Y]),
    "Head.rotation[y]": spread(3.2, [0, 0.18, 0, -0.12, 0]),
    "Head.rotation[x]": spread(3.2, [0, 0.05, 0]),
    "ArmL.rotation[z]": spread(3.2, [-ARM_REST, -ARM_REST - 0.05, -ARM_REST]),
    "ArmR.rotation[z]": spread(3.2, [ARM_REST, ARM_REST + 0.05, ARM_REST]),
  }),
  clip("Walking", 0.9, {
    "Hips.position[y]": spread(0.9, [HIP_Y, HIP_Y + 0.03, HIP_Y, HIP_Y + 0.03, HIP_Y]),
    "LegL.rotation[x]": spread(0.9, [0.55, -0.55, 0.55]),
    "LegR.rotation[x]": spread(0.9, [-0.55, 0.55, -0.55]),
    "ShinL.rotation[x]": spread(0.9, [0.1, 0.7, 0.1, 0.0, 0.1]),
    "ShinR.rotation[x]": spread(0.9, [0.1, 0.0, 0.1, 0.7, 0.1]),
    "ArmL.rotation[x]": spread(0.9, [-0.45, 0.45, -0.45]),
    "ArmR.rotation[x]": spread(0.9, [0.45, -0.45, 0.45]),
    "ForearmL.rotation[x]": hold(-0.35),
    "ForearmR.rotation[x]": hold(-0.35),
    "Torso.rotation[x]": hold(0.06),
  }),
  clip("Storm", 0.55, {
    "Hips.position[y]": spread(0.55, [HIP_Y, HIP_Y + 0.05, HIP_Y, HIP_Y + 0.05, HIP_Y]),
    "LegL.rotation[x]": spread(0.55, [0.75, -0.75, 0.75]),
    "LegR.rotation[x]": spread(0.55, [-0.75, 0.75, -0.75]),
    "ShinL.rotation[x]": spread(0.55, [0.1, 0.8, 0.1, 0.0, 0.1]),
    "ShinR.rotation[x]": spread(0.55, [0.1, 0.0, 0.1, 0.8, 0.1]),
    "ArmL.rotation[x]": hold(0.25),
    "ArmR.rotation[x]": hold(0.25),
    "ArmL.rotation[z]": hold(-0.5),
    "ArmR.rotation[z]": hold(0.5),
    "ForearmL.rotation[x]": hold(-1.3),
    "ForearmR.rotation[x]": hold(-1.3),
    "Torso.rotation[x]": hold(0.2),
    "Head.rotation[x]": hold(0.3),
  }),
  clip("Fume", 0.8, {
    "Hips.position[y]": spread(0.8, [HIP_Y, HIP_Y + 0.06, HIP_Y, HIP_Y + 0.06, HIP_Y]),
    "Head.rotation[y]": spread(0.8, [0, 0.5, -0.5, 0.5, 0]),
    "Head.rotation[x]": hold(0.25),
    "ArmL.rotation[z]": hold(-0.5),
    "ArmR.rotation[z]": hold(0.5),
    "ForearmL.rotation[x]": hold(-1.3),
    "ForearmR.rotation[x]": hold(-1.3),
  }),
  clip("Wave", 1.6, {
    "ArmR.rotation[z]": hold(2.5),
    "ForearmR.rotation[z]": spread(1.6, [0.7, -0.4, 0.7, -0.4, 0.7]),
    "Head.rotation[z]": hold(-0.12),
    "Hips.position[y]": spread(1.6, [HIP_Y, HIP_Y + 0.015, HIP_Y]),
  }),
  clip("Sitting", 0.5, {
    "Hips.position[y]": hold(HIP_Y - 0.26),
    "LegL.rotation[x]": hold(-1.45),
    "LegR.rotation[x]": hold(-1.45),
    "ShinL.rotation[x]": hold(1.4),
    "ShinR.rotation[x]": hold(1.4),
    "ArmL.rotation[x]": hold(-1.05),
    "ArmR.rotation[x]": hold(-1.05),
    "ForearmL.rotation[x]": hold(-0.45),
    "ForearmR.rotation[x]": hold(-0.45),
    "Head.rotation[x]": hold(0.14),
  }),
  clip("Punch", 0.7, {
    "ArmR.rotation[x]": spread(0.7, [-1.9, -0.9, -1.9]),
    "ForearmR.rotation[x]": spread(0.7, [-1.2, -0.3, -1.2]),
    "ArmL.rotation[x]": hold(-0.6),
    "ForearmL.rotation[x]": hold(-0.6),
    "Head.rotation[x]": hold(0.2),
    "Torso.rotation[x]": spread(0.7, [0.1, 0.18, 0.1]),
  }),
  clip("Dance", 1.2, {
    "Body.rotation[y]": { times: [0, 1.2], values: [0, TURN] },
    "Hips.position[y]": spread(1.2, [HIP_Y, HIP_Y + 0.14, HIP_Y, HIP_Y + 0.14, HIP_Y]),
    "ArmL.rotation[z]": hold(-2.4),
    "ArmR.rotation[z]": hold(2.4),
    "ForearmL.rotation[z]": spread(1.2, [-0.5, 0.5, -0.5, 0.5, -0.5]),
    "ForearmR.rotation[z]": spread(1.2, [0.5, -0.5, 0.5, -0.5, 0.5]),
    "LegL.rotation[x]": spread(1.2, [0.3, -0.3, 0.3, -0.3, 0.3]),
    "LegR.rotation[x]": spread(1.2, [-0.3, 0.3, -0.3, 0.3, -0.3]),
  }),
  clip("Yes", 1.0, {
    "Head.rotation[x]": spread(1.0, [0, 0.32, 0, 0.32, 0]),
  }),
  clip("No", 1.0, {
    "Head.rotation[y]": spread(1.0, [0, 0.45, -0.45, 0.45, 0]),
  }),
  clip("ThumbsUp", 1.4, {
    "ArmR.rotation[x]": { times: [0, 0.3, 1.1, 1.4], values: [0, -1.3, -1.3, 0] },
    "ArmR.rotation[z]": { times: [0, 0.3, 1.1, 1.4], values: [ARM_REST, 0.35, 0.35, ARM_REST] },
    "ForearmR.rotation[x]": { times: [0, 0.3, 1.1, 1.4], values: [0, -1.5, -1.5, 0] },
    "Head.rotation[z]": { times: [0, 0.3, 1.1, 1.4], values: [0, 0.14, 0.14, 0] },
  }),
];

const CLAUDE_TERRACOTTA = 0xd97757;
const CLAUDE_CREAM = 0xf4ece2;
const STAR_RAYS = 12;

const starShape = (outer, inner) => {
  const shape = new THREE.Shape();
  for (let point = 0; point < STAR_RAYS * 2; point += 1) {
    const radius = point % 2 === 0 ? outer : inner;
    const angle = (point / (STAR_RAYS * 2)) * TURN;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (point === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
};

// options : couleurs du robot, yeux lumineux, et decorate({ head, torso, hips, mesh, group, materials }) pour ajouter des accessoires (chapeau, antenne…).
export const buildRobotModel = ({ clay = CLAUDE_TERRACOTTA, ink = 0x24201c, cream = CLAUDE_CREAM, metalness = 0.02, decorate = null } = {}) => {
  const mainMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.05 });
  mainMaterial.name = "Main";
  const clayMaterial = new THREE.MeshStandardMaterial({ color: clay, roughness: 0.6, metalness });
  const inkMaterial = new THREE.MeshStandardMaterial({ color: ink, roughness: 0.5, metalness: 0.1 });
  const creamMaterial = new THREE.MeshStandardMaterial({ color: cream, roughness: 0.7, metalness: 0 });
  const shineMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.4 });

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

  const scene = new THREE.Group();
  scene.name = "Robot";
  const body = group("Body", scene);
  const hips = group("Hips", body, 0, HIP_Y, 0);

  const leg = (name, side) => {
    const hip = group(`Leg${name}`, hips, side * 0.24, 0, 0);
    mesh(new THREE.CapsuleGeometry(0.09, 0.14, 6, 16), clayMaterial, hip, 0, -0.12, 0);
    const shin = group(`Shin${name}`, hip, 0, -0.26, 0);
    mesh(new THREE.CapsuleGeometry(0.08, 0.1, 6, 16), clayMaterial, shin, 0, -0.1, 0);
    mesh(new RoundedBoxGeometry(0.24, 0.11, 0.32, 4, 0.05), mainMaterial, shin, 0, -0.22, 0.05);
  };
  leg("L", -1);
  leg("R", 1);

  const torso = group("Torso", hips);
  const head = group("Head", torso, 0, 0.06, 0);
  mesh(new RoundedBoxGeometry(0.98, 0.9, 0.62, 5, 0.18), clayMaterial, head, 0, 0.45, 0);
  [-1, 1].forEach((side) => {
    mesh(new RoundedBoxGeometry(0.13, 0.18, 0.05, 3, 0.035), inkMaterial, head, side * 0.2, 0.6, 0.31);
    mesh(new THREE.SphereGeometry(0.028, 12, 10), shineMaterial, head, side * 0.2 + 0.03, 0.645, 0.335);
  });
  const star = mesh(new THREE.ShapeGeometry(starShape(0.16, 0.095)), creamMaterial, head, 0, 0.26, 0.318);
  star.castShadow = false;
  mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.01, 24), creamMaterial, head, 0, 0.26, 0.32).rotation.x = Math.PI / 2;

  const arm = (name, side) => {
    const shoulder = group(`Arm${name}`, head, side * 0.5, 0.52, 0);
    mesh(new THREE.CapsuleGeometry(0.08, 0.16, 6, 16), clayMaterial, shoulder, 0, -0.1, 0);
    const forearm = group(`Forearm${name}`, shoulder, 0, -0.22, 0);
    mesh(new THREE.CapsuleGeometry(0.075, 0.12, 6, 16), clayMaterial, forearm, 0, -0.08, 0);
    mesh(new THREE.SphereGeometry(0.1, 20, 16), mainMaterial, forearm, 0, -0.2, 0);
  };
  arm("L", -1);
  arm("R", 1);

  decorate?.({ head, torso, hips, mesh, group, materials: { main: mainMaterial, clay: clayMaterial, ink: inkMaterial, cream: creamMaterial, shine: shineMaterial } });

  scene.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });

  return { scene, animations: buildClips() };
};
