import { SPORT } from "@/lib/vertical";
/**
 * Server-directed Home feed modules (B-05).
 * Client owns rendering; server owns type/order/content.
 *
 * Module priority (architecture): live_match → headline_stack → short_post →
 * standings_snapshot → audio_briefing → discussion (+ podcast).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { FeedModuleSchema } from "@/lib/api-schemas";
import type { Plan } from "@/lib/access-rules";
import { canAccess } from "@/lib/access-rules";
import { fetchStandingsFull, fetchLiveScores, fetchUpcomingFixtures, parseFixtureScore } from "@/lib/db/fixtures";
import { listenMetaFromRow } from "@/lib/podcast/spotify";
import { rankFeedModules } from "@/lib/feed/rank-feed-modules";
import { mapNewsFeedRow } from "@/lib/feed/map-feed-row";
import {
  articlePublicPath,
  canPublishBody,
  resolveRightsStatus,
} from "@/lib/provenance";
import { getDailyEpisodeForShareCached } from "@/lib/team-hub/queries";
import { contentCutoffIso } from "@/lib/content-window";

export type FeedModule = z.infer<typeof FeedModuleSchema>;


export type BuildFeedModulesOptions = {
  /** Effective plan for access flags (never include signed audio URLs). */
  plan?: Plan;
};

