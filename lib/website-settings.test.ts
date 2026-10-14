import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WEBSITE_SETTINGS,
  interpolate,
  parseWebsiteSettings,
  resolveShareMetadata,
} from "./website-settings";

const settings = DEFAULT_WEBSITE_SETTINGS;

test("artikel tar rubrik och sammanfattning — inte sajtens standardfras", () => {
  const resolved = resolveShareMetadata(settings, {
    kind: "article",
    title: "Malmö FF:s värvning säger mer om titeljakten än om anfallet",
    summary: "En sen värvning i augusti ritade om hur MFF kan spela från dag ett.",
    path: "/artikel/mff-varvning",
  });
  assert.equal(resolved.title, "Malmö FF:s värvning säger mer om titeljakten än om anfallet");
  assert.equal(resolved.ogTitle, resolved.title);
  assert.equal(resolved.description, "En sen värvning i augusti ritade om hur MFF kan spela från dag ett.");
  assert.equal(resolved.ogType, "article");
  assert.equal(resolved.robots.index, true);
  assert.equal(resolved.titleAbsolute, false);
});

test("artikel utan summary faller tillbaka på sajtbeskrivning, aldrig tom sträng", () => {
  const resolved = resolveShareMetadata(settings, {
    kind: "article",
    title: "Rubrik",
    summary: "   ",
    path: "/artikel/x",
  });
  assert.equal(resolved.description, settings.seo.defaultDescription);
});

test("nyhet får egen fras med källa — tar inte emot teaser", () => {
  const resolved = resolveShareMetadata(settings, {
    kind: "nyhet",
    title: "Hammarby jagar mittback före stängning",
    sourceName: "Fotbollskanalen",
    path: "/nyhet/bajen-mittback",
  });
  assert.equal(resolved.description, "Nano Fotboll följer händelsen. Originalet hos Fotbollskanalen.");
  assert.equal(resolved.robots.index, false);
  assert.equal(resolved.ogImageUrl, settings.sharing.ogImageUrl);
});

test("startsida använder standardfras, inte artikelrubrik", () => {
  const resolved = resolveShareMetadata(settings, { kind: "home" });
  assert.equal(resolved.title, settings.seo.homeTitle);
  assert.equal(resolved.ogTitle, settings.sharing.homeOgTitle);
  assert.equal(resolved.titleAbsolute, true);
  assert.equal(resolved.canonicalPath, "/");
});

test("lag interpolerar {team}", () => {
  const resolved = resolveShareMetadata(settings, {
    kind: "team",
    team: "Djurgården",
    path: "/lag/djurgarden",
  });
  assert.match(resolved.title, /Djurgården/);
  assert.doesNotMatch(resolved.title, /\{team\}/);
});

test("match utan resultat döljer siffror — 0–0 efter avspark är ett resultat", () => {
  const upcoming = resolveShareMetadata(settings, {
    kind: "match",
    home: "Djurgården",
    away: "Hammarby",
    homeScore: null,
    awayScore: null,
    when: "sön 20:00",
    path: "/match/1",
  });
  assert.equal(upcoming.title, "Djurgården – Hammarby");
  assert.doesNotMatch(upcoming.title, /null/);

  const draw = resolveShareMetadata(settings, {
    kind: "match",
    home: "Djurgården",
    away: "Hammarby",
    homeScore: 0,
    awayScore: 0,
    when: null,
    path: "/match/1",
  });
  assert.equal(draw.title, "Djurgården 0–0 Hammarby");
});

test("og-titel får varumärke bara när toggle är på", () => {
  const on = parseWebsiteSettings({
    sharing: { includeBrandInOgTitle: true },
  });
  const resolved = resolveShareMetadata(on, {
    kind: "article",
    title: "Rubrik utan varumärke",
    summary: "Dek.",
    path: "/artikel/x",
  });
  assert.equal(resolved.ogTitle, "Rubrik utan varumärke | Nano Fotboll");
});

test("parse struntar i HTML och ogiltig bild-URL", () => {
  const parsed = parseWebsiteSettings({
    identity: { siteName: "<script>Nano Fotboll</script>" },
    sharing: { ogImageUrl: "javascript:alert(1)" },
  });
  assert.equal(parsed.identity.siteName, "Nano Fotboll");
  assert.equal(parsed.sharing.ogImageUrl, DEFAULT_WEBSITE_SETTINGS.sharing.ogImageUrl);
});

test("delningsbild: 'ingen uppladdad'-markören faller till den genererade, match har egen", () => {
  const parsed = parseWebsiteSettings({ sharing: { ogImageUrl: "/og-default.png" } });
  assert.equal(parsed.sharing.ogImageUrl, "/opengraph-image");
  const match = resolveShareMetadata(settings, {
    kind: "match", home: "AIK", away: "DIF", homeScore: null, awayScore: null, when: null, path: "/match/aik-dif",
  });
  assert.equal(match.ogImageUrl, "/match/aik-dif/og");
});

test("interpolate lämnar okända platshållare synliga", () => {
  assert.equal(interpolate("Hej {team} {nope}", { team: "AIK" }), "Hej AIK {nope}");
});
