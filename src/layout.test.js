import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COLUMNS, GRID, ROOM_SIZE, ROWS, SLOTS, columnAt, roomAt, roomCenters, rowAt } from "./layout.js";
import { ROOM_ACTIONS, ROOM_LABELS, ROOM_NAMES } from "./data.js";
import { buildRoute } from "./characters.js";

const roomIds = GRID.flat().filter(Boolean);

describe("plan du bâtiment", () => {
  it("donne à chaque pièce un centre, des places et des textes", () => {
    roomIds.forEach((roomId) => {
      assert.ok(roomCenters[roomId], `centre de ${roomId}`);
      assert.ok(SLOTS[roomId]?.length > 0, `places de ${roomId}`);
      [ROOM_NAMES, ROOM_LABELS, ROOM_ACTIONS].forEach((table) => assert.ok(table[roomId], `texte de ${roomId}`));
    });
  });

  it("place la salle des bugs devant l'atelier, et la pause à côté de la salle de merge", () => {
    assert.equal(roomAt(0, 2), "bug");
    assert.equal(roomAt(0, 1), "fix");
    assert.equal(roomAt(1, 2), "mrg");
    assert.equal(roomAt(2, 2), "pause");
    assert.equal(roomAt(9, 9), null);
  });

  it("n'a plus de salle des brouillons ni d'attente", () => {
    ["draft", "wait"].forEach((roomId) => {
      assert.ok(!roomIds.includes(roomId));
      assert.equal(SLOTS[roomId], undefined);
    });
  });

  it("donne à la pause ses propres places, dans sa propre case", () => {
    assert.notDeepEqual(roomCenters.pause, roomCenters.arch);
    assert.ok(SLOTS.pause.length >= 6);
  });

  it("retrouve la colonne et la rangée d'une position", () => {
    GRID.forEach((rowRooms, row) =>
      rowRooms.forEach((roomId, column) => {
        if (!roomId) return;
        assert.equal(columnAt(roomCenters[roomId].x), column);
        assert.equal(rowAt(roomCenters[roomId].z), row);
      }),
    );
    assert.equal(columnAt(-1000), 0);
    assert.equal(columnAt(1000), COLUMNS - 1);
    assert.equal(rowAt(1000), ROWS - 1);
  });
});

describe("trajets entre les pièces", () => {
  const center = (roomId) => roomCenters[roomId];

  it("passe de pièce en pièce par les portes, jamais à travers une case vide", () => {
    roomIds.forEach((from) =>
      roomIds.forEach((to) => {
        const route = buildRoute(center(from).x, center(from).z, center(to).x, center(to).z);
        let previous = center(from);
        route.forEach((point) => {
          const cell = roomAt(columnAt(point.x), rowAt(point.z));
          assert.ok(cell, `${from} vers ${to} traverse une case vide en (${point.x}, ${point.z})`);
          assert.ok(Math.abs(point.x - previous.x) < ROOM_SIZE + 0.01 && Math.abs(point.z - previous.z) < ROOM_SIZE + 0.01, `${from} vers ${to} saute une pièce`);
          previous = point;
        });
      }),
    );
  });
});
