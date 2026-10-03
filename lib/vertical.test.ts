import assert from "node:assert/strict";
import test from "node:test";
import { leagueHrefFor, resolveVertical, FOOTBALL, GOLF, HOCKEY } from "./vertical";
import { planForVertical } from "./plan-for-vertical";

test("odefinierad vertikal är fotboll", () => {
  assert.equal(resolveVertical(undefined), "football");
  assert.equal(resolveVertical(""), "football");
  assert.equal(resolveVertical("basket"), "football");
});

test("hockey och golf är de andra vertikalerna", () => {
  assert.equal(resolveVertical("hockey"), "hockey");
  assert.equal(resolveVertical("golf"), "golf");
});

test("golf har ingen serie, inga lag och säljer inget", () => {
  assert.equal(leagueHrefFor("golf"), "/golf");
  assert.equal(leagueHrefFor("golf", "/tabell"), "/golf");
  assert.equal(GOLF.paused, true);
  assert.deepEqual(GOLF.featuredTeams, []);
  for (const route of ["/allsvenskan", "/match", "/lag", "/mitt-lag", "/prenumerera"]) {
    assert.ok(GOLF.hiddenRoutes.includes(route), route);
  }
  assert.equal(planForVertical("golf", { plan: "elite", plans: { hockey: "pro" } }), "free");
});

test("fotbollens ligaväg är oförändrad", () => {
  assert.equal(leagueHrefFor("football"), "/allsvenskan");
  assert.equal(leagueHrefFor("football", "/tabell"), "/allsvenskan/tabell");
  assert.equal(FOOTBALL.productName, "Nano Fotboll");
  assert.equal(FOOTBALL.paused, false);
});

test("hockey pekar på SHL och är live", () => {
  assert.equal(leagueHrefFor("hockey"), "/shl");
  assert.equal(leagueHrefFor("hockey", "tabell"), "/shl/tabell");
  assert.equal(HOCKEY.leagueEntity, "SHL");
  assert.equal(HOCKEY.paused, false); // Sportradar-synken live sedan 2026-09-29
});

test("fotbollsplan läser det gamla fältet", () => {
  assert.equal(planForVertical("football", { plan: "pro" }), "pro");
  assert.equal(planForVertical("football", { plan: "elite", plans: { hockey: "free" } }), "elite");
  assert.equal(planForVertical("football", {}), "free");
});

test("hockeyplan läser inte fotbollens plan", () => {
  assert.equal(planForVertical("hockey", { plan: "elite" }), "free");
  assert.equal(planForVertical("hockey", { plan: "elite", plans: { hockey: "pro" } }), "pro");
  assert.equal(planForVertical("hockey", null), "free");
});
