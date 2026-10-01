import { SPORT } from "@/lib/vertical";
import { auth } from "@clerk/nextjs/server";
import { fetchNationalTeamIds } from "@/lib/db/national";
import { keepForNationalInterest, parseNationalInterest, type NationalInterest } from "@/lib/national-interest";
import { createClient } from "@supabase/supabase-js";
import { jsonContract } from "@/lib/api-contract";
import { FeedResponseSchema } from "@/lib/api-schemas";
import type { FeedItem } from "@/lib/types";
import { interestsToNewsTags } from "@/lib/feed/content-preferences";
import { mapNewsFeedRow } from "@/lib/feed/map-feed-row";
import { buildFeedModules } from "@/lib/feed/build-feed-modules";
import { resolveFeedUserId } from "@/lib/feed/feed-usage";
import { getUserPlan } from "@/lib/user-plan";
import { canAccess, type Plan } from "@/lib/access-rules";
import { withDiscussionCounts } from "@/lib/feed/discussion-counts";
import { contentCutoffIso } from "@/lib/content-window";

const PAGE_SIZE = 20;
function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** Ökar items_seen för free-användaren med det antal items som skickas (analys, ej gating). */
async function incrementItemsSeen(
  db: ReturnType<typeof getDb>,
  userId: string,
  count: number
): Promise<void> {
  if (!db || count === 0) return;
  const today = new Date().toISOString().split("T")[0];
  const { error: rpcErr } = await db.rpc("increment_feed_usage", {
    p_clerk_user_id: userId,
    p_date: today,
    p_delta: count,
  });
  if (rpcErr) {
    await db!
      .from("user_feed_usage")
      .upsert(
        { clerk_user_id: userId, date: today, items_seen: count },
        { onConflict: "clerk_user_id,date" }
      );
  }
}

