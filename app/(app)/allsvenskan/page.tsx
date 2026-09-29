import type { Metadata } from "next";
import Link from "next/link";
import { TrackedLink } from "@/components/analytics/TrackedLink";
import { ArticleCard } from "@/components/ui/ArticleCard";
import { AthleticFeedRow } from "@/components/news/AthleticFeed";
import { ScoreWidget } from "@/components/ui/ScoreWidget";
import { Separator } from "@/components/ui/separator";
import { getNarratives, getFilteredArticles } from "@/lib/supabase";
import { fetchAllsvenskanFixtures, fetchStandingsFull } from "@/lib/db/fixtures";
import { getTopScorersFromDb, SEASON_IDS } from "@/lib/statistik";
import { FixturesTicker } from "@/components/ui/FixturesTicker";
import { jsonLd } from "@/lib/json-ld";
import { leagueHref, VERTICAL, vertical } from "@/lib/vertical";
import { getSiteUrl } from "@/lib/site-url";

export const revalidate = 60;

const LEAGUE_CANONICAL =
  `${getSiteUrl()}${leagueHref()}`;

export const metadata: Metadata = {
  title: vertical.leagueTitle,
  description: vertical.leagueDescription,
  alternates: { canonical: LEAGUE_CANONICAL },
  openGraph: {
    type: "website",
    locale: "sv_SE",
    url: LEAGUE_CANONICAL,
    title: vertical.leagueTitle,
    description: vertical.leagueShareDescription,
  },
};

const NEWS_PREVIEW_LIMIT = 12;
const NEWS_MORE_LIMIT = 8;
const STANDINGS_PREVIEW_ROWS = 8;
const FIXTURES_PREVIEW_LIMIT = 5;
const SCORERS_PREVIEW_ROWS = 5;

function AllsvenskanJsonLd() {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({
      "@context": "https://schema.org",
      "@type": "SportsOrganization",
      "@id": `${LEAGUE_CANONICAL}#${vertical.leagueName.toLowerCase()}`,
      name: vertical.leagueName,
      sport: vertical.schemaSport,
      url: LEAGUE_CANONICAL,
      description: vertical.leagueJsonLdDescription,
    })}} />
  );
}

