import assert from "node:assert/strict";
import test from "node:test";
import {
  BOTTOM_NAV_ITEMS,
  MAX_BOTTOM_NAV_ITEMS,
  isNavActive,
  SECONDARY_NAV_ITEMS,
  SIDEBAR_NAV_ITEMS,
} from "./nav";

/**
 * Vakt för mobil UX-regel 3 (`context/mobile_ux_rules.md`).
 *
 * Bottenraden är den enda navigationen de flesta supportrar någonsin använder,
 * och den är dessutom kontraktet som iOS-tabbarna genereras ur. Ordningen och
 * taket är därför kod, inte en överenskommelse — en flik som smyger in på
 * fel plats ska fälla bygget, inte upptäckas i en designgranskning.
 */

test("Hem ligger längst till vänster", () => {
  assert.equal(BOTTOM_NAV_ITEMS[0]?.label, "Hem");
});

test("Profil ligger längst till höger", () => {
  assert.equal(BOTTOM_NAV_ITEMS.at(-1)?.label, "Profil");
  assert.equal(BOTTOM_NAV_ITEMS.at(-1)?.href, "/profil");
});

test("bottenraden har högst fem flikar", () => {
  assert.ok(
    BOTTOM_NAV_ITEMS.length <= MAX_BOTTOM_NAV_ITEMS,
    `${BOTTOM_NAV_ITEMS.length} flikar — en sjätte destination hör under Mer, inte i docken`,
  );
  assert.equal(MAX_BOTTOM_NAV_ITEMS, 5);
});

test("varje flik har en iOS-symbol så parity-kontraktet kan genereras", () => {
  for (const item of BOTTOM_NAV_ITEMS) {
    assert.ok(item.iosSymbol.length > 0, `${item.label} saknar iosSymbol`);
    assert.ok(item.href.startsWith("/"), `${item.label} har en relativ href`);
  }
});

test("overflow dubblerar aldrig en bottenflik", () => {
  const bottom = new Set(BOTTOM_NAV_ITEMS.map((i) => i.href));
  const dubletter = SECONDARY_NAV_ITEMS.filter((i) => bottom.has(i.href)).map((i) => i.href);
  assert.deepEqual(dubletter, [], `Samma destination på två ställen i chromet: ${dubletter}`);
});

test("sidobaren är bottenraden plus exakt en overflow-ingång", () => {
  assert.equal(SIDEBAR_NAV_ITEMS.length, BOTTOM_NAV_ITEMS.length + 1);
  assert.equal(SIDEBAR_NAV_ITEMS.at(-1)?.href, "/mer");
});

test("exakt flik lyser inte på undersidor", () => {
  assert.equal(isNavActive({ href: "/golf", exact: true }, "/golf"), true);
  assert.equal(isNavActive({ href: "/golf", exact: true }, "/golf/spelare"), false);
  assert.equal(isNavActive({ href: "/golf/spelare" }, "/golf/spelare/ludvig-aberg"), true);
  assert.equal(isNavActive({ href: "/nyheter" }, "/nyheter-arkiv"), false);
});

test("högst en bottenflik är aktiv på en given sida", () => {
  for (const path of [...BOTTOM_NAV_ITEMS.map((i) => i.href), "/golf/spelare/x", "/golf/tourer/x", "/lag/aik"]) {
    const active = BOTTOM_NAV_ITEMS.filter((item) => isNavActive(item, path));
    assert.ok(active.length <= 1, `${path}: ${active.map((i) => i.label).join(" + ")}`);
  }
});
