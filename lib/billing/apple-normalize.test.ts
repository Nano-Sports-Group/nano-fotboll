import assert from "node:assert/strict";
import test from "node:test";
import type { JWSTransactionDecodedPayload } from "@apple/app-store-server-library";
import { APP_STORE_PRODUCTS } from "../product-contract";
import { normalizeAppleTransaction, storefrontToCountry } from "./apple-normalize";

const NOW = new Date("2026-10-07T10:00:00Z");
const DAY = 86_400_000;

function tx(over: Partial<JWSTransactionDecodedPayload> = {}): JWSTransactionDecodedPayload {
  return {
    transactionId: "2000000000000002",
    originalTransactionId: "2000000000000001",
    productId: APP_STORE_PRODUCTS.proMonthly.id,
    purchaseDate: NOW.getTime() - DAY,
    expiresDate: NOW.getTime() + 29 * DAY,
    signedDate: NOW.getTime(),
    environment: "Production",
    storefront: "SWE",
    currency: "SEK",
    price: 89000, // milliunits = 89,00 kr
    appAccountToken: "11111111-1111-4111-8111-111111111111",
    ...over,
  };
}

function ok(t: JWSTransactionDecodedPayload) {
  const r = normalizeAppleTransaction(t, "user_1", NOW);
  assert.ok(r.ok, r.ok ? "" : r.reason);
  return r.value.events;
}

test("nytt köp: prenumeration + försäljning i minsta enhet, plattformsmoms", () => {
  const [event, ...rest] = ok(tx());
  assert.equal(rest.length, 0);
  assert.equal(event.environment, "live");
  assert.equal(event.subscription?.provider, "apple");
  assert.equal(event.subscription?.provider_subscription_id, "2000000000000001");
  assert.equal(event.subscription?.provider_transaction_id, "2000000000000002");
  assert.equal(event.subscription?.product_id, "nano_fotboll_pro");
  assert.equal(event.subscription?.status, "active");
  assert.equal(event.subscription?.price_interval, "month");
  const t = event.transaction!;
  assert.equal(t.type, "sale");
  assert.equal(t.gross_amount, 8900);
  assert.equal(t.currency, "SEK");
  assert.equal(t.tax_type, "platform_collected");
  assert.match(t.tax_exemption_reason!, /TAX_ADVISER_VERIFICATION_REQUIRED/);
  assert.equal(t.customer_country, "SE");
  assert.equal(t.customer_country_source, "apple_storefront");
  assert.deepEqual(t.country_evidence, [{ source: "apple_storefront", value: "SE" }]);
});

test("förnyelse: ny transactionId, samma originalTransactionId", () => {
  const first = ok(tx())[0];
  const renewal = ok(tx({ transactionId: "2000000000000099", purchaseDate: NOW.getTime() }))[0];
  assert.equal(renewal.subscription?.provider_subscription_id, first.subscription?.provider_subscription_id);
  assert.notEqual(renewal.transaction?.provider_transaction_id, first.transaction?.provider_transaction_id);
  assert.equal(renewal.transaction?.provider_transaction_id, "2000000000000099");
});

test("återkallad transaktion ger status revoked och en refund som pekar på försäljningen", () => {
  const events = ok(tx({ revocationDate: NOW.getTime() - 1000, revocationReason: 0 }));
  assert.equal(events.length, 2);
  assert.equal(events[0].subscription?.status, "revoked");
  const refund = events[1].transaction!;
  assert.equal(refund.type, "refund");
  assert.equal(refund.provider_transaction_id, "refund:2000000000000002");
  assert.equal(refund.original_provider_transaction_id, "2000000000000002");
  assert.equal(refund.gross_amount, -8900);
  assert.equal(events[1].subscription, undefined);
});

test("utgången prenumeration blir expired", () => {
  const [event] = ok(tx({ expiresDate: NOW.getTime() - DAY }));
  assert.equal(event.subscription?.status, "expired");
});

test("uppgraderad transaktion är förbrukad (expired) och daterad så att den inte skriver över den nya", () => {
  const [event] = ok(tx({ isUpgraded: true }));
  assert.equal(event.subscription?.status, "expired");
  assert.equal(event.subscription?.event_time, new Date(NOW.getTime() - DAY).toISOString());
});

test("Sandbox blir test-miljö", () => {
  assert.equal(ok(tx({ environment: "Sandbox" }))[0].environment, "test");
  assert.equal(ok(tx({ environment: "Xcode" }))[0].environment, "test");
});

test("price är milliunits: 169000 → 16900 öre; saknas pris eller valuta skrivs ingen transaktion", () => {
  assert.equal(ok(tx({ productId: APP_STORE_PRODUCTS.eliteMonthly.id, price: 169000 }))[0].transaction?.gross_amount, 16900);
  assert.equal(ok(tx({ price: undefined }))[0].transaction, undefined);
  assert.equal(ok(tx({ currency: undefined }))[0].transaction, undefined);
  // Gratis provperiod: 0 kr är ingen försäljning.
  assert.equal(ok(tx({ price: 0 }))[0].transaction, undefined);
});

test("okänd storefront ger land null men råvärdet bevaras", () => {
  const t = ok(tx({ storefront: "BRA" }))[0].transaction!;
  assert.equal(t.customer_country, null);
  assert.equal(t.customer_country_source, null);
  assert.deepEqual(t.country_evidence, [{ source: "apple_storefront", value: "BRA" }]);
});

test("storefront-tabellen täcker EU-27 + NO, GB, CH, US, AE", () => {
  const eu = ["AUT","BEL","BGR","HRV","CYP","CZE","DNK","EST","FIN","FRA","DEU","GRC","HUN","IRL","ITA","LVA","LTU","LUX","MLT","NLD","POL","PRT","ROU","SVK","SVN","ESP","SWE"];
  for (const code of eu) assert.ok(storefrontToCountry(code), code);
  assert.equal(eu.length, 27);
  for (const [a3, a2] of [["NOR","NO"],["GBR","GB"],["CHE","CH"],["USA","US"],["ARE","AE"],["DEU","DE"]]) {
    assert.equal(storefrontToCountry(a3), a2);
  }
  assert.equal(storefrontToCountry(undefined), null);
});

test("okänd produkt eller saknade id:n ger skäl, inte en gissning", () => {
  assert.equal(normalizeAppleTransaction(tx({ productId: "se.athopia.app.annat" }), "u", NOW).ok, false);
  assert.equal(normalizeAppleTransaction(tx({ transactionId: undefined }), "u", NOW).ok, false);
});
