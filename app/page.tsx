import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AthopiaLanding, { type LandingArticle } from "@/components/landing/AthopiaLanding";
import { SportFront } from "@/components/landing/SportFront";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { getLandingCopy } from "@/lib/landing-copy";
import { ProductEventTracker } from "@/components/analytics/ProductEventTracker";
import { absoluteUrl, getSiteUrl } from "@/lib/site-url";
import { jsonLd } from "@/lib/json-ld";
import { isWaitlistMode } from "@/lib/waitlist/mode";
import { getWebsiteSettings } from "@/lib/website-settings.server";
import { resolveShareMetadata, toNextMetadata } from "@/lib/website-settings";
import { SPORT, VERTICAL, vertical } from "@/lib/vertical";
import { contentCutoffIso } from "@/lib/content-window";

// ISR: servera cachad HTML direkt (snabb laddning), regenerera i bakgrunden.
// Tidigare 'force-dynamic' gjorde att varje besök blockerade på en Supabase-query
// (upp till 25s timeout) innan sidan renderades.
export const revalidate = 120;

const SITE = getSiteUrl();

const SEO_KEYWORDS = [
  "Allsvenskan", "Allsvenskan 2026", "Allsvenskan tabell", "Allsvenskan resultat",
  "Allsvenskan matcher", "Allsvenskan statistik", "Allsvenskan live", "Allsvenskan idag",
  "Allsvenskan spelschema", "Allsvenskan skytteliga", "svensk fotboll", "fotboll Allsvenskan",
  "AIK", "Djurgården", "Hammarby", "Malmö FF", "IFK Göteborg", "Häcken",
  "Allsvenskan nyheter", "Allsvenskan matchanalys", "Allsvenskan poängliga", "Allsvenskan statistik",
];

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getWebsiteSettings();
  const resolved = resolveShareMetadata(settings, { kind: "home" });
  return {
    ...toNextMetadata(settings, resolved),
    keywords: VERTICAL === "football" ? SEO_KEYWORDS : [...vertical.seoKeywords],
  };
}

async function getLatestArticles(): Promise<LandingArticle[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from("articles")
      .select("*")
      .eq("status", "published")
      .eq("is_processed", true)
      .eq("sport", SPORT)
      .gte("published_at", contentCutoffIso())
      .order("published_at", { ascending: false })
      .limit(6);

    return ((data as Record<string, unknown>[] | null) ?? [])
      .map((row): LandingArticle => ({
        id: String(row.id ?? ""),
        slug: String(row.slug ?? ""),
        title: String(row.title ?? ""),
        summary: String(row.summary ?? row.ai_summary ?? ""),
        sourceName: String(row.source_name ?? row.sourceName ?? vertical.productName),
        publishedAt: String(row.published_at ?? row.publishedAt ?? row.created_at ?? ""),
      }))
      .filter((a) => a.slug && a.title);
  } catch {
    return [];
  }
}

function LandingJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE}/#website`,
        name: vertical.productName,
        url: SITE,
        inLanguage: "sv-SE",
        description:
          VERTICAL !== "football"
            ? vertical.leagueDescription
            : "Allsvenskan 2026 — tabell, resultat, matcher, skytteliga, statistik, matchanalyser och forum för alla 16 lag.",
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: absoluteUrl("/nyheter?q={search_term_string}") },
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "SportsOrganization",
        "@id": `${SITE}/#${vertical.leaguePath.slice(1)}`,
        name: vertical.leagueEntity,
        sport: vertical.schemaSport,
        url: absoluteUrl(vertical.leaguePath),
      },
    ],
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />;
}

export default async function LandingPage() {
  // Hockey och golf har sitt hem på en egen väg (/shl, /golf) inne i app-skalet.
  if (VERTICAL !== "football") redirect(vertical.leaguePath);
  // Inloggad-redirect hanteras i proxy.ts (edge, ingen currentUser()-call här)
  // så denna route förblir statisk/ISR-cachebar (revalidate=120) för alla
  // utloggade besökare — se LCP-utredning i proxy.ts.
  // Potten läses inte här: ISR 120 s skulle visa Founder efter att platserna
  // tagit slut. AthopiaLanding hämtar /api/pricing/state (30 s, fail-closed).
  const [articles, pulse, clubs, heroCopy] = await Promise.all([
    getLatestArticles(),
    getHeroPulse(),
    getClubChips(),
    getLandingCopy(),
  ]);
  const waitlistMode = isWaitlistMode();
  return (
    <>
      <LandingJsonLd />
      <ProductEventTracker event="landing_view" once="landing_view" onceScope="session" />
      <AthopiaLanding
        articles={articles}
        pulse={pulse}
        clubs={clubs}
        heroCopy={heroCopy}
        waitlistMode={waitlistMode}
        sportSlot={<SportFront articles={articles} />}
      />
    </>
  );
}

/** Riktig sportpuls i heron: live-match eller nästa avspark + serieledaren. */
async function getHeroPulse() {
  if (VERTICAL !== "football") {
    return { live: false, matchName: null, matchId: null, kickoff: null, leaderName: null, leaderPoints: null };
  }
  try {
    const [{ fetchLiveScores, fetchAllsvenskanFixtures, fetchStandingsFull }] = await Promise.all([
      import("@/lib/db/fixtures"),
    ]);
    const [live, fixtures, standings] = await Promise.all([
      fetchLiveScores(),
      fetchAllsvenskanFixtures(),
      fetchStandingsFull(),
    ]);
    const liveMatch = live[0] ?? null;
    const next = fixtures
      .filter((f) => f.state?.short_name === "NS" && new Date(f.starting_at).getTime() > Date.now())
      .sort((a, b) => new Date(a.starting_at).getTime() - new Date(b.starting_at).getTime())[0] ?? null;
    const leader = standings[0] ?? null;
    const match = liveMatch ?? next;
    return {
      live: !!liveMatch,
      matchName: match?.name ?? null,
      matchId: match?.id ?? null,
      kickoff: match?.starting_at ?? null,
      leaderName: leader?.team.name ?? null,
      leaderPoints: leader?.points ?? null,
    };
  } catch {
    return { live: false, matchName: null, matchId: null, kickoff: null, leaderName: null, leaderPoints: null };
  }
}

/** Alla 16 klubbar för hero-klubbväljaren. */
async function getClubChips() {
  if (VERTICAL !== "football") return [];
  try {
    const { fetchTeamsWithSlugs } = await import("@/lib/db/fixtures");
    const teams = await fetchTeamsWithSlugs();
    return teams
      .filter((t) => t.slug)
      .map((t) => ({ slug: t.slug as string, name: t.name, shortCode: t.short_code }));
  } catch {
    return [];
  }
}
