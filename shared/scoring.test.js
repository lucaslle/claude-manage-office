import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { advanceScore, applyEvents, createScore, dayKey, levelFor, publicScore, streakNow } from "./scoring.js";

const MINUTE = 60000;
const DAY = 24 * 60 * MINUTE;
const T0 = new Date(2026, 9, 15, 10, 0, 0).getTime();

const session = (key, room, overrides = {}) => ({ key, kind: "robot", room, name: key, ...overrides });
const mergeRequest = (key, room, overrides = {}) => ({ key, kind: "mr", room, name: key, ...overrides });

const seeded = (characters, at = T0) => advanceScore(createScore(), { characters, now: at }).score;

describe("advanceScore", () => {
  it("n'attribue rien à la première observation", () => {
    const result = advanceScore(createScore(), { characters: [session("s:1", "acc")], now: T0 });
    assert.equal(result.score.xp, 0);
    assert.deepEqual(result.events, []);
    assert.equal(result.score.presence["s:1"].room, "acc");
  });

  it("récompense une réponse éclair quand la session quitte l'accueil en moins de cinq minutes", () => {
    const score = seeded([session("s:1", "acc"), session("s:2", "acc")]);
    const result = advanceScore(score, { characters: [session("s:1", "open"), session("s:2", "acc")], now: T0 + 2 * MINUTE });
    assert.deepEqual(result.events.map((event) => event.type), ["quick_reply"]);
    assert.equal(result.score.xp, 25);
  });

  it("récompense une réponse simple après cinq minutes", () => {
    const score = seeded([session("s:1", "acc"), session("s:2", "acc")]);
    const result = advanceScore(score, { characters: [session("s:1", "open"), session("s:2", "acc")], now: T0 + 9 * MINUTE });
    assert.deepEqual(result.events.map((event) => event.type), ["reply"]);
    assert.equal(result.score.xp, 10);
  });

  it("ignore un agent qui quitte l'accueil", () => {
    const score = seeded([session("a:1", "acc", { agent: true })]);
    const result = advanceScore(score, { characters: [session("a:1", "open", { agent: true })], now: T0 + MINUTE });
    assert.deepEqual(result.events, []);
  });

  it("ajoute « accueil vide » quand la dernière session en attente est traitée", () => {
    const score = seeded([session("s:1", "acc"), session("s:2", "acc")]);
    const first = advanceScore(score, { characters: [session("s:1", "open"), session("s:2", "acc")], now: T0 + MINUTE });
    assert.deepEqual(first.events.map((event) => event.type), ["quick_reply"]);
    const second = advanceScore(first.score, { characters: [session("s:1", "open"), session("s:2", "open")], now: T0 + 2 * MINUTE });
    assert.deepEqual(second.events.map((event) => event.type), ["quick_reply", "inbox_zero"]);
  });

  it("récompense une réparation, une relecture et un brouillon terminé", () => {
    const score = seeded([mergeRequest("m:1", "fix"), mergeRequest("m:2", "rev"), mergeRequest("m:3", "rev", { draft: true })]);
    const result = advanceScore(score, { characters: [mergeRequest("m:1", "rev"), mergeRequest("m:2", "mrg"), mergeRequest("m:3", "rev")], now: T0 + 10 * MINUTE });
    assert.deepEqual(result.events.map((event) => event.type), ["repair", "review", "ready"]);
  });

  it("ne compte un merge qu'une seule fois", () => {
    const score = seeded([mergeRequest("m:1", "mrg")]);
    const first = advanceScore(score, { characters: [], merged: [{ key: "m:1", name: "repo !1" }], now: T0 + MINUTE });
    assert.equal(first.events[0].type, "merge");
    assert.equal(first.events[0].name, "repo !1");
    const second = advanceScore(first.score, { characters: [], merged: [{ key: "m:1", name: "repo !1" }], now: T0 + 2 * MINUTE });
    assert.deepEqual(second.events, []);
    assert.equal(second.score.xp, 40);
  });

  it("garde la date d'arrivée dans une pièce entre deux observations", () => {
    const score = seeded([session("s:1", "acc")]);
    const later = advanceScore(score, { characters: [session("s:1", "acc")], now: T0 + 4 * MINUTE }).score;
    const result = advanceScore(later, { characters: [session("s:1", "open")], now: T0 + 6 * MINUTE });
    assert.equal(result.events[0].type, "reply");
  });
});

