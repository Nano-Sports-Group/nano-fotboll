/**
 * Klubbar: färger och kortnamn per entities.slug — en post per klubb, en källa.
 *
 * Filen i ordning:
 *   1. Typer
 *   2. Fotboll   — Allsvenskan
 *   3. Hockey    — SHL, HockeyAllsvenskan
 *   4. Samma förening i två sporter (AIK, Djurgården)
 *   5. Uppslag   — getTeamColors, getTeamShort, sisterClubSlug
 *   6. Accent (yta) och bläck (text) — getTeamAccent, getTeamInk
 *
 * Ny klubb: lägg en rad under rätt liga. Tre klubbfärger → gradientStops.
 * Vakt: tests/e2e/team-ink.spec.ts kräver 4.5:1 som text i båda teman för varje slug.
 * Klubbfärgen används som `--team-accent`/`--team-accent-fg` på lag-hub och matchytor.
 * Lag utan post faller tillbaka på sportens accent.
 */
import { SPORT_ACCENT } from "./vertical";

// ─── 1. Typer ────────────────────────────────────────────────────────────────

export type TeamColors = {
  /** Klubbens huvudfärg. */
  primary: string;
  /** Andra klubbfärgen. Blir accent när primary är för mörk för svart bakgrund. */
  secondary: string;
  /** Textfärg ovanpå primary. */
  text: string;
  /** Valfria extra gradient-stopp, i ordning — override av det annars 2-stopps primary→secondary. */
  gradientStops?: string[];
};

/** `short` = kortnamn för "Nickname (DIF)"-visning i forum m.m. */
type Club = TeamColors & { short: string };

const BLACK = "#111111";
const WHITE = "#FFFFFF";

// ─── 2. Fotboll — Allsvenskan ────────────────────────────────────────────────

const FOOTBALL_CLUBS: Record<string, Club> = {
  aik: { short: "AIK", primary: BLACK, secondary: "#F5C518", text: WHITE }, // svart/gul
  djurgarden: { short: "DIF", primary: "#0B2A6B", secondary: "#5FA8E0", text: WHITE }, // mörkblå/ljusblå
  hammarby: { short: "HIF", primary: "#0B7A3B", secondary: "#4ED17A", text: WHITE }, // grön/vit
  "malmo-ff": { short: "MFF", primary: "#6DB7E8", secondary: WHITE, text: "#07111F" }, // himmelsblå
  "ifk-goteborg": { short: "IFK", primary: "#1D5FA7", secondary: WHITE, text: WHITE }, // blå/vit
  "if-elfsborg": { short: "IFE", primary: "#F4D21F", secondary: BLACK, text: BLACK }, // gul/svart
  "bk-hacken": { short: "BKH", primary: "#F5D000", secondary: BLACK, text: BLACK }, // gul/svart
  sirius: { short: "SIR", primary: "#0057B8", secondary: BLACK, text: WHITE }, // blå/svart
  halmstad: { short: "HBK", primary: "#0056A4", secondary: WHITE, text: WHITE }, // blå/vit
  brommapojkarna: { short: "BP", primary: "#D71920", secondary: BLACK, text: WHITE }, // röd/svart
  mjallby: { short: "MAIF", primary: "#F4D21F", secondary: BLACK, text: BLACK }, // gul/svart
  degerfors: { short: "DEG", primary: "#D71920", secondary: WHITE, text: WHITE }, // röd/vit ("DIF" är Djurgårdens)
  gais: { short: "GAIS", primary: "#0B7A3B", secondary: BLACK, text: WHITE }, // grön/svart
  "kalmar-ff": { short: "KFF", primary: "#D71920", secondary: WHITE, text: WHITE }, // röd/vit
  "vasteras-sk": { short: "VSK", primary: "#0C7B45", secondary: WHITE, text: WHITE }, // grön/vit
  orgryte: { short: "ÖIS", primary: "#C8102E", secondary: "#123B7A", text: WHITE }, // röd/blå
};

// ─── 3. Hockey ───────────────────────────────────────────────────────────────
// Klubbfärgerna kontrollerade mot Wikipedia/Eliteprospects 2026-10-07. AIK och
// Djurgården står inte här: de delar post med fotbollen (avsnitt 4).

