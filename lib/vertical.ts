/**
 * En motor, flera ytor. Odefinierad miljö är fotboll — samma beteende som innan
 * vertikalen fanns. Hockey och golf är egna deployer: NEXT_PUBLIC_VERTICAL=hockey | golf.
 * Golf har spelare och tävlingar, inte lag och serie: alla lag-, match- och tabellytor är
 * dolda (hiddenRoutes) och startsidan är golfens egen (components/golf/GolfFront).
 */

export type VerticalId = "football" | "hockey" | "golf";

export type VerticalPack = {
  id: VerticalId;
  productName: string;
  wordmark: string;
  tagline: string;
  dailyName: string;
  aboutLabel: string;
  leagueName: string;
  leagueHeading: string;
  /** entities.metadata.league */
  leagueEntity: string;
  /**
   * Alla ligor vertikalen täcker (entities.metadata.league). Lagfrågor filtrerar på hela
   * listan; hockey = SHL + HockeyAllsvenskan (founder-beslut 2026-09-30).
   */
  leagueEntities: readonly string[];
  /** Ligaväxlare på tabell/spelschema/resultat. Första = huvudligan (ingen ?liga=). */
  leagues: readonly { name: string; param: string | null }[];
  /** Vertikalens hem. Golf har ingen serie — /golf är golfens egen startsida. */
  leaguePath: "/allsvenskan" | "/shl" | "/golf";
  leagueTitle: string;
  leagueDescription: string;
  leagueShareDescription: string;
  leagueSubtitle: string;
  leagueJsonLdDescription: string;
  schemaSport: "Soccer" | "IceHockey" | "Golf";
  paused: boolean;
  seoKeywords: readonly string[];
  featuredTeams: readonly { href: string; label: string }[];
  /** "Skytteliga" (fotboll) / "Poängliga" (hockey). */
  scorersLabel: string;
  /**
   * Ytor som bara har innehåll i den här sporten ännu inte finns: redirectas i next.config
   * och döljs i menyn. Tas bort ur listan när hockeyn har eget material där.
   */
  hiddenRoutes: readonly string[];
};

const FOOTBALL_KEYWORDS = [
  "Allsvenskan",
  "Allsvenskan 2026",
  "Allsvenskan tabell",
  "Allsvenskan resultat",
  "Allsvenskan matcher",
  "Allsvenskan statistik",
  "Allsvenskan live",
  "Allsvenskan spelschema",
  "Allsvenskan skytteliga",
  "svensk fotboll",
  "fotboll Allsvenskan",
  "Allsvenskan statistik",
] as const;

export const FOOTBALL: VerticalPack = {
  id: "football",
  productName: "Nano Fotboll",
  wordmark: "NANO FOTBOLL",
  tagline: "Svensk fotbollsintelligens",
  dailyName: "Nano Fotboll Daily",
  aboutLabel: "Om Nano Fotboll",
  leagueName: "Allsvenskan",
  leagueHeading: "ALLSVENSKAN",
  leagueEntity: "Allsvenskan",
  // Superettan förberedd 2026-10-01: syns i ligaväxlaren först när synken levererat en säsong.
  leagueEntities: ["Allsvenskan", "Superettan"],
  leagues: [
    { name: "Allsvenskan", param: null },
    { name: "Superettan", param: "superettan" },
  ],
  leaguePath: "/allsvenskan",
  leagueTitle: "Allsvenskan 2026 – Nyheter, Tabell, Resultat & Matcher",
  leagueDescription:
    "Allsvenskan just nu: dagens nyheter, live-tabell, matchresultat och spelschema. Uppdateras löpande.",
  leagueShareDescription:
    "Allsvenskan just nu: dagens nyheter, live-tabell, matchresultat och spelschema.",
  leagueSubtitle: "Nyheter, tabell och matcher — uppdateras löpande.",
  leagueJsonLdDescription:
    "Allsvenskan är den högsta divisionen i svensk klubbfotboll för herrar.",
  schemaSport: "Soccer",
  paused: false,
  seoKeywords: FOOTBALL_KEYWORDS,
  featuredTeams: [
    { href: "/lag/aik", label: "AIK" },
    { href: "/lag/djurgarden", label: "DIF" },
    { href: "/lag/malmo-ff", label: "Malmö" },
  ],
  scorersLabel: "Skytteliga",
  hiddenRoutes: [],
};

export const HOCKEY: VerticalPack = {
  id: "hockey",
  productName: "Nano Hockey",
  wordmark: "NANO HOCKEY",
  tagline: "Svensk hockeyintelligens",
  dailyName: "Nano Hockey Daily",
  aboutLabel: "Om Nano Hockey",
  leagueName: "SHL",
  leagueHeading: "SHL",
  leagueEntity: "SHL",
  leagueEntities: ["SHL", "HockeyAllsvenskan"],
  leagues: [
    { name: "SHL", param: null },
    { name: "HockeyAllsvenskan", param: "hockeyallsvenskan" },
  ],
  leaguePath: "/shl",
  leagueTitle: "SHL 2026/27 – Nyheter, Tabell, Resultat & Matcher",
  leagueDescription:
    "SHL just nu: dagens nyheter, tabell, matchresultat och spelschema. Uppdateras löpande.",
  leagueShareDescription:
    "SHL just nu: dagens nyheter, tabell, matchresultat och spelschema.",
  leagueSubtitle: "Tabell, spelschema och resultat för SHL och HockeyAllsvenskan.",
  leagueJsonLdDescription: "SHL är den högsta divisionen i svensk klubbhockey för herrar.",
  schemaSport: "IceHockey",
  paused: false,
  seoKeywords: [
    "SHL",
    "SHL 2026",
    "SHL tabell",
    "SHL resultat",
    "SHL matcher",
    "SHL statistik",
    "svensk hockey",
    "hockey SHL",
  ],
  featuredTeams: [
    { href: "/lag/frolunda-hc", label: "Frölunda" },
    { href: "/lag/farjestads-bk", label: "Färjestad" },
    { href: "/lag/djurgardens-if", label: "Djurgården" },
    { href: "/lag/skelleftea-aik", label: "Skellefteå" },
    { href: "/lag/lulea-hf", label: "Luleå" },
    { href: "/lag/brynas-if", label: "Brynäs" },
  ],
  scorersLabel: "Poängliga",
  // Öppnade 2026-09-30: /podcast (16 verifierade SHL-poddar) och /ai (chatten läser hockeyns
  // tabell, matcher och nyheter). /daily öppnas när hockeyns Daily har innehåll — tom yta visas aldrig.
  hiddenRoutes: ["/analys", "/daily", "/kronika", "/brev", "/narrativ", "/allsvenskan/xp-tabell", "/allsvenskan/talanger", "/statistik"],
};

