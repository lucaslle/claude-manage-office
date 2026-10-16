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

// La salle de pause est un salon : deux rangées de trois canapés face à face autour de petites tables, plus une rangée
// devant, tournée vers la caméra. Un canapé par place, hors des deux couloirs de passage et du bar à café.
export const PAUSE_COLUMNS = [-1.2, 1.4, 3.9];
const PAUSE_SEAT_OFFSET = 0.15;
export const PAUSE_SOFAS = [
  ...PAUSE_COLUMNS.map((x) => ({ x, z: -2.9, ry: 0 })),
  ...PAUSE_COLUMNS.map((x) => ({ x, z: -0.3, ry: Math.PI })),
  ...PAUSE_COLUMNS.map((x) => ({ x, z: 4.3, ry: 0 })),
];

// Les premiers arrivés s'installent loin les uns des autres : on range les places en partant de la plus éloignée de celles déjà prises.
const farthestFirst = (points) => {
  const remaining = points.slice(1);
  const ordered = [points[0]];
  while (remaining.length > 0) {
    let best = 0;
    let bestDistance = -1;
    remaining.forEach((point, index) => {
      const nearest = Math.min(...ordered.map((taken) => Math.hypot(point.x - taken.x, point.z - taken.z)));
      if (nearest > bestDistance) {
        bestDistance = nearest;
        best = index;
      }
    });
    ordered.push(remaining.splice(best, 1)[0]);
  }
  return ordered;
};

const PAUSE_SLOTS = farthestFirst(PAUSE_SOFAS).map(({ x, z, ry }) => ({ x, z: z + (ry === 0 ? PAUSE_SEAT_OFFSET : -PAUSE_SEAT_OFFSET), ry, pose: "meet" }));

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
    { x: -1.6, z: -0.5, ry: 0.5, pose: "work" },
    { x: 0.3, z: -0.5, ry: 0.5, pose: "work" },
    { x: 3.9, z: 1.6, ry: 0.5, pose: "work" },
    { x: 0.4, z: 1.8, ry: 0.5, pose: "work" },
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
  pause: PAUSE_SLOTS,
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
