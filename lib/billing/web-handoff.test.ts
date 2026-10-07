import assert from "node:assert/strict";
import test from "node:test";
import { resolvePurchaseOptions, type RoutingRule } from "./routing";
import {
  HANDOFF_TARGETS,
  handoffAllowed,
  handoffRedirectPath,
  handoffUrl,
  isHandoffPlatform,
  parseHandoffFragment,
} from "./web-handoff";

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

/** Fröna i migrationen: ingen regel för external_web_checkout. */
const SEEDS: RoutingRule[] = [
  rule({ platform: "web", flow: "stripe_web" }),
  rule({ platform: "ios", flow: "apple_iap" }),
  rule({ platform: "android", flow: "google_play", enabled: false }),
];

const ctx = (platform: string, extra: Record<string, string> = {}) => ({ platform, ...extra });

test("grind: standardreglerna tillåter ingen överlämning, varken android eller ios", () => {
  assert.equal(handoffAllowed(resolvePurchaseOptions(SEEDS, ctx("android"))), false);
  assert.equal(handoffAllowed(resolvePurchaseOptions(SEEDS, ctx("ios", { country: "SE" }))), false);
});

test("grind: not_available och tom lista är nej", () => {
  assert.equal(handoffAllowed([{ flow: "not_available" }]), false);
  assert.equal(handoffAllowed([]), false);
});

test("grind: tillåten bara när external_web_checkout finns för just den kontexten", () => {
  const rules = [
    ...SEEDS,
    rule({ platform: "android", country: "NL", flow: "external_web_checkout", program: "ntt_external_offer" }),
    rule({ platform: "ios", country: "SE", min_app_version: "1.4.0", flow: "external_web_checkout", program: "storekit_external_link" }),
  ];
  assert.equal(handoffAllowed(resolvePurchaseOptions(rules, ctx("android", { country: "NL" }))), true);
  assert.equal(handoffAllowed(resolvePurchaseOptions(rules, ctx("android", { country: "SE" }))), false);
  assert.equal(handoffAllowed(resolvePurchaseOptions(rules, ctx("android"))), false); // inget land uppgivet
  assert.equal(handoffAllowed(resolvePurchaseOptions(rules, ctx("ios", { country: "SE", appVersion: "1.4.0" }))), true);
  assert.equal(handoffAllowed(resolvePurchaseOptions(rules, ctx("ios", { country: "SE", appVersion: "1.3.9" }))), false);
  assert.equal(handoffAllowed(resolvePurchaseOptions(rules, ctx("ios", { country: "SE" }))), false); // version saknas
});

test("grind: en avstängd extern regel räknas inte", () => {
  const rules = [rule({ platform: "android", flow: "external_web_checkout", program: "x", enabled: false })];
  assert.equal(handoffAllowed(resolvePurchaseOptions(rules, ctx("android"))), false);
});

test("mål: sökvägen byggs ur den fasta listan", () => {
  assert.equal(HANDOFF_TARGETS.upgrade, "/konto/uppgradera");
  assert.equal(handoffRedirectPath("upgrade", "android"), "/konto/uppgradera?from=android");
  assert.equal(handoffRedirectPath("upgrade", "ios"), "/konto/uppgradera?from=ios");
});

test("mål: adressen innehåller biljetten i fragmentet, aldrig i frågesträngen", () => {
  const url = handoffUrl("https://nanofotboll.se/", "tok_abc12345", "android", "upgrade");
  const [base, fragment] = url.split("#");
  assert.equal(base, "https://nanofotboll.se/handoff");
  assert.ok(!base.includes("tok_"));
  assert.deepEqual(parseHandoffFragment(`#${fragment}`), { ticket: "tok_abc12345", platform: "android", target: "upgrade" });
});

test("fragment: ogiltigt eller manipulerat innehåll ger aldrig en extern redirect", () => {
  const evil = parseHandoffFragment("#t=tok_abc12345&from=https://evil.example&to=https://evil.example/x");
  assert.equal(evil.platform, "android");
  assert.equal(evil.target, "upgrade");
  assert.equal(handoffRedirectPath(evil.target, evil.platform), "/konto/uppgradera?from=android");
  // prototypnycklar är inte mål
  assert.equal(parseHandoffFragment("#t=tok_abc12345&to=__proto__").target, "upgrade");
  assert.equal(parseHandoffFragment("#t=tok_abc12345&to=toString").target, "upgrade");
});

test("fragment: biljett saknas eller har fel tecken → null", () => {
  assert.equal(parseHandoffFragment("").ticket, null);
  assert.equal(parseHandoffFragment("#t=").ticket, null);
  assert.equal(parseHandoffFragment("#t=<script>alert(1)</script>").ticket, null);
  assert.equal(parseHandoffFragment("#t=kort").ticket, null);
});

test("plattformar: bara android och ios", () => {
  assert.equal(isHandoffPlatform("android"), true);
  assert.equal(isHandoffPlatform("ios"), true);
  assert.equal(isHandoffPlatform("web"), false);
  assert.equal(isHandoffPlatform(undefined), false);
});
