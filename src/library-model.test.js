import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countByFilter, dateBucket, filterEntries, groupEntries, liveLabel, matchesSearch, stateBucket } from "./library-model.js";

const HOUR = 3600000;
const DAY = 24 * HOUR;
const now = new Date(2026, 9, 16, 15, 0, 0).getTime();

const entry = (id, overrides = {}) => ({ id, title: `Discussion ${id}`, project: "app", branch: "", firstPrompt: "", lastMessage: "", source: "terminal", archived: false, live: null, updatedAt: now - HOUR, ...overrides });

describe("recherche", () => {
  it("ignore la casse et les accents, et exige tous les mots", () => {
    const item = entry("a", { title: "Création du portail", project: "Portail-Client" });
    assert.equal(matchesSearch(item, "creation PORTAIL"), true);
    assert.equal(matchesSearch(item, "portail client"), true);
    assert.equal(matchesSearch(item, "portail facture"), false);
    assert.equal(matchesSearch(item, "   "), true);
  });

  it("cherche aussi dans la branche, la première demande et le dernier message", () => {
    const item = entry("a", { branch: "feat/login", firstPrompt: "Corrige le bug", lastMessage: "Migrations prêtes" });
    assert.equal(matchesSearch(item, "login"), true);
    assert.equal(matchesSearch(item, "bug"), true);
    assert.equal(matchesSearch(item, "migrations"), true);
  });
});

describe("filtres", () => {
  const entries = [entry("a", { live: "needs_reply" }), entry("b", { live: "working", source: "app" }), entry("c", { archived: true, source: "app" }), entry("d", { title: "Portail final" })];

  it("masque les archivées dans « Toutes » et les montre dans « Archivées »", () => {
    assert.deepEqual(filterEntries(entries, "all", "").map((item) => item.id), ["a", "b", "d"]);
    assert.deepEqual(filterEntries(entries, "archived", "").map((item) => item.id), ["c"]);
  });

  it("filtre par état et par origine", () => {
    assert.deepEqual(filterEntries(entries, "reply", "").map((item) => item.id), ["a"]);
    assert.deepEqual(filterEntries(entries, "working", "").map((item) => item.id), ["b"]);
    assert.deepEqual(filterEntries(entries, "app", "").map((item) => item.id), ["b"]);
    assert.deepEqual(filterEntries(entries, "terminal", "").map((item) => item.id), ["a", "d"]);
  });

  it("combine un filtre et une recherche, et compte chaque filtre", () => {
    assert.deepEqual(filterEntries(entries, "all", "portail").map((item) => item.id), ["d"]);
    assert.deepEqual(countByFilter(entries), { all: 3, reply: 1, working: 1, app: 1, terminal: 2, archived: 1 });
  });
});

describe("regroupements", () => {
  it("classe par jour calendaire", () => {
    assert.equal(dateBucket(now - HOUR, now).id, "today");
    assert.equal(dateBucket(new Date(2026, 9, 15, 23, 0).getTime(), now).id, "yesterday");
    assert.equal(dateBucket(now - 4 * DAY, now).id, "week");
    assert.equal(dateBucket(now - 20 * DAY, now).id, "month");
    assert.equal(dateBucket(now - 90 * DAY, now).id, "older");
  });

  it("classe par état, les archivées en dernier", () => {
    assert.equal(stateBucket(entry("a", { live: "needs_reply" }), now).id, "reply");
    assert.equal(stateBucket(entry("a", { live: "working" }), now).id, "working");
    assert.equal(stateBucket(entry("a", { updatedAt: now - 2 * HOUR }), now).id, "recent");
    assert.equal(stateBucket(entry("a", { updatedAt: now - 3 * DAY }), now).id, "week");
    assert.equal(stateBucket(entry("a", { updatedAt: now - 30 * DAY }), now).id, "older");
    assert.equal(stateBucket(entry("a", { archived: true, live: "working" }), now).id, "archived");
  });

  it("groupe par projet, le plus récemment actif d'abord", () => {
    const groups = groupEntries([entry("a", { project: "api", updatedAt: now - 5 * HOUR }), entry("b", { project: "web", updatedAt: now - HOUR }), entry("c", { project: "api", updatedAt: now - 2 * HOUR })], "project", now);
    assert.deepEqual(groups.map((group) => [group.label, group.entries.length]), [["web", 1], ["api", 2]]);
  });

  it("groupe par date et par état dans l'ordre d'affichage", () => {
    const items = [entry("a", { updatedAt: now - 40 * DAY }), entry("b", { updatedAt: now - HOUR }), entry("c", { live: "needs_reply" })];
    assert.deepEqual(groupEntries(items, "date", now).map((group) => group.id), ["today", "older"]);
    assert.deepEqual(groupEntries(items, "state", now).map((group) => group.id), ["reply", "recent", "older"]);
  });

  it("place les épinglées en premier sans les dupliquer", () => {
    const items = [entry("a", { project: "api" }), entry("b", { project: "web", updatedAt: now - 3 * HOUR })];
    const groups = groupEntries(items, "project", now, new Set(["b"]));
    assert.deepEqual(groups.map((group) => [group.id, group.entries.map((item) => item.id)]), [["pinned", ["b"]], ["project:api", ["a"]]]);
  });
});

describe("libellés", () => {
  it("nomme les états en direct et ignore les inconnus", () => {
    assert.equal(liveLabel("needs_reply"), "À répondre");
    assert.equal(liveLabel(null), "");
  });
});
