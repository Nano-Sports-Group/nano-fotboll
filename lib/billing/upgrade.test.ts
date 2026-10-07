import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPreviewParams,
  buildUpdateParams,
  isCardDeclined,
  parseUpgradePreview,
  priceRefFor,
  upgradeEligibility,
  upgradeIdempotencyKey,
  upgradeTarget,
  type UpgradeSubjectInput,
} from "./upgrade";

const proActive: UpgradeSubjectInput = { status: "active", plan: "pro", scope: "football", cancelAtPeriodEnd: false, cancelAt: null };
const ELITE_ON = { eliteAvailable: true };

// ─── Behörighet ──────────────────────────────────────────────────────────────

test("behörighet: free (ingen prenumeration) är inte berättigad", () => {
  const r = upgradeEligibility(null, ELITE_ON);
  assert.equal(r.eligible, false);
  if (!r.eligible) assert.equal(r.code, "no_subscription");
});

test("behörighet: PRO aktiv och PRO i provperiod är berättigade, med rätt läge", () => {
  const active = upgradeEligibility(proActive, ELITE_ON);
  assert.deepEqual(active, { eligible: true, mode: "active", scope: "football" });
  const trial = upgradeEligibility({ ...proActive, status: "trialing" }, ELITE_ON);
  assert.deepEqual(trial, { eligible: true, mode: "trialing", scope: "football" });
});

test("behörighet: Nano Sport PRO (both) är berättigad", () => {
  const r = upgradeEligibility({ ...proActive, scope: "both" }, ELITE_ON);
  assert.deepEqual(r, { eligible: true, mode: "active", scope: "both" });
});

test("behörighet: schemalagd uppsägning (flagga eller cancel_at) stoppar", () => {
  for (const over of [{ cancelAtPeriodEnd: true }, { cancelAt: 1_800_000_000 }]) {
    const r = upgradeEligibility({ ...proActive, ...over }, ELITE_ON);
    assert.equal(r.eligible, false);
    if (!r.eligible) {
      assert.equal(r.code, "cancel_scheduled");
      assert.equal(r.httpStatus, 409);
    }
  }
});

test("behörighet: redan Elite → 409", () => {
  const r = upgradeEligibility({ ...proActive, plan: "elite" }, ELITE_ON);
  assert.equal(r.eligible, false);
  if (!r.eligible) {
    assert.equal(r.code, "already_elite");
    assert.equal(r.httpStatus, 409);
  }
});

test("behörighet: bara hockey → 400 med svenskt meddelande", () => {
  const r = upgradeEligibility({ ...proActive, scope: "hockey" }, ELITE_ON);
  assert.equal(r.eligible, false);
  if (!r.eligible) {
    assert.equal(r.code, "no_elite_for_scope");
    assert.equal(r.httpStatus, 400);
    assert.match(r.reason, /hockey/i);
  }
});

test("behörighet: deploy utan Elite (ELITE_AVAILABLE false) → 400", () => {
  const r = upgradeEligibility(proActive, { eliteAvailable: false });
  assert.equal(r.eligible, false);
  if (!r.eligible) assert.equal(r.httpStatus, 400);
});

test("behörighet: past_due och övriga status stoppar", () => {
  const pastDue = upgradeEligibility({ ...proActive, status: "past_due" }, ELITE_ON);
  assert.equal(pastDue.eligible, false);
  if (!pastDue.eligible) assert.equal(pastDue.code, "past_due");
  for (const status of ["canceled", "incomplete", "paused", "unpaid"]) {
    assert.equal(upgradeEligibility({ ...proActive, status }, ELITE_ON).eligible, false, status);
  }
});

test("behörighet: saknad eller okänd plan i metadatan gissas aldrig", () => {
  const r = upgradeEligibility({ ...proActive, plan: undefined }, ELITE_ON);
  assert.equal(r.eligible, false);
  if (!r.eligible) assert.equal(r.code, "unknown_plan");
});

// ─── Målpris ─────────────────────────────────────────────────────────────────

