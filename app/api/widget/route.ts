import { SPORT } from "@/lib/vertical";
import { createClient } from "@supabase/supabase-js";
import {
  fetchAllsvenskanFixtures,
  fetchLiveScores,
  parseFixtureScore,
} from "@/lib/db/fixtures";
import { mapNewsFeedRow } from "@/lib/feed/map-feed-row";
import { jsonContract } from "@/lib/api-contract";
import { WidgetSnapshotSchema } from "@/lib/api-schemas";
import { contentCutoffIso } from "@/lib/content-window";

/**
 * GET /api/widget?team=<slug>
 *
 * Allt hem- och låsskärmswidgeten behöver i ETT publikt anrop. Widget-extensions
 * har hård CPU-/nätverksbudget: en request, inga auth-hopp, ingen klientlogik.
 *
 * Innehållsregel:
 * - Är lagets match live → visa matchen.
 * - Annars nästa kommande match inom 24h → visa den som countdown.
 * - Annars → viktigaste nyheterna, rankade på `importance_score` + `push_priority`
 *   (samma regel som pushen, se lib/feed/importance.ts). Athopia-artiklar får
 *   en native deep link; externa källor öppnar källan.
 *
 * Ingen plan-gating: widgeten visar bara gratisytor. Paywallade värden
 * (brief, signaler) hör inte hemma på låsskärmen.
 */
export const revalidate = 60;

const NEWS_LIMIT = 3;
const UPCOMING_WINDOW_MS = 24 * 60 * 60 * 1000;

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET(req: Request) {
  const teamSlug = new URL(req.url).searchParams.get("team");
  const db = getDb();

  const empty = {
    teamName: null,
    teamSlug,
    match: null,
    news: [],
    generatedAt: new Date().toISOString(),
  };
  if (!db) return jsonContract(WidgetSnapshotSchema, empty);

  let teamEntityId: string | null = null;
  let teamName: string | null = null;
  if (teamSlug) {
    const { data: team } = await db
      .from("entities")
      .select("id,name")
      .eq("type", "team")
      .eq("slug", teamSlug)
      .maybeSingle();
    teamEntityId = team?.id ? String(team.id) : null;
    teamName = team?.name ? String(team.name) : null;
  }

  const involvesTeam = (fixture: Awaited<ReturnType<typeof fetchLiveScores>>[number]) => {
    if (!teamSlug) return true;
    const { home, away } = parseFixtureScore(fixture);
    return home?.slug === teamSlug || away?.slug === teamSlug;
  };

  const [live, all] = await Promise.all([
    fetchLiveScores(),
    fetchAllsvenskanFixtures(),
  ]);

  const now = Date.now();
  const liveFixture = live.find(involvesTeam) ?? null;
  const upcomingFixture =
    liveFixture ??
    all
      .filter(involvesTeam)
      .filter((f) => {
        const kickoff = new Date(f.starting_at).getTime();
        return kickoff >= now && kickoff - now <= UPCOMING_WINDOW_MS;
      })
      .sort(
        (a, b) =>
          new Date(a.starting_at).getTime() - new Date(b.starting_at).getTime(),
      )[0] ??
    null;

  const match = upcomingFixture
    ? (() => {
        const { home, away, homeGoals, awayGoals, liveMinute, isLive } =
          parseFixtureScore(upcomingFixture);
        return {
          id: upcomingFixture.id,
          isLive,
          minute: liveMinute,
          kickoffAt: upcomingFixture.starting_at,
          status: isLive
            ? "LIVE"
            : (upcomingFixture.state?.short_name ?? upcomingFixture.state?.state ?? "NS"),
          homeName: home?.name ?? "?",
          awayName: away?.name ?? "?",
          homeScore: homeGoals,
          awayScore: awayGoals,
        };
      })()
    : null;

  // Viktigaste nyheterna: samma signal som push (importance + breaking-flagga).
  let newsQuery = db
    .from("news_feed_clustered")
    .select(
      "id, title, source_name, url, published_at, summary, importance_score, entity_ids, news_tag, source_count, story_cluster_id, push_priority, slug, rights_status, is_athopia_generated",
    )
    .eq("sport", SPORT)
    .gte("published_at", contentCutoffIso())
    .order("importance_score", { ascending: false, nullsFirst: false })
    .order("published_at", { ascending: false })
    .limit(NEWS_LIMIT);

  if (teamEntityId) newsQuery = newsQuery.contains("entity_ids", [teamEntityId]);

  const { data: newsRows } = await newsQuery;

  const news = (newsRows ?? []).map((row) => {
    const item = mapNewsFeedRow(row);
    return {
      id: item.id,
      title: item.title,
      href: item.href,
      source: item.source,
      publishedAt: item.time,
      importanceTier: item.importanceTier ?? null,
    };
  });

  return jsonContract(WidgetSnapshotSchema, {
    teamName,
    teamSlug,
    match,
    news,
    generatedAt: new Date().toISOString(),
  });
}
