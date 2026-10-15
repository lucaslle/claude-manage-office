import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { GRID, ROOM_SIZE, DOOR_WIDTH, DOOR_ALONG, DOOR_ACROSS, roomCenters } from "./layout.js";
import { ROOM_LABELS } from "./data.js";

const FURNITURE_SCALE = 0.9;
const WALL_HEIGHT = 3.4;
const PARTITION_HEIGHT = 1.2;

const FLOORS = {
  acc: { color: "#d9b487", kind: "wood" },
  open: { color: "#e2cba8", kind: "wood" },
  rev: { color: "#b8b1d8", kind: "carpet" },
  mrg: { color: "#bfd8b3", kind: "tile" },
  wait: { color: "#ebc2ab", kind: "carpet" },
  draft: { color: "#d2d6dc", kind: "tile" },
  fix: { color: "#cfa9a9", kind: "tile" },
  arch: { color: "#d2cbbb", kind: "wood" },
  meet: { color: "#c3cde6", kind: "carpet" },
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
  "cabinet_small",
  "shelf_B_large_decorated",
  "shelf_A_big",
  "lamp_standing",
  "lamp_table",
  "cactus_medium_A",
  "cactus_medium_B",
  "cactus_small_A",
  "rug_rectangle_A",
  "rug_rectangle_stripes_A",
  "rug_oval_A",
  "pictureframe_large_A",
  "pictureframe_medium",
  "book_set",
  "pillow_A",
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
    const plankCount = 8;
    const plankWidth = size / plankCount;
    for (let plank = 0; plank < plankCount; plank += 1) {
      context.fillStyle = shadeColor(baseColor, (Math.random() - 0.5) * 0.07);
      context.fillRect(plank * plankWidth, 0, plankWidth, size);
      context.fillStyle = "rgba(0,0,0,0.16)";
      context.fillRect(plank * plankWidth, 0, 2, size);
      const cut = Math.random() * size;
      context.fillRect(plank * plankWidth, cut, plankWidth, 2);
    }
  } else if (kind === "carpet") {
    for (let dot = 0; dot < 9000; dot += 1) {
      context.fillStyle = `rgba(${Math.random() > 0.5 ? "255,255,255" : "0,0,0"},0.06)`;
      context.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }
  } else if (kind === "tile") {
    const tiles = 4;
    const tileSize = size / tiles;
    for (let row = 0; row < tiles; row += 1) {
      for (let column = 0; column < tiles; column += 1) {
        context.fillStyle = shadeColor(baseColor, (Math.random() - 0.5) * 0.035);
        context.fillRect(column * tileSize, row * tileSize, tileSize, tileSize);
      }
    }
    context.fillStyle = "rgba(0,0,0,0.12)";
    for (let line = 0; line < tiles; line += 1) {
      context.fillRect(line * tileSize, 0, 2, size);
      context.fillRect(0, line * tileSize, size, 2);
    }
  } else {
    for (let blade = 0; blade < 14000; blade += 1) {
      context.fillStyle = shadeColor(baseColor, (Math.random() - 0.5) * 0.12);
      context.fillRect(Math.random() * size, Math.random() * size, 2, 5);
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

  const plasterMaterial = standardMaterial(0xf3f4f6, { roughness: 0.95 });
  const partitionMaterial = standardMaterial(0xf8f9fa, { roughness: 0.9 });
  const trimMaterial = standardMaterial(0xc4cad3, { roughness: 0.7 });
  const darkMaterial = standardMaterial(0x232830, { roughness: 0.5 });
  const metalMaterial = standardMaterial(0x8d96a3, { roughness: 0.4, metalness: 0.6 });
  const woodMaterial = standardMaterial(0xc89a62, { roughness: 0.7 });

  const ground = new THREE.Mesh(new THREE.BoxGeometry(ROOM_SIZE * 3 + 1, 0.6, ROOM_SIZE * 3 + 1), standardMaterial(0xb7bec9, { roughness: 0.9 }));
  ground.position.y = -0.36;
  ground.receiveShadow = true;
  world.add(ground);

  GRID.flat().forEach((roomId) => {
    const group = new THREE.Group();
    group.position.set(roomCenters[roomId].x, 0, roomCenters[roomId].z);
    world.add(group);
    roomGroups[roomId] = group;
    const floorConfig = FLOORS[roomId];
    const floorMaterial = new THREE.MeshStandardMaterial({ map: makeFloorTexture(floorConfig.color, floorConfig.kind), roughness: floorConfig.kind === "tile" ? 0.45 : 0.85, metalness: 0 });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(ROOM_SIZE, 0.12, ROOM_SIZE), floorMaterial);
    floor.position.y = -0.06;
    floor.receiveShadow = true;
    group.add(floor);
    const labelElement = document.createElement("div");
    labelElement.className = "room-label";
    labelElement.textContent = ROOM_LABELS[roomId];
    const labelObject = new CSS2DObject(labelElement);
    labelObject.position.set(0, 0.05, ROOM_SIZE / 2 - 0.55);
    group.add(labelObject);
    labelElements[roomId] = labelElement;
  });

  const wallSegment = (x1, z1, x2, z2, height, thickness, material) => {
    const length = Math.abs(x2 - x1) + Math.abs(z2 - z1);
    if (length < 0.05) return;
    const horizontal = z1 === z2;
    addBox(world, horizontal ? length : thickness, height, horizontal ? thickness : length, material, (x1 + x2) / 2, height / 2, (z1 + z2) / 2);
  };

  const partition = (x1, z1, x2, z2) => {
    const halfGap = DOOR_WIDTH / 2;
    if (z1 === z2) {
      const doorX = (x1 + x2) / 2 + DOOR_ACROSS;
      wallSegment(x1, z1, doorX - halfGap, z2, PARTITION_HEIGHT, 0.2, partitionMaterial);
      wallSegment(doorX + halfGap, z1, x2, z2, PARTITION_HEIGHT, 0.2, partitionMaterial);
    } else {
      const doorZ = (z1 + z2) / 2 + DOOR_ALONG;
      wallSegment(x1, z1, x2, doorZ - halfGap, PARTITION_HEIGHT, 0.2, partitionMaterial);
      wallSegment(x1, doorZ + halfGap, x2, z2, PARTITION_HEIGHT, 0.2, partitionMaterial);
    }
  };

  const edge = (index) => (index - 1.5) * ROOM_SIZE;
  for (let lineIndex = 0; lineIndex < 4; lineIndex += 1) {
    for (let cellIndex = 0; cellIndex < 3; cellIndex += 1) {
      const start = edge(cellIndex);
      const end = edge(cellIndex + 1);
      const line = edge(lineIndex);
      if (lineIndex === 0) {
        wallSegment(line, start, line, end, WALL_HEIGHT, 0.3, plasterMaterial);
        wallSegment(start, line, end, line, WALL_HEIGHT, 0.3, plasterMaterial);
      } else if (lineIndex === 3) {
        wallSegment(line, start, line, end, 0.3, 0.25, trimMaterial);
        wallSegment(start, line, end, line, 0.3, 0.25, trimMaterial);
      } else {
        partition(line, start, line, end);
        partition(start, line, end, line);
      }
    }
  }

  const windowMaterial = new THREE.MeshStandardMaterial({ color: 0xcfe6f7, roughness: 0.15, metalness: 0.1, emissive: 0x6fa4d1, emissiveIntensity: 0.35 });
  for (let cellIndex = 0; cellIndex < 3; cellIndex += 1) {
    const middle = (edge(cellIndex) + edge(cellIndex + 1)) / 2;
    [-1.7, 1.7].forEach((offset) => {
      addBox(world, 0.06, 1.5, 2.3, windowMaterial, edge(0) + 0.19, 2.0, middle + offset);
      addBox(world, 2.3, 1.5, 0.06, windowMaterial, middle + offset, 2.0, edge(0) + 0.19);
      addBox(world, 0.1, 0.08, 2.5, trimMaterial, edge(0) + 0.2, 1.22, middle + offset);
      addBox(world, 2.5, 0.08, 0.1, trimMaterial, middle + offset, 1.22, edge(0) + 0.2);
    });
  }

  const addMonitor = (roomId, x, z, ry) => {
    const group = new THREE.Group();
    group.position.set(x, 0.9, z);
    group.rotation.y = ry;
    const screenMaterial = new THREE.MeshStandardMaterial({ color: 0x9ed0ff, emissive: 0x2f7fc4, emissiveIntensity: 0.9, roughness: 0.2 });
    addBox(group, 0.95, 0.55, 0.05, darkMaterial, 0, 0.55, 0);
    addBox(group, 0.88, 0.48, 0.02, screenMaterial, 0, 0.55, 0.03);
    addBox(group, 0.1, 0.28, 0.1, darkMaterial, 0, 0.14, 0);
    addBox(group, 0.4, 0.03, 0.22, darkMaterial, 0, 0.015, 0.05);
    addBox(group, 0.5, 0.025, 0.18, metalMaterial, 0, 0.0, 0.5);
    roomGroups[roomId].add(group);
  };

  place("acc", "table_medium_long", { x: 0, z: -2.8, ry: 0 });
  place("acc", "rug_rectangle_stripes_A", { x: 0, z: 0.9, ry: 0, scale: 1.1 });
  place("acc", "couch", { x: -3.0, z: -0.2, ry: Math.PI / 2, scale: 0.8 });
  place("acc", "lamp_standing", { x: 3.1, z: -3.0 });
  place("acc", "cactus_medium_A", { x: -3.1, z: -3.1 });
  place("acc", "pictureframe_large_A", { x: -1.5, z: -3.6, y: 2.0, scale: 1.1 });
  addMonitor("acc", 0.6, -2.8, Math.PI);

  [-2.5, 0.2].forEach((deskZ) => {
    [-1.9, 1.9].forEach((deskX) => {
      place("open", "table_medium_long", { x: deskX, z: deskZ });
      place("open", "chair_A", { x: deskX, z: deskZ + 1.55, ry: Math.PI });
      addMonitor("open", deskX, deskZ, 0);
    });
  });
  place("open", "cactus_medium_B", { x: 3.0, z: 3.0 });
  place("open", "lamp_standing", { x: -3.1, z: 3.0 });

  place("rev", "table_medium_long", { x: 0, z: -0.2, ry: 0, scale: 1.0 });
  [-1.0, 1.0].forEach((offset) => {
    place("rev", "chair_B", { x: offset, z: 1.2, ry: Math.PI });
  });
  place("rev", "chair_C", { x: -2.2, z: -0.2, ry: Math.PI / 2 });
  place("rev", "chair_C", { x: 2.2, z: -0.2, ry: -Math.PI / 2 });
  place("rev", "rug_rectangle_A", { x: 0, z: -0.2, scale: 1.4 });
  const screen = addBox(roomGroups.rev, 3.2, 1.7, 0.1, darkMaterial, 0, 2.1, -3.55);
  const screenFace = addBox(roomGroups.rev, 3.0, 1.5, 0.04, new THREE.MeshStandardMaterial({ color: 0xa9c1ff, emissive: 0x3a58c0, emissiveIntensity: 0.8, roughness: 0.2 }), 0, 2.1, -3.49);
  screen.castShadow = false;
  screenFace.castShadow = false;

  [-1.1, 1.1].forEach((offset) => addBox(roomGroups.mrg, 0.35, 2.6, 0.35, metalMaterial, offset, 1.3, -2.9));
  const gateBeam = addBox(roomGroups.mrg, 2.9, 0.4, 0.4, new THREE.MeshStandardMaterial({ color: 0x4bbd6c, emissive: 0x1f8a42, emissiveIntensity: 1.1, roughness: 0.3 }), 0, 2.7, -2.9);
  addBox(roomGroups.mrg, 1.8, 0.02, 5.6, standardMaterial(0x9cbc88, { roughness: 0.9 }), 0, 0.01, 0.2);
  for (let stripe = -2; stripe <= 2; stripe += 1) addBox(roomGroups.mrg, 0.12, 0.025, 0.55, standardMaterial(0xf6f8fa), 0, 0.02, stripe * 1.1 + 0.2);
  place("mrg", "cactus_small_A", { x: 3.0, z: 3.0 });
  place("mrg", "cactus_small_A", { x: -3.0, z: 3.0 });

  place("wait", "couch", { x: 0, z: -3.0, ry: 0, scale: 0.9 });
  place("wait", "table_low", { x: -2.6, z: 0.4, ry: Math.PI / 2, scale: 0.7 });
  place("wait", "lamp_standing", { x: 3.1, z: -3.0 });
  [-0.9, 0.9].forEach((offset) => {
    [-1.9, -0.2, 1.5, 3.0].forEach((posZ) => {
      addCylinder(roomGroups.wait, 0.06, 0.09, 1.0, metalMaterial, offset, 0.5, posZ);
      addCylinder(roomGroups.wait, 0.09, 0.09, 0.05, metalMaterial, offset, 1.02, posZ);
    });
    [-1.9, -0.2, 1.5].forEach((posZ) => addBox(roomGroups.wait, 0.03, 0.05, 1.7, standardMaterial(0xc0392b), offset, 0.88, posZ + 0.85));
  });
  addBox(roomGroups.wait, 0.7, 1.5, 0.5, standardMaterial(0x3a4a63), 3.0, 0.75, -1.2);
  addBox(roomGroups.wait, 0.5, 0.35, 0.03, new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xb58a12, emissiveIntensity: 0.9 }), 3.0, 1.15, -0.94);

  [-2.4, 0, 2.4].forEach((offset) => {
    place("draft", "table_medium", { x: offset, z: -2.7, ry: 0, scale: 0.75 });
    addBox(roomGroups.draft, 1.0, 0.02, 0.7, standardMaterial(0xffffff), offset, 0.78, -2.7);
    place("draft", "chair_stool", { x: offset, z: -1.7, ry: 0, scale: 0.8 });
  });
  addBox(roomGroups.draft, 0.1, 1.7, 2.8, standardMaterial(0xf8f9fb, { roughness: 0.35 }), 3.4, 1.4, 0.4);
  place("draft", "cactus_medium_A", { x: -3.1, z: 3.0 });
  place("draft", "shelf_A_big", { x: -3.65, z: 0.4, ry: Math.PI / 2, y: 1.6, scale: 1.0 });

  place("fix", "table_medium_long", { x: 0, z: -3.0, ry: 0, scale: 1.0 });
  place("fix", "cabinet_medium", { x: -2.9, z: -3.0, ry: 0 });
  place("fix", "cabinet_small", { x: 2.9, z: -3.0, ry: 0 });
  addBox(roomGroups.fix, 0.8, 0.4, 0.4, standardMaterial(0xd04a3a, { roughness: 0.5 }), 2.6, 0.2, 0.2);
  addBox(roomGroups.fix, 0.4, 0.06, 0.06, metalMaterial, -0.6, 1.0, -3.0);
  addBox(roomGroups.fix, 0.14, 0.24, 0.14, darkMaterial, 0.5, 1.12, -3.0);
  addCylinder(roomGroups.fix, 0.06, 0.06, 1.8, metalMaterial, 3.2, 0.9, -1.5);
  const beaconMaterial = new THREE.MeshStandardMaterial({ color: 0xe24b4a, emissive: 0xc01818, emissiveIntensity: 1.2, roughness: 0.3 });
  const beacon = addCylinder(roomGroups.fix, 0.22, 0.22, 0.34, beaconMaterial, 3.2, 1.95, -1.5);
  animated.push((elapsed) => {
    beacon.rotation.y = elapsed * 3;
    beaconMaterial.emissiveIntensity = 0.7 + Math.sin(elapsed * 6) * 0.5;
  });

  [-2.5, -0.85, 0.85, 2.5].forEach((offset) => place("arch", "cabinet_medium", { x: offset, z: -3.0, ry: 0 }));
  place("arch", "shelf_B_large_decorated", { x: -1.7, z: -3.65, y: 2.0, scale: 1.0 });
  place("arch", "shelf_B_large_decorated", { x: 1.7, z: -3.65, y: 2.0, scale: 1.0 });
  [-2.5, 0, 2.5].forEach((offset) => place("arch", "armchair", { x: offset, z: 1.0, ry: 0.35, scale: 0.8 }));
  [-1.25, 1.25].forEach((offset) => place("arch", "armchair", { x: offset, z: 2.8, ry: 0.35, scale: 0.8 }));
  place("arch", "lamp_standing", { x: 3.2, z: -0.6 });
  place("arch", "rug_rectangle_A", { x: 0, z: 1.4, scale: 1.6 });

  place("meet", "table_medium_long", { x: 0, z: -0.2, ry: 0, scale: 1.0 });
  place("meet", "rug_rectangle_A", { x: 0, z: -0.2, scale: 1.5 });
  [-1.0, 0, 1.0].forEach((seatX) => {
    place("meet", "chair_B", { x: seatX, z: -1.45, ry: 0 });
    place("meet", "chair_B", { x: seatX, z: 1.05, ry: Math.PI });
  });
  place("meet", "chair_B", { x: -2.0, z: -0.2, ry: Math.PI / 2 });
  place("meet", "chair_B", { x: 2.0, z: -0.2, ry: -Math.PI / 2 });
  const meetingScreen = addBox(roomGroups.meet, 3.4, 1.8, 0.1, darkMaterial, 0, 2.15, -3.55);
  const meetingScreenFace = addBox(roomGroups.meet, 3.2, 1.6, 0.04, new THREE.MeshStandardMaterial({ color: 0xb7e3c4, emissive: 0x2f8f56, emissiveIntensity: 0.8, roughness: 0.2 }), 0, 2.15, -3.49);
  meetingScreen.castShadow = false;
  meetingScreenFace.castShadow = false;
  place("meet", "cactus_medium_A", { x: 3.1, z: 3.0 });
  place("meet", "cactus_medium_B", { x: -3.1, z: 3.0 });
  place("meet", "lamp_standing", { x: 3.2, z: -3.0 });

  const update = (elapsed) => animated.forEach((step) => step(elapsed));

  const setRoomOverflow = (overflow) => {
    Object.entries(labelElements).forEach(([roomId, element]) => {
      const hiddenCount = overflow[roomId] ?? 0;
      element.textContent = hiddenCount > 0 ? `${ROOM_LABELS[roomId]} (+${hiddenCount})` : ROOM_LABELS[roomId];
    });
  };

  return { world, roomGroups, update, setRoomOverflow, gateBeam };
};
