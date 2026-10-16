import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { COLUMNS, ROWS, GRID, ROOM_SIZE, DOOR_WIDTH, DOOR_ALONG, DOOR_ACROSS, roomAt, roomCenters, rowToZ } from "./layout.js";
import { ROOM_LABELS } from "./data.js";
import { createProps } from "./props.js";
import { boxGeometry, makeFloorTexture, makeWallTexture } from "./textures.js";
import { OFFICE_STYLE } from "./styles/index.js";

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
const LOW_WALL_HEIGHT = 0.22;
const columnCenter = (column) => (column - 1) * ROOM_SIZE;

// Sols de bureau tech : grès cérame clair, moquette en dalles, béton ciré. Le bois reste réservé à la zone Pause.
const FLOORS = {
  acc: { color: "#e3e6eb", kind: "tile" },
  open: { color: "#cdd4de", kind: "carpet" },
  rev: { color: "#c8cde4", kind: "carpet" },
  mrg: { color: "#dde5df", kind: "tile" },
  pause: { color: "#d8bd92", kind: "wood" },
  fix: { color: "#cfcfd2", kind: "concrete" },
  bug: { color: "#e6d3cd", kind: "carpet" },
  arch: { color: "#c6ccd6", kind: "carpet" },
  meet: { color: "#c2cde2", kind: "carpet" },
};

const ACCENTS = {
  acc: 0xff6b6b,
  open: 0x3566f0,
  rev: 0x8f6bff,
  mrg: 0x2fbf71,
  pause: 0x14b8a6,
  fix: 0xe24b4a,
  bug: 0xff7a3d,
  arch: 0x64748b,
  meet: 0x14b8a6,
};


const wallTexture = (entry) => {
  if (!entry) return null;
  return typeof entry === "string" ? makeWallTexture(entry) : makeWallTexture(entry.texture, entry.color, entry.accent);
};

