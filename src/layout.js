export const ROOM_SIZE = 7.5;
export const DOOR_WIDTH = 2.4;
export const DOOR_ALONG = 2.2;
export const DOOR_ACROSS = -2.2;

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

export const SLOTS = {
  acc: [
    { x: -1.7, z: 0.9, ry: 0.55, pose: "wave" },
    { x: 0, z: 1.9, ry: 0.55, pose: "wave" },
    { x: 1.7, z: 0.9, ry: 0.55, pose: "wave" },
    { x: 2.6, z: -0.9, ry: 0.55, pose: "wave" },
    { x: -0.9, z: -0.8, ry: 0.55, pose: "wave" },
    { x: 0.9, z: -0.8, ry: 0.55, pose: "wave" },
  ],
  open: [
    { x: -1.9, z: -0.9, ry: Math.PI, pose: "type" },
    { x: 1.9, z: -0.9, ry: Math.PI, pose: "type" },
    { x: -1.9, z: 1.9, ry: Math.PI, pose: "type" },
    { x: 1.9, z: 1.9, ry: Math.PI, pose: "type" },
  ],
  rev: [
    { x: -2.5, z: -2.3, ry: 0.4, pose: "stand" },
    { x: -0.85, z: -2.5, ry: 0.4, pose: "stand" },
    { x: 0.85, z: -2.5, ry: 0.4, pose: "stand" },
    { x: 2.5, z: -2.3, ry: 0.4, pose: "stand" },
    { x: -3.0, z: 1.6, ry: 0.4, pose: "stand" },
    { x: 3.0, z: 1.6, ry: 0.4, pose: "stand" },
  ],
  mrg: [
    { x: -1.3, z: 1.0, ry: Math.PI, pose: "ready" },
    { x: 1.3, z: 1.0, ry: Math.PI, pose: "ready" },
    { x: -1.3, z: 2.4, ry: Math.PI, pose: "ready" },
    { x: 1.3, z: 2.4, ry: Math.PI, pose: "ready" },
  ],
  wait: [
    { x: 0, z: -1.3, ry: 0.45, pose: "queue" },
    { x: 0, z: 0.5, ry: 0.45, pose: "queue" },
    { x: 0, z: 2.3, ry: 0.45, pose: "queue" },
    { x: -2.4, z: 1.8, ry: 0.45, pose: "queue" },
    { x: 2.2, z: 1.8, ry: 0.45, pose: "queue" },
  ],
  draft: [
    { x: -2.4, z: -1.2, ry: Math.PI, pose: "work" },
    { x: 0, z: -1.2, ry: Math.PI, pose: "work" },
    { x: 2.4, z: -1.2, ry: Math.PI, pose: "work" },
    { x: -1.4, z: 1.7, ry: 0.5, pose: "queue" },
    { x: 1.4, z: 1.7, ry: 0.5, pose: "queue" },
    { x: -2.6, z: 0.3, ry: 0.5, pose: "queue" },
    { x: 0, z: 0.5, ry: 0.5, pose: "queue" },
    { x: 2.3, z: 0.4, ry: 0.5, pose: "queue" },
  ],
  fix: [
    { x: -1.5, z: -1.6, ry: Math.PI, pose: "work" },
    { x: 1.5, z: -1.6, ry: Math.PI, pose: "work" },
    { x: 0, z: 1.0, ry: 0.5, pose: "work" },
    { x: -2.4, z: 1.2, ry: 0.5, pose: "work" },
  ],
  arch: [
    { x: -2.5, z: 1.0, ry: 0.35, pose: "sleep" },
    { x: 0, z: 1.0, ry: 0.35, pose: "sleep" },
    { x: 2.5, z: 1.0, ry: 0.35, pose: "sleep" },
    { x: -1.25, z: 2.8, ry: 0.35, pose: "sleep" },
    { x: 1.25, z: 2.8, ry: 0.35, pose: "sleep" },
  ],
  meet: [
    { x: -1.0, z: -1.45, ry: 0, pose: "meet" },
    { x: 0, z: -1.45, ry: 0, pose: "meet" },
    { x: 1.0, z: -1.45, ry: 0, pose: "meet" },
    { x: -1.0, z: 1.05, ry: Math.PI, pose: "meet" },
    { x: 0, z: 1.05, ry: Math.PI, pose: "meet" },
    { x: 1.0, z: 1.05, ry: Math.PI, pose: "meet" },
    { x: -2.0, z: -0.2, ry: Math.PI / 2, pose: "meet" },
    { x: 2.0, z: -0.2, ry: -Math.PI / 2, pose: "meet" },
  ],
};

export const SEATED_POSES = new Set(["type", "sleep", "meet"]);

export const GATE_LOCAL = { x: 0, z: -2.5 };
