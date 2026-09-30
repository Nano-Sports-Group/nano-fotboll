import type { Metadata } from "next";
import Link from "next/link";
import { fetchStandingsFull, fetchStandingsCoveredThrough } from "@/lib/db/fixtures";
import { freshnessOf, stalenessNotice } from "@/lib/data-freshness";
import type { SMStandingRow } from "@/lib/db/fixtures";
import { AppBreadcrumbs } from "@/components/ui/AppBreadcrumbs";
import { Target, CalendarDays, Flag, BarChart3, Sparkles } from "lucide-react";
import { jsonLd } from "@/lib/json-ld";
import { VERTICAL, leagueFromParam, leagueHref, vertical } from "@/lib/vertical";
import { LeagueSwitcher } from "@/components/ui/LeagueSwitcher";
import { getSiteUrl } from "@/lib/site-url";

export const revalidate = 60;

// Allsvenskan-kval/nedflyttningszoner (16 lag). Sportmonks levererar ingen
// zon-flagga i vår standings-vy, så den härleds från placering (stabil regel).
type Zone = "cl" | "el" | "playoff" | "relegation" | null;
function zoneFor(position: number): Zone {
  if (VERTICAL === "hockey") return null;
  if (position === 1) return "cl";
  if (position === 2 || position === 3) return "el";
  if (position === 14) return "playoff";
  if (position >= 15) return "relegation";
  return null;
}
const ZONE_DOT: Record<Exclude<Zone, null>, string> = {
  cl: "bg-success",
  el: "bg-sky-500",
  playoff: "bg-amber-500",
  relegation: "bg-destructive",
};
const ZONE_LABEL: Record<Exclude<Zone, null>, string> = {
  cl: "Champions League",
  el: "Europa/Conference League",
  playoff: "Kval",
  relegation: "Nedflyttning",
};

const TABELL_TITLE =
  VERTICAL === "hockey"
    ? "SHL Tabell 2026/27 – Poängtabell & Ställning"
    : "Allsvenskan Tabell 2026 – Poängtabell & Ställning";
const TABELL_DESCRIPTION =
  VERTICAL === "hockey"
    ? "Aktuell SHL-tabell 2026/27 med poäng, målskillnad och form. Uppdateras när intaget är på."
    : "Aktuell Allsvenskan-tabell 2026 med poäng, målskillnad och form för alla 16 lag. Uppdateras automatiskt efter varje match.";
const TABELL_CANONICAL =
  `${getSiteUrl()}${leagueHref("/tabell")}`;

export const metadata: Metadata = {
  title: TABELL_TITLE,
  description: TABELL_DESCRIPTION,
  alternates: { canonical: TABELL_CANONICAL },
  openGraph: {
    type: "website",
    locale: "sv_SE",
    url: TABELL_CANONICAL,
    title: TABELL_TITLE,
    description:
      VERTICAL === "hockey"
        ? "Aktuell SHL-tabell 2026/27 med poäng, målskillnad och form."
        : "Aktuell Allsvenskan-tabell 2026 med poäng, målskillnad och form.",
  },
};

