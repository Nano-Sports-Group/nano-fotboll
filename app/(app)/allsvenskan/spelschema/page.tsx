import { smFixtureHref } from "@/lib/match/slug";
import type { Metadata } from "next";
import Link from "next/link";
import { fetchAllsvenskanFixtures } from "@/lib/db/fixtures";
import type { SMFixture } from "@/lib/db/fixtures";
import { AppBreadcrumbs } from "@/components/ui/AppBreadcrumbs";
import { VERTICAL, leagueHref, vertical, leagueFromParam } from "@/lib/vertical";
import { LeagueSwitcher } from "@/components/ui/LeagueSwitcher";
import { getSiteUrl } from "@/lib/site-url";

export const revalidate = 1800;

const TITLE =
  VERTICAL === "hockey"
    ? "SHL Spelschema 2026/27 – Alla Omgångar & Datum"
    : "Allsvenskan Spelschema 2026 – Alla Omgångar & Datum";
const CANONICAL =
  `${getSiteUrl()}${leagueHref("/spelschema")}`;

export const metadata: Metadata = {
  title: TITLE,
  description:
    VERTICAL === "hockey"
      ? "Spelschema för SHL 2026/27 med datum och tider. Visas när matcherna finns."
      : "Komplett spelschema för Allsvenskan 2026 med datum och tider. Hitta din lags nästa match.",
  alternates: { canonical: CANONICAL },
  openGraph: {
    type: "website",
    locale: "sv_SE",
    url: CANONICAL,
    title: TITLE,
    description: VERTICAL === "hockey" ? "Spelschema för SHL 2026/27." : "Komplett spelschema för Allsvenskan 2026.",
  },
};

function getHomeTeam(f: SMFixture) {
  return f.participants?.find(p => (p as unknown as Record<string,unknown>).location === "home");
}
function getAwayTeam(f: SMFixture) {
  return f.participants?.find(p => (p as unknown as Record<string,unknown>).location === "away");
}

export default async function AllsvenskanSpelschemePage({
  searchParams,
}: {
  searchParams: Promise<{ liga?: string }>;
}) {
  const league = leagueFromParam((await searchParams).liga);
  const leagueName = league ?? vertical.leagueName;
  const fixtures = await fetchAllsvenskanFixtures(league).catch(() => [] as SMFixture[]);
  const upcoming = fixtures
    .filter(f => f.state?.short_name === "NS")
    .sort((a, b) => new Date(a.starting_at).getTime() - new Date(b.starting_at).getTime());

  return (
    <div className="w-full px-4 sm:px-8 py-10 max-w-3xl mx-auto">
      <div className="mb-6">
        <AppBreadcrumbs
          items={[
            { label: vertical.leagueName, href: vertical.leaguePath },
            { label: "Spelschema" },
          ]}
        />
      </div>

      <h1 className="font-bold text-4xl sm:text-5xl text-foreground mb-2 text-balance">{VERTICAL === "hockey" ? `${leagueName.toUpperCase()} SPELSCHEMA 2026/27` : `${leagueName.toUpperCase()} SPELSCHEMA 2026`}</h1>
      <LeagueSwitcher basePath={leagueHref("/spelschema")} active={league} />
      <p className="text-muted-foreground mb-8">{VERTICAL === "hockey" ? "Nästa omgångar i SHL 2026/27." : "Nästa omgångar i Allsvenskan 2026."}</p>

      {upcoming.length === 0 ? (
        <p className="text-muted-foreground">Inga kommande matcher just nu.</p>
      ) : (
        <div className="space-y-2">
          {upcoming.map(f => {
            const home = getHomeTeam(f);
            const away = getAwayTeam(f);
            return (
              <Link
                key={f.id}
                href={smFixtureHref(f)}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-4 hover:border-pitch/50 transition-colors"
              >
                <div className="flex items-center gap-4 flex-1">
                  <span className="font-medium text-right w-[40%] truncate">{(home as unknown as Record<string,unknown>)?.name as string ?? "—"}</span>
                  <span className="text-muted-foreground text-sm shrink-0">vs</span>
                  <span className="font-medium w-[40%] truncate">{(away as unknown as Record<string,unknown>)?.name as string ?? "—"}</span>
                </div>
                <span className="text-xs text-muted-foreground ml-4 shrink-0">
                  {new Date(f.starting_at).toLocaleString("sv-SE", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" })}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-8 flex gap-4 text-sm">
        <Link href={`${vertical.leaguePath}/tabell`} className="text-pitch-ink hover:underline">Tabell →</Link>
        <Link href={leagueHref("/skytteliga")} className="text-pitch-ink hover:underline">{vertical.scorersLabel} →</Link>
      </div>
    </div>
  );
}
