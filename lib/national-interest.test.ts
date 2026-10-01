import { test } from "node:test";
import assert from "node:assert/strict";
import { keepForNationalInterest, parseNationalInterest } from "./national-interest";

const NAT = new Set(["sverige"]);
const nationalBig = { entity_ids: ["sverige"], importance_score: 0.85 };
const nationalSmall = { entity_ids: ["sverige"], importance_score: 0.4 };
const clubAngle = { entity_ids: ["sverige", "malmo"], importance_score: 0.4 };
const club = { entity_ids: ["malmo"], importance_score: 0.4 };

test("inte intresserad: inga rena landslagsnyheter, men klubbvinkeln syns", () => {
  assert.equal(keepForNationalInterest(nationalBig, "none", NAT), false);
  assert.equal(keepForNationalInterest(clubAngle, "none", NAT), true);
  assert.equal(keepForNationalInterest(club, "none", NAT), true);
});

test("lagom: bara det viktigaste om landslaget", () => {
  assert.equal(keepForNationalInterest(nationalBig, "some", NAT), true);
  assert.equal(keepForNationalInterest(nationalSmall, "some", NAT), false);
  assert.equal(keepForNationalInterest(clubAngle, "some", NAT), true);
});

test("mitt andra lag: allt", () => {
  assert.equal(keepForNationalInterest(nationalSmall, "second_team", NAT), true);
});

test("okänt värde blir lagom", () => {
  assert.equal(parseNationalInterest("hack"), "some");
  assert.equal(parseNationalInterest("none"), "none");
});
