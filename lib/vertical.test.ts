import assert from "node:assert/strict";
import test from "node:test";
import { leagueHrefFor, resolveVertical, FOOTBALL, HOCKEY } from "./vertical";
import { planForVertical } from "./plan-for-vertical";

test("odefinierad vertikal är fotboll", () => {
  assert.equal(resolveVertical(undefined), "football");
  assert.equal(resolveVertical(""), "football");
  assert.equal(resolveVertical("golf"), "football");
});

test("hockey är den enda andra vertikalen", () => {
  assert.equal(resolveVertical("hockey"), "hockey");
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