export default async function AllsvenskanPage() {
  const [narratives, { articles: allArticles }, standings, fixtures, scorers] = await Promise.all([
    getNarratives(1).catch(() => []),
    getFilteredArticles({ visa: "all", limit: NEWS_PREVIEW_LIMIT + NEWS_MORE_LIMIT }).catch(() => ({ articles: [], total: 0 })),
    fetchStandingsFull().catch(() => []),
    fetchAllsvenskanFixtures().catch(() => []),
    vertical.id === "football"
      ? getTopScorersFromDb(SEASON_IDS["2026"] ?? "").catch(() => [])
      : Promise.resolve([]),
  ]);

  const topStory = narratives[0] ?? null;
  const articles = allArticles.slice(0, NEWS_PREVIEW_LIMIT);
  const moreArticles = allArticles.slice(NEWS_PREVIEW_LIMIT, NEWS_PREVIEW_LIMIT + NEWS_MORE_LIMIT);
  const topScorers = scorers.slice(0, SCORERS_PREVIEW_ROWS);
  const hasForm = standings.length > 0 && standings.some((row) => row.form.length > 0);

  return (
    <div className="w-full px-6 sm:px-8 py-10">
      <AllsvenskanJsonLd />
      <div className="-mx-6 sm:-mx-8 -mt-10 mb-6">
        <FixturesTicker />
      </div>
      <div className="mb-8">
        <h1 className="font-bold text-5xl text-foreground text-balance">{vertical.leagueHeading}</h1>
        <p className="text-muted-foreground mt-2">{vertical.leagueSubtitle}</p>
        {vertical.paused ? (
          <p className="text-muted-foreground mt-2 max-w-xl">
            Intaget är pausat. Tabell, matcher och artiklar visas när de finns — inga utfyllnadssiffror.
          </p>
        ) : null}
        <div className="flex gap-2 flex-wrap mt-4">
          {[
            { href: leagueHref("/tabell"), label: "Tabell" },
            { href: leagueHref("/spelschema"), label: "Spelschema" },
            { href: leagueHref("/skytteliga"), label: vertical.id === "hockey" ? "Poängliga" : "Skytteliga" },
            { href: leagueHref("/resultat"), label: "Resultat" },
            { href: "/statistik", label: "Statistik" },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:border-pitch/40 hover:text-pitch-ink active:scale-[0.97] touch-manipulation"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {topStory && (
        <Link
          href={`/narrativ/${topStory.id}`}
          className="mb-8 block rounded-2xl border border-border bg-card p-6 transition-colors hover:border-pitch/40"
        >
          <span className="text-xs font-medium uppercase tracking-wider text-pitch-ink">Dagens story</span>
          <h2 className="mt-2 font-bold text-2xl text-foreground text-balance">{topStory.topic}</h2>
          {topStory.description && (
            <p className="mt-2 text-muted-foreground line-clamp-2">{topStory.description}</p>
          )}
          <span className="mt-3 inline-block text-sm text-muted-foreground">
            {topStory.sourceCount} källor
          </span>
        </Link>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8">
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-2xl text-foreground text-balance">NYHETER</h2>
            {/* Explicit scope: utan den defaultade /nyheter till "for-you" och
                visade anvandarens favoritlag under rubriken "Alla nyheter". */}
            <TrackedLink
              href="/nyheter?scope=allsvenskan&sort=latest"
              event="allsvenskan_news_opened"
              props={{ source_page: "allsvenskan", active_scope: "allsvenskan" }}
              className="text-sm text-pitch-ink hover:underline"
            >
              Alla nyheter →
            </TrackedLink>
          </div>
          {articles.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {articles.map((a, i) => (
                <ArticleCard key={a.id} article={a} size="md" priority={i === 0} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
              Inga nyheter tillgängliga just nu.
            </div>
          )}

          {moreArticles.length > 0 && (
            <div className="mt-8">
              <h3 className="mb-2 font-semibold text-lg text-foreground text-balance">Fler nyheter</h3>
              <div className="rounded-2xl border border-border bg-card px-4">
                {moreArticles.map((a) => (
                  <AthleticFeedRow key={a.id} article={a} />
                ))}
              </div>
            </div>
          )}

          {(articles.length > 0 || moreArticles.length > 0) && (
            <div className="mt-6">
              <TrackedLink
                href="/nyheter?scope=allsvenskan&sort=latest"
                event="allsvenskan_news_opened"
                props={{ source_page: "allsvenskan", active_scope: "allsvenskan" }}
                className="inline-flex items-center justify-center rounded-full bg-pitch px-5 py-2.5 text-sm font-medium text-white hover:bg-pitch/90 transition-colors"
              >
                Alla nyheter →
              </TrackedLink>
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-8">
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-2xl text-foreground text-balance">TABELL</h2>
              <Link href={leagueHref("/tabell")} className="text-sm text-pitch-ink hover:underline">
                Hela tabellen →
              </Link>
            </div>
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {standings.slice(0, STANDINGS_PREVIEW_ROWS).map((row) => (
                    <tr key={row.team.id} className="border-b border-border/50 last:border-0">
                      <td className="p-3 text-muted-foreground font-mono tabular-nums w-8">{row.position}</td>
                      <td className="p-3 text-foreground">
                        <Link
                          href={`/lag/${row.team.slug ?? ""}`}
                          className="hover:text-pitch-ink"
                        >
                          {row.team.name}
                        </Link>
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums text-muted-foreground w-12">{row.goal_diff > 0 ? `+${row.goal_diff}` : row.goal_diff}</td>
                      <td className="p-3 text-right font-mono tabular-nums font-medium text-foreground w-10">{row.points}</td>
                      {hasForm && (
                        <td className="p-3">
                          <div className="flex items-center justify-end gap-1">
                            {row.form.map((result, i) => (
                              <span
                                key={i}
                                aria-label={result === "W" ? "Vinst" : result === "L" ? "Förlust" : "Oavgjort"}
                                title={result === "W" ? "Vinst" : result === "L" ? "Förlust" : "Oavgjort"}
                                className={`h-2 w-2 rounded-full ${
                                  result === "W"
                                    ? "bg-success"
                                    : result === "L"
                                      ? "bg-destructive"
                                      : "bg-muted-foreground/40"
                                }`}
                              />
                            ))}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                  {standings.length === 0 && (
                    <tr>
                      <td className="p-4 text-center text-muted-foreground">
                        Ingen tabell tillgänglig ännu.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h2 className="mb-4 font-semibold text-2xl text-foreground text-balance">MATCHER</h2>
            <div className="flex flex-col gap-3">
              {fixtures.slice(0, FIXTURES_PREVIEW_LIMIT).map((f) => (
                <ScoreWidget key={f.id} fixture={f} />
              ))}
              {fixtures.length === 0 && (
                <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
                  Inga matcher hittades just nu.
                </div>
              )}
            </div>
            <Separator className="my-4" />
            <Link href="/match" className="text-sm text-pitch-ink hover:underline">
              Alla matcher →
            </Link>
          </div>

          {topScorers.length > 0 && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-semibold text-2xl text-foreground text-balance">SKYTTELIGA</h2>
                <Link href={leagueHref("/skytteliga")} className="text-sm text-pitch-ink hover:underline">
                  Hela skytteligan →
                </Link>
              </div>
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    {topScorers.map((s, i) => (
                      <tr key={s.player_id ?? i} className="border-b border-border/50 last:border-0">
                        <td className="p-3 text-muted-foreground font-mono tabular-nums w-8">{i + 1}</td>
                        <td className="p-3 text-foreground">
                          {s.slug ? (
                            <Link href={`/spelare/${s.slug}`} className="hover:text-pitch-ink">
                              {s.player_name}
                            </Link>
                          ) : (
                            s.player_name
                          )}
                        </td>
                        <td className="p-3 text-muted-foreground">{s.team_name}</td>
                        <td className="p-3 text-right font-mono tabular-nums font-medium text-foreground w-10">{s.goals}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