describe("applyEvents", () => {
  it("multiplie les points d'un enchaînement rapide, jusqu'au double", () => {
    let state = createScore();
    const points = [];
    for (let index = 0; index < 6; index += 1) {
      const result = applyEvents(state, [{ type: "reply", key: "s", name: "s" }], T0 + index * MINUTE);
      state = result.score;
      points.push(result.events[0].points);
    }
    assert.deepEqual(points, [10, 13, 15, 18, 20, 20]);
    assert.equal(state.combo.best, 6);
  });

  it("repart à un quand l'enchaînement est rompu", () => {
    const first = applyEvents(createScore(), [{ type: "reply", key: "s", name: "s" }], T0);
    const second = applyEvents(first.score, [{ type: "reply", key: "s", name: "s" }], T0 + 10 * MINUTE);
    assert.equal(second.score.combo.count, 1);
    assert.equal(second.events[0].points, 10);
  });

  it("prolonge la série un jour après l'autre et la casse après un trou", () => {
    const event = [{ type: "reply", key: "s", name: "s" }];
    const dayOne = applyEvents(createScore(), event, T0).score;
    const dayTwo = applyEvents(dayOne, event, T0 + DAY).score;
    assert.equal(dayTwo.streak.days, 2);
    const sameDay = applyEvents(dayTwo, event, T0 + DAY + MINUTE).score;
    assert.equal(sameDay.streak.days, 2);
    const afterGap = applyEvents(sameDay, event, T0 + 4 * DAY).score;
    assert.equal(afterGap.streak.days, 1);
    assert.equal(streakNow(afterGap.streak, T0 + 4 * DAY), 1);
    assert.equal(streakNow(afterGap.streak, T0 + 7 * DAY), 0);
  });

  it("remet le compteur du jour à zéro à la première action d'un nouveau jour", () => {
    const event = [{ type: "merge", key: "m", name: "m" }];
    const dayOne = applyEvents(createScore(), event, T0).score;
    assert.equal(dayOne.today.points, 40);
    const dayTwo = applyEvents(dayOne, event, T0 + DAY).score;
    assert.equal(dayTwo.today.points, 40);
    assert.equal(dayTwo.today.day, dayKey(T0 + DAY));
  });

  it("débloque un badge et signale un changement de niveau", () => {
    const result = applyEvents({ ...createScore(), xp: 90 }, [{ type: "merge", key: "m", name: "m" }], T0);
    assert.deepEqual(result.badges, ["first_merge"]);
    assert.equal(result.levelUp.name, "Junior");
    const again = applyEvents(result.score, [{ type: "merge", key: "m", name: "m" }], T0 + 10 * MINUTE);
    assert.deepEqual(again.badges, []);
    assert.equal(again.levelUp, null);
  });

  it("garde un historique borné", () => {
    let state = createScore();
    for (let index = 0; index < 40; index += 1) state = applyEvents(state, [{ type: "reply", key: "s", name: "s" }], T0 + index * 10 * MINUTE).score;
    assert.equal(state.events.length, 30);
    assert.equal(state.events[0].id, 40);
  });
});

describe("levelFor et publicScore", () => {
  it("calcule le niveau et la progression", () => {
    assert.equal(levelFor(0).name, "Stagiaire");
    assert.equal(levelFor(299).name, "Junior");
    assert.equal(levelFor(300).name, "Confirmé");
    assert.equal(levelFor(200).progress, 0.5);
    assert.equal(levelFor(20000).next, null);
  });

  it("n'expose ni la présence ni les merges déjà comptés", () => {
    const exposed = publicScore(seeded([session("s:1", "acc")]));
    assert.equal(exposed.presence, undefined);
    assert.equal(exposed.scoredMerges, undefined);
    assert.equal(exposed.level.name, "Stagiaire");
  });
});
