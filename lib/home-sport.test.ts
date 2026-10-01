import { test } from "node:test";
import assert from "node:assert/strict";
import { apexDestination, sportOfHost } from "./home-sport";

test("sportsajterna känns igen, inget annat", () => {
  assert.equal(sportOfHost("hockey.nanosport.se"), "hockey");
  assert.equal(sportOfHost("FOTBOLL.nanosport.se"), "fotboll");
  assert.equal(sportOfHost("nanosport.se"), null);
  assert.equal(sportOfHost("admin.nanosport.se"), null);
  assert.equal(sportOfHost("hockey.nanosport.se.evil.com"), null);
});

test("inloggad på huvuddomänen skickas till sin sport, annars Välj sport", () => {
  assert.equal(apexDestination("hockey"), "https://hockey.nanosport.se/mitt-lag");
  assert.equal(apexDestination(undefined), null);
  assert.equal(apexDestination("https://evil.com"), null);
});
