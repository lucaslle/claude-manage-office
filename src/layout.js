export const ROOM_SIZE = 10;
export const DOOR_WIDTH = 2.6;
export const DOOR_ALONG = 3.0;
export const DOOR_ACROSS = -3.0;

export const GRID = [
  ["acc", "open", "rev"],
  ["mrg", "wait", "draft"],
  ["fix", "arch", "meet"],
];

export const roomCenters = {};
GRID.forEach((rowRooms, rowIndex) => {
  rowRooms.forEach((roomId, columnIndex) => {
    roomCenters[roomId] = {
      x: (columnIndex - 1) * ROOM_SIZE,
      z: (rowIndex - 1) * ROOM_SIZE,
    };
  });
});

// Les places restent hors des deux bandes de passage de chaque pièce (z entre 2.2 et 3.8, x entre -3.8 et -2.2).
export const SLOTS = {
  acc: [
    { x: -1.6, z: 0.4, ry: 0.55, pose: "wave" },
    { x: 0.4, z: 1.6, ry: 0.55, pose: "wave" },
    { x: 2.4, z: 0.4, ry: 0.55, pose: "wave" },
    { x: 1.4, z: -1.4, ry: 0.55, pose: "wave" },
    { x: -0.8, z: -1.6, ry: 0.55, pose: "wave" },
    { x: 3.6, z: 1.4, ry: 0.55, pose: "wave" },
  ],
  open: [
    { x: -0.9, z: -1.8, ry: Math.PI, pose: "type" },
    { x: 2.4, z: -1.8, ry: Math.PI, pose: "type" },
    { x: -0.9, z: 1.4, ry: Math.PI, pose: "type" },
    { x: 2.4, z: 1.4, ry: Math.PI, pose: "type" },
  ],
  rev: [
    { x: -1.6, z: -3.3, ry: 0.4, pose: "stand" },
    { x: 0.6, z: -3.5, ry: 0.4, pose: "stand" },
    { x: 2.8, z: -3.3, ry: 0.4, pose: "stand" },
    { x: 4.2, z: -1.8, ry: 0.4, pose: "stand" },
    { x: -1.8, z: 1.0, ry: 0.4, pose: "stand" },
    { x: 4.0, z: 1.6, ry: 0.4, pose: "stand" },
  ],
  mrg: [
    { x: -1.5, z: -1.2, ry: Math.PI, pose: "ready" },
    { x: 1.5, z: -1.2, ry: Math.PI, pose: "ready" },
    { x: -1.5, z: 0.8, ry: Math.PI, pose: "ready" },
    { x: 1.5, z: 0.8, ry: Math.PI, pose: "ready" },
  ],
  wait: [
    { x: 0, z: -2.2, ry: 0.45, pose: "queue" },
    { x: 0, z: -0.6, ry: 0.45, pose: "queue" },
    { x: 0, z: 1.0, ry: 0.45, pose: "queue" },
    { x: 2.6, z: 1.6, ry: 0.45, pose: "queue" },
    { x: -2.0, z: -3.6, ry: 0.45, pose: "queue" },
  ],
  draft: [
    { x: -1.6, z: -1.5, ry: Math.PI, pose: "work" },
    { x: 0.8, z: -1.5, ry: Math.PI, pose: "work" },
    { x: 3.2, z: -1.5, ry: Math.PI, pose: "work" },
    { x: -1.4, z: 0.4, ry: 0.5, pose: "queue" },
    { x: 1.0, z: 0.4, ry: 0.5, pose: "queue" },
    { x: 3.4, z: 0.4, ry: 0.5, pose: "queue" },
    { x: 0, z: 1.8, ry: 0.5, pose: "queue" },
    { x: 2.4, z: 1.8, ry: 0.5, pose: "queue" },
  ],
  fix: [
    { x: -1.4, z: -1.9, ry: Math.PI, pose: "work" },
    { x: 1.8, z: -1.9, ry: Math.PI, pose: "work" },
    { x: -1.0, z: 1.0, ry: 0.5, pose: "work" },
    { x: 2.0, z: 1.2, ry: 0.5, pose: "work" },
  ],
  arch: [
    { x: -1.6, z: 1.0, ry: 0.35, pose: "sleep" },
    { x: 0.4, z: 1.0, ry: 0.35, pose: "sleep" },
    { x: 2.4, z: 1.0, ry: 0.35, pose: "sleep" },
    { x: -0.6, z: -1.4, ry: 0.35, pose: "sleep" },
    { x: 1.4, z: -1.4, ry: 0.35, pose: "sleep" },
  ],
  meet: [
    { x: -0.6, z: -1.8, ry: 0, pose: "meet" },
    { x: 0.6, z: -1.8, ry: 0, pose: "meet" },
    { x: 1.8, z: -1.8, ry: 0, pose: "meet" },
    { x: -0.6, z: 1.0, ry: Math.PI, pose: "meet" },
    { x: 0.6, z: 1.0, ry: Math.PI, pose: "meet" },
    { x: 1.8, z: 1.0, ry: Math.PI, pose: "meet" },
    { x: -1.8, z: -0.4, ry: Math.PI / 2, pose: "meet" },
    { x: 3.0, z: -0.4, ry: -Math.PI / 2, pose: "meet" },
  ],
};

export const SEATED_POSES = new Set(["type", "sleep", "meet"]);

export const GATE_LOCAL = { x: 0, z: -3.2 };