const SHL_CLUBS: Record<string, Club> = {
  "brynas-if": { short: "BIF", primary: BLACK, secondary: "#FFCD00", text: WHITE, gradientStops: [BLACK, "#D4002A", "#FFCD00"] }, // svart/röd/gul
  "farjestads-bk": { short: "FBK", primary: "#00693E", secondary: "#C9A227", text: WHITE }, // grön/guld
  "frolunda-hc": { short: "FHC", primary: "#C8102E", secondary: "#006341", text: WHITE }, // röd/grön
  hv71: { short: "HV71", primary: "#002F6C", secondary: "#FFC72C", text: WHITE }, // blå/gul
  "if-bjorkloven": { short: "IFB", primary: "#00703C", secondary: "#FFD200", text: WHITE }, // grön/gul
  "linkopings-hc": { short: "LHC", primary: "#0A2D6E", secondary: WHITE, text: WHITE, gradientStops: ["#0A2D6E", WHITE, "#E4002B"] }, // blå/vit/röd
  "lulea-hf": { short: "LHF", primary: BLACK, secondary: "#E2231A", text: WHITE, gradientStops: [BLACK, "#E2231A", "#FFD100"] }, // svart/röd/gul
  "malmo-redhawks": { short: "MIF", primary: "#C8102E", secondary: BLACK, text: WHITE }, // röd/svart
  "orebro-hk": { short: "ÖRE", primary: "#D71920", secondary: WHITE, text: WHITE }, // röd/vit
  "rogle-bk": { short: "RBK", primary: "#00843D", secondary: WHITE, text: WHITE }, // grön/vit
  "skelleftea-aik": { short: "SAIK", primary: BLACK, secondary: "#FFC20E", text: WHITE }, // svart/gul
  "timra-ik": { short: "TIK", primary: "#D0021B", secondary: "#003DA5", text: WHITE, gradientStops: ["#D0021B", WHITE, "#003DA5"] }, // röd/vit/blå
  "vaxjo-lakers": { short: "VLH", primary: "#002B5C", secondary: "#F58220", text: WHITE }, // blå/orange
};

const HOCKEYALLSVENSKAN_CLUBS: Record<string, Club> = {
  "almtuna-is": { short: "AIS", primary: "#C8102E", secondary: "#E0B400", text: WHITE, gradientStops: ["#C8102E", "#E0B400", BLACK] }, // röd/guld/svart
  "bik-karlskoga": { short: "BIK", primary: "#003DA5", secondary: WHITE, text: WHITE }, // blå/vit
  "ik-oskarshamn": { short: "IKO", primary: "#0033A0", secondary: "#E4002B", text: WHITE, gradientStops: ["#0033A0", WHITE, "#E4002B"] }, // blå/vit/röd
  "kalmar-hc": { short: "KHC", primary: "#C8102E", secondary: "#FFD100", text: WHITE }, // röd/gul
  "leksands-if": { short: "LIF", primary: "#002F6C", secondary: WHITE, text: WHITE }, // mörkblå/vit
  "modo-hockey": { short: "MODO", primary: "#D2001F", secondary: "#00713D", text: WHITE, gradientStops: ["#D2001F", WHITE, "#00713D"] }, // röd/vit/grön
  "mora-ik": { short: "MIK", primary: "#C8102E", secondary: WHITE, text: WHITE }, // röd/vit
  "nybro-vikings-if": { short: "NVIF", primary: "#C8102E", secondary: BLACK, text: WHITE, gradientStops: ["#C8102E", BLACK, WHITE] }, // röd/svart/vit
  "ostersunds-ik": { short: "ÖIK", primary: "#00703C", secondary: "#FFD200", text: WHITE }, // grön/gul
  "sodertalje-sk": { short: "SSK", primary: "#0B2A5B", secondary: "#FFD100", text: WHITE, gradientStops: ["#0B2A5B", WHITE, "#FFD100"] }, // marinblå/vit/gul
  "vasteras-ik": { short: "VIK", primary: "#FFD100", secondary: BLACK, text: BLACK }, // gul/svart
  "vimmerby-hc": { short: "VHC", primary: BLACK, secondary: "#FFD100", text: WHITE }, // svart/gul
  "visby-roma-hk": { short: "VRHK", primary: BLACK, secondary: "#C9A227", text: WHITE }, // svart/guld
};