/**
 * Golf: ytan finns, innehållet kommer. Intaget är pausat i motorn (`golf_intake_enabled`),
 * ingen dataleverantör är vald och inget pris är satt — därför visas bara ytor som tål att
 * vara tomma (hem, flöde, konto) och aldrig tabeller, matcher, lagforum eller en kassa.
 */
export const GOLF: VerticalPack = {
  id: "golf",
  productName: "Nano Golf",
  wordmark: "NANO GOLF",
  tagline: "Svensk golfintelligens",
  dailyName: "Nano Golf Daily",
  aboutLabel: "Om Nano Golf",
  leagueName: "Tourerna",
  leagueHeading: "GOLF",
  leagueEntity: "Golf",
  leagueEntities: [],
  leagues: [{ name: "Golf", param: null }],
  leaguePath: "/golf",
  leagueTitle: "Nano Golf – svenska spelare och de stora tourerna",
  leagueDescription:
    "Golf ur svenskt perspektiv: svenska spelare på PGA Tour, DP World Tour, LPGA och LET, och majors.",
  leagueShareDescription: "Golf ur svenskt perspektiv: svenska spelare, tourerna och majors.",
  leagueSubtitle: "Svenska spelare, tourerna och majors.",
  leagueJsonLdDescription: "Nano Golf följer svenska golfspelare och de stora tourerna.",
  schemaSport: "Golf",
  paused: true,
  seoKeywords: [
    "svensk golf",
    "golf nyheter",
    "svenska golfspelare",
    "PGA Tour",
    "DP World Tour",
    "LPGA",
    "Ladies European Tour",
    "majors golf",
    "Ryder Cup",
    "Solheim Cup",
  ],
  featuredTeams: [],
  scorersLabel: "Ledartavla",
  // Allt som förutsätter lag, serie, matcher eller pris. Öppnas yta för yta när golfen har
  // material där: /daily och /podcast vid påslag, ledartavlor när dataleverantören är vald.
  hiddenRoutes: [
    "/allsvenskan", "/shl", "/match", "/lag", "/mitt-lag", "/statistik", "/analys", "/daily",
    "/podcast", "/ai", "/kronika", "/brev", "/narrativ", "/prenumerera", "/spelare", "/vaenta",
    "/onboarding", "/elite", "/dashboard",
    // Forumet är byggt per lag (/forum/[teamSlug]). Golf får ett eget när det finns en tavla utan lag.
    "/forum", "/skriv",
  ],
};

export function resolveVertical(raw: string | undefined): VerticalId {
  return raw === "hockey" ? "hockey" : raw === "golf" ? "golf" : "football";
}

export const VERTICAL: VerticalId = resolveVertical(process.env.NEXT_PUBLIC_VERTICAL);

const PACKS: Record<VerticalId, VerticalPack> = { football: FOOTBALL, hockey: HOCKEY, golf: GOLF };

export const vertical: VerticalPack = PACKS[VERTICAL];

/**
 * Sportens accent för ytor som inte når CSS-variablerna (e-post, OG-bild, ikon).
 * Samma värden som blocket "Sportens accent" i app/globals.css — ändra båda.
 */
export const SPORT_ACCENTS: Record<VerticalId, { base: string; light: string }> = {
  football: { base: "#2D5349", light: "#5FA98C" },
  hockey: { base: "#1F4E79", light: "#6FA8DC" },
  golf: { base: "#8A6A2B", light: "#D2B06A" },
};
export const SPORT_ACCENT = SPORT_ACCENTS[VERTICAL];

/** Kolumnen `sport` i Supabase. Fotbollsdeployen läser och skriver "football". */
export const SPORT = VERTICAL;

export function leagueHrefFor(id: VerticalId, subpath = ""): string {
  // Golf har ingen ligasida: allt under den pekar på golfens hem.
  if (id === "golf") return "/golf";
  const base = id === "hockey" ? "/shl" : "/allsvenskan";
  if (!subpath) return base;
  return `${base}${subpath.startsWith("/") ? subpath : `/${subpath}`}`;
}

export function leagueHref(subpath = ""): string {
  return leagueHrefFor(VERTICAL, subpath);
}

/** `?liga=` → ligans namn (undefined = huvudligan). Okänt värde ger huvudligan, aldrig ett fel. */
export function leagueFromParam(param: string | string[] | undefined): string | undefined {
  const value = Array.isArray(param) ? param[0] : param;
  if (!value) return undefined;
  return vertical.leagues.find((l) => l.param === value.toLowerCase())?.name;
}
