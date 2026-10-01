/**
 * app/lag/[slug]/page.tsx — Kanonisk lag-hub
 * ─────────────────────────────────────────────────────────────────────────────
 * Server component: hämtar ALL data server-side (getTeamHub + teams/följda/plan/
 * insights) och skickar som props till klientlagren TeamHubHeader (lagväxlare +
 * nyckeltal) och TeamHubTabs (flikar). Ingen client-fetch — SEO bevaras via
 * generateMetadata + JSON-LD. Samma URL används av /mitt-lag (redirect hit).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { SPORT, vertical } from "@/lib/vertical";
import { isFollowing } from "@/app/actions/follows";
import {
  createServerClient,
  getTeamEntityInsights,
  getPodcastSignalsForEntities,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { getFollowedTeams } from "@/lib/dashboard/queries";
import { getUserFeedPreferences } from "@/lib/feed/getUserFeedPreferences";
import { getTeamHub } from "@/lib/team-hub/queries";
import { getHighlights } from "@/lib/highlights/queries";
import { HighlightRail } from "@/components/highlights/HighlightRail";
import { getUserPlan } from "@/lib/user-plan";
import { TeamContextTracker } from "@/components/team-hub/TeamContextTracker";
import { getTeamColors, getTeamAccent, getTeamInk } from "@/lib/team-colors";
import { TeamHubHeader } from "@/components/team-hub/TeamHubHeader";
import { TeamSection } from "@/components/team-hub/TeamSection";
import { MatchdayBanner } from "@/components/team-hub/MatchdayBanner";
import { ProductEventTracker } from "@/components/analytics/ProductEventTracker";
import { PodcastSignalsPanel } from "@/components/podcast/PodcastSignalsPanel";
import { TransferRadar } from "@/components/team-hub/TransferRadar";
import { PositionTrend } from "@/components/team-hub/PositionTrend";
import type { SwitcherTeam } from "@/components/team-hub/TeamSwitcher";
import { AppBreadcrumbs } from "@/components/ui/AppBreadcrumbs";
import { jsonLd } from "@/lib/json-ld";
import { getWebsiteSettings } from "@/lib/website-settings.server";
import { resolveShareMetadata, toNextMetadata } from "@/lib/website-settings";
import { getSiteUrl } from "@/lib/site-url";

export const revalidate = 60;

interface TeamMeta {
  name: string;
  slug: string;
  logo_url: string | null;
  league?: string;
}

async function getTeamMeta(slug: string): Promise<TeamMeta | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const db = createServerClient();
    const { data } = await db
      .from("entities")
      .select("name,slug,metadata")
      .eq("type", "team")
      .eq("sport", SPORT)
      .eq("slug", slug)
      .maybeSingle();
    if (!data) return null;
    const meta = (data.metadata ?? {}) as Record<string, unknown>;
    return {
      name: String(data.name),
      slug: String(data.slug),
      logo_url: (meta.logo_url as string | null) ?? null,
      league: typeof meta.league === "string" ? meta.league : undefined,
    };
  } catch {
    return null;
  }
}

/** Ligans sida: huvudligan på sin väg, övriga ligor via tabellens ?liga=. */
function leagueTableHref(league: string): string {
  const l = vertical.leagues.find((x) => x.name === league);
  return l?.param ? `${vertical.leaguePath}/tabell?liga=${l.param}` : vertical.leaguePath;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const team = await getTeamMeta(slug);
  if (!team) return { title: "Lag hittades inte" };
  const settings = await getWebsiteSettings();
  return toNextMetadata(
    settings,
    resolveShareMetadata(settings, {
      kind: "team",
      team: team.name,
      path: `/lag/${slug}`,
      ...(team.league ? { league: team.league } : {}),
    }),
  );
}

/** Alla lag för lagväxlaren (namn/slug/logo). */
async function getTeams(): Promise<SwitcherTeam[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const db = createServerClient();
    const { data } = await db
      .from("entities")
      .select("name,slug,sportmonks_id,metadata")
      .eq("type", "team")
      .eq("sport", SPORT)
      .order("name");
    const smIds = (data ?? []).map((t) => t.sportmonks_id).filter((id): id is number => id != null);
    const { data: teamsData } = smIds.length
      ? await db.from("teams").select("sportmonks_id,logo").in("sportmonks_id", smIds)
      : { data: [] as { sportmonks_id: number; logo: string | null }[] };
    const logoBySmId = new Map((teamsData ?? []).map((t) => [Number(t.sportmonks_id), t.logo]));
    return (data ?? [])
      .filter((t) => t.slug)
      .map((t) => {
        const meta = (t.metadata ?? {}) as Record<string, unknown>;
        const logo = logoBySmId.get(Number(t.sportmonks_id)) ?? (meta.logo_url as string | null) ?? null;
        return { name: String(t.name), slug: String(t.slug), logo_url: logo };
      });
  } catch {
    return [];
  }
}

