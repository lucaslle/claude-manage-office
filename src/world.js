import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { GRID, ROOM_SIZE, DOOR_WIDTH, DOOR_ALONG, DOOR_ACROSS, roomCenters } from "./layout.js";
import { ROOM_LABELS } from "./data.js";

const FURNITURE_SCALE = 0.72;
const PROP_SCALE = 0.75;
const WALL_HEIGHT = 3.3;
const SILL_HEIGHT = 0.8;
const PARTITION_HEIGHT = 2.2;
const PARTITION_SILL = 0.85;
const FRAME_SIZE = 0.07;
const GLAZING_MULLIONS = 3;
const EXIT_DOOR_HEIGHT = 2.3;
const EXIT_DOOR_OPEN_ANGLE = -1.9;
const EXIT_DOOR_OPEN_SPEED = 7;
const EXIT_DOOR_SLAM_SPEED = 16;
const EXIT_DOOR_WOBBLE = 0.14;

const FLOORS = {
  acc: { color: "#d9bf98", kind: "wood" },
  open: { color: "#dcc4a1", kind: "wood" },
  rev: { color: "#bcc3d8", kind: "carpet" },
  mrg: { color: "#d3dad6", kind: "tile" },
  wait: { color: "#d8c8bc", kind: "carpet" },
  draft: { color: "#d7dade", kind: "tile" },
  fix: { color: "#d4c3bd", kind: "tile" },
  arch: { color: "#cfc2ab", kind: "wood" },
  meet: { color: "#bfcbe0", kind: "carpet" },
};

const FURNITURE_FILES = [
  "table_medium_long",
  "table_medium",
  "table_small",
  "table_low",
  "chair_A",
  "chair_B",
  "chair_C",
  "chair_stool",
  "couch",
  "armchair",
  "cabinet_medium",
  "cabinet_medium_decorated",
  "cabinet_small",
  "shelf_A_big",
  "lamp_standing",
  "cactus_medium_A",
  "cactus_medium_B",
  "cactus_small_A",
  "rug_rectangle_A",
  "rug_oval_A",
  "book_set",
];

const shadeColor = (hex, amount) => {
  const color = new THREE.Color(hex);
  color.offsetHSL(0, 0, amount);
  return `#${color.getHexString()}`;
};

