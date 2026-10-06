import assert from "node:assert/strict";
import test from "node:test";
import { APP_STORE_PRODUCTS } from "../product-contract";
import {
  PRODUCT,
  ownsClerkProjection,
  productFromAppleProductId,
  productFromGoogleProductId,
  productFromStripeMetadata,
} from "./products";

test("varje vertical × plan som säljs får sin produkt", () => {
  const cases: [string, string, string][] = [
    ["football", "pro", PRODUCT.footballPro],
    ["football", "elite", PRODUCT.footballElite],
    ["hockey", "pro", PRODUCT.hockeyPro],
    ["both", "pro", PRODUCT.sportPro],
    ["both", "elite", PRODUCT.sportElite],
    ["golf", "pro", PRODUCT.golfPro],
    ["maps", "pro", PRODUCT.mapsPro],
    ["tv", "plus", PRODUCT.tvPlus],
    ["tv", "pro", PRODUCT.tvPlus],
  ];
  for (const [vertical, plan, expected] of cases) {
    assert.equal(productFromStripeMetadata({ vertical, plan }), expected, `${vertical}/${plan}`);
  }
});

test("katalogens produkt-id:n är exakt de vi mappar till", () => {
  assert.deepEqual(
    Object.values(PRODUCT).sort(),
    [
      "nano_fotboll_elite", "nano_fotboll_pro", "nano_golf_pro", "nano_hockey_pro",
      "nano_maps_pro", "nano_sport_elite", "nano_sport_pro", "nano_tv_plus",
    ],
  );
});

test("okänt blir null — vi hittar aldrig på en produkt", () => {
  assert.equal(productFromStripeMetadata({ vertical: "padel", plan: "pro" }), null);
  assert.equal(productFromStripeMetadata({ vertical: "football", plan: "platinum" }), null);
  assert.equal(productFromStripeMetadata({ vertical: "football" }), null);
  assert.equal(productFromStripeMetadata({ vertical: "hockey", plan: "elite" }), null); // hockey säljer ingen Elite
  assert.equal(productFromStripeMetadata(null), null);
});

test("saknad vertical betyder fotboll (som webhooken alltid antagit)", () => {
  assert.equal(productFromStripeMetadata({ plan: "pro" }), PRODUCT.footballPro);
});

test("Apple-produkterna mappar via kontraktet", () => {
  assert.deepEqual(productFromAppleProductId(APP_STORE_PRODUCTS.proMonthly.id), { product: PRODUCT.footballPro, interval: "month" });
  assert.deepEqual(productFromAppleProductId(APP_STORE_PRODUCTS.eliteYearly.id), { product: PRODUCT.footballElite, interval: "year" });
  assert.equal(productFromAppleProductId("se.athopia.app.okand"), null);
  assert.equal(productFromAppleProductId(undefined), null);
});

test("Google-produkter är tomma tills Play-produkterna finns", () => {
  assert.equal(productFromGoogleProductId("nano_pro_monthly"), null);
});

test("bara sportfacken skrivs till Clerk — maps och tv ägs av apparna", () => {
  assert.equal(ownsClerkProjection("football"), true);
  assert.equal(ownsClerkProjection("hockey"), true);
  assert.equal(ownsClerkProjection("both"), true);
  assert.equal(ownsClerkProjection(undefined), true);
  assert.equal(ownsClerkProjection("maps"), false);
  assert.equal(ownsClerkProjection("tv"), false);
});
