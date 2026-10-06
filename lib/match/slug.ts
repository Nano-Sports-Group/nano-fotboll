/**
 * lib/match/slug.ts — läsbara matchadresser: /match/farjestads-bk-hv71-2026-10-03.
 *
 * Adressen är lagnamnen plus matchdagen i svensk tid. Den slås upp genom att hämta dagens matcher
 * och räkna fram samma sträng (resolveMatchParam i lib/match/resolve.ts) — ingen slug-kolumn, ingen
 * migration. Numeriska adresser (/match/19635869) fungerar som förut: djuplänkar, gamla länkar och
 * de ytor som bara har ett id. Sidans canonical pekar alltid på den läsbara adressen.
 *
 * Ren modul — importeras av klientkomponenter.
 */

const DAY = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" });

function part(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Sportmonks skriver "2026-10-03 16:00:00" (UTC utan zon); databasen skriver ISO med zon. */
function toDate(kickoff: string): Date {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(kickoff) ? kickoff : `${kickoff.replace(" ", "T")}Z`);
}

export function matchSlug(home: string | null | undefined, away: string | null | undefined, kickoff: string | null | undefined): string | null {
  if (!home || !away || !kickoff) return null;
  const date = toDate(kickoff);
  const h = part(home);
  const a = part(away);
  if (!h || !a || Number.isNaN(date.getTime())) return null;
  return `${h}-${a}-${DAY.format(date)}`;
}

/** Länk till en match. Saknas namn eller tid blir det den numeriska adressen. */
export function matchHref(f: { id: number | string; home?: string | null; away?: string | null; kickoff?: string | null }): string {
  return `/match/${matchSlug(f.home, f.away, f.kickoff) ?? f.id}`;
}

/** Från en rad i `fixtures`. */
export function fixtureHref(f: { sportmonks_id: number | string; home_team_name?: string | null; away_team_name?: string | null; kickoff_at?: string | null }): string {
  return matchHref({ id: f.sportmonks_id, home: f.home_team_name, away: f.away_team_name, kickoff: f.kickoff_at });
}

/** Från Sportmonks-formen (lib/db/fixtures → SMFixture). */
export function smFixtureHref(f: { id: number; starting_at?: string | null; participants: Array<{ name: string; meta: { location: "home" | "away" } }> }): string {
  return matchHref({
    id: f.id,
    home: f.participants.find((p) => p.meta.location === "home")?.name,
    away: f.participants.find((p) => p.meta.location === "away")?.name,
    kickoff: f.starting_at,
  });
}

/** "19635869" → id. "farjestads-bk-hv71-2026-10-03" → dagen att leta i. Annat → null. */
export function parseMatchParam(param: string): { id: number } | { slug: string; day: string } | null {
  if (/^\d+$/.test(param)) return { id: Number(param) };
  const day = /-(\d{4}-\d{2}-\d{2})$/.exec(param)?.[1];
  return day ? { slug: param, day } : null;
}
