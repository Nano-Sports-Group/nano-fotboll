import { test } from "node:test";
import assert from "node:assert/strict";
import { favoriteFromMeta, onboardingDoneFromMeta, withFavorite } from "./favorite-meta";

test("hockeyval skriver aldrig över fotbollslaget", () => {
  const football = withFavorite({}, "football", "hammarby");
  const both = withFavorite(football, "hockey", "frolunda-hc");
  assert.equal(favoriteFromMeta(both, "football"), "hammarby");
  assert.equal(favoriteFromMeta(both, "hockey"), "frolunda-hc");
});

test("fotbollen läser samma fält som tidigare", () => {
  assert.equal(favoriteFromMeta({ favoriteTeam: "aik" }, "football"), "aik");
  assert.equal(favoriteFromMeta({ favoriteTeam: "aik" }, "hockey"), undefined);
});

test("introduktionen är per sport", () => {
  const meta = withFavorite({}, "football", "aik");
  assert.equal(onboardingDoneFromMeta(meta, "football"), true);
  assert.equal(onboardingDoneFromMeta(meta, "hockey"), false);
});

test("ta bort hockeyfavorit lämnar fotbollen orörd", () => {
  const meta = withFavorite(withFavorite({}, "football", "aik"), "hockey", "hv71");
  const cleared = withFavorite(meta, "hockey", null);
  assert.equal(favoriteFromMeta(cleared, "hockey"), undefined);
  assert.equal(favoriteFromMeta(cleared, "football"), "aik");
});
