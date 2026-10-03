import assert from "node:assert/strict";
import test from "node:test";
import { GOLF_PLAYERS, GOLF_TOURS, getTour, playersOnTour, starPlayers, swedishPlayers } from "./catalog";
import { EMPTY_FOLLOWS, followCount, followsFromMeta, isFollowing, mergeFollows, parseFollows, toggleFollow, withFollows } from "./follows";

test("katalogen: unika slugar, varje spelare har en tour som finns", () => {
  assert.equal(new Set(GOLF_PLAYERS.map((p) => p.slug)).size, GOLF_PLAYERS.length);
  assert.equal(new Set(GOLF_TOURS.map((t) => t.slug)).size, GOLF_TOURS.length);
  for (const p of GOLF_PLAYERS) {
    assert.ok(getTour(p.tour), `${p.name} pekar på en tour som inte finns`);
    assert.match(p.slug, /^[a-z-]+$/, p.slug);
  }
});

test("svenskarna är fokus och kommer först", () => {
  assert.ok(swedishPlayers().length >= 5);
  assert.ok(swedishPlayers().every((p) => p.country === "Sverige"));
  assert.ok(starPlayers().every((p) => p.country !== "Sverige"));
  assert.equal(GOLF_PLAYERS[0]!.group, "swedish");
});

test("katalogen bär inga siffror som åldras", () => {
  // Ranking, form och poäng ska komma ur data. En merit får bära årtal och ett fast antal majors.
  for (const p of GOLF_PLAYERS) assert.doesNotMatch(p.merit, /rank|världs(etta|tvåa)|form|poäng/i, p.name);
});

test("spelare per tour", () => {
  assert.ok(playersOnTour("lpga-tour").some((p) => p.slug === "maja-stark"));
  assert.deepEqual(playersOnTour("finns-inte"), []);
});

test("följ och sluta följa", () => {
  let f = toggleFollow(EMPTY_FOLLOWS, "players", "ludvig-aberg");
  f = toggleFollow(f, "tours", "majors");
  assert.equal(isFollowing(f, "players", "ludvig-aberg"), true);
  assert.equal(followCount(f), 2);
  f = toggleFollow(f, "players", "ludvig-aberg");
  assert.equal(isFollowing(f, "players", "ludvig-aberg"), false);
  assert.deepEqual(EMPTY_FOLLOWS, { players: [], tours: [] }); // ingen mutation
});

test("okänd slug följs inte", () => {
  assert.deepEqual(toggleFollow(EMPTY_FOLLOWS, "players", "lionel-messi"), EMPTY_FOLLOWS);
});

test("sparat värde saneras: skräp, dubbletter och borttagna spelare faller bort", () => {
  assert.deepEqual(parseFollows(null), EMPTY_FOLLOWS);
  assert.deepEqual(parseFollows("x"), EMPTY_FOLLOWS);
  assert.deepEqual(parseFollows({ players: ["maja-stark", "maja-stark", "borttagen", 7], tours: "majors" }), {
    players: ["maja-stark"],
    tours: [],
  });
});

test("metadata: golfens följningar rör inte andra sporters fält", () => {
  const meta = { favoriteTeam: "aik", favoriteTeams: { hockey: "frolunda-hc" } };
  const next = withFollows(meta, { players: ["linn-grant"], tours: [] });
  assert.equal(next.favoriteTeam, "aik");
  assert.deepEqual(next.favoriteTeams, { hockey: "frolunda-hc" });
  assert.deepEqual(followsFromMeta(next), { players: ["linn-grant"], tours: [] });
  assert.deepEqual(followsFromMeta(meta), EMPTY_FOLLOWS);
});

test("gästens val slås ihop med kontots", () => {
  assert.deepEqual(
    mergeFollows({ players: ["linn-grant"], tours: ["majors"] }, { players: ["linn-grant", "tiger-woods"], tours: [] }),
    { players: ["linn-grant", "tiger-woods"], tours: ["majors"] },
  );
});