test("målpris: produkt och lookup-nyckel per omfång × intervall, aldrig Founder", () => {
  const cases = [
    ["football", "month", "nano_fotboll_elite", "nano_fotboll_elite_month", 16900],
    ["football", "year", "nano_fotboll_elite", "nano_fotboll_elite_year", 161900],
    ["both", "month", "nano_sport_elite", "nano_sport_elite_month", 20900],
    ["both", "year", "nano_sport_elite", "nano_sport_elite_year", 199900],
  ] as const;
  for (const [scope, interval, productId, lookupKey, amountOre] of cases) {
    const t = upgradeTarget(scope, interval);
    assert.equal(t.productId, productId);
    assert.equal(t.lookupKey, lookupKey);
    assert.equal(t.amountOre, amountOre);
    assert.ok(!t.lookupKey.includes("founder"));
  }
  assert.equal(upgradeTarget("football", "month").productName, "Nano Fotboll Elite");
  assert.equal(upgradeTarget("both", "month").productName, "Nano Sport Elite");
});

// ─── Stripe-parametrar ───────────────────────────────────────────────────────

const target = upgradeTarget("football", "month");
const catalogPrice = priceRefFor(target, "price_elite_month", target.productId);
const meta = { clerkUserId: "user_1", vertical: "football", plan: "pro", interval: "month", founder: "true" };

test("uppdatering, aktiv: ny period nu, fakturera direkt, nekat kort lämnar prenumerationen orörd", () => {
  const p = buildUpdateParams("active", "si_1", catalogPrice, meta);
  assert.equal(p.proration_behavior, "always_invoice");
  assert.equal(p.billing_cycle_anchor, "now");
  assert.equal(p.payment_behavior, "error_if_incomplete");
  assert.deepEqual(p.items, [{ id: "si_1", price: "price_elite_month" }]);
});

test("uppdatering, provperiod: bara prisbyte — ingen proration, ingen ankarflytt, inget trial_end", () => {
  const p = buildUpdateParams("trialing", "si_1", catalogPrice, meta);
  assert.equal(p.proration_behavior, "none");
  assert.equal(p.billing_cycle_anchor, undefined);
  assert.equal(p.payment_behavior, undefined);
  assert.equal(p.trial_end, undefined);
});

test("uppdatering: metadatan behåller founder, clerkUserId, vertical, interval — och plan blir elite", () => {
  for (const mode of ["active", "trialing"] as const) {
    const p = buildUpdateParams(mode, "si_1", catalogPrice, meta);
    assert.deepEqual(p.metadata, { ...meta, plan: "elite" });
  }
});

test("uppdatering: inline-pris när katalogen saknas (belopp och intervall ur koden)", () => {
  const ref = priceRefFor(target, null, "nano_fotboll_elite");
  assert.deepEqual(ref, {
    price_data: { currency: "sek", product: "nano_fotboll_elite", unit_amount: 16900, recurring: { interval: "month" } },
  });
  const p = buildUpdateParams("active", "si_1", ref, meta);
  assert.deepEqual(p.items, [{ id: "si_1", ...ref }]);
});

test("förhandsvisning använder samma ändring som uppdateringen", () => {
  for (const mode of ["active", "trialing"] as const) {
    const update = buildUpdateParams(mode, "si_1", catalogPrice, meta);
    const preview = buildPreviewParams("cus_1", "sub_1", mode, "si_1", catalogPrice);
    assert.equal(preview.customer, "cus_1");
    assert.equal(preview.subscription, "sub_1");
    assert.deepEqual(preview.subscription_details?.items, update.items);
    assert.equal(preview.subscription_details?.proration_behavior, update.proration_behavior);
    assert.equal(preview.subscription_details?.billing_cycle_anchor, update.billing_cycle_anchor);
  }
});

test("idempotensnyckel: samma för ett dubbelklick, ny efter fönstret och per period/prenumeration", () => {
  const t0 = 1_791_000_000_000;
  const a = upgradeIdempotencyKey("user_1", "sub_1", 1_790_000_000, t0);
  assert.equal(a, upgradeIdempotencyKey("user_1", "sub_1", 1_790_000_000, t0 + 1000));
  assert.notEqual(a, upgradeIdempotencyKey("user_1", "sub_1", 1_790_000_000, t0 + 5 * 60_000));
  assert.notEqual(a, upgradeIdempotencyKey("user_1", "sub_1", 1_790_100_000, t0));
  assert.notEqual(a, upgradeIdempotencyKey("user_1", "sub_2", 1_790_000_000, t0));
  assert.notEqual(a, upgradeIdempotencyKey("user_2", "sub_1", 1_790_000_000, t0));
});

