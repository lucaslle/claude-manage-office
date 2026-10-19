import * as THREE from "three";

// Among Us : un vaisseau spatial. Sols et murs en plaques de coque, bandes de danger jaunes et noires,
// bouches d'aération au sol, et des équipiers à la place des plantes. La salle de réunion a son bouton d'urgence.

const CREW_COLORS = [0xc51111, 0x132ed1, 0x117f2d, 0xed54ba, 0xf5f557, 0x3f474e, 0xd6e0f0, 0x6b2fbb, 0x71491e, 0x38fedc, 0x50ef39, 0xef7d0e];

const makeHazardTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 32;
  const context = canvas.getContext("2d");
  context.fillStyle = "#f2c200";
  context.fillRect(0, 0, 128, 32);
  context.fillStyle = "#15171c";
  for (let stripe = -2; stripe < 10; stripe += 1) {
    context.beginPath();
    context.moveTo(stripe * 16, 32);
    context.lineTo(stripe * 16 + 8, 32);
    context.lineTo(stripe * 16 + 40, 0);
    context.lineTo(stripe * 16 + 32, 0);
    context.closePath();
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(10, 1);
  return texture;
};

const props = ({ box, cylinder, sphere, placed, materials: M, seededRandom, animated, screenPanel }) => {
  const visor = new THREE.MeshStandardMaterial({ color: 0xa5dcf2, emissive: 0x5fb5d8, emissiveIntensity: 0.35, roughness: 0.08, metalness: 0.2 });
  const button = new THREE.MeshStandardMaterial({ color: 0xd11b1b, emissive: 0xff2a2a, emissiveIntensity: 0.6, roughness: 0.3 });
  animated.push((elapsed) => {
    button.emissiveIntensity = 0.55 + Math.max(0, Math.sin(elapsed * 3)) * 0.7;
  });

  const crewmate = (parent, { x, z, ry = 0, color, scale = 1, lying = false }) => {
    const suit = new THREE.MeshStandardMaterial({ color, roughness: 0.45 });
    const group = placed(parent, x, z, ry, lying ? 0.28 : 0);
    group.scale.setScalar(scale);
    const body = placed(group, 0, 0);
    if (lying) body.rotation.z = Math.PI / 2;
    [-0.13, 0.13].forEach((legX) => box(body, 0.2, 0.28, 0.22, suit, legX, 0.14, 0));
    cylinder(body, 0.28, 0.28, 0.5, suit, 0, 0.5, 0, 18);
    sphere(body, 0.28, suit, 0, 0.76, 0, [1, 0.95, 1]);
    box(body, 0.16, 0.38, 0.3, suit, 0, 0.5, -0.34);
    sphere(body, 0.2, visor, 0, 0.74, 0.19, [1.1, 0.62, 0.7]);
    if (lying) {
      const bone = new THREE.MeshStandardMaterial({ color: 0xf2eee0, roughness: 0.6 });
      cylinder(body, 0.035, 0.035, 0.26, bone, 0, 1.12, 0, 8);
      sphere(body, 0.06, bone, 0.03, 1.27, 0);
      sphere(body, 0.06, bone, -0.03, 1.27, 0);
    }
    return group;
  };

  const taskConsole = (parent, { x, z }) => {
    const group = placed(parent, x, z, ((x * 7 + z * 3) % 1) * 0.6);
    box(group, 0.8, 0.14, 0.5, M.graphite, 0, 0.07, 0);
    box(group, 0.7, 1.0, 0.3, M.graphite, 0, 0.64, 0);
    screenPanel(group, 0.56, 0.5, 0, 0.9, 0.17, M.screen, x + z);
    box(group, 0.1, 0.1, 0.02, button, 0.22, 0.52, 0.16, { shadow: false });
    return group;
  };

  return {
    crewmate,
    plant: (parent, { x, z, height = 1.5, kind = "ficus" }) => {
      if (kind === "snake") return taskConsole(parent, { x, z });
      const random = seededRandom(x * 13 + z * 7 + height);
      const color = CREW_COLORS[Math.floor(random() * CREW_COLORS.length)];
      return crewmate(parent, { x, z, ry: random() * Math.PI * 2, color, scale: height * 0.7 });
    },
    meetingTable: (parent, { x, z, width = 3.4, depth = 1.5 }) => {
      const group = placed(parent, x, z);
      const top = cylinder(group, depth / 2 + 0.12, depth / 2 + 0.12, 0.07, M.white, 0, 0.76, 0, 40);
      top.scale.x = width / (depth + 0.24);
      cylinder(group, 0.25, 0.4, 0.7, M.graphite, 0, 0.38, 0, 20);
      cylinder(group, 0.28, 0.32, 0.06, M.black, 0, 0.82, 0, 28);
      const dome = sphere(group, 0.2, button, 0, 0.86, 0, [1, 0.55, 1]);
      dome.castShadow = false;
      return group;
    },
  };
};