// ─── 4. Samma förening i två sporter ─────────────────────────────────────────

/**
 * Hockey-slug → fotbolls-slug. Posten delas (en AIK:are ska känna igen sig i
 * båda), och favoritlaget i den ena sporten är förvalet i den andra tills
 * användaren valt själv (lib/favorite-meta.ts).
 * Bara verkliga samma-klubb-par: Kalmar HC/Kalmar FF och Västerås IK/Västerås SK
 * är olika föreningar.
 */
const SAME_CLUB: Record<string, string> = {
  "aik-if": "aik",
  "djurgardens-if": "djurgarden",
};

const CLUBS: Record<string, Club> = {
  ...FOOTBALL_CLUBS,
  ...SHL_CLUBS,
  ...HOCKEYALLSVENSKAN_CLUBS,
  ...Object.fromEntries(Object.entries(SAME_CLUB).map(([hockey, football]) => [hockey, FOOTBALL_CLUBS[football]])),
};

// ─── 5. Uppslag ──────────────────────────────────────────────────────────────

const FALLBACK: TeamColors = { primary: SPORT_ACCENT.base, secondary: WHITE, text: WHITE };

export function getTeamColors(slug: string | null | undefined): TeamColors {
  return (slug && CLUBS[slug]) || FALLBACK;
}

export function getTeamShort(slug: string | null | undefined): string | null {
  return (slug && CLUBS[slug]?.short) || null;
}

/** Föreningens slug i den andra sporten, om den finns där. */
export function sisterClubSlug(slug: string, to: "football" | "hockey"): string | undefined {
  if (to === "football") return SAME_CLUB[slug];
  return Object.keys(SAME_CLUB).find((hockey) => SAME_CLUB[hockey] === slug);
}

// ─── 6. Accent (yta) och bläck (text) ────────────────────────────────────────

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255;
}

/** Accentfärg läsbar mot mörk bakgrund — den ljusare av primary/secondary (AIK:s #111 är osynlig på zinc-950). */
export function getTeamAccent(slug: string | null | undefined): string {
  const c = getTeamColors(slug);
  const pick = luminance(c.primary) >= 0.25 ? c.primary : c.secondary;
  return luminance(pick) >= 0.25 ? pick : FALLBACK.primary;
}

// ─── Klubbfärg som TEXT ───────────────────────────────────────────────────────
// getTeamAccent duger som yta men inte som textfärg: tröskeln 0.25 är
// perceptuell, inte WCAG. Hammarbys #0B7A3B passerar den och landar på 3.19:1
// mot svart, och fallbacken #2D5349 på 2.45:1. Ingen enskild valör klarar 4.5:1
// mot BÅDA temabakgrunderna (kraven motsäger varandra), därför ett par.

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const hex = (c: number[]) =>
  "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

/** WCAG relativ luminans — inte att förväxla med luminance() ovan. */
function relLuminance(c: number[]): number {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: number[], b: number[]): number {
  const [l1, l2] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Blandar `color` mot `toward` i 5%-steg tills 4.5:1 mot `bg` uppnås. */
function readableOn(color: string, bg: string, toward: number[]): string {
  const src = rgb(color);
  const dst = rgb(bg);
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const mixed = src.map((v, i) => v * (1 - t) + toward[i] * t);
    if (contrast(mixed, dst) >= 4.5) return hex(mixed);
  }
  return hex(toward);
}

/* Referenserna är den svåraste ytan i varje tema, inte den vanligaste: mörkt
   bläck har lägst kontrast mot den MÖRKASTE ljusa ytan (--muted #F3F2F0), ljust
   bläck mot den LJUSASTE mörka (--card #1B1B1C). Klarar de dem klarar de resten. */
const PAPER = "#F3F2F0";
const DARK_SURFACE = "#1B1B1C";

/**
 * Klubbfärg avsedd som textfärg, en valör per tema. Sätt som CSS-variabler och
 * använd `.team-ink` (definierad i globals.css) så växlar den med `.dark`.
 */
export function getTeamInk(slug: string | null | undefined): { light: string; dark: string } {
  const accent = getTeamAccent(slug);
  return {
    light: readableOn(accent, PAPER, [0, 0, 0]),
    dark: readableOn(accent, DARK_SURFACE, [255, 255, 255]),
  };
}
