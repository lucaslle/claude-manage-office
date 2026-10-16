import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { GRID, ROOM_SIZE, DOOR_WIDTH, DOOR_ALONG, DOOR_ACROSS, roomCenters } from "./layout.js";
import { ROOM_LABELS } from "./data.js";
import { createProps } from "./props.js";

const WALL_HEIGHT = 3.3;
const SILL_HEIGHT = 0.8;
const GLAZING_TOP = WALL_HEIGHT - 0.25;
const PLINTH_Y = -0.08;
const PARTITION_HEIGHT = 2.2;
const PARTITION_SILL = 0.85;
const FRAME_SIZE = 0.07;
const GLAZING_MULLIONS = 3;
const EXIT_DOOR_HEIGHT = 2.3;
const EXIT_DOOR_OPEN_ANGLE = -1.9;
const EXIT_DOOR_OPEN_SPEED = 7;
const EXIT_DOOR_SLAM_SPEED = 16;
const EXIT_DOOR_WOBBLE = 0.14;

// Sols de bureau tech : grès cérame clair, moquette en dalles, béton ciré. Le bois reste réservé à la zone Pause.
const FLOORS = {
  acc: { color: "#e3e6eb", kind: "tile" },
  open: { color: "#cdd4de", kind: "carpet" },
  rev: { color: "#c8cde4", kind: "carpet" },
  mrg: { color: "#dde5df", kind: "tile" },
  wait: { color: "#d8dbe2", kind: "carpet" },
  draft: { color: "#e0e3e8", kind: "tile" },
  fix: { color: "#cfcfd2", kind: "concrete" },
  arch: { color: "#c6ccd6", kind: "carpet" },
  meet: { color: "#c2cde2", kind: "carpet" },
};

const ACCENTS = {
  acc: 0xff6b6b,
  open: 0x3566f0,
  rev: 0x8f6bff,
  mrg: 0x2fbf71,
  wait: 0xf0a020,
  draft: 0x94a3b8,
  fix: 0xe24b4a,
  arch: 0x64748b,
  meet: 0x14b8a6,
};

