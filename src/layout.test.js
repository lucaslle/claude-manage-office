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

  it("place la salle des bugs à côté de l'attente, avec une cour derrière", () => {
    assert.equal(roomAt(3, 2), "bug");
    assert.equal(roomAt(2, 2), "wait");
    assert.equal(roomAt(3, 0), null);
    assert.equal(roomAt(3, 1), null);
    assert.equal(roomAt(9, 9), null);
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

  it("contourne la case vide pour aller de l'open space à la salle des bugs", () => {
    const route = buildRoute(center("open").x, center("open").z, center("bug").x, center("bug").z);
    const crossed = new Set(route.map((point) => roomAt(columnAt(point.x), rowAt(point.z))));
    assert.ok(crossed.has("meet") && crossed.has("arch") && crossed.has("wait"));
  });
});
