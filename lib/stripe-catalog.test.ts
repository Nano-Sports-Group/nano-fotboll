import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOG, catalogRef } from "./stripe-catalog";
import { scopeAmountFor, type BillingInterval, type PaidPlan, type SubscriptionScope } from "./pricing";

const prices = CATALOG.flatMap((p) => p.prices.map((price) => ({ ...price, productId: p.id })));

test("lookup-nycklar och produkt-id:n är unika", () => {
  assert.equal(new Set(prices.map((p) => p.lookupKey)).size, prices.length);
  assert.equal(new Set(CATALOG.map((p) => p.id)).size, CATALOG.length);
});

test("varje pris kassan kan sälja finns i katalogen med exakt samma belopp", () => {
  const sellable: [SubscriptionScope, PaidPlan][] = [
    ["football", "pro"], ["football", "elite"], ["hockey", "pro"], ["both", "pro"], ["both", "elite"],
  ];
  for (const [scope, plan] of sellable) {
    for (const interval of ["month", "year"] as BillingInterval[]) {
      for (const founder of [false, true]) {
        const ref = catalogRef(scope, plan, interval, { founder });
        const hit = prices.find((p) => p.lookupKey === ref.lookupKey);
        assert.ok(hit, `${ref.lookupKey} saknas i katalogen`);
        assert.equal(hit.productId, ref.productId);
        assert.equal(hit.interval, interval);
        assert.equal(hit.amount, scopeAmountFor(scope, plan, interval, { founder }), ref.lookupKey);
      }
    }
  }
});

test("founder-priset finns bara på fotbollens PRO", () => {
  assert.deepEqual(
    prices.filter((p) => p.lookupKey.includes("founder")).map((p) => p.productId),
    ["nano_fotboll_pro", "nano_fotboll_pro"],
  );
  assert.equal(catalogRef("both", "pro", "month", { founder: true }).lookupKey, "nano_sport_pro_month");
  assert.equal(catalogRef("hockey", "pro", "year", { founder: true }).lookupKey, "nano_hockey_pro_year");
});

test("alla sporter kostar mindre än sporterna var för sig, och golf säljs inte", () => {
  const amount = (id: string, key: string) => prices.find((p) => p.productId === id && p.lookupKey === key)!.amount;
  const singles = amount("nano_fotboll_pro", "nano_fotboll_pro_month") + amount("nano_hockey_pro", "nano_hockey_pro_month");
  assert.ok(amount("nano_sport_pro", "nano_sport_pro_month") < singles);
  assert.equal(CATALOG.find((p) => p.id === "nano_golf_pro")!.metadata.sold, "false");
});
