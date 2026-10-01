import type { Metadata } from "next";
import Link from "next/link";
import { fetchAllsvenskanFixtures } from "@/lib/db/fixtures";
import type { SMFixture } from "@/lib/db/fixtures";
import { AppBreadcrumbs } from "@/components/ui/AppBreadcrumbs";
import { jsonLd } from "@/lib/json-ld";
import { VERTICAL, leagueHref, vertical, leagueFromParam } from "@/lib/vertical";
import { LeagueSwitcher } from "@/components/ui/LeagueSwitcher";
import { getSiteUrl } from "@/lib/site-url";

export const revalidate = 60;

const TITLE =
  VERTICAL === "hockey"
    ? "SHL Resultat 2026/27 – Alla Matchresultat"
    : "Allsvenskan Resultat 2026 – Alla Matchresultat";
const CANONICAL =
  `${getSiteUrl()}${leagueHref("/resultat")}`;

export const metadata: Metadata = {
  title: TITLE,
  description:
    VERTICAL === "hockey"
      ? "Matchresultat från SHL 2026/27. Visas när de finns."
      : "Samtliga matchresultat från Allsvenskan 2026, omgång för omgång. Live-uppdaterat.",
  alternates: { canonical: CANONICAL },
  openGraph: {
    type: "website",
    locale: "sv_SE",
    url: CANONICAL,
    title: TITLE,
    description: VERTICAL === "hockey" ? "Matchresultat från SHL 2026/27." : "Samtliga matchresultat från Allsvenskan 2026.",
  },
};

function getScore(f: SMFixture): { home: number; away: number } | null {
  const home = f.scores?.find(s => s.score.participant === "home")?.score.goals;
  const away = f.scores?.find(s => s.score.participant === "away")?.score.goals;
  if (home == null || away == null) return null;
  return { home, away };
}

function getParticipantName(f: SMFixture, location: "home" | "away"): string {
  const p = f.participants?.find(
    (p) => (p as unknown as Record<string, unknown>).location === location
  );
  return (p as unknown as Record<string, unknown>)?.name as string ?? "—";
}

export default async function AllsvenskanResultatPage({
  searchParams,
}: {
  searchParams: Promise<{ liga?: string }>;
}) {
  const league = leagueFromParam((await searchParams).liga);
  const leagueName = league ?? vertical.leagueName;
  const fixtures = await fetchAllsvenskanFixtures(league).catch(() => [] as SMFixture[]);
  const finished = fixtures
    .filter(f => f.state?.short_name === "FT" || f.state?.state === "finished")
    .sort((a, b) => new Date(b.starting_at).getTime() - new Date(a.starting_at).getTime());

  return (
    <div className="w-full px-4 sm:px-8 py-10 max-w-3xl mx-auto">
      <div className="mb-4">
        <AppBreadcrumbs
          items={[
            { label: vertical.leagueName, href: vertical.leaguePath },
            { label: "Resultat" },
          ]}
        />
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: vertical.leagueName, item: `${getSiteUrl()}${vertical.leaguePath}` },
          { "@type": "ListItem", position: 2, name: "Resultat", item: CANONICAL },
        ],
      })}} />

      <h1 className="font-bold text-4xl sm:text-5xl text-foreground mb-2 text-balance">{VERTICAL === "hockey" ? `${leagueName.toUpperCase()} RESULTAT 2026/27` : `${leagueName.toUpperCase()} RESULTAT 2026`}</h1>
      <LeagueSwitcher basePath={leagueHref("/resultat")} active={league} />
      <p className="text-muted-foreground mb-8">Alla matchresultat — senaste matchen visas först.</p>

      {finished.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card px-4 py-10 text-center text-muted-foreground">
          <p>Säsongen har inte sparkat igång än — inga matcher är spelade.</p>
          <Link href={leagueHref("/spelschema")} className="mt-2 inline-block text-sm text-pitch-ink hover:underline">
            Se spelschemat →
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {finished.map(f => {
            const score = getScore(f);
            const home = getParticipantName(f, "home");
            const away = getParticipantName(f, "away");
            return (
              <Link
                key={f.id}
                href={`/match/${f.id}`}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-4 hover:border-pitch/50 transition-colors"
              >
                <span className="font-medium w-[38%] text-right truncate">{home}</span>
                <span className="mx-4 font-bold text-lg font-mono tabular-nums shrink-0">
                  {score ? `${score.home}–${score.away}` : "—"}
                </span>
                <span className="font-medium w-[38%] truncate">{away}</span>
                <span className="text-xs text-muted-foreground ml-4 shrink-0 hidden sm:block">
                  {new Date(f.starting_at).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm", day: "numeric", month: "short" })}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex gap-4 text-sm">
        <Link href={`${vertical.leaguePath}/tabell`} className="text-pitch-ink hover:underline">Tabell →</Link>
        <Link href={`${vertical.leaguePath}/spelschema`} className="text-pitch-ink hover:underline">Spelschema →</Link>
      </div>
    </div>
  );
}
