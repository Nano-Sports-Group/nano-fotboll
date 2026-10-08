import type { Metadata } from "next";
import Link from "next/link";
import { getTopScorersFromDb, SEASON_IDS } from "@/lib/statistik";
import { AppBreadcrumbs } from "@/components/ui/AppBreadcrumbs";
import { VERTICAL, leagueHref, vertical } from "@/lib/vertical";
import { fetchHockeyPointsLeaders, type HockeyPlayerStat } from "@/lib/db/fixtures";
import { LeagueSwitcher } from "@/components/ui/LeagueSwitcher";
import { resolveViewerLeague } from "@/lib/team/viewer-league";
import { getSiteUrl } from "@/lib/site-url";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";

export const revalidate = 300;

const TITLE =
  VERTICAL === "hockey"
    ? "SHL Poängliga 2026/27"
    : "Allsvenskan Skytteliga 2026 – Toppskytt & Målkung";
const CANONICAL =
  `${getSiteUrl()}${leagueHref("/skytteliga")}`;

export const metadata: Metadata = {
  title: TITLE,
  description:
    VERTICAL === "hockey"
      ? "Poängligan i SHL 2026/27: poäng, mål, assist, plus/minus och skott per spelare, uppdaterad efter varje omgång."
      : "Aktuell skytteliga för Allsvenskan 2026. Se vilken spelare som leder jakten på titeln som toppskytt med flest mål.",
  alternates: { canonical: CANONICAL },
  openGraph: {
    type: "website",
    locale: "sv_SE",
    url: CANONICAL,
    title: TITLE,
    description: VERTICAL === "hockey" ? "Vem leder poängligan i SHL 2026/27?" : "Vem leder skytteligan i Allsvenskan 2026?",
  },
};

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/** Hockeyns poängliga: poäng först, mål som skiljetecken. Tom liga = ärlig tom text, aldrig nollor. */
function HockeyPointsTable({ rows }: { rows: HockeyPlayerStat[] }) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground">Spelarstatistik finns inte för den här ligan än.</p>;
  }
  return (
    <div className="rounded-2xl border border-border overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30 text-muted-foreground">
            <th className="text-left py-3 px-3 font-medium w-8">#</th>
            <th className="text-left py-3 px-3 font-medium">Spelare</th>
            <th className="text-center py-3 px-2 font-medium" title="Matcher">M</th>
            <th className="text-center py-3 px-2 font-medium" title="Mål">G</th>
            <th className="text-center py-3 px-2 font-medium" title="Assist">A</th>
            <th className="text-center py-3 px-2 font-bold text-foreground" title="Poäng">P</th>
            <th className="text-center py-3 px-2 font-medium hidden sm:table-cell" title="Plus/minus">+/-</th>
            <th className="text-center py-3 px-2 font-medium hidden sm:table-cell" title="Skott på mål">Skott</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.player_id} className="border-b border-border/50">
              <td className="py-3 px-3 text-muted-foreground font-mono tabular-nums">{i + 1}</td>
              <td className="py-3 px-3">
                <span className="font-medium text-foreground">{r.player_name}</span>
                <span className="block text-xs text-muted-foreground">{r.team_name}</span>
              </td>
              <td className="py-3 px-2 text-center tabular-nums">{r.games}</td>
              <td className="py-3 px-2 text-center tabular-nums">{r.goals}</td>
              <td className="py-3 px-2 text-center tabular-nums">{r.assists}</td>
              <td className="py-3 px-2 text-center tabular-nums font-bold text-foreground">{r.points}</td>
              <td className="py-3 px-2 text-center tabular-nums hidden sm:table-cell">{signed(r.plus_minus)}</td>
              <td className="py-3 px-2 text-center tabular-nums hidden sm:table-cell">{r.shots_on_goal}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AllsvenskanSkytteligaPage({
  searchParams,
}: {
  searchParams: Promise<{ liga?: string }>;
}) {
  const { league, homeIsSecondary } =
    VERTICAL === "hockey"
      ? await resolveViewerLeague((await searchParams).liga)
      : { league: undefined, homeIsSecondary: false };
  const hockeyRows = VERTICAL === "hockey" ? await fetchHockeyPointsLeaders(league) : [];
  // OBS: Object.values(SEASON_IDS)[0] ger "2025" pga JS:s heltalsnyckel-
  // sortering (numeriska nyckelsträngar ordnas alltid stigande, oavsett
  // insättningsordning) — gav en tom skytteliga i produktion 2026-07-03.
  // Explicit nyckel = korrekt oavsett hur SEASON_IDS-objektet är skrivet.
  const seasonId = SEASON_IDS["2026"] ?? "";
  const scorers = VERTICAL === "hockey" ? [] : await getTopScorersFromDb(seasonId).catch(() => []);

  return (
    <div className="w-full px-4 sm:px-8 py-10 max-w-3xl mx-auto">
      <div className="mb-6">
        <AppBreadcrumbs
          items={[
            { label: vertical.leagueName, href: vertical.leaguePath },
            { label: VERTICAL === "hockey" ? "Poängliga" : "Skytteliga" },
          ]}
        />
      </div>

      <h1 className="font-bold text-4xl sm:text-5xl text-foreground mb-2 text-balance">{VERTICAL === "hockey" ? `${(league ?? vertical.leagueName).toUpperCase()} POÄNGLIGA 2026/27` : "ALLSVENSKAN SKYTTELIGA 2026"}</h1>
      <p className="text-muted-foreground mb-8">{VERTICAL === "hockey" ? "Poäng, mål och assist per spelare, räknat ur varje spelad match." : "Vem leder skytteligan just nu?"}</p>

      {VERTICAL === "hockey" ? (
        <>
          <LeagueSwitcher basePath={leagueHref("/skytteliga")} active={league} explicitMain={homeIsSecondary} />
          <HockeyPointsTable rows={hockeyRows} />
        </>
      ) : (
      <div className="rounded-2xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-muted-foreground">
              <th className="text-left py-3 px-4 font-medium w-8">#</th>
              <th className="text-left py-3 px-4 font-medium">Spelare</th>
              <th className="text-left py-3 px-4 font-medium hidden sm:table-cell">Lag</th>
              <th className="text-center py-3 px-4 font-medium font-bold">Mål</th>
            </tr>
          </thead>
          <tbody>
            {scorers.slice(0, 20).map((s, i) => (
              <tr key={s.player_id ?? i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                <td className="py-3 px-4 text-muted-foreground font-mono tabular-nums">{i + 1}</td>
                <td className="py-3 px-4">
                  <Link href={`/spelare/${s.slug ?? s.player_id}`} className="flex items-center gap-3 hover:text-pitch-ink transition-colors">
                    {s.image && (
                      <div className="relative w-8 h-8 rounded-full overflow-hidden bg-muted shrink-0">
                        <PlayerAvatar src={s.image} alt={s.player_name ?? ""} sizes="32px" />
                      </div>
                    )}
                    <span className="font-medium">{s.player_name}</span>
                  </Link>
                </td>
                <td className="py-3 px-4 text-muted-foreground hidden sm:table-cell">
                  <Link href={`/lag/${s.team_slug ?? s.team_name.toLowerCase().replace(/\s+/g, "-").replace(/[åä]/g, "a").replace(/ö/g, "o")}`} className="hover:text-pitch-ink transition-colors">
                    {s.team_name}
                  </Link>
                </td>
                <td className="py-3 px-4 text-center font-bold text-foreground">{s.goals}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      <div className="mt-6 flex gap-4 text-sm">
        <Link href={`${vertical.leaguePath}/tabell`} className="text-pitch-ink hover:underline">Tabell →</Link>
        <Link href="/statistik" className="text-pitch-ink hover:underline">All statistik →</Link>
      </div>
    </div>
  );
}
