import assert from "node:assert/strict";
import test from "node:test";
import { googleRefundEvent, normalizeGooglePurchase, type GoogleOrder, type GoogleSubscriptionPurchase } from "./google-normalize";

const NOW = new Date("2026-10-07T10:00:00Z");
const FUTURE = "2026-11-07T10:00:00Z";

import { productFromGoogleProductId } from "./products";

/** Play-produkterna finns inte än (tabellen i products.ts är tom) — testerna injicerar en. */
const known: typeof productFromGoogleProductId = (id) =>
  id === "nano_pro" ? { product: "nano_fotboll_pro", interval: "month" } : null;

function purchase(over: Partial<GoogleSubscriptionPurchase> = {}): GoogleSubscriptionPurchase {
  return {
    regionCode: "SE",
    latestOrderId: "GPA.3300-0000-0000-00001",
    startTime: "2026-10-07T09:00:00Z",
    subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
    lineItems: [{ productId: "nano_pro", expiryTime: FUTURE, autoRenewingPlan: { recurringPrice: { currencyCode: "SEK", units: "89" } } }],
    externalAccountIdentifiers: { obfuscatedExternalAccountId: "11111111-1111-4111-8111-111111111111" },
    ...over,
  };
}

const order: GoogleOrder = {
  orderId: "GPA.3300-0000-0000-00001",
  state: "PROCESSED",
  createTime: "2026-10-07T09:00:05Z",
  total: { currencyCode: "SEK", units: "89" },
  buyerAddress: { regionCode: "SE" },
};

test("okänd Google-produkt (tabellen är tom) ger skäl, inte en gissad produkt", () => {
  const r = normalizeGooglePurchase(purchase(), order, "user_1", "tok", NOW);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /okänd Google Play-produkt/);
  assert.equal(productFromGoogleProductId("nano_pro"), null);
});

function norm(p: GoogleSubscriptionPurchase, o: GoogleOrder | null = order) {
  const r = normalizeGooglePurchase(p, o, "user_1", "token-abc", NOW, known);
  assert.ok(r.ok, r.ok ? "" : r.reason);
  return r.value;
}

test("ACTIVE: prenumeration + försäljning med plattformsmoms och land ur regionCode", () => {
  const { event, missingOrderAmount } = norm(purchase());
  assert.equal(missingOrderAmount, false);
  assert.equal(event.environment, "live");
  assert.equal(event.subscription?.provider, "google");
  assert.equal(event.subscription?.provider_subscription_id, "token-abc");
  assert.equal(event.subscription?.provider_transaction_id, "GPA.3300-0000-0000-00001");
  assert.equal(event.subscription?.status, "active");
  assert.equal(event.subscription?.product_id, "nano_fotboll_pro");
  assert.equal(event.subscription?.price_amount, 8900);
  const t = event.transaction!;
  assert.equal(t.gross_amount, 8900);
  assert.equal(t.currency, "SEK");
  assert.equal(t.tax_type, "platform_collected");
  assert.match(t.tax_exemption_reason!, /^google_play_marketplace — TAX_ADVISER_VERIFICATION_REQUIRED$/);
  assert.equal(t.customer_country, "SE");
  assert.equal(t.customer_country_source, "google_play_country");
});

test("IN_GRACE_PERIOD → grace med grace_until = periodslut", () => {
  const s = norm(purchase({ subscriptionState: "SUBSCRIPTION_STATE_IN_GRACE_PERIOD" })).event.subscription!;
  assert.equal(s.status, "grace");
  assert.equal(s.grace_until, new Date(FUTURE).toISOString());
});

test("ON_HOLD → past_due utan åtkomst (grace_until = nu)", () => {
  const s = norm(purchase({ subscriptionState: "SUBSCRIPTION_STATE_ON_HOLD" })).event.subscription!;
  assert.equal(s.status, "past_due");
  assert.equal(s.grace_until, NOW.toISOString());
});

test("PAUSED → paused", () => {
  assert.equal(norm(purchase({ subscriptionState: "SUBSCRIPTION_STATE_PAUSED" })).event.subscription?.status, "paused");
});

test("CANCELED → aktiv till periodslut med cancel_at_period_end; passerat periodslut → expired", () => {
  const s = norm(purchase({ subscriptionState: "SUBSCRIPTION_STATE_CANCELED" })).event.subscription!;
  assert.equal(s.status, "active");
  assert.equal(s.cancel_at_period_end, true);
  const past = norm(
    purchase({ subscriptionState: "SUBSCRIPTION_STATE_CANCELED", lineItems: [{ productId: "nano_pro", expiryTime: "2026-10-01T00:00:00Z" }] }),
  ).event.subscription!;
  assert.equal(past.status, "expired");
  assert.equal(past.cancel_at_period_end, false);
});

test("EXPIRED → expired", () => {
  assert.equal(norm(purchase({ subscriptionState: "SUBSCRIPTION_STATE_EXPIRED" })).event.subscription?.status, "expired");
});

test("PENDING → ingen rättighet och ingen rad", () => {
  const r = normalizeGooglePurchase(purchase({ subscriptionState: "SUBSCRIPTION_STATE_PENDING" }), order, "u", "t", NOW, known);
  assert.equal(r.ok, false);
});

test("okänt läge ger skäl", () => {
  const r = normalizeGooglePurchase(purchase({ subscriptionState: "SUBSCRIPTION_STATE_NYTT" }), order, "u", "t", NOW, known);
  assert.equal(r.ok, false);
});

test("testPurchase → test-miljö", () => {
  assert.equal(norm(purchase({ testPurchase: {} })).event.environment, "test");
});

test("saknas ordern skrivs bara prenumerationen (ingen transaktion)", () => {
  const { event, missingOrderAmount } = norm(purchase(), null);
  assert.equal(missingOrderAmount, true);
  assert.equal(event.transaction, undefined);
  assert.ok(event.subscription);
});

test("order utan belopp ger ingen transaktion; avvikande köparland sparas som bevis", () => {
  assert.equal(norm(purchase(), { orderId: "x" }).event.transaction, undefined);
  const { event } = norm(purchase(), { ...order, buyerAddress: { regionCode: "DE" } });
  assert.deepEqual(event.transaction?.country_evidence.map((e) => e.value), ["SE", "DE"]);
});

test("helt återbetald order ger en refund som speglar försäljningen", () => {
  const { event } = norm(purchase());
  const refund = googleRefundEvent(event, { ...order, state: "REFUNDED", lastEventTime: "2026-10-08T00:00:00Z" }, NOW)!;
  assert.equal(refund.transaction?.type, "refund");
  assert.equal(refund.transaction?.gross_amount, -8900);
  assert.equal(refund.transaction?.original_provider_transaction_id, "GPA.3300-0000-0000-00001");
  assert.equal(googleRefundEvent(event, order, NOW), null);
});
