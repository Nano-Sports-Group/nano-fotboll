import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveFavoriteFromMeta, favoriteFromMeta, onboardingDoneFromMeta, withFavorite } from "./favorite-meta";

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

test("samma förening i den andra sporten är förval, eget val vinner", () => {
  assert.equal(effectiveFavoriteFromMeta({ favoriteTeam: "aik" }, "hockey"), "aik-if");
  assert.equal(effectiveFavoriteFromMeta({ favoriteTeams: { hockey: "djurgardens-if" } }, "football"), "djurgarden");
  // Klubb utan motsvarighet ger inget förval — Hammarby spelar inte i SHL/HockeyAllsvenskan.
  assert.equal(effectiveFavoriteFromMeta({ favoriteTeam: "hammarby" }, "hockey"), undefined);
  assert.equal(effectiveFavoriteFromMeta({ favoriteTeam: "aik", favoriteTeams: { hockey: "hv71" } }, "hockey"), "hv71");
  assert.equal(effectiveFavoriteFromMeta({ favoriteTeam: "aik" }, "golf"), undefined);
});
