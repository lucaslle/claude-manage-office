import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const HIP_Y = 0.74;
const ARM_REST = 0.14;
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

const buildClips = () => [
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
  clip("Wave", 1.6, {
    "ArmR.rotation[z]": hold(2.5),
    "ForearmR.rotation[z]": spread(1.6, [0.7, -0.4, 0.7, -0.4, 0.7]),
    "Head.rotation[z]": hold(-0.12),
    "Hips.position[y]": spread(1.6, [HIP_Y, HIP_Y + 0.015, HIP_Y]),
  }),
  clip("Sitting", 0.5, {
    "Hips.position[y]": hold(HIP_Y - 0.3),
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

export const buildRobotModel = () => {
  const mainMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0.05 });
  mainMaterial.name = "Main";
  const shellMaterial = new THREE.MeshStandardMaterial({ color: 0xeef1f5, roughness: 0.42, metalness: 0.04 });
  const accentMaterial = new THREE.MeshStandardMaterial({ color: 0x2b303a, roughness: 0.55, metalness: 0.25 });
  const visorMaterial = new THREE.MeshStandardMaterial({ color: 0x0d1117, roughness: 0.12, metalness: 0.3 });
  const glowMaterial = new THREE.MeshStandardMaterial({ color: 0xc6f1ff, emissive: 0x7fd8ff, emissiveIntensity: 2.2, roughness: 0.3 });

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
    const hip = group(`Leg${name}`, hips, side * 0.17, 0, 0);
    mesh(new THREE.SphereGeometry(0.1, 20, 16), accentMaterial, hip);
    mesh(new THREE.CapsuleGeometry(0.085, 0.24, 6, 16), shellMaterial, hip, 0, -0.17, 0);
    const shin = group(`Shin${name}`, hip, 0, -0.34, 0);
    mesh(new THREE.SphereGeometry(0.08, 20, 16), accentMaterial, shin);
    mesh(new THREE.CapsuleGeometry(0.075, 0.2, 6, 16), shellMaterial, shin, 0, -0.15, 0);
    mesh(new RoundedBoxGeometry(0.2, 0.1, 0.32, 4, 0.045), mainMaterial, shin, 0, -0.35, 0.05);
  };
  leg("L", -1);
  leg("R", 1);

  const torso = group("Torso", hips);
  const egg = mesh(new THREE.SphereGeometry(0.4, 40, 28), mainMaterial, torso, 0, 0.5, 0);
  egg.scale.set(0.85, 1.15, 0.78);
  mesh(new RoundedBoxGeometry(0.26, 0.2, 0.06, 4, 0.025), visorMaterial, torso, 0, 0.56, 0.29);
  mesh(new RoundedBoxGeometry(0.14, 0.035, 0.02, 3, 0.01), glowMaterial, torso, 0, 0.56, 0.325);
  mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.16, 20), accentMaterial, torso, 0, 1.0, 0);

  const arm = (name, side) => {
    const shoulder = group(`Arm${name}`, torso, side * 0.4, 0.74, 0);
    mesh(new THREE.SphereGeometry(0.095, 20, 16), accentMaterial, shoulder);
    mesh(new THREE.CapsuleGeometry(0.07, 0.24, 6, 16), shellMaterial, shoulder, 0, -0.17, 0);
    const forearm = group(`Forearm${name}`, shoulder, 0, -0.36, 0);
    mesh(new THREE.SphereGeometry(0.075, 20, 16), accentMaterial, forearm);
    mesh(new THREE.CapsuleGeometry(0.065, 0.2, 6, 16), shellMaterial, forearm, 0, -0.14, 0);
    mesh(new THREE.SphereGeometry(0.095, 20, 16), mainMaterial, forearm, 0, -0.32, 0);
  };
  arm("L", -1);
  arm("R", 1);

  const head = group("Head", torso, 0, 1.06, 0);
  const skull = mesh(new THREE.SphereGeometry(0.31, 40, 28), mainMaterial, head, 0, 0.26, 0);
  skull.scale.set(1, 0.88, 0.94);
  const visor = mesh(new THREE.SphereGeometry(0.315, 40, 28, Math.PI / 2 - 1.0, 2.0, 0.6, 1.05), visorMaterial, head, 0, 0.26, 0);
  visor.scale.copy(skull.scale);
  [-1, 1].forEach((side) => {
    const eye = mesh(new THREE.SphereGeometry(0.045, 16, 12), glowMaterial, head, side * 0.1, 0.28, 0.265);
    eye.scale.set(1, 1.5, 0.5);
  });
  [-1, 1].forEach((side) => {
    const ear = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 20), accentMaterial, head, side * 0.31, 0.26, 0);
    ear.rotation.z = Math.PI / 2;
  });
  mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 10), accentMaterial, head, 0, 0.58, 0);
  mesh(new THREE.SphereGeometry(0.04, 16, 12), glowMaterial, head, 0, 0.66, 0);

  scene.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });

  return { scene, animations: buildClips() };
};