async function getFollowedSlugs(): Promise<string[]> {
  const { userId } = await auth();
  if (!userId) return [];
  const followed = await getFollowedTeams(userId);
  return followed.map((t) => t.slug);
}

export default async function TeamHubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { userId } = await auth();
  const feedPrefs = userId ? await getUserFeedPreferences() : null;
  const newsTags = feedPrefs?.newsTags ?? null;

  const hub = await getTeamHub(slug, userId ? { newsTags } : undefined);
  if (!hub) {
    return (
      <div className="w-full px-6 sm:px-8 py-16 text-center">
        <h1 className="font-bold text-4xl text-foreground mb-4 text-balance">Lag hittades inte</h1>
        <p className="text-muted-foreground">Laget <strong>{slug}</strong> finns inte i systemet ännu.</p>
      </div>
    );
  }

  const [teams, followedSlugs, plan, insights, following, podcastClips, highlights] =
    await Promise.all([
      getTeams(),
      getFollowedSlugs(),
      getUserPlan(),
      getTeamEntityInsights(hub.team.id, 2),
      isFollowing(hub.team.id),
      getPodcastSignalsForEntities([hub.team.id], { limit: 2, teamNames: [hub.team.name] }),
      getHighlights({ teamEntityId: hub.team.id, limit: 10 }),
    ]);

  const teamJsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsTeam",
    name: hub.team.name,
    sport: vertical.schemaSport,
    url: `${getSiteUrl()}/lag/${hub.team.slug}`,
    memberOf: {
      "@type": "SportsOrganization",
      name: hub.team.league,
      url: `${getSiteUrl()}${leagueTableHref(hub.team.league)}`,
    },
    ...(hub.team.logo_url ? { logo: hub.team.logo_url, image: hub.team.logo_url } : {}),
  };

  const colors = getTeamColors(hub.team.slug);
  const ink = getTeamInk(hub.team.slug);

  return (
    <div
      className="max-w-6xl mx-auto pb-6"
      style={
        {
          "--team-accent": getTeamAccent(hub.team.slug),
          "--team-accent-2": colors.secondary,
          // Klubbfärgen som TEXT behöver egen valör per tema — se getTeamInk().
          "--team-ink-light": ink.light,
          "--team-ink-dark": ink.dark,
        } as React.CSSProperties
      }
    >
      {/* Klubbfärgad accentlinje (audit T6) — gradientStops om laget har fler än 2 klubbfärger */}
      <div
        className="h-1.5 rounded-b-full"
        style={{
          background: colors.gradientStops
            ? `linear-gradient(90deg, ${colors.gradientStops.join(", ")})`
            : `linear-gradient(90deg, ${colors.primary} 0%, ${colors.secondary} 100%)`,
        }}
        aria-hidden
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(teamJsonLd) }} />
      <TeamContextTracker slug={hub.team.slug} name={hub.team.name} logo_url={hub.team.logo_url} />
      <ProductEventTracker
        event="team_hub_opened"
        props={{ team_slug: hub.team.slug, team_id: hub.team.id }}
      />

      <div className="px-4 sm:px-6 pt-1.5 pb-0">
        <AppBreadcrumbs
          items={[
            { label: hub.team.league, href: leagueTableHref(hub.team.league) },
            { label: hub.team.name },
          ]}
        />
      </div>

      <TeamHubHeader
        teams={teams}
        followedSlugs={followedSlugs}
        currentSlug={hub.team.slug}
        team={{ name: hub.team.name, logo_url: hub.team.logo_url }}
        position={hub.position}
        league={hub.team.league}
        form={hub.form}
        stats={hub.stats}
        entityId={hub.team.id}
        initialFollowing={following}
      />

      <MatchdayBanner teamName={hub.team.name} recent={hub.recent} upcoming={hub.upcoming} />

      {/* Brief-ritualen ligger uteslutande på /mitt-lag. Den är den personliga
          dagliga vanan; laghubben är lagets permanenta uppslagsverk och ska inte
          vara ett andra hem för samma innehåll (produktbrief, problem 1). */}

      {/* Poddarna låg tidigare här, direkt efter matchbannern — före lagets egen
          trend, transferradar och nyheter. Ett laghubb ska leda med matchen och
          lagets eget innehåll; poddar är en stödmodul och har dessutom en egen
          flik. De ligger nu sist. */}

      <TeamSection section="oversikt" hub={hub} plan={plan} insights={insights} />

      <PositionTrend teamSlug={hub.team.slug} />

      <TransferRadar teamSlug={hub.team.slug} plan={plan} teamName={hub.team.name} />

      {highlights.length > 0 && (
        <div className="mt-6">
          <HighlightRail highlights={highlights} title={`Höjdpunkter · ${hub.team.name}`} />
        </div>
      )}

      <div className="mx-4 sm:mx-6 mt-6">
        <PodcastSignalsPanel
          signals={podcastClips}
          plan={plan}
          teamSlug={hub.team.slug}
          title={`Podcast om ${hub.team.name}`}
        />
      </div>
    </div>
  );
}
