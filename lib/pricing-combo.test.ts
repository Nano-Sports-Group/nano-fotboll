import test from "node:test";
import assert from "node:assert/strict";
import { ANNUAL_DISCOUNT, COMBO_PRICING, SPORT_PRICING, nextScope, scopeAmountFor } from "./pricing";

const exactYear = (monthly: number) => monthly * 12 * (1 - ANNUAL_DISCOUNT);

test("founder-godkända priser 2026-09-30", () => {
  assert.equal(SPORT_PRICING.hockey.pro.monthly, 6900);
  assert.equal(COMBO_PRICING.pro.monthly, 12900);
  assert.equal(COMBO_PRICING.elite.monthly, 20900);
});

test("årspriser ligger på …9 under exakt 20 % — aldrig över", () => {
  for (const p of [SPORT_PRICING.hockey.pro, COMBO_PRICING.pro, COMBO_PRICING.elite]) {
    assert.ok(p.yearly <= exactYear(p.monthly), `${p.label}: ${p.yearly} > ${exactYear(p.monthly)}`);
    assert.equal((p.yearly / 100) % 10, 9, `${p.label} slutar inte på 9`);
  }
});

test("kombo är billigare än sporterna var för sig", () => {
  assert.ok(COMBO_PRICING.pro.monthly < SPORT_PRICING.football.pro.monthly + SPORT_PRICING.hockey.pro.monthly);
  // Elite Kombo = fotbollens Elite + hockeyns PRO
  assert.ok(COMBO_PRICING.elite.monthly < SPORT_PRICING.football.elite.monthly + SPORT_PRICING.hockey.pro.monthly);
});

test("priset följer omfångets sport, founder bara fotbollens PRO", () => {
  assert.equal(scopeAmountFor("football", "pro", "month", { founder: true }), 6900);
  assert.equal(scopeAmountFor("football", "pro", "month"), 8900);
  assert.equal(scopeAmountFor("hockey", "pro", "month", { founder: true }), 6900);
  assert.equal(scopeAmountFor("hockey", "pro", "year"), 65900);
  // Hockey har ingen Elite: en Elite-plan på bara hockey prissätts som PRO.
  assert.equal(scopeAmountFor("hockey", "elite", "month"), 6900);
  assert.equal(scopeAmountFor("both", "pro", "month", { founder: true }), 12900);
  assert.equal(scopeAmountFor("both", "elite", "year"), 199900);
});

test("lägga till och ta bort sport", () => {
  assert.equal(nextScope("football", "add", "hockey"), "both");
  assert.equal(nextScope("hockey", "add", "football"), "both");
  assert.equal(nextScope("both", "remove", "hockey"), "football");
  assert.equal(nextScope("both", "remove", "football"), "hockey");
  assert.equal(nextScope("football", "add", "football"), null);
  assert.equal(nextScope("football", "remove", "football"), null); // sista sporten = uppsägning
});