export const buildWorld = async (scene, style = OFFICE_STYLE) => {
  const world = new THREE.Group();
  scene.add(world);
  const roomGroups = {};
  const animated = [];
  const labelElements = {};

  const standardMaterial = (color, options = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: options.roughness ?? 0.8, metalness: options.metalness ?? 0.02, emissive: options.emissive ?? 0x000000, emissiveIntensity: options.emissiveIntensity ?? 1 });

  const addBox = (parent, width, height, depth, material, x, y, z) => {
    const mesh = new THREE.Mesh(boxGeometry(width, height, depth, material), material);
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
    const side = radiusTop + radiusBottom;
    const mesh = new THREE.Mesh(style.voxel ? boxGeometry(side, height, side, material) : new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 20), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const props = createProps({ animated, style });

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

  plasterMaterial.map = wallTexture(style.walls?.plaster);
  frameMaterial.map = wallTexture(style.walls?.frame);

  const slabWidth = ROOM_SIZE * COLUMNS + 2.4;
  const slabDepth = ROOM_SIZE * ROWS + 2.4;
  const centerX = columnCenter((COLUMNS - 1) / 2);
  const centerZ = rowToZ((ROWS - 1) / 2);
  const groundMaterial = standardMaterial(0xc2c9d3, { roughness: 0.9 });
  const plinthMaterial = standardMaterial(0x3a4049, { roughness: 0.7 });
  groundMaterial.map = wallTexture(style.walls?.ground);
  plinthMaterial.map = wallTexture(style.walls?.plinth);
  const floorMaterials = [];
  const ground = new THREE.Mesh(boxGeometry(slabWidth, 0.6, slabDepth, groundMaterial), groundMaterial);
  ground.position.set(centerX, -0.36, centerZ);
  ground.receiveShadow = true;
  world.add(ground);
  // Le soubassement ne suit que les cases qui ont une pièce : le reste du terrain est une terrasse.
  GRID.forEach((rowRooms, row) =>
    rowRooms.forEach((roomId, column) => {
      if (!roomId) return;
      const plinth = new THREE.Mesh(boxGeometry(ROOM_SIZE + 0.6, 0.08, ROOM_SIZE + 0.6, plinthMaterial), plinthMaterial);
      plinth.position.set(columnCenter(column), PLINTH_Y, rowToZ(row));
      plinth.receiveShadow = true;
      world.add(plinth);
    }),
  );

  const addRoomLabel = (group, roomId, x) => {
    const labelElement = document.createElement("div");
    labelElement.className = "room-label";
    labelElement.textContent = ROOM_LABELS[roomId];
    const labelObject = new CSS2DObject(labelElement);
    labelObject.position.set(x, 0.05, ROOM_SIZE / 2 - 0.7);
    group.add(labelObject);
    return labelElement;
  };

  const rooms = GRID.flat().filter(Boolean);

  const floorFor = (roomId) => {
    const base = FLOORS[roomId];
    const override = style.floors?.[roomId];
    const woodKind = roomId === "pause" ? style.woodKind : undefined;
    return { color: override?.color ?? base.color, kind: override?.kind ?? woodKind ?? style.floorKinds?.[base.kind] ?? base.kind };
  };

  rooms.forEach((roomId) => {
    const group = new THREE.Group();
    group.position.set(roomCenters[roomId].x, 0, roomCenters[roomId].z);
    world.add(group);
    roomGroups[roomId] = group;
    const floorConfig = floorFor(roomId);
    const floorMaterial = new THREE.MeshStandardMaterial({
      map: makeFloorTexture(floorConfig.color, floorConfig.kind, "#" + ACCENTS[roomId].toString(16).padStart(6, "0")),
      roughness: floorConfig.kind === "tile" || floorConfig.kind === "checker" ? 0.45 : 0.85,
      metalness: 0,
    });
    floorMaterials.push(floorMaterial);
    const floor = new THREE.Mesh(boxGeometry(ROOM_SIZE, 0.12, ROOM_SIZE, floorMaterial), floorMaterial);
    floor.position.y = -0.06;
    floor.receiveShadow = true;
    group.add(floor);
    labelElements[roomId] = addRoomLabel(group, roomId, 0);
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

  // Chaque côté de pièce est une façade (mur extérieur vitré, fond et gauche), une cloison vitrée (entre deux pièces)
  // ou un muret (devant et à droite, pour que la caméra voie à l'intérieur). Une case vide ne dessine rien.
  const horizontalKind = (column, line) => {
    const above = roomAt(column, line - 1);
    const below = roomAt(column, line);
    if (!above && !below) return null;
    if (above && below) return "partition";
    return above ? "low" : "facade";
  };
  const verticalKind = (line, row) => {
    const left = roomAt(line - 1, row);
    const right = roomAt(line, row);
    if (!left && !right) return null;
    if (left && right) return "partition";
    return left ? "low" : "facade";
  };
  const lowWall = (x1, z1, x2, z2) => wallSegment(x1, z1, x2, z2, 0, LOW_WALL_HEIGHT, 0.2, frameMaterial);
  const drawSegment = { facade, partition, low: lowWall };

  for (let line = 0; line <= ROWS; line += 1) {
    for (let column = 0; column < COLUMNS; column += 1) {
      const kind = horizontalKind(column, line);
      if (kind) drawSegment[kind](edge(column), edge(line), edge(column + 1), edge(line));
    }
  }
  for (let line = 0; line <= COLUMNS; line += 1) {
    for (let row = 0; row < ROWS; row += 1) {
      const kind = verticalKind(line, row);
      if (!kind) continue;
      if (kind === "facade" && line === 0 && row === 0) facadeWithDoor(edge(line), edge(row), edge(row + 1), exitDoorZ);
      else drawSegment[kind](edge(line), edge(row), edge(line), edge(row + 1));
    }
  }

  // Les murs sont centrés sur leur axe : sans plots, chaque bout de façade garde une encoche d'une demi-épaisseur.
  // Chaque angle reçoit aussi un poteau, aussi haut que le plus haut mur qui s'y rejoint.
  for (let line = 0; line <= COLUMNS; line += 1) {
    for (let row = 0; row <= ROWS; row += 1) {
      const incident = [
        { axis: "x", kind: horizontalKind(line - 1, row) },
        { axis: "x", kind: horizontalKind(line, row) },
        { axis: "z", kind: verticalKind(line, row - 1) },
        { axis: "z", kind: verticalKind(line, row) },
      ].filter((side) => side.kind);
      if (incident.length === 0) continue;
      const kinds = incident.map((side) => side.kind);
      const facades = incident.filter((side) => side.kind === "facade");
      if (facades.length === 1 || (facades.length === 2 && facades[0].axis !== facades[1].axis)) addBox(world, 0.3, WALL_HEIGHT, 0.3, plasterMaterial, edge(line), WALL_HEIGHT / 2, edge(row));
      else if (kinds.every((kind) => kind === "low")) addBox(world, 0.2, LOW_WALL_HEIGHT, 0.2, frameMaterial, edge(line), LOW_WALL_HEIGHT / 2, edge(row));
      const height = kinds.includes("low") ? LOW_WALL_HEIGHT : kinds.includes("facade") ? WALL_HEIGHT : PARTITION_HEIGHT;
      post(edge(line), edge(row), height);
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
  rooms.forEach((roomId) => props.wallLedge(room(roomId), { x: 0, z: -ROOM_SIZE / 2 + 0.14, width: ROOM_SIZE - 0.8, color: style.accentColor ?? ACCENTS[roomId], intensity: style.ledgeIntensity ?? 0.85 }));

  props.counter(room("acc"), { x: -0.3, z: -3.9, width: 3.4, depth: 0.8, top: M.white, light: 0xff6b6b });
  addBox(room("acc"), 0.8, 0.46, 0.03, M.black, -0.3, 1.38, -4.05);
  addBox(room("acc"), 0.74, 0.4, 0.01, M.screen, -0.3, 1.38, -4.03).castShadow = false;
  props.signPanel(room("acc"), { x: -0.3, y: 2.35, z: backWall, width: 3.2, height: 0.8, text: style.receptionSign ?? "BUREAUX CLAUDE", accentColor: "#ff6b6b" });
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

  // Salle des bugs : un open space à part pour les discussions qui corrigent un bug, écrans rouges, tickets au mur et piège à insectes.
  [-3.4, -0.2].forEach((deskZ) => {
    [-0.9, 2.4].forEach((deskX) => {
      props.desk(room("bug"), { x: deskX, z: deskZ, screenMaterial: M.screenRed });
      props.chair(room("bug"), { x: deskX, z: deskZ + 1.2, ry: Math.PI });
    });
  });
  props.lockers(room("bug"), { x: -4.6, z: -1.7, ry: Math.PI / 2, count: 4 });
  props.glassBoard(room("bug"), { x: 0.8, z: backWall, width: 2.8, height: 1.2 });
  addWallScreen("bug", -3.3, 1.7, 1.1, 0xffc4b0, 0xc4401a);
  props.signPanel(room("bug"), { x: 0.8, y: 2.8, z: backWall, width: 2.4, height: 0.7, text: "BUGS", accentColor: "#ff7a3d" });
  props.bugStatue(room("bug"), { x: 4.3, z: 1.0, ry: -0.9 });
  props.bugZapper(room("bug"), { x: 4.4, z: -4.3 });
  props.plant(room("bug"), { x: 4.3, z: 4.3, height: 1.6 });
  props.plant(room("bug"), { x: -4.4, z: 4.3, kind: "snake" });

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

  // Archives : baies de serveurs au fond, poufs de sieste au milieu, casiers à gauche.
  [-1.7, -0.6, 0.5, 1.6, 2.7, 3.8].forEach((rackX) => props.serverRack(room("arch"), { x: rackX, z: -4.35 }));
  [
    [-1.4, -1.9, M.slate],
    [0.5, -1.9, M.navy],
    [-1.4, 0.1, M.navy],
    [0.5, 0.1, M.slate],
    [-0.5, 1.5, M.fog],
    [2.6, -1.9, M.fog],
    [2.6, 0.1, M.navy],
    [3.9, -0.9, M.slate],
  ].forEach(([bagX, bagZ, color]) => props.beanBag(room("arch"), { x: bagX, z: bagZ, color }));
  props.lockers(room("arch"), { x: -4.6, z: -1.0, ry: Math.PI / 2, count: 5 });
  props.plant(room("arch"), { x: 4.4, z: 4.3, height: 1.6 });
  props.plant(room("arch"), { x: -4.4, z: 4.3, kind: "snake" });

  // Pause : un vrai salon sur parquet, deux coins canapé face à face et le bar à café au fond.
  props.rug(room("pause"), { x: 1.4, z: -1.7, width: 6.8, depth: 4.2, color: M.fog });
  props.sofa(room("pause"), { x: -1.5, z: -1.7, ry: Math.PI / 2, length: 2.4, tone: M.door[0] });
  props.roundTable(room("pause"), { x: -0.2, z: -1.7, radius: 0.5, top: M.oak });
  props.sofa(room("pause"), { x: 4.4, z: -1.7, ry: -Math.PI / 2, length: 2.4, tone: M.door[1] });
  props.roundTable(room("pause"), { x: 3.0, z: -1.7, radius: 0.5, top: M.oak });
  props.pouf(room("pause"), { x: 2.3, z: -0.4, color: M.door[2] });
  props.pouf(room("pause"), { x: 2.2, z: -2.2, color: M.door[0] });
  props.pouf(room("pause"), { x: -0.2, z: -0.3, color: M.door[3] });
  props.bench(room("pause"), { x: -0.4, z: -4.15, length: 2.4 });
  props.coffeeBar(room("pause"), { x: 2.9, z: -4.4, width: 2.3 });
  props.signPanel(room("pause"), { x: 2.9, y: 2.9, z: backWall, width: 1.8, height: 0.6, text: "PAUSE", accentColor: "#14b8a6" });
  props.plant(room("pause"), { x: 4.4, z: 4.3, height: 1.6 });
  props.plant(room("pause"), { x: 2.0, z: 1.3, kind: "snake" });
  props.plant(room("pause"), { x: -4.4, z: -4.3, height: 1.7 });
  props.plant(room("pause"), { x: -4.4, z: 4.3, kind: "snake" });

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

  style.decor?.({ THREE, world, room, rooms, props, M, addBox, addCylinder, animated, roomGroups, ROOM_SIZE, backWall, ACCENTS, edge, standardMaterial, scene, centerX, centerZ, slabWidth, slabDepth });

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
    if (style.walls?.frameGlow) {
      frameMaterial.emissive.set(style.walls.frameGlow);
      frameMaterial.emissiveIntensity = style.walls.frameGlowIntensity ?? 1;
    }
    groundMaterial.color.set(palette.ground);
    plinthMaterial.color.set(palette.plinth);
    glazingMaterial.emissive.set(palette.glazing);
    floorMaterials.forEach((material) => material.color.set(palette.floorTint));
  };

  return { world, roomGroups, update, setRoomOverflow, applyPalette, gateBeam, exitDoor, style };
};
