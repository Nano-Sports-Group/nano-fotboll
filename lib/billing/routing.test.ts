import assert from "node:assert/strict";
import test from "node:test";
import { compareVersions, resolvePurchaseOptions, type RoutingRule } from "./routing";

const rule = (over: Partial<RoutingRule>): RoutingRule => ({
  priority: 100,
  platform: null,
  country: null,
  storefront: null,
  min_app_version: null,
  product_type: null,
  program: null,
  flow: "stripe_web",
  enabled: true,
  ...over,
});

/** Samma form som fröna i migrationen: web → stripe_web, ios → apple_iap, android → google_play (avstängd). */
const SEEDS: RoutingRule[] = [
  rule({ platform: "web", flow: "stripe_web" }),
  rule({ platform: "ios", flow: "apple_iap" }),
  rule({ platform: "android", flow: "google_play", enabled: false }),
];

test("seeds: web och ios får sitt flöde, android är avstängt", () => {
  assert.deepEqual(resolvePurchaseOptions(SEEDS, { platform: "web" }), [{ flow: "stripe_web" }]);
  assert.deepEqual(resolvePurchaseOptions(SEEDS, { platform: "ios", country: "SE" }), [{ flow: "apple_iap" }]);
  assert.deepEqual(resolvePurchaseOptions(SEEDS, { platform: "android" }), [{ flow: "not_available" }]);
});

test("ingen träff → not_available", () => {
  assert.deepEqual(resolvePurchaseOptions([], { platform: "web" }), [{ flow: "not_available" }]);
  assert.deepEqual(resolvePurchaseOptions(SEEDS, { platform: "tv" }), [{ flow: "not_available" }]);
});

test("landsspecifik regel slår jokern via prioritet; båda flödena erbjuds i ordning", () => {
  const rules = [
    rule({ platform: "ios", flow: "apple_iap", priority: 100 }),
    rule({ platform: "ios", country: "NL", flow: "external_web_checkout", program: "nl_link_out", priority: 10 }),
  ];
  assert.deepEqual(resolvePurchaseOptions(rules, { platform: "ios", country: "nl" }), [
    { flow: "external_web_checkout", program: "nl_link_out" },
    { flow: "apple_iap" },
  ]);
  assert.deepEqual(resolvePurchaseOptions(rules, { platform: "ios", country: "SE" }), [{ flow: "apple_iap" }]);
});

test("vid lika prioritet vinner den mest specifika regeln", () => {
  const rules = [
    rule({ platform: "ios", flow: "apple_iap" }),
    rule({ platform: "ios", country: "US", flow: "external_web_checkout", program: "us" }),
  ];
  assert.equal(resolvePurchaseOptions(rules, { platform: "ios", country: "US" })[0].flow, "external_web_checkout");
});

test("'*' är samma som null; avstängda regler hoppas över; flöden dubbleras aldrig", () => {
  const rules = [
    rule({ platform: "*", country: "*", flow: "stripe_web", priority: 1, enabled: false }),
    rule({ platform: "web", country: "*", flow: "stripe_web", priority: 2 }),
    rule({ platform: "web", flow: "stripe_web", priority: 3 }),
  ];
  assert.deepEqual(resolvePurchaseOptions(rules, { platform: "web", country: "SE" }), [{ flow: "stripe_web" }]);
});

test("min_app_version jämförs numeriskt per segment", () => {
  const rules = [rule({ platform: "ios", min_app_version: "1.10.0", flow: "apple_iap" })];
  assert.equal(resolvePurchaseOptions(rules, { platform: "ios", appVersion: "1.9.2" })[0].flow, "not_available");
  assert.equal(resolvePurchaseOptions(rules, { platform: "ios", appVersion: "1.10.0" })[0].flow, "apple_iap");
  assert.equal(resolvePurchaseOptions(rules, { platform: "ios", appVersion: "2.0" })[0].flow, "apple_iap");
  // Klienten säger inte vilken version den kör: regeln med minsta version gäller inte.
  assert.equal(resolvePurchaseOptions(rules, { platform: "ios" })[0].flow, "not_available");
  assert.equal(compareVersions("1.10", "1.9.9"), 1);
  assert.equal(compareVersions("1.0.0", "1"), 0);
});

test("storefront och product_type filtrerar", () => {
  const rules = [rule({ platform: "ios", storefront: "SWE", product_type: "subscription", flow: "apple_iap" })];
  assert.equal(resolvePurchaseOptions(rules, { platform: "ios", storefront: "swe", productType: "subscription" })[0].flow, "apple_iap");
  assert.equal(resolvePurchaseOptions(rules, { platform: "ios", storefront: "NOR", productType: "subscription" })[0].flow, "not_available");
  assert.equal(resolvePurchaseOptions(rules, { platform: "ios", storefront: "SWE" })[0].flow, "not_available");
});