export async function GET(req: Request) {
  const { userId } = await auth();
  const { searchParams } = new URL(req.url);
  const teamSlug = searchParams.get("team");
  const typeFilter = searchParams.get("type");
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10));

  const db = getDb();
  if (!db) {
    return jsonContract(FeedResponseSchema, {
      items: [],
      hasMore: false,
      gated: false,
      remainingToday: null,
      modules: [],
    });
  }

  let plan: Plan = "free";
  if (userId) {
    try {
      plan = await getUserPlan();
    } catch (err) {
      console.warn("[feed] Kunde inte hämta plan från Clerk:", err);
    }
  }

  // Grinden härleds ur ACCESS-mappen, inte ur en handskriven planjämförelse.
  // ACCESS är den deklarativa SoT som exporteras till iOS via
  // `pnpm contracts:generate` — skrivs grinden om för hand här driver web och
  // iOS isär utan att något test märker det (Sync I-72).
  //
  // Beteendet är oförändrat: smartRanking är "pro", så canAccess ger exakt
  // samma utfall som `plan === "pro" || plan === "elite"` gjorde.
  const isPro = canAccess("smartRanking", plan);
  const isElite = plan === "elite"; // ren plandeskriptor i svaret, ingen grind

  const feedUserId = resolveFeedUserId(userId, req);
  const effectiveLimit = PAGE_SIZE;

  let filterTeamIds: string[] = [];
  if (teamSlug) {
    const { data: team } = await db
      .from("entities")
      .select("id")
      .eq("type", "team")
      .eq("slug", teamSlug)
      .maybeSingle();
    if (team?.id) filterTeamIds = [String(team.id)];
  }

  let contentTypeTags: string[] | null = null;
  let nationalInterest: NationalInterest = "some";
  const nationalIds = new Set(await fetchNationalTeamIds().catch(() => [] as string[]));
  if (userId) {
    const { data: feedConfig } = await db
      .from("user_feed_config")
      .select("followed_team_ids, content_types, national_interest")
      .eq("clerk_user_id", userId)
      .eq("sport", SPORT)
      .maybeSingle();

    if (isPro && !teamSlug) {
      filterTeamIds = feedConfig?.followed_team_ids ?? [];
    } else if (!teamSlug && (feedConfig?.followed_team_ids?.length ?? 0) > 0) {
      filterTeamIds = feedConfig!.followed_team_ids!;
    }

    if (!typeFilter) {
      contentTypeTags = interestsToNewsTags(feedConfig?.content_types ?? null);
    }

    nationalInterest = parseNationalInterest(feedConfig?.national_interest);
    // "Mitt andra lag": landslaget räknas som ett följt lag när flödet filtreras på följda lag.
    if (nationalInterest === "second_team" && filterTeamIds.length > 0 && !teamSlug) {
      filterTeamIds = [...new Set([...filterTeamIds, ...nationalIds])];
    }
  }

  let items: FeedItem[] = [];

  try {
    let aq = db
      .from("news_feed_clustered")
      .select(
        "id, title, source_name, url, published_at, summary, importance_score, feed_score, entity_ids, news_tag, source_count, story_cluster_id, push_priority, slug, rights_status, is_athopia_generated",
      )
      .eq("sport", SPORT)
      .gte("published_at", contentCutoffIso())
      .order(isPro ? "feed_score" : "published_at", { ascending: false, nullsFirst: false })
      .range(offset, offset + effectiveLimit - 1);

    if (filterTeamIds.length === 1) {
      aq = aq.contains("entity_ids", [filterTeamIds[0]]);
    } else if (filterTeamIds.length > 1) {
      aq = aq.overlaps("entity_ids", filterTeamIds);
    }

    if (typeFilter) {
      aq = aq.eq("news_tag", typeFilter);
    } else if (contentTypeTags?.length) {
      aq = aq.in("news_tag", contentTypeTags);
    }

    const { data: articleData, error } = await aq;
    if (error) {
      console.warn("[feed] clustered select fallback:", error.message);
      let fallback = db
        .from("news_feed_clustered")
        .select(
          "id, title, source_name, url, published_at, summary, importance_score, feed_score, entity_ids, news_tag, source_count, story_cluster_id, push_priority",
        )
        .eq("sport", SPORT)
        .gte("published_at", contentCutoffIso())
        .order(isPro ? "feed_score" : "published_at", { ascending: false, nullsFirst: false })
        .range(offset, offset + effectiveLimit - 1);
      if (filterTeamIds.length === 1) {
        fallback = fallback.contains("entity_ids", [filterTeamIds[0]]);
      } else if (filterTeamIds.length > 1) {
        fallback = fallback.overlaps("entity_ids", filterTeamIds);
      }
      if (typeFilter) {
        fallback = fallback.eq("news_tag", typeFilter);
      } else if (contentTypeTags?.length) {
        fallback = fallback.in("news_tag", contentTypeTags);
      }
      const { data: fb } = await fallback;
      items = (fb ?? [])
        .filter((a) => teamSlug || keepForNationalInterest(a, nationalInterest, nationalIds))
        .map((a) => mapNewsFeedRow(a));
    } else {
      // Landslagets rum: användarens intresse avgör (lib/national-interest.ts). En lagsida visar allt.
      items = (articleData ?? [])
        .filter((a) => teamSlug || keepForNationalInterest(a, nationalInterest, nationalIds))
        .map((a) => mapNewsFeedRow(a));
    }
  } catch (err) {
    console.error("[feed] DB-fel:", err);
  }

  let modules: Awaited<ReturnType<typeof buildFeedModules>> = [];
  if (offset === 0 && !teamSlug && !typeFilter) {
    try {
      modules = await buildFeedModules(db, { plan });
    } catch (err) {
      console.warn("[feed] modules fel:", err);
    }
  }

  if (!isPro && items.length > 0) {
    void incrementItemsSeen(db, feedUserId, items.length);
  }

  if (items.length > 0) {
    try {
      items = await withDiscussionCounts(items);
    } catch (err) {
      console.warn("[feed] discussion counts fel:", err);
    }
  }

  const hasMore = items.length === effectiveLimit;

  return jsonContract(FeedResponseSchema, {
    items,
    hasMore,
    gated: false,
    remainingToday: null,
    isPro,
    isElite,
    modules,
  });
}
