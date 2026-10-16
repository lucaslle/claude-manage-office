export const ROOM_SIZE = 10;
export const DOOR_WIDTH = 2.6;
export const DOOR_ALONG = 3.0;
export const DOOR_ACROSS = -3.0;

// La relecture est au centre : elle touche l'open space, l'atelier, la salle de merge et les archives,
// les quatre pièces avec lesquelles sessions et MR échangent le plus. Accueil, open space et réunion
// forment la rangée du fond ; bugs, merge et pause la rangée de devant. La salle des bugs est un open space
// à part. null marquerait une case sans pièce (aucune pour l'instant).
export const GRID = [
  ["acc", "open", "meet"],
  ["fix", "rev", "arch"],
  ["bug", "mrg", "pause"],
];

export const COLUMNS = GRID[0].length;
export const ROWS = GRID.length;

// La case (colonne 1, rangée 1), la relecture, est à l'origine.
export const roomAt = (column, row) => GRID[row]?.[column] ?? null;
export const columnToX = (column) => (column - 1) * ROOM_SIZE;
export const rowToZ = (row) => (row - 1) * ROOM_SIZE;
export const columnAt = (x) => Math.min(COLUMNS - 1, Math.max(0, Math.floor((x + 1.5 * ROOM_SIZE) / ROOM_SIZE)));
export const rowAt = (z) => Math.min(ROWS - 1, Math.max(0, Math.floor((z + 1.5 * ROOM_SIZE) / ROOM_SIZE)));

export const roomCenters = {};
GRID.forEach((rowRooms, rowIndex) => {
  rowRooms.forEach((roomId, columnIndex) => {
    if (!roomId) return;
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
    { x: -0.9, z: -2.15, ry: Math.PI, pose: "type" },
    { x: 2.4, z: -2.15, ry: Math.PI, pose: "type" },
    { x: -0.9, z: 1.05, ry: Math.PI, pose: "type" },
    { x: 2.4, z: 1.05, ry: Math.PI, pose: "type" },
  ],
  rev: [
    { x: -1.6, z: -3.3, ry: 0.4, pose: "stand" },
    { x: 0.6, z: -3.5, ry: 0.4, pose: "stand" },
    { x: 2.8, z: -3.3, ry: 0.4, pose: "stand" },
    { x: 4.2, z: -1.8, ry: 0.4, pose: "stand" },
    { x: -1.8, z: 1.2, ry: 0.4, pose: "stand" },
    { x: 4.0, z: 1.6, ry: 0.4, pose: "stand" },
  ],
  mrg: [
    { x: -1.5, z: -1.2, ry: Math.PI, pose: "ready" },
    { x: 1.5, z: -1.2, ry: Math.PI, pose: "ready" },
    { x: -1.5, z: 0.8, ry: Math.PI, pose: "ready" },
    { x: 1.5, z: 0.8, ry: Math.PI, pose: "ready" },
  ],
  fix: [
    { x: -1.4, z: -2.2, ry: Math.PI, pose: "work" },
    { x: 1.8, z: -2.2, ry: Math.PI, pose: "work" },
    { x: -1.0, z: 1.0, ry: 0.5, pose: "work" },
    { x: 2.0, z: 1.2, ry: 0.5, pose: "work" },
  ],
  arch: [
    { x: -1.4, z: -1.9, ry: 0.35, pose: "sleep" },
    { x: 0.5, z: -1.9, ry: 0.35, pose: "sleep" },
    { x: -1.4, z: 0.1, ry: 0.35, pose: "sleep" },
    { x: 0.5, z: 0.1, ry: 0.35, pose: "sleep" },
    { x: -0.5, z: 1.5, ry: 0.35, pose: "sleep" },
    { x: 2.6, z: -1.9, ry: 0.35, pose: "sleep" },
    { x: 2.6, z: 0.1, ry: 0.35, pose: "sleep" },
    { x: 3.9, z: -0.9, ry: 0.35, pose: "sleep" },
  ],
  pause: [
    { x: -1.15, z: -2.6, ry: Math.PI / 2, pose: "meet" },
    { x: -1.15, z: -0.8, ry: Math.PI / 2, pose: "meet" },
    { x: 4.05, z: -2.6, ry: -Math.PI / 2, pose: "meet" },
    { x: 4.05, z: -0.8, ry: -Math.PI / 2, pose: "meet" },
    { x: 2.5, z: -3.2, ry: Math.PI, pose: "stand" },
    { x: 3.7, z: -3.2, ry: Math.PI, pose: "stand" },
  ],
  bug: [
    { x: -0.9, z: -2.15, ry: Math.PI, pose: "type" },
    { x: 2.4, z: -2.15, ry: Math.PI, pose: "type" },
    { x: -0.9, z: 1.05, ry: Math.PI, pose: "type" },
    { x: 2.4, z: 1.05, ry: Math.PI, pose: "type" },
  ],
  meet: [
    { x: -0.4, z: -1.5, ry: 0, pose: "meet" },
    { x: 0.6, z: -1.5, ry: 0, pose: "meet" },
    { x: 1.6, z: -1.5, ry: 0, pose: "meet" },
    { x: -0.4, z: 0.7, ry: Math.PI, pose: "meet" },
    { x: 0.6, z: 0.7, ry: Math.PI, pose: "meet" },
    { x: 1.6, z: 0.7, ry: Math.PI, pose: "meet" },
    { x: -1.5, z: -0.4, ry: Math.PI / 2, pose: "meet" },
    { x: 2.7, z: -0.4, ry: -Math.PI / 2, pose: "meet" },
  ],
};

export const SEATED_POSES = new Set(["type", "sleep", "meet"]);

export const GATE_LOCAL = { x: 0, z: -3.2 };
