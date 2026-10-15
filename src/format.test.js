import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatAge, formatDuration } from "./format.js";

const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("formatDuration", () => {
  it("dit « maintenant » pour une durée nulle ou passée", () => {
    assert.equal(formatDuration(0), "maintenant");
    assert.equal(formatDuration(-5 * MINUTE), "maintenant");
  });

  it("arrondit à la minute, au moins une", () => {
    assert.equal(formatDuration(10_000), "1 min");
    assert.equal(formatDuration(2.6 * MINUTE), "3 min");
    assert.equal(formatDuration(45 * MINUTE), "45 min");
  });

  it("affiche les heures avec les minutes sur deux chiffres", () => {
    assert.equal(formatDuration(HOUR), "1 h 00");
    assert.equal(formatDuration(2 * HOUR + 9 * MINUTE), "2 h 09");
  });

  it("affiche les jours et les heures", () => {
    assert.equal(formatDuration(5 * DAY + 10 * HOUR + 30 * MINUTE), "5 j 10 h");
  });
});

describe("formatAge", () => {
  it("passe des minutes aux heures puis aux jours", () => {
    assert.equal(formatAge(20_000), "à l'instant");
    assert.equal(formatAge(5 * MINUTE), "il y a 5 min");
    assert.equal(formatAge(3 * HOUR), "il y a 3 h");
    assert.equal(formatAge(47 * HOUR), "il y a 47 h");
    assert.equal(formatAge(3 * DAY), "il y a 3 j");
  });
});