export async function buildFeedModules(
  db: SupabaseClient,
  opts: BuildFeedModulesOptions = {},
): Promise<FeedModule[]> {
  const plan = opts.plan ?? "free";
  const candidates: FeedModule[] = [];

  const [liveFixtures, upcomingFixtures, headlinesRes, shortPostRes, podcastRes, forumRes, standings, daily] =
    await Promise.all([
      fetchLiveScores().catch(() => []),
      fetchUpcomingFixtures(3, 7).catch(() => []),
      db
        .from("news_feed_clustered")
        .select(
          "id, title, source_name, url, published_at, summary, importance_score, feed_score, news_tag, source_count, story_cluster_id, push_priority, slug, rights_status, is_athopia_generated",
        )
        .eq("sport", SPORT)
        .gte("published_at", contentCutoffIso())
        .order("feed_score", { ascending: false, nullsFirst: false })
        .limit(4),
      db
        .from("articles")
        .select(
          "id, slug, title, summary, published_at, news_tag, source_count, rights_status, is_athopia_generated",
        )
        .eq("sport", SPORT)
        .eq("status", "published")
        .eq("is_athopia_generated", true)
        .gte("published_at", contentCutoffIso())
        .order("published_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("podcasts")
        .select(
          "id, title, show_name, published_at, metadata, audio_url, rss_sources!inner(sport)",
        )
        .eq("rss_sources.sport", SPORT)
        .gte("published_at", contentCutoffIso())
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("forum_posts")
        .select(
          "id, content, author_name, team_slug, like_count, reply_count, created_at, hot_score, depth",
        )
        .eq("sport", SPORT)
        .eq("status", "published")
        .eq("depth", 0)
        .order("hot_score", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
      fetchStandingsFull().catch(() => []),
      getDailyEpisodeForShareCached().catch(() => null),
    ]);

  // 1. LIVE hero
  const live = liveFixtures[0];
  if (live) {
    const { home, away, homeGoals, awayGoals, liveMinute } =
      parseFixtureScore(live);
    candidates.push({
      id: `mod_live_${live.id}`,
      type: "live_match",
      schemaVersion: 1,
      tracking: { reason: "live_match", position: 2 },
      payload: {
        fixtureId: live.id,
        status: "LIVE",
        minute: liveMinute,
        homeName: home?.name ?? "?",
        awayName: away?.name ?? "?",
        homeSlug: home?.slug ?? null,
        awaySlug: away?.slug ?? null,
        scoreHome: homeGoals,
        scoreAway: awayGoals,
        startingAt: live.starting_at,
      },
    });
  } else if (upcomingFixtures.length > 0) {
    // 1b. Upcoming strip when nothing is live (avoid double match density with LIVE)
    candidates.push({
      id: "mod_upcoming",
      type: "upcoming_matches",
      schemaVersion: 1,
      tracking: { reason: "upcoming_window", position: 2 },
      payload: {
        matches: upcomingFixtures.slice(0, 3).map((fx) => {
          const { home, away } = parseFixtureScore(fx);
          return {
            fixtureId: fx.id,
            homeName: home?.name ?? "?",
            awayName: away?.name ?? "?",
            homeSlug: home?.slug ?? null,
            awaySlug: away?.slug ?? null,
            startingAt: fx.starting_at,
          };
        }),
      },
    });
  }

  // 2. Headline stack — titles + links only (no third-party body)
  if (headlinesRes.data && !headlinesRes.error && headlinesRes.data.length > 0) {
    const headlines = headlinesRes.data.map((row) => {
      const item = mapNewsFeedRow(
        row as Parameters<typeof mapNewsFeedRow>[0],
      );
      return {
        id: item.id,
        title: item.title,
        href: item.href,
        source: item.source,
        publishedAt: item.time,
        importanceTier: item.importanceTier ?? null,
        newsTag: item.newsTag ?? null,
      };
    });
    candidates.push({
      id: "mod_headlines_top",
      type: "headline_stack",
      schemaVersion: 1,
      tracking: { reason: "top_headlines", position: 4 },
      payload: { headlines },
    });
  }

  // 3. Short Athopia-owned editorial (snippet only when body may be published)
  if (shortPostRes.data && !shortPostRes.error) {
    const a = shortPostRes.data as {
      id: string;
      slug: string | null;
      title: string;
      summary: string | null;
      published_at: string | null;
      news_tag: string | null;
      source_count: number | null;
      rights_status: string | null;
      is_athopia_generated: boolean | null;
    };
    const rights = resolveRightsStatus(a);
    if (canPublishBody(rights) && a.slug) {
      const href = articlePublicPath({
        slug: a.slug,
        rights_status: a.rights_status,
        is_athopia_generated: a.is_athopia_generated,
      });
      const snippet = (a.summary ?? "").trim().slice(0, 240);
      candidates.push({
        id: `mod_short_${a.id}`,
        type: "short_post",
        schemaVersion: 1,
        tracking: { reason: "athopia_editorial", position: 8 },
        payload: {
          id: a.id,
          slug: a.slug,
          title: a.title,
          snippet: snippet || null,
          href,
          publishedAt: a.published_at,
          newsTag: a.news_tag,
          sourceCount: a.source_count,
        },
      });
    }
  }

  if (podcastRes.data && !podcastRes.error) {
    const p = podcastRes.data as {
      id: string;
      title: string;
      show_name: string | null;
      published_at: string | null;
      metadata: Record<string, unknown> | null;
      audio_url: string | null;
    };
    const listen = listenMetaFromRow(p.metadata, null, p.audio_url);
    const listenUrl = listen.spotifyEpisodeId
      ? `https://open.spotify.com/episode/${listen.spotifyEpisodeId}`
      : listen.spotifyShowId
        ? `https://open.spotify.com/show/${listen.spotifyShowId}`
        : listen.listenUrl;
    candidates.push({
      id: `mod_podcast_${p.id}`,
      type: "podcast",
      schemaVersion: 1,
      tracking: { reason: "latest_podcast", position: 4 },
      payload: {
        id: p.id,
        title: p.title,
        showName: p.show_name ?? "Podcast",
        publishedAt: p.published_at,
        listenUrl,
        spotifyEpisodeId: listen.spotifyEpisodeId,
      },
    });
  }

  if (forumRes.data && !forumRes.error) {
    const t = forumRes.data as {
      id: string;
      content: string;
      author_name: string | null;
      team_slug: string | null;
      like_count: number | null;
      reply_count: number | null;
      created_at: string | null;
    };
    const snippet = t.content.trim();
    const title =
      snippet.split("\n")[0]?.slice(0, 120) || "Diskussion";
    // "SNACKIS JUST NU" påstår att något diskuteras. Utan tröskel lyfte modulen
    // först ett inlägg som bara löd "Hej!", och därefter en automatpostad
    // matchtråd utan ett enda svar — båda gånger ett falskt påstående på
    // förstasidan. Kräv att någon faktiskt reagerat. Finns ingen sådan tråd
    // renderas modulen inte alls, vilket är rätt: säg inte att folk snackar
    // när ingen gör det.
    const harEngagemang = (t.reply_count ?? 0) > 0 || (t.like_count ?? 0) > 0;
    const harSubstans = snippet.length >= 25;
    if (harEngagemang && harSubstans) candidates.push({
      id: `mod_discussion_${t.id}`,
      type: "discussion",
      schemaVersion: 1,
      tracking: { reason: "hot_thread", position: 8 },
      payload: {
        id: t.id,
        title,
        body: snippet.slice(0, 240),
        authorName: t.author_name,
        teamSlug: t.team_slug,
        likeCount: t.like_count ?? 0,
        replyCount: t.reply_count ?? 0,
        createdAt: t.created_at,
      },
    });
  }

  if (standings.length > 0) {
    candidates.push({
      id: "mod_standings_top",
      type: "standings_snapshot",
      schemaVersion: 1,
      tracking: { reason: "league_pulse", position: 12 },
      payload: {
        rows: standings.slice(0, 3).map((r) => ({
          position: r.position,
          teamName: r.team.name,
          teamSlug: r.team.slug,
          played: r.played,
          points: r.points,
          goalDifference: r.goals_for - r.goals_against,
        })),
      },
    });
  }

  // 5. Daily audio briefing — metadata + access only (never signed MP3 URL)
  if (daily) {
    const unlocked = canAccess("briefAudio", plan);
    candidates.push({
      id: `mod_daily_${daily.slug}`,
      type: "audio_briefing",
      schemaVersion: 1,
      tracking: { reason: "daily_brief", position: 12 },
      payload: {
        slug: daily.slug,
        title: daily.title,
        episodeDate: daily.episode_date,
        durationSec: daily.duration_sec,
        episodeType: daily.episode_type,
        hasAudio: daily.has_audio,
        href: "/daily",
        access: {
          feature: "briefAudio",
          unlocked,
          requiredPlan: "pro",
          upgradePath: "/prenumerera",
        },
      },
    });
  }

  // Ranking v1 — explainable order + slot positions (score/factors for analytics).
  return rankFeedModules(candidates);
}