const PAUSE_ZONE = { x: 3.4, z: -1.5, width: 3.0, depth: 6.8 };
const ZONE_LABEL_OFFSETS = { arch: -1.1 };

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
    const tiles = 6;
    const tileSize = size / tiles;
    for (let row = 0; row < tiles; row += 1) {
      for (let column = 0; column < tiles; column += 1) {
        context.fillStyle = shadeColor(baseColor, (Math.random() - 0.5) * 0.03);
        context.fillRect(column * tileSize, row * tileSize, tileSize, tileSize);
      }
    }
    for (let dot = 0; dot < 5000; dot += 1) {
      context.fillStyle = `rgba(${Math.random() > 0.5 ? "255,255,255" : "0,0,0"},0.035)`;
      context.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }
    context.fillStyle = "rgba(20,30,50,0.1)";
    for (let line = 0; line < tiles; line += 1) {
      context.fillRect(line * tileSize, 0, 1.2, size);
      context.fillRect(0, line * tileSize, size, 1.2);
    }
  } else if (kind === "concrete") {
    for (let patch = 0; patch < 260; patch += 1) {
      context.fillStyle = `rgba(${Math.random() > 0.5 ? "255,255,255" : "0,0,0"},${0.02 + Math.random() * 0.03})`;
      context.beginPath();
      context.arc(Math.random() * size, Math.random() * size, 14 + Math.random() * 46, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = "rgba(0,0,0,0.12)";
    context.fillRect(size / 2 - 0.75, 0, 1.5, size);
    context.fillRect(0, size / 2 - 0.75, size, 1.5);
  } else {
    const tiles = 3;
    const tileSize = size / tiles;
    for (let row = 0; row < tiles; row += 1) {
      for (let column = 0; column < tiles; column += 1) {
        const gradient = context.createLinearGradient(column * tileSize, row * tileSize, (column + 1) * tileSize, (row + 1) * tileSize);
        gradient.addColorStop(0, shadeColor(baseColor, 0.012 + (Math.random() - 0.5) * 0.02));
        gradient.addColorStop(1, shadeColor(baseColor, -0.012 + (Math.random() - 0.5) * 0.02));
        context.fillStyle = gradient;
        context.fillRect(column * tileSize, row * tileSize, tileSize, tileSize);
      }
    }
    context.fillStyle = "rgba(30,40,60,0.16)";
    for (let line = 0; line < tiles; line += 1) {
      context.fillRect(line * tileSize - 1, 0, 2, size);
      context.fillRect(0, line * tileSize - 1, size, 2);
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

export const buildWorld = async (scene) => {
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

  const props = createProps({ animated });

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
  plinth.position.y = PLINTH_Y;
  plinth.receiveShadow = true;
  world.add(plinth);

  const addRoomLabel = (group, roomId, x) => {
    const labelElement = document.createElement("div");
    labelElement.className = "room-label";
    labelElement.textContent = ROOM_LABELS[roomId];
    const labelObject = new CSS2DObject(labelElement);
    labelObject.position.set(x, 0.05, ROOM_SIZE / 2 - 0.7);
    group.add(labelObject);
    return labelElement;
  };

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
    labelElements[roomId] = addRoomLabel(group, roomId, ZONE_LABEL_OFFSETS[roomId] ?? 0);
  });
  labelElements.pause = addRoomLabel(roomGroups.arch, "pause", PAUSE_ZONE.x);

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
    wallSegment(x1, z1, x2, z2, SILL_HEIGHT, GLAZING_TOP, 0.08, glazingMaterial, true);
    wallSegment(x1, z1, x2, z2, GLAZING_TOP, WALL_HEIGHT, 0.3, plasterMaterial);
    wallSegment(x1, z1, x2, z2, SILL_HEIGHT - 0.05, SILL_HEIGHT + 0.05, 0.34, frameMaterial);
    const horizontal = z1 === z2;
    for (let mullion = 0; mullion <= GLAZING_MULLIONS; mullion += 1) {
      const ratio = mullion / GLAZING_MULLIONS;
      const x = horizontal ? x1 + (x2 - x1) * ratio : x1;
      const z = horizontal ? z1 : z1 + (z2 - z1) * ratio;
      addBox(world, horizontal ? FRAME_SIZE : 0.14, GLAZING_TOP - SILL_HEIGHT, horizontal ? 0.14 : FRAME_SIZE, frameMaterial, x, (GLAZING_TOP + SILL_HEIGHT) / 2, z);
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
  // Les murs sont centrés sur leur axe : sans ces plots, chaque angle extérieur garde une encoche d'une demi-épaisseur.
  addBox(world, 0.3, WALL_HEIGHT, 0.3, plasterMaterial, edge(0), WALL_HEIGHT / 2, edge(0));
  addBox(world, 0.3, WALL_HEIGHT, 0.3, plasterMaterial, edge(3), WALL_HEIGHT / 2, edge(0));
  addBox(world, 0.3, WALL_HEIGHT, 0.3, plasterMaterial, edge(0), WALL_HEIGHT / 2, edge(3));
  addBox(world, 0.2, 0.22, 0.2, frameMaterial, edge(3), 0.11, edge(3));

  for (let lineIndex = 0; lineIndex < 4; lineIndex += 1) {
    for (let cellIndex = 0; cellIndex < 4; cellIndex += 1) {
      const isFront = lineIndex === 3 || cellIndex === 3;
      post(edge(cellIndex), edge(lineIndex), isFront ? 0.22 : lineIndex === 0 || cellIndex === 0 ? WALL_HEIGHT : PARTITION_HEIGHT);
    }
  }


  const addWallScreen = (roomId, x, width, height, faceColor, emissive) => {
    const screenY = 1.7;
    const frame = addBox(roomGroups[roomId], width, height, 0.1, darkMaterial, x, screenY, -ROOM_SIZE / 2 + 0.16);
    const face = addBox(roomGroups[roomId], width - 0.16, height - 0.16, 0.04, new THREE.MeshStandardMaterial({ color: faceColor, emissive, emissiveIntensity: 0.8, roughness: 0.2 }), x, screenY, -ROOM_SIZE / 2 + 0.22);
    frame.castShadow = false;
    face.castShadow = false;
  };

  // Les trajets traversent chaque pièce sur deux bandes : z entre 2.2 et 3.8 (passage d'une colonne à l'autre)
  // et x entre -3.8 et -2.2 (passage d'une rangée à l'autre). Le mobilier reste en dehors.
  const M = props.materials;
  const room = (roomId) => roomGroups[roomId];
  const backWall = -ROOM_SIZE / 2 + 0.2;

  // Liseré LED au pied du mur du fond de chaque pièce, dans la couleur de la pièce.
  GRID.flat().forEach((roomId) => props.wallLedge(room(roomId), { x: 0, z: -ROOM_SIZE / 2 + 0.14, width: ROOM_SIZE - 0.8, color: ACCENTS[roomId], intensity: 0.85 }));

  props.counter(room("acc"), { x: -0.3, z: -3.9, width: 3.4, depth: 0.8, top: M.white, light: 0xff6b6b });
  addBox(room("acc"), 0.8, 0.46, 0.03, M.black, -0.3, 1.38, -4.05);
  addBox(room("acc"), 0.74, 0.4, 0.01, M.screen, -0.3, 1.38, -4.03).castShadow = false;
  props.signPanel(room("acc"), { x: -0.3, y: 2.35, z: backWall, width: 3.2, height: 0.8, text: "BUREAUX CLAUDE", accentColor: "#ff6b6b" });
  props.rug(room("acc"), { x: 0.6, z: 0.4, width: 4.6, depth: 3.2, color: M.fog });
  props.sofa(room("acc"), { x: 4.3, z: -2.1, ry: -Math.PI / 2, length: 2.4 });
  props.roundTable(room("acc"), { x: 3.1, z: -2.1, radius: 0.5 });
  props.pouf(room("acc"), { x: 2.9, z: -3.5, color: M.door[1] });
  props.plant(room("acc"), { x: 4.4, z: -4.3, height: 1.7 });
  props.plant(room("acc"), { x: -4.35, z: 0.2, height: 1.5 });
  props.plant(room("acc"), { x: 4.4, z: 4.3, kind: "snake" });

  [-3.4, -0.2].forEach((deskZ) => {
    [-0.9, 2.4].forEach((deskX) => {
      props.desk(room("open"), { x: deskX, z: deskZ });
      props.chair(room("open"), { x: deskX, z: deskZ + 1.2, ry: Math.PI });
    });
  });
  props.lockers(room("open"), { x: -4.6, z: -1.7, ry: Math.PI / 2, count: 4 });
  props.glassBoard(room("open"), { x: 0.8, z: backWall, width: 2.8, height: 1.2 });
  props.plant(room("open"), { x: 4.3, z: 4.3, height: 1.6 });
  props.plant(room("open"), { x: -4.4, z: 4.3, kind: "snake" });

  props.rug(room("rev"), { x: 0.8, z: -0.4, width: 4.6, depth: 3, color: M.slate });
  props.meetingTable(room("rev"), { x: 0.8, z: -0.4, width: 3.2, depth: 1.4 });
  [-0.1, 1.7].forEach((seatX) => {
    props.chair(room("rev"), { x: seatX, z: 0.85, ry: Math.PI, tone: M.navy });
    props.chair(room("rev"), { x: seatX, z: -1.65, ry: 0, tone: M.navy });
  });
  props.chair(room("rev"), { x: -1.4, z: -0.4, ry: Math.PI / 2, tone: M.navy });
  props.chair(room("rev"), { x: 3.0, z: -0.4, ry: -Math.PI / 2, tone: M.navy });
  addWallScreen("rev", 0.8, 2.8, 1.5, 0xa9c1ff, 0x3a58c0);
  props.plant(room("rev"), { x: 4.3, z: 4.3, height: 1.6 });

  [-1.4, 1.4].forEach((offset) => addBox(roomGroups.mrg, 0.26, 2.2, 0.26, metalMaterial, offset, 1.1, -3.6));
  const gateBeam = addBox(roomGroups.mrg, 3.06, 0.3, 0.3, new THREE.MeshStandardMaterial({ color: 0x4bbd6c, emissive: 0x1f8a42, emissiveIntensity: 1.1, roughness: 0.3 }), 0, 2.3, -3.6);
  addBox(roomGroups.mrg, 2.0, 0.02, 8.0, standardMaterial(0xa3c391, { roughness: 0.9 }), 0, 0.01, 0.4);
  for (let stripe = -3; stripe <= 3; stripe += 1) addBox(roomGroups.mrg, 0.12, 0.025, 0.6, standardMaterial(0xf6f8fa), 0, 0.02, stripe * 1.2 + 0.4);
  props.signPanel(room("mrg"), { x: 0, y: 3.0, z: backWall, width: 2.6, height: 0.7, text: "MERGE", accentColor: "#2fbf71" });
  props.counter(room("mrg"), { x: -4.35, z: -1.0, ry: Math.PI / 2, width: 1.8, depth: 0.6, top: M.white, light: 0x2fbf71 });
  props.plant(room("mrg"), { x: 4.3, z: 4.3, height: 1.6 });
  props.plant(room("mrg"), { x: -4.4, z: 4.3, kind: "snake" });

  props.bench(room("wait"), { x: 0, z: -3.9, length: 3.2 });
  props.roundTable(room("wait"), { x: 4.2, z: 1.2, radius: 0.4, top: M.oak });
  props.plant(room("wait"), { x: 4.4, z: -4.3, height: 1.6 });
  props.plant(room("wait"), { x: -4.4, z: -4.3, kind: "snake" });
  props.signPanel(room("wait"), { x: 0, y: 2.7, z: backWall, width: 2.4, height: 0.7, text: "ATTENTE", accentColor: "#f0a020" });
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

  [-1.6, 0.8, 3.2].forEach((deskX) => props.desk(room("draft"), { x: deskX, z: -2.9, width: 2.0, depth: 0.9, monitors: 1, standing: true }));
  props.lockers(room("draft"), { x: -4.6, z: 0.0, ry: Math.PI / 2, count: 5 });
  props.glassBoard(room("draft"), { x: 0.8, z: backWall, width: 3.2, height: 1.3 });
  addBox(roomGroups.draft, 0.08, 1.3, 2.6, standardMaterial(0xf8f9fb, { roughness: 0.35 }), 4.5, 1.2, 0.2);
  addBox(roomGroups.draft, 0.1, 1.4, 2.7, frameMaterial, 4.56, 1.2, 0.2);
  props.plant(room("draft"), { x: -4.4, z: 4.3, height: 1.6 });

  props.workbench(room("fix"), { x: 0.4, z: -3.9, width: 5.2 });
  props.lockers(room("fix"), { x: 4.1, z: -4.0, count: 2 });
  addBox(roomGroups.fix, 0.6, 0.3, 0.3, standardMaterial(0xd04a3a, { roughness: 0.5 }), 3.2, 0.15, 0.6);
  addCylinder(roomGroups.fix, 0.05, 0.05, 1.4, metalMaterial, 4.2, 0.7, -1.8);
  const beaconMaterial = new THREE.MeshStandardMaterial({ color: 0xe24b4a, emissive: 0xc01818, emissiveIntensity: 1.2, roughness: 0.3 });
  const beacon = addCylinder(roomGroups.fix, 0.17, 0.17, 0.26, beaconMaterial, 4.2, 1.5, -1.8);
  animated.push((elapsed) => {
    beacon.rotation.y = elapsed * 3;
    beaconMaterial.emissiveIntensity = 0.7 + Math.sin(elapsed * 6) * 0.5;
  });
  props.plant(room("fix"), { x: 4.3, z: 4.3, kind: "snake" });

  // Archives à gauche (baies de serveurs, poufs de sieste), zone Pause à droite, séparées par une paroi vitrée.
  [-1.7, -0.8, 0.1, 1.0].forEach((rackX) => props.serverRack(room("arch"), { x: rackX, z: -4.35 }));
  [
    [-1.4, -1.9, M.slate],
    [0.5, -1.9, M.navy],
    [-1.4, 0.1, M.navy],
    [0.5, 0.1, M.slate],
    [-0.5, 1.5, M.fog],
  ].forEach(([bagX, bagZ, color]) => props.beanBag(room("arch"), { x: bagX, z: bagZ, color }));
  props.lockers(room("arch"), { x: -4.6, z: -1.0, ry: Math.PI / 2, count: 5 });
  props.box(room("arch"), 0.04, 1.6, 6.0, M.glass, 1.7, 0.8, -2.0, { shadow: false }).renderOrder = 2;
  props.box(room("arch"), 0.07, 0.07, 6.0, M.graphite, 1.7, 1.62, -2.0, { shadow: false });
  [-5.0 + 0.03, 1.0].forEach((postZ) => props.box(room("arch"), 0.07, 1.65, 0.07, M.graphite, 1.7, 0.825, postZ, { shadow: false }));

  const woodMaterial = new THREE.MeshStandardMaterial({ map: makeFloorTexture("#d8bd92", "wood"), roughness: 0.7, metalness: 0 });
  floorMaterials.push(woodMaterial);
  const pauseFloor = props.box(room("arch"), PAUSE_ZONE.width, 0.02, PAUSE_ZONE.depth, woodMaterial, PAUSE_ZONE.x, 0.01, PAUSE_ZONE.z, { shadow: false });
  pauseFloor.castShadow = false;
  props.sofa(room("arch"), { x: 4.4, z: -1.7, ry: -Math.PI / 2, length: 2.4, tone: M.door[1] });
  props.roundTable(room("arch"), { x: 3.0, z: -1.7, radius: 0.5, top: M.oak });
  props.pouf(room("arch"), { x: 2.3, z: -0.4, color: M.door[2] });
  props.pouf(room("arch"), { x: 2.2, z: -2.2, color: M.door[0] });
  props.coffeeBar(room("arch"), { x: 2.9, z: -4.4, width: 2.3 });
  props.signPanel(room("arch"), { x: 3.4, y: 2.9, z: backWall, width: 1.8, height: 0.6, text: "PAUSE", accentColor: "#14b8a6" });
  props.plant(room("arch"), { x: 4.4, z: 1.2, height: 1.6 });
  props.plant(room("arch"), { x: 2.0, z: 1.3, kind: "snake" });

  props.rug(room("meet"), { x: 0.6, z: -0.4, width: 5, depth: 3.4, color: M.slate });
  props.meetingTable(room("meet"), { x: 0.6, z: -0.4, width: 3.2, depth: 1.5 });
  [-0.4, 0.6, 1.6].forEach((seatX) => {
    props.chair(room("meet"), { x: seatX, z: -1.6, ry: 0 });
    props.chair(room("meet"), { x: seatX, z: 0.8, ry: Math.PI });
  });
  props.chair(room("meet"), { x: -1.6, z: -0.4, ry: Math.PI / 2 });
  props.chair(room("meet"), { x: 2.8, z: -0.4, ry: -Math.PI / 2 });
  addWallScreen("meet", 0.6, 2.9, 1.55, 0xb7e3c4, 0x2f8f56);
  props.plant(room("meet"), { x: 4.3, z: 4.3, height: 1.6 });
  props.plant(room("meet"), { x: -4.4, z: 4.3, kind: "snake" });
  props.plant(room("meet"), { x: 4.3, z: -4.3, height: 1.7 });

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
