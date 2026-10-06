import assert from "node:assert/strict";
import test from "node:test";
import { entitlementsToClerkPlans } from "./clerk-plans";
import { entitlementMapFrom } from "./types";

test("elite slår pro, pro slår free", () => {
  assert.equal(entitlementsToClerkPlans({ football_elite: true, football_pro: true }, {}).plan, "elite");
  assert.equal(entitlementsToClerkPlans({ football_pro: true }, {}).plan, "pro");
  assert.equal(entitlementsToClerkPlans({}, {}).plan, "free");
  assert.equal(entitlementsToClerkPlans({ hockey_pro: true, maps_pro: true }, {}).plan, "free");
});

test("hockey styrs bara av hockey_pro", () => {
  assert.equal(entitlementsToClerkPlans({ hockey_pro: true }, {}).plans.hockey, "pro");
  assert.equal(entitlementsToClerkPlans({ football_elite: true }, {}).plans.hockey, "free");
});

test("maps och tv under plans bevaras orörda", () => {
  const current = { plan: "pro", plans: { maps: "pro", tv: "plus", hockey: "free" } };
  const out = entitlementsToClerkPlans({ football_pro: true, hockey_pro: true }, current);
  assert.deepEqual(out.plans, { maps: "pro", tv: "plus", hockey: "pro" });
  assert.equal(out.footballChanged, false);
  assert.equal(out.hockeyChanged, true);
});

test("no-op: stämmer metadatan redan skrivs inget", () => {
  const current = { plan: "elite", plans: { hockey: "pro", maps: "pro" } };
  const out = entitlementsToClerkPlans({ football_elite: true, hockey_pro: true }, current);
  assert.equal(out.changed, false);
  // Saknad metadata är free — och free → free är också en no-op.
  assert.equal(entitlementsToClerkPlans({}, undefined).changed, false);
  assert.equal(entitlementsToClerkPlans({}, { plan: "free", plans: { hockey: "free" } }).changed, false);
});

test("nedgradering upptäcks", () => {
  const out = entitlementsToClerkPlans({}, { plan: "pro", plans: { hockey: "pro" } });
  assert.deepEqual([out.footballChanged, out.hockeyChanged, out.changed], [true, true, true]);
  assert.equal(out.plan, "free");
});

test("äldre hockey-elite i metadatan skrivs om till pro (hockey säljer ingen Elite)", () => {
  const out = entitlementsToClerkPlans({ hockey_pro: true }, { plans: { hockey: "elite" } });
  assert.equal(out.hockeyChanged, true);
  assert.equal(out.plans.hockey, "pro");
});

test("entitlementMapFrom ger alla nycklar och ignorerar okända", () => {
  const map = entitlementMapFrom(["football_pro", "ufo"]);
  assert.equal(map.football_pro, true);
  assert.equal(map.hockey_pro, false);
  assert.equal(Object.keys(map).length, 7);
  assert.ok(!("ufo" in map));
});
