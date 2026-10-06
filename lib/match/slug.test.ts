import { test } from "node:test";
import assert from "node:assert/strict";
import { fixtureHref, matchHref, matchSlug, parseMatchParam, smFixtureHref } from "./slug";

test("lagnamn + svensk matchdag", () => {
  assert.equal(matchSlug("Färjestads BK", "HV71", "2026-10-03T16:00:00+00:00"), "farjestads-bk-hv71-2026-10-03");
  assert.equal(matchSlug("IFK Göteborg", "Malmö FF", "2026-04-04 13:00:00"), "ifk-goteborg-malmo-ff-2026-04-04");
});

test("matchdagen är Stockholms, inte UTC:s", () => {
  // 22:30 UTC den 3:e är 00:30 den 4:e i Stockholm (sommartid).
  assert.equal(matchSlug("A", "B", "2026-10-03T22:30:00Z"), "a-b-2026-10-04");
});

test("utan namn eller tid blir länken numerisk", () => {
  assert.equal(matchHref({ id: 42 }), "/match/42");
  assert.equal(matchHref({ id: 42, home: "A", away: "B", kickoff: "skräp" }), "/match/42");
  assert.equal(fixtureHref({ sportmonks_id: 9000071696434, home_team_name: "Färjestads BK", away_team_name: "HV71", kickoff_at: "2026-10-03T16:00:00+00:00" }), "/match/farjestads-bk-hv71-2026-10-03");
});

test("Sportmonks-formen", () => {
  const f = { id: 7, starting_at: "2026-10-09 17:00:00", participants: [{ name: "AIK", meta: { location: "away" as const } }, { name: "Hammarby", meta: { location: "home" as const } }] };
  assert.equal(smFixtureHref(f), "/match/hammarby-aik-2026-10-09");
});

test("parametern tolkas som id, slug eller ingenting", () => {
  assert.deepEqual(parseMatchParam("19635869"), { id: 19635869 });
  assert.deepEqual(parseMatchParam("farjestads-bk-hv71-2026-10-03"), { slug: "farjestads-bk-hv71-2026-10-03", day: "2026-10-03" });
  assert.equal(parseMatchParam("abc"), null);
  assert.equal(parseMatchParam("12abc"), null);
});
