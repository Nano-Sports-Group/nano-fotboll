/**
 * Innehållsfönstret: listor, flöden och sök visar bara de senaste 60 dagarna
 * (founder-beslut 2026-09-30). Enskilda sidor (artikel, podd, narrativ, match)
 * och sitemap filtreras INTE — delade länkar och indexerade URL:er ska fortsätta fungera.
 */
export const CONTENT_WINDOW_DAYS = 60;

/** ISO-tidsstämpel för fönstrets början. Tidpunkt, inte kalenderdag — zonoberoende. */
export function contentCutoffIso(now: number = Date.now()): string {
  return new Date(now - CONTENT_WINDOW_DAYS * 86_400_000).toISOString();
}
