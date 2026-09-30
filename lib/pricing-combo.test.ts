import test from "node:test";
import assert from "node:assert/strict";
import { COMBO_PRICING, PRICING, nextScope, scopeAmountFor } from "./pricing";

test("kombo är billigare än två separata planer", () => {
  for (const plan of ["pro", "elite"] as const) {
    assert.ok(COMBO_PRICING[plan].monthly < PRICING[plan].monthly * 2);
    assert.ok(COMBO_PRICING[plan].yearly < COMBO_PRICING[plan].monthly * 12);
  }
});

test("founder gäller bara fotbollens PRO", () => {
  assert.equal(scopeAmountFor("football", "pro", "month", { founder: true }), 6900);
  assert.equal(scopeAmountFor("hockey", "pro", "month", { founder: true }), 8900);
  assert.equal(scopeAmountFor("both", "pro", "month", { founder: true }), COMBO_PRICING.pro.monthly);
});

test("lägga till och ta bort sport", () => {
  assert.equal(nextScope("football", "add", "hockey"), "both");
  assert.equal(nextScope("hockey", "add", "football"), "both");
  assert.equal(nextScope("both", "remove", "hockey"), "football");
  assert.equal(nextScope("both", "remove", "football"), "hockey");
  assert.equal(nextScope("football", "add", "football"), null);
  assert.equal(nextScope("football", "remove", "football"), null); // sista sporten = uppsägning, inte ändring
});