const makeFloorTexture = (baseColor, kind) => {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  context.fillStyle = baseColor;
  context.fillRect(0, 0, size, size);
  if (kind === "wood") {
    const plankCount = 10;
    const plankWidth = size / plankCount;
    for (let plank = 0; plank < plankCount; plank += 1) {
      context.fillStyle = shadeColor(baseColor, (Math.random() - 0.5) * 0.05);
      context.fillRect(plank * plankWidth, 0, plankWidth, size);
      context.fillStyle = "rgba(0,0,0,0.1)";
      context.fillRect(plank * plankWidth, 0, 1.5, size);
      const cut = Math.random() * size;
      context.fillRect(plank * plankWidth, cut, plankWidth, 1.5);
    }
  } else if (kind === "carpet") {
    for (let dot = 0; dot < 7000; dot += 1) {
      context.fillStyle = `rgba(${Math.random() > 0.5 ? "255,255,255" : "0,0,0"},0.05)`;
      context.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }
  } else {
    const tiles = 5;
    const tileSize = size / tiles;
    for (let row = 0; row < tiles; row += 1) {
      for (let column = 0; column < tiles; column += 1) {
        context.fillStyle = shadeColor(baseColor, (Math.random() - 0.5) * 0.025);
        context.fillRect(column * tileSize, row * tileSize, tileSize, tileSize);
      }
    }
    context.fillStyle = "rgba(0,0,0,0.09)";
    for (let line = 0; line < tiles; line += 1) {
      context.fillRect(line * tileSize, 0, 1.5, size);
      context.fillRect(0, line * tileSize, size, 1.5);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.anisotropy = 8;
  return texture;
};

const loadFurniture = async () => {
  const loader = new GLTFLoader();
  const entries = await Promise.all(
    FURNITURE_FILES.map(
      (fileName) =>
        new Promise((resolve, reject) => {
          loader.load(`/models/furniture/${fileName}.gltf`, (gltf) => resolve([fileName, gltf.scene]), undefined, reject);
        }),
    ),
  );
  return Object.fromEntries(entries);
};

export const buildWorld = async (scene) => {
  const furniture = await loadFurniture();
  const world = new THREE.Group();
  scene.add(world);
  const roomGroups = {};
  const animated = [];
  const labelElements = {};

  const standardMaterial = (color, options = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: options.roughness ?? 0.8, metalness: options.metalness ?? 0.02, emissive: options.emissive ?? 0x000000, emissiveIntensity: options.emissiveIntensity ?? 1 });

  const addBox = (parent, width, height, depth, material, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const addGlass = (parent, width, height, depth, material, x, y, z) => {
    const mesh = addBox(parent, width, height, depth, material, x, y, z);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = 2;
    return mesh;
  };

  const addCylinder = (parent, radiusTop, radiusBottom, height, material, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 20), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const place = (roomId, name, { x, z, ry = 0, scale = FURNITURE_SCALE, y = 0 }) => {
    const instance = furniture[name].clone(true);
    instance.position.set(x, y, z);
    instance.rotation.y = ry;
    instance.scale.setScalar(scale);
    instance.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    roomGroups[roomId].add(instance);
    return instance;
  };

  const plasterMaterial = standardMaterial(0xf5f6f8, { roughness: 0.95 });
  const frameMaterial = standardMaterial(0x7d8794, { roughness: 0.45, metalness: 0.5 });
  const darkMaterial = standardMaterial(0x232830, { roughness: 0.5 });
  const metalMaterial = standardMaterial(0x9aa3b0, { roughness: 0.4, metalness: 0.6 });
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xd6ebf5,
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const glazingMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xbfe0f4,
    roughness: 0.06,
    metalness: 0.05,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    emissive: 0x4f8fc4,
    emissiveIntensity: 0.18,
    side: THREE.DoubleSide,
  });

  const slabSize = ROOM_SIZE * 3 + 2.4;
  const groundMaterial = standardMaterial(0xc2c9d3, { roughness: 0.9 });
  const plinthMaterial = standardMaterial(0x3a4049, { roughness: 0.7 });
  const floorMaterials = [];
  const ground = new THREE.Mesh(new THREE.BoxGeometry(slabSize, 0.6, slabSize), groundMaterial);
  ground.position.y = -0.36;
  ground.receiveShadow = true;
  world.add(ground);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(ROOM_SIZE * 3 + 0.6, 0.08, ROOM_SIZE * 3 + 0.6), plinthMaterial);
  plinth.position.y = -0.1;
  plinth.receiveShadow = true;
  world.add(plinth);

  GRID.flat().forEach((roomId) => {
    const group = new THREE.Group();
    group.position.set(roomCenters[roomId].x, 0, roomCenters[roomId].z);
    world.add(group);
    roomGroups[roomId] = group;
    const floorConfig = FLOORS[roomId];
    const floorMaterial = new THREE.MeshStandardMaterial({ map: makeFloorTexture(floorConfig.color, floorConfig.kind), roughness: floorConfig.kind === "tile" ? 0.45 : 0.85, metalness: 0 });
    floorMaterials.push(floorMaterial);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(ROOM_SIZE, 0.12, ROOM_SIZE), floorMaterial);
    floor.position.y = -0.06;
    floor.receiveShadow = true;
    group.add(floor);
    const labelElement = document.createElement("div");
    labelElement.className = "room-label";
    labelElement.textContent = ROOM_LABELS[roomId];
    const labelObject = new CSS2DObject(labelElement);
    labelObject.position.set(0, 0.05, ROOM_SIZE / 2 - 0.7);
    group.add(labelObject);
    labelElements[roomId] = labelElement;
  });

  const wallSegment = (x1, z1, x2, z2, bottom, top, thickness, material, glass = false) => {
    const length = Math.abs(x2 - x1) + Math.abs(z2 - z1);
    if (length < 0.05) return null;
    const horizontal = z1 === z2;
    const add = glass ? addGlass : addBox;
    return add(world, horizontal ? length : thickness, top - bottom, horizontal ? thickness : length, material, (x1 + x2) / 2, (bottom + top) / 2, (z1 + z2) / 2);
  };

  const post = (x, z, height) => addBox(world, FRAME_SIZE, height, FRAME_SIZE, frameMaterial, x, height / 2, z);

  const glassPartitionRun = (x1, z1, x2, z2) => {
    wallSegment(x1, z1, x2, z2, 0, PARTITION_SILL, 0.14, plasterMaterial);
    wallSegment(x1, z1, x2, z2, PARTITION_SILL, PARTITION_HEIGHT - FRAME_SIZE / 2, 0.04, glassMaterial, true);
    wallSegment(x1, z1, x2, z2, PARTITION_SILL - FRAME_SIZE / 2, PARTITION_SILL + FRAME_SIZE / 2, FRAME_SIZE, frameMaterial);
  };

  const partition = (x1, z1, x2, z2) => {
    const halfGap = DOOR_WIDTH / 2;
    wallSegment(x1, z1, x2, z2, PARTITION_HEIGHT - FRAME_SIZE, PARTITION_HEIGHT, FRAME_SIZE, frameMaterial);
    if (z1 === z2) {
      const doorX = (x1 + x2) / 2 + DOOR_ACROSS;
      glassPartitionRun(x1, z1, doorX - halfGap, z2);
      glassPartitionRun(doorX + halfGap, z1, x2, z2);
      post(doorX - halfGap, z1, PARTITION_HEIGHT);
      post(doorX + halfGap, z1, PARTITION_HEIGHT);
    } else {
      const doorZ = (z1 + z2) / 2 + DOOR_ALONG;
      glassPartitionRun(x1, z1, x2, doorZ - halfGap);
      glassPartitionRun(x1, doorZ + halfGap, x2, z2);
      post(x1, doorZ - halfGap, PARTITION_HEIGHT);
      post(x1, doorZ + halfGap, PARTITION_HEIGHT);
    }
  };

  const facade = (x1, z1, x2, z2) => {
    wallSegment(x1, z1, x2, z2, 0, SILL_HEIGHT, 0.3, plasterMaterial);
    wallSegment(x1, z1, x2, z2, SILL_HEIGHT, WALL_HEIGHT - 0.25, 0.08, glazingMaterial, true);
    wallSegment(x1, z1, x2, z2, WALL_HEIGHT - 0.25, WALL_HEIGHT, 0.3, plasterMaterial);
    wallSegment(x1, z1, x2, z2, SILL_HEIGHT - 0.05, SILL_HEIGHT + 0.05, 0.34, frameMaterial);
    const horizontal = z1 === z2;
    for (let mullion = 0; mullion <= GLAZING_MULLIONS; mullion += 1) {
      const ratio = mullion / GLAZING_MULLIONS;
      const x = horizontal ? x1 + (x2 - x1) * ratio : x1;
      const z = horizontal ? z1 : z1 + (z2 - z1) * ratio;
      addBox(world, horizontal ? FRAME_SIZE : 0.14, WALL_HEIGHT - SILL_HEIGHT, horizontal ? 0.14 : FRAME_SIZE, frameMaterial, x, (WALL_HEIGHT + SILL_HEIGHT) / 2, z);
    }
  };

  const edge = (index) => (index - 1.5) * ROOM_SIZE;
  const exitDoorX = edge(0);
  const exitDoorZ = roomCenters.acc.z + DOOR_ALONG;

  const facadeWithDoor = (x, z1, z2, doorZ) => {
    const halfGap = DOOR_WIDTH / 2;
    facade(x, z1, x, doorZ - halfGap);
    facade(x, doorZ + halfGap, x, z2);
    wallSegment(x, doorZ - halfGap, x, doorZ + halfGap, EXIT_DOOR_HEIGHT, WALL_HEIGHT, 0.3, plasterMaterial);
    [doorZ - halfGap, doorZ + halfGap].forEach((postZ) => addBox(world, 0.2, EXIT_DOOR_HEIGHT, 0.2, frameMaterial, x, EXIT_DOOR_HEIGHT / 2, postZ));
  };

  const buildExitDoor = (x, z) => {
    const halfGap = DOOR_WIDTH / 2;
    const width = DOOR_WIDTH - 0.16;
    const pivot = new THREE.Group();
    pivot.position.set(x, 0, z - halfGap + 0.08);
    world.add(pivot);
    addBox(pivot, 0.1, EXIT_DOOR_HEIGHT - 0.06, width, standardMaterial(0xd97757, { roughness: 0.55 }), 0, (EXIT_DOOR_HEIGHT - 0.06) / 2, width / 2);
    addBox(pivot, 0.04, 0.9, 0.34, standardMaterial(0xf4ece2, { roughness: 0.7 }), -0.06, 1.5, width - 0.5);
    addBox(pivot, 0.14, 0.05, 0.24, metalMaterial, -0.1, 1.05, width - 0.4);
    return pivot;
  };

  for (let lineIndex = 0; lineIndex < 4; lineIndex += 1) {
    for (let cellIndex = 0; cellIndex < 3; cellIndex += 1) {
      const start = edge(cellIndex);
      const end = edge(cellIndex + 1);
      const line = edge(lineIndex);
      if (lineIndex === 0) {
        if (cellIndex === 0) facadeWithDoor(line, start, end, exitDoorZ);
        else facade(line, start, line, end);
        facade(start, line, end, line);
      } else if (lineIndex === 3) {
        wallSegment(line, start, line, end, 0, 0.22, 0.2, frameMaterial);
        wallSegment(start, line, end, line, 0, 0.22, 0.2, frameMaterial);
      } else {
        partition(line, start, line, end);
        partition(start, line, end, line);
      }
    }
  }
  for (let lineIndex = 0; lineIndex < 4; lineIndex += 1) {
    for (let cellIndex = 0; cellIndex < 4; cellIndex += 1) {
      const isFront = lineIndex === 3 || cellIndex === 3;
      post(edge(cellIndex), edge(lineIndex), isFront ? 0.22 : lineIndex === 0 || cellIndex === 0 ? WALL_HEIGHT : PARTITION_HEIGHT);
    }
  }

  const addMonitor = (roomId, x, z, ry) => {
    const group = new THREE.Group();
    group.position.set(x, 0.9 * PROP_SCALE, z);
    group.rotation.y = ry;
    group.scale.setScalar(PROP_SCALE);
    const screenMaterial = new THREE.MeshStandardMaterial({ color: 0x9ed0ff, emissive: 0x2f7fc4, emissiveIntensity: 0.9, roughness: 0.2 });
    addBox(group, 0.95, 0.55, 0.05, darkMaterial, 0, 0.55, 0);
    addBox(group, 0.88, 0.48, 0.02, screenMaterial, 0, 0.55, 0.03);
    addBox(group, 0.1, 0.28, 0.1, darkMaterial, 0, 0.14, 0);
    addBox(group, 0.4, 0.03, 0.22, darkMaterial, 0, 0.015, 0.05);
    addBox(group, 0.5, 0.025, 0.18, metalMaterial, 0, 0.0, 0.5);
    roomGroups[roomId].add(group);
  };

  const addWallScreen = (roomId, x, width, height, faceColor, emissive) => {
    const screenY = 1.7;
    const frame = addBox(roomGroups[roomId], width, height, 0.1, darkMaterial, x, screenY, -ROOM_SIZE / 2 + 0.16);
    const face = addBox(roomGroups[roomId], width - 0.16, height - 0.16, 0.04, new THREE.MeshStandardMaterial({ color: faceColor, emissive, emissiveIntensity: 0.8, roughness: 0.2 }), x, screenY, -ROOM_SIZE / 2 + 0.22);
    frame.castShadow = false;
    face.castShadow = false;
  };

  // Les trajets traversent chaque pièce sur deux bandes : z entre 2.2 et 3.8 (passage d'une colonne à l'autre)
  // et x entre -3.8 et -2.2 (passage d'une rangée à l'autre). Le mobilier reste en dehors.
  place("acc", "table_medium_long", { x: -0.6, z: -3.4, ry: 0 });
  addMonitor("acc", -0.1, -3.4, Math.PI);
  place("acc", "book_set", { x: -1.2, z: -3.4, y: 0.6, scale: 0.6 });
  place("acc", "couch", { x: 4.3, z: -2.2, ry: -Math.PI / 2, scale: 0.65 });
  place("acc", "table_low", { x: 3.2, z: -2.2, ry: Math.PI / 2, scale: 0.55 });
  place("acc", "rug_oval_A", { x: 0.6, z: 0.6, scale: 1.2 });
  place("acc", "lamp_standing", { x: 4.3, z: -4.3 });
  place("acc", "cactus_medium_A", { x: -4.4, z: 0.2 });
  place("acc", "cactus_small_A", { x: 4.3, z: 4.3 });

  [-3.4, -0.2].forEach((deskZ) => {
    [-0.9, 2.4].forEach((deskX) => {
      place("open", "table_medium_long", { x: deskX, z: deskZ });
      place("open", "chair_A", { x: deskX, z: deskZ + 1.2, ry: Math.PI });
      addMonitor("open", deskX, deskZ, 0);
    });
  });
  place("open", "cabinet_small", { x: -4.4, z: -4.0, ry: Math.PI / 2 });
  place("open", "cactus_medium_B", { x: 4.3, z: 4.3 });
  place("open", "lamp_standing", { x: -4.4, z: 4.3 });

  place("rev", "table_medium_long", { x: 0.8, z: -0.4, ry: 0, scale: 0.8 });
  [-0.1, 1.7].forEach((offset) => place("rev", "chair_B", { x: offset, z: 0.85, ry: Math.PI }));
  place("rev", "chair_C", { x: -1.3, z: -0.4, ry: Math.PI / 2 });
  place("rev", "chair_C", { x: 2.9, z: -0.4, ry: -Math.PI / 2 });
  place("rev", "rug_rectangle_A", { x: 0.8, z: -0.4, scale: 1.3 });
  addWallScreen("rev", 0.8, 2.8, 1.5, 0xa9c1ff, 0x3a58c0);
  place("rev", "cactus_medium_A", { x: 4.3, z: 4.3 });

  [-1.4, 1.4].forEach((offset) => addBox(roomGroups.mrg, 0.26, 2.2, 0.26, metalMaterial, offset, 1.1, -3.6));
  const gateBeam = addBox(roomGroups.mrg, 3.06, 0.3, 0.3, new THREE.MeshStandardMaterial({ color: 0x4bbd6c, emissive: 0x1f8a42, emissiveIntensity: 1.1, roughness: 0.3 }), 0, 2.3, -3.6);
  addBox(roomGroups.mrg, 2.0, 0.02, 8.0, standardMaterial(0xa3c391, { roughness: 0.9 }), 0, 0.01, 0.4);
  for (let stripe = -3; stripe <= 3; stripe += 1) addBox(roomGroups.mrg, 0.12, 0.025, 0.6, standardMaterial(0xf6f8fa), 0, 0.02, stripe * 1.2 + 0.4);
  place("mrg", "cactus_small_A", { x: 4.3, z: 4.3 });
  place("mrg", "cactus_small_A", { x: -4.4, z: 4.3 });
  place("mrg", "cabinet_small", { x: -4.4, z: -1.0, ry: Math.PI / 2 });

  place("wait", "couch", { x: 0, z: -3.9, ry: 0, scale: 0.72 });
  place("wait", "table_low", { x: 4.2, z: 1.2, ry: Math.PI / 2, scale: 0.55 });
  place("wait", "lamp_standing", { x: 4.3, z: -4.3 });
  place("wait", "cactus_medium_A", { x: -4.4, z: -4.3 });
  const ropeMaterial = standardMaterial(0x2e343d, { roughness: 0.6 });
  [-1.0, 1.0].forEach((offset) => {
    [-3.0, -1.4, 0.2, 1.8].forEach((posZ) => {
      addCylinder(roomGroups.wait, 0.04, 0.07, 0.75, metalMaterial, offset, 0.375, posZ);
      addCylinder(roomGroups.wait, 0.07, 0.07, 0.04, metalMaterial, offset, 0.77, posZ);
    });
    [-3.0, -1.4, 0.2].forEach((posZ) => addBox(roomGroups.wait, 0.03, 0.04, 1.5, ropeMaterial, offset, 0.68, posZ + 0.8));
  });
  addBox(roomGroups.wait, 0.55, 1.15, 0.4, standardMaterial(0x3a4a63), 3.8, 0.575, -1.6);
  addBox(roomGroups.wait, 0.4, 0.28, 0.03, new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xb58a12, emissiveIntensity: 0.9 }), 3.8, 0.88, -1.39);

  [-1.6, 0.8, 3.2].forEach((offset) => {
    place("draft", "table_medium", { x: offset, z: -3.4, ry: 0, scale: 0.6 });
    addBox(roomGroups.draft, 0.75, 0.02, 0.55, standardMaterial(0xffffff), offset, 0.62, -3.4);
    place("draft", "chair_stool", { x: offset, z: -2.5, ry: 0, scale: 0.6 });
  });
  addBox(roomGroups.draft, 0.08, 1.3, 2.6, standardMaterial(0xf8f9fb, { roughness: 0.35 }), 4.5, 1.2, 0.2);
  addBox(roomGroups.draft, 0.1, 1.4, 2.7, frameMaterial, 4.56, 1.2, 0.2);
  place("draft", "shelf_A_big", { x: -4.75, z: 0.2, ry: Math.PI / 2, y: 1.3, scale: 0.76 });
  place("draft", "cactus_medium_A", { x: -4.4, z: 4.3 });

  place("fix", "table_medium_long", { x: 0.4, z: -3.6, ry: 0, scale: 0.76 });
  place("fix", "cabinet_medium", { x: -4.4, z: -1.2, ry: Math.PI / 2 });
  place("fix", "cabinet_small", { x: 3.6, z: -3.7, ry: 0 });
  addBox(roomGroups.fix, 0.6, 0.3, 0.3, standardMaterial(0xd04a3a, { roughness: 0.5 }), 3.2, 0.15, 0.6);
  addBox(roomGroups.fix, 0.3, 0.05, 0.05, metalMaterial, -0.2, 0.74, -3.6);
  addBox(roomGroups.fix, 0.11, 0.18, 0.11, darkMaterial, 0.9, 0.83, -3.6);
  addCylinder(roomGroups.fix, 0.05, 0.05, 1.4, metalMaterial, 4.2, 0.7, -1.8);
  const beaconMaterial = new THREE.MeshStandardMaterial({ color: 0xe24b4a, emissive: 0xc01818, emissiveIntensity: 1.2, roughness: 0.3 });
  const beacon = addCylinder(roomGroups.fix, 0.17, 0.17, 0.26, beaconMaterial, 4.2, 1.5, -1.8);
  animated.push((elapsed) => {
    beacon.rotation.y = elapsed * 3;
    beaconMaterial.emissiveIntensity = 0.7 + Math.sin(elapsed * 6) * 0.5;
  });
  place("fix", "cactus_small_A", { x: 4.3, z: 4.3 });

  [-1.5, 0.3, 2.1, 3.9].forEach((offset, index) => place("arch", index % 2 === 0 ? "cabinet_medium" : "cabinet_medium_decorated", { x: offset, z: -3.9, ry: 0 }));
  [-1.6, 0.4, 2.4].forEach((offset) => place("arch", "armchair", { x: offset, z: 1.0, ry: 0.35, scale: 0.65 }));
  [-0.6, 1.4].forEach((offset) => place("arch", "armchair", { x: offset, z: -1.4, ry: 0.35, scale: 0.65 }));
  place("arch", "lamp_standing", { x: 4.3, z: -1.2 });
  place("arch", "rug_rectangle_A", { x: 0.4, z: 0.0, scale: 1.5 });

  place("meet", "table_medium_long", { x: 0.6, z: -0.4, ry: 0, scale: 0.85 });
  place("meet", "rug_rectangle_A", { x: 0.6, z: -0.4, scale: 1.4 });
  [-0.4, 0.6, 1.6].forEach((seatX) => {
    place("meet", "chair_B", { x: seatX, z: -1.5, ry: 0 });
    place("meet", "chair_B", { x: seatX, z: 0.7, ry: Math.PI });
  });
  place("meet", "chair_B", { x: -1.5, z: -0.4, ry: Math.PI / 2 });
  place("meet", "chair_B", { x: 2.7, z: -0.4, ry: -Math.PI / 2 });
  addWallScreen("meet", 0.6, 2.9, 1.55, 0xb7e3c4, 0x2f8f56);
  place("meet", "cactus_medium_A", { x: 4.3, z: 4.3 });
  place("meet", "cactus_medium_B", { x: -4.4, z: 4.3 });
  place("meet", "lamp_standing", { x: 4.3, z: -4.3 });

  const door = { pivot: buildExitDoor(exitDoorX, exitDoorZ), angle: 0, target: 0, slamming: false, wobble: 0, onSlam: null };
  animated.push((elapsed, delta) => {
    if (door.slamming) {
      door.angle = Math.min(0, door.angle + EXIT_DOOR_SLAM_SPEED * delta);
      if (door.angle >= 0) {
        door.slamming = false;
        door.wobble = EXIT_DOOR_WOBBLE;
        door.onSlam?.();
      }
    } else if (door.wobble > 0.002) {
      door.wobble *= Math.exp(-delta * 9);
      door.angle = -Math.abs(Math.sin(elapsed * 42)) * door.wobble;
    } else {
      door.angle += (door.target - door.angle) * Math.min(1, delta * EXIT_DOOR_OPEN_SPEED);
    }
    door.pivot.rotation.y = door.angle;
  });
  const exitDoor = {
    x: exitDoorX,
    z: exitDoorZ,
    open: () => {
      door.target = EXIT_DOOR_OPEN_ANGLE;
      door.slamming = false;
    },
    slam: () => {
      door.target = 0;
      door.wobble = 0;
      door.slamming = true;
    },
    onSlam: (handler) => {
      door.onSlam = handler;
    },
  };

  const update = (elapsed, delta = 0) => animated.forEach((step) => step(elapsed, delta));

  const setRoomOverflow = (overflow) => {
    Object.entries(labelElements).forEach(([roomId, element]) => {
      const hiddenCount = overflow[roomId] ?? 0;
      element.textContent = hiddenCount > 0 ? `${ROOM_LABELS[roomId]} (+${hiddenCount})` : ROOM_LABELS[roomId];
    });
  };

  const applyPalette = (palette) => {
    plasterMaterial.color.set(palette.plaster);
    frameMaterial.color.set(palette.frame);
    groundMaterial.color.set(palette.ground);
    plinthMaterial.color.set(palette.plinth);
    glazingMaterial.emissive.set(palette.glazing);
    floorMaterials.forEach((material) => material.color.set(palette.floorTint));
  };

  return { world, roomGroups, update, setRoomOverflow, applyPalette, gateBeam, exitDoor };
};