test("kortnekan känns igen (402 / StripeCardError)", () => {
  assert.equal(isCardDeclined({ type: "StripeCardError" }), true);
  assert.equal(isCardDeclined({ statusCode: 402 }), true);
  assert.equal(isCardDeclined({ statusCode: 500 }), false);
  assert.equal(isCardDeclined(new Error("x")), false);
  assert.equal(isCardDeclined(null), false);
});

// ─── Förhandsfaktura ─────────────────────────────────────────────────────────

const T = 1_791_000_000; // 2026-10-03
const line = (amount: number, proration: boolean, end = T + 30 * 86400) => ({
  amount,
  period: { start: T, end },
  parent: {
    type: "subscription_item_details" as const,
    invoice_item_details: null,
    subscription_item_details: { invoice_item: null, proration, proration_details: null, subscription: "sub_1", subscription_item: "si_1" },
  },
});

/** PRO 89 kr månadsvis, 10 av 30 dagar förbrukade → 5933 öre kvar; Elite 169 kr; ny period direkt. */
const previewActive = {
  amount_due: 16900 - 5933,
  lines: { data: [line(-5933, true), line(16900, false, T + 30 * 86400)] },
};

test("förhandsfaktura, aktiv: kredit = summan av negativa prorationsrader, belopp = amount_due", () => {
  const r = parseUpgradePreview(previewActive, { mode: "active", target, trialEnd: null, nowMs: T * 1000 });
  assert.equal(r.creditOre, 5933);
  assert.equal(r.amountDueNowOre, 10967);
  assert.equal(r.newPriceOre, 16900);
  assert.equal(r.nextRenewalAt, new Date((T + 30 * 86400) * 1000).toISOString());
});

test("förhandsfaktura: flera negativa prorationsrader summeras; en negativ rad som inte är proration räknas inte", () => {
  const r = parseUpgradePreview(
    { amount_due: 9000, lines: { data: [line(-3000, true), line(-2000, true), line(-500, false), line(16900, false)] } },
    { mode: "active", target, trialEnd: null, nowMs: T * 1000 },
  );
  assert.equal(r.creditOre, 5000);
});

test("förhandsfaktura: kredit större än nytt pris ger 0 att dra (Stripe sätter amount_due)", () => {
  const r = parseUpgradePreview({ amount_due: 0, lines: { data: [line(-20000, true), line(16900, false)] } }, { mode: "active", target, trialEnd: null, nowMs: T * 1000 });
  assert.equal(r.amountDueNowOre, 0);
  assert.equal(r.creditOre, 20000);
});

test("förhandsfaktura: saknas periodslut i raderna räknas nästa förnyelse ett intervall fram", () => {
  const noPeriod = { amount: 16900, parent: line(0, false).parent } as ReturnType<typeof line>;
  const r = parseUpgradePreview({ amount_due: 16900, lines: { data: [noPeriod] } }, { mode: "active", target, trialEnd: null, nowMs: Date.UTC(2026, 9, 3) });
  assert.equal(r.nextRenewalAt, new Date(Date.UTC(2026, 10, 3)).toISOString());
});

test("förhandsfaktura, provperiod: inget dras nu, ingen kredit, förnyelse = provperiodens slut, pris ur koden", () => {
  const trialEnd = T + 3 * 86400;
  // Hur Stripe än radar upp den kommande fakturan under provperioden:
  const r = parseUpgradePreview({ amount_due: 16900, lines: { data: [line(16900, false, trialEnd + 30 * 86400)] } }, { mode: "trialing", target, trialEnd, nowMs: T * 1000 });
  assert.equal(r.amountDueNowOre, 0);
  assert.equal(r.creditOre, 0);
  assert.equal(r.newPriceOre, 16900);
  assert.equal(r.nextRenewalAt, new Date(trialEnd * 1000).toISOString());
});