export default async function AllsvenskanTabellPage({
  searchParams,
}: {
  searchParams: Promise<{ liga?: string }>;
}) {
  const league = leagueFromParam((await searchParams).liga);
  const leagueName = league ?? vertical.leagueName;
  const [standings, coveredThrough] = await Promise.all([
    fetchStandingsFull(league).catch(() => [] as SMStandingRow[]),
    fetchStandingsCoveredThrough().catch(() => null),
  ]);
  // Tabellen räknas om varje natt, men ur fixtures som inte fått nya resultat
  // sedan Sportmonks-planen slutade täcka Allsvenskan. Färsk beräkning av
  // gammal verklighet är fortfarande gammal verklighet — säg det.
  const freshness = freshnessOf(coveredThrough);
  const notice = stalenessNotice(freshness);

  return (
    <div className="w-full px-4 sm:px-8 py-10 max-w-3xl mx-auto">
      <div className="mb-4">
        <AppBreadcrumbs
          items={[
            { label: vertical.leagueName, href: vertical.leaguePath },
            { label: "Tabell" },
          ]}
        />
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({
        "@context": "https://schema.org",
        "@type": "Table",
        about: { "@type": "SportsOrganization", name: VERTICAL === "hockey" ? "SHL 2026/27" : "Allsvenskan 2026", sport: vertical.schemaSport, url: TABELL_CANONICAL.replace(/\/tabell$/, "") },
        description: standings[0]
          ? `${VERTICAL === "hockey" ? "SHL-tabell 2026/27" : "Allsvenskan-tabell 2026"}. Ledare: ${standings[0].team.name}`
          : VERTICAL === "hockey" ? "SHL-tabell 2026/27" : "Allsvenskan-tabell 2026",
      })}} />

      <h1 className="font-bold text-4xl sm:text-5xl text-foreground mb-2 text-balance">{VERTICAL === "hockey" ? `${leagueName.toUpperCase()} TABELL 2026/27` : "ALLSVENSKAN TABELL 2026"}</h1>
      <LeagueSwitcher basePath={leagueHref("/tabell")} active={league} />
      {notice ? (
        <p
          data-testid="standings-staleness"
          className="mb-6 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-foreground"
        >
          {notice}
        </p>
      ) : (
        <p className="text-muted-foreground mb-6">Uppdateras löpande under säsongen.</p>
      )}

      <nav aria-label={VERTICAL === "hockey" ? "SHL-sidor" : "Allsvenskan-sidor"} className="mb-8 flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
        {/* Lucide-ikoner, inte emoji. Emoji renderas i systemets egen stil och
            bryter mot ikonspråket i resten av appen — och jordgloben som stod
            för Skytteliga betydde ingenting. */}
        {[
          { href: leagueHref("/skytteliga"), Icon: Target, label: VERTICAL === "hockey" ? "Poängliga" : "Skytteliga" },
          { href: leagueHref("/spelschema"), Icon: CalendarDays, label: "Spelschema" },
          { href: leagueHref("/resultat"), Icon: Flag, label: "Resultat" },
          { href: leagueHref("/xp-tabell"), Icon: BarChart3, label: "xP-tabell" },
          { href: leagueHref("/talanger"), Icon: Sparkles, label: "Talanger" },
        ]
          // Dolda ytor (hockey: xP-tabell, talanger) länkas inte — de redirectar bara.
          .filter((l) => !vertical.hiddenRoutes.some((r) => l.href.startsWith(r.replace("/allsvenskan", vertical.leaguePath))))
          .map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="shrink-0 inline-flex min-h-11 items-center gap-1.5 px-3.5 rounded-xl border border-border bg-card text-sm font-medium text-foreground hover:border-pitch/60 hover:text-pitch-ink transition-colors"
          >
            <l.Icon className="h-4 w-4 shrink-0" aria-hidden />
            {l.label}
          </Link>
        ))}
      </nav>

      {/* overflow-x-auto, inte overflow-hidden: kortet rundar fortfarande hörnen,
          men på 390px är tabellen 468px bred och hidden klippte bort F, +/- och
          P — poängkolumnen gick inte att nå på mobil. */}
      <div className="rounded-2xl border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-muted-foreground">
              <th className="text-left py-3 px-4 font-medium w-8">#</th>
              <th className="text-left py-3 px-4 font-medium">Lag</th>
              <th className="text-center py-3 px-3 font-medium">M</th>
              <th className="text-center py-3 px-3 font-medium">V</th>
              <th className="text-center py-3 px-3 font-medium">O</th>
              <th className="text-center py-3 px-3 font-medium">F</th>
              <th className="text-center py-3 px-3 font-medium hidden sm:table-cell">Gjorda</th>
              <th className="text-center py-3 px-3 font-medium hidden sm:table-cell">Insläppta</th>
              <th className="text-center py-3 px-3 font-medium">+/-</th>
              <th className="text-center py-3 px-4 font-medium font-bold">P</th>
              <th className="text-center py-3 px-3 font-medium hidden md:table-cell">Form</th>
            </tr>
          </thead>
          <tbody>
            {standings.length === 0 && (
              <tr>
                <td colSpan={11} className="py-10 text-center text-muted-foreground">
                  Tabellen kunde inte hämtas just nu — uppdateras automatiskt inom en minut.
                </td>
              </tr>
            )}
            {standings.map((row) => {
              const zone = zoneFor(row.position);
              return (
              <tr key={row.team.name} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                <td className="py-3 px-4 text-muted-foreground font-mono tabular-nums">
                  <span className="inline-flex items-center gap-1.5">
                    {zone && (
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${ZONE_DOT[zone]}`}
                        aria-hidden
                      />
                    )}
                    {row.position}
                    {row.trend != null && row.trend !== 0 && (
                      <span
                        className={`text-xs leading-none ${row.trend > 0 ? "text-success" : "text-red-400"}`}
                        title={row.trend > 0 ? `Upp ${row.trend}` : `Ner ${Math.abs(row.trend)}`}
                        aria-label={row.trend > 0 ? `Klättrat ${row.trend} placeringar` : `Tappat ${Math.abs(row.trend)} placeringar`}
                      >
                        {row.trend > 0 ? "▲" : "▼"}
                      </span>
                    )}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <Link href={`/lag/${row.team.slug ?? row.team.name.toLowerCase().replace(/\s+/g, "-").replace(/[åä]/g, "a").replace(/ö/g, "o")}`} className="font-medium hover:text-pitch-ink transition-colors">
                    {row.team.name}
                  </Link>
                </td>
                <td className="py-3 px-3 text-center text-muted-foreground font-mono tabular-nums">{row.played}</td>
                <td className="py-3 px-3 text-center text-muted-foreground font-mono tabular-nums">{row.wins}</td>
                <td className="py-3 px-3 text-center text-muted-foreground font-mono tabular-nums">{row.draws}</td>
                <td className="py-3 px-3 text-center text-muted-foreground font-mono tabular-nums">{row.losses}</td>
                <td className="py-3 px-3 text-center text-muted-foreground hidden sm:table-cell font-mono tabular-nums">{row.goals_for}</td>
                <td className="py-3 px-3 text-center text-muted-foreground hidden sm:table-cell font-mono tabular-nums">{row.goals_against}</td>
                <td className="py-3 px-3 text-center text-muted-foreground font-mono tabular-nums">{row.goal_diff > 0 ? `+${row.goal_diff}` : row.goal_diff}</td>
                <td className="py-3 px-4 text-center font-bold text-foreground font-mono tabular-nums">{row.points}</td>
                <td className="py-3 px-3 text-center hidden md:table-cell">
                  <span className="flex gap-0.5 justify-center">
                    {row.form.map((r, fi) => (
                      <span key={fi} className={`w-4 h-4 rounded-sm text-[9px] font-bold flex items-center justify-center ${r === "W" ? "bg-success/20 text-success" : r === "L" ? "bg-red-400/20 text-destructive-ink" : "bg-muted text-muted-foreground"}`}>{r === "W" ? "V" : r === "L" ? "F" : "O"}</span>
                    ))}
                  </span>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {standings.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-4 px-1 text-xs text-muted-foreground">
          {(Object.keys(ZONE_LABEL) as Array<keyof typeof ZONE_LABEL>).map((z) => (
            <span key={z} className="inline-flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${ZONE_DOT[z]}`} aria-hidden />
              {ZONE_LABEL[z]}
            </span>
          ))}
        </div>
      )}

    </div>
  );
}
