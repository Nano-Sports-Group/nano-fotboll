import assert from "node:assert/strict";
import test from "node:test";
import { newsletterToken, verifyNewsletterToken } from "./token";

const SECRET = "test-secret";
const ID = "11111111-2222-3333-4444-555555555555";

test("gemensam testvektor med nano-os/packages/notifications/src/resend/resend.test.ts", () => {
  // Motorn skapar länkarna, webben verifierar dem. Ändras en av filerna utan den andra dör varje avslutningslänk.
  assert.equal(newsletterToken(SECRET, "unsubscribe", ID), `${ID}.mNBTEVQOrxYQYu-Q0-oo3DKVFxS2ytqRXBG5yLAXgAc`);
  assert.equal(newsletterToken(SECRET, "confirm", ID), `${ID}.Gi1Jy7PJMRL9zgreqwIa4QWk3qv_alk_G-B8uWFoEjM`);
});

test("ett token gäller bara sitt syfte, sin prenumerant och sin hemlighet", () => {
  const token = newsletterToken(SECRET, "unsubscribe", ID);
  assert.equal(verifyNewsletterToken(SECRET, "unsubscribe", token), ID);
  assert.equal(verifyNewsletterToken(SECRET, "confirm", token), null);
  assert.equal(verifyNewsletterToken("annan", "unsubscribe", token), null);
  assert.equal(verifyNewsletterToken(SECRET, "unsubscribe", token.replace("1111", "9999")), null);
  assert.equal(verifyNewsletterToken(SECRET, "unsubscribe", "skräp"), null);
  assert.equal(verifyNewsletterToken("", "unsubscribe", token), null);
});