const decor = ({ world, room, rooms, props: kit, animated, ROOM_SIZE, centerX, centerZ, slabWidth }) => {
  const { box, materials: M } = kit;

  const hazard = new THREE.MeshStandardMaterial({ map: makeHazardTexture(), roughness: 0.6 });
  rooms.forEach((roomId) => {
    box(room(roomId), ROOM_SIZE - 1.2, 0.02, 0.26, hazard, 0, 0.01, -ROOM_SIZE / 2 + 0.55, { shadow: false });
  });

  const vent = (parent, x, z, ry = 0) => {
    const group = kit.placed(parent, x, z, ry);
    box(group, 1.1, 0.05, 0.7, M.steel, 0, 0.025, 0, { shadow: false });
    for (let slot = 0; slot < 5; slot += 1) box(group, 0.9, 0.012, 0.06, M.black, 0, 0.056, -0.24 + slot * 0.12, { shadow: false });
  };
  [["acc", -3.9, -2.4], ["open", 3.8, 4.3], ["rev", -3.4, 4.3], ["fix", 3.6, -0.6], ["bug", -3.4, -4.3], ["arch", -3.9, 4.3], ["meet", 3.8, -4.3], ["draft", -3.8, -3.6], ["pause", -3.8, 4.3]].forEach(([roomId, ventX, ventZ]) => vent(room(roomId), ventX, ventZ, ventX > 0 ? 0.4 : -0.3));

  const bugRoom = room("bug");
  kit.crewmate?.(bugRoom, { x: -4.1, z: 2.6, ry: 0.7, color: 0xc51111, scale: 1, lying: true });

  const random = (() => {
    let state = 99;
    return () => {
      state = (state * 48271) % 2147483647;
      return state / 2147483647;
    };
  })();
  const starCount = 900;
  const positions = new Float32Array(starCount * 3);
  for (let star = 0; star < starCount; star += 1) {
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);
    const radius = 130 + random() * 60;
    positions[star * 3] = centerX + radius * Math.sin(phi) * Math.cos(theta);
    positions[star * 3 + 1] = radius * Math.cos(phi) - 20;
    positions[star * 3 + 2] = centerZ + radius * Math.sin(phi) * Math.sin(theta);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xdfeaff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.85, depthWrite: false }));
  world.add(stars);

  const planet = new THREE.Mesh(new THREE.SphereGeometry(16, 32, 20), new THREE.MeshStandardMaterial({ color: 0xb4452c, roughness: 0.9, emissive: 0x401408, emissiveIntensity: 0.6 }));
  planet.position.set(centerX - slabWidth - 40, -30, centerZ - 60);
  world.add(planet);
  const ring = new THREE.Mesh(new THREE.RingGeometry(21, 30, 64), new THREE.MeshBasicMaterial({ color: 0xd9a066, side: THREE.DoubleSide, transparent: true, opacity: 0.5 }));
  ring.position.copy(planet.position);
  ring.rotation.x = Math.PI / 2.3;
  world.add(ring);
  animated.push((elapsed) => {
    planet.rotation.y = elapsed * 0.03;
  });
};

const FLOOR_COLORS = {
  acc: "#9aa5b4",
  open: "#8f9bab",
  rev: "#8794ab",
  draft: "#a39f8c",
  pause: "#a39a8c",
  fix: "#8a8f98",
  arch: "#6c7480",
  meet: "#a8b3c2",
  bug: "#a58f8f",
};

export const AMONG_US_STYLE = {
  id: "amongus",
  materials: {
    white: { color: 0xc9d1dc, roughness: 0.4, metalness: 0.3 },
    offWhite: 0xaab4c2,
    graphite: 0x2a3340,
    black: 0x121720,
    oak: { color: 0x6c7a8e, roughness: 0.5, metalness: 0.4 },
    navy: 0x2a4a7f,
    slate: 0x435068,
    fog: 0x7f8da2,
    pot: 0xcfd7e0,
    screen: { color: 0x07202a, emissive: 0x2ee6ff, emissiveIntensity: 0.9 },
    screenRed: { color: 0x2a0a0a, emissive: 0xff3a3a, emissiveIntensity: 0.9 },
    screenWhite: { color: 0xcfeaff, emissive: 0x7fe0ff, emissiveIntensity: 0.5 },
  },
  doorColors: [0xc51111, 0x132ed1, 0x117f2d, 0xed54ba, 0xf5f557, 0x38fedc],
  noteColors: [0x38fedc, 0xf5f557, 0xed54ba, 0x50ef39],
  ledColors: [0x38fedc, 0xff3a3a, 0xf5f557],
  floors: Object.fromEntries(Object.entries(FLOOR_COLORS).map(([roomId, color]) => [roomId, { color, kind: "hull" }])),
  walls: { plaster: { texture: "hull", color: "#7f8ca0" } },
  ledgeIntensity: 1.3,
  sign: { background: "#0b1220", color: "#d8f6ff", font: '"Trebuchet MS", "Arial Rounded MT Bold", sans-serif', weight: 800, emissive: 0.7 },
  props,
  decor,
};
