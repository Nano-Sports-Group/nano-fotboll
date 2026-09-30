import { planForVertical } from "@/lib/plan-for-vertical";
import { SPORT, VERTICAL } from "@/lib/vertical";
import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase";
import type { FeedItem } from "@/lib/types";
import { mapNewsFeedRow } from "@/lib/feed/map-feed-row";
import { jsonContract } from "@/lib/api-contract";
import { HeroResponseSchema } from "@/lib/api-schemas";
import { withDiscussionCounts } from "@/lib/feed/discussion-counts";
import { contentCutoffIso } from "@/lib/content-window";

export const dynamic = "force-dynamic";

function toItem(a: Record<string, unknown>, type: "summary" | "news"): FeedItem {
  const base = mapNewsFeedRow(a as Parameters<typeof mapNewsFeedRow>[0]);
  const slug = a.slug as string | null | undefined;
  const urlHash = a.url_hash as string | null | undefined;
  const articleId = a.id as string;
  return {
    ...base,
    id: `article-${articleId}`,
    type,
    href:
      type === "summary"
        ? `/artikel/${slug ?? urlHash ?? articleId}`
        : (base.href !== "#" ? base.href : `/artikel/${slug ?? urlHash ?? articleId}`),
  };
}

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Ej autentiserad" }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ summary: null, topNews: [] });

  // AI-summaries är en PRO+-feature — free-användare får null
  let isPro = false;
  try {
    const user = await currentUser();
    const plan = planForVertical(VERTICAL, user?.publicMetadata as { plan?: unknown; plans?: unknown } | undefined);
    isPro = plan === "pro" || plan === "elite";
  } catch { /* ignorera */ }

  const { searchParams } = new URL(req.url);
  const team = searchParams.get("team");
  const db = createServiceClient();

  // articles taggas med entity_ids (uuid[]), inte lagets slug — slå upp id:t
  // en gång här så anropskontraktet (?team=<slug>) kan vara oförändrat.
  let teamEntityId: string | null = null;
  if (team) {
    const { data: entity } = await db
      .from("entities")
      .select("id")
      .eq("type", "team")
      .eq("sport", SPORT)
      .eq("slug", team)
      .maybeSingle();
    teamEntityId = (entity?.id as string | undefined) ?? null;
  }

  const ARTICLE_SELECT =
    "id, title, summary, source_name, published_at, slug, url_hash, source_count, story_cluster_id, importance_score, push_priority";
  const CLUSTER_SELECT =
    "id, title, summary, source_name, published_at, url, source_count, story_cluster_id, importance_score, push_priority, feed_score";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let summaryQ: any = db
    .from("articles")
    .select(ARTICLE_SELECT)
    .eq("status", "published")
    .eq("sport", SPORT)
    .eq("is_athopia_generated", true)
    .gte("published_at", contentCutoffIso())
    .order("published_at", { ascending: false })
    .limit(1);
  if (teamEntityId) summaryQ = summaryQ.contains("entity_ids", [teamEntityId]);

  // Kluster-dedupad topplista — en story per kluster, sorterad på signal (PRO-värde)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let newsQ: any = db
    .from("news_feed_clustered")
    .select(CLUSTER_SELECT)
    .eq("sport", SPORT)
    .gte("published_at", contentCutoffIso())
    .order("feed_score", { ascending: false, nullsFirst: false })
    .limit(5);
  if (teamEntityId) newsQ = newsQ.contains("entity_ids", [teamEntityId]);

  const [{ data: sumData }, { data: newsData }] = await Promise.all([
    isPro ? summaryQ : Promise.resolve({ data: [] }),
    newsQ,
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let summary: FeedItem | null =
    isPro && (sumData as any[])?.[0]
      ? toItem((sumData as any[])[0], "summary")
      : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let topNews: FeedItem[] = ((newsData as any[]) ?? []).map((a) =>
    toItem(a, "news"),
  );

  try {
    const counted = await withDiscussionCounts([
      ...(summary ? [summary] : []),
      ...topNews,
    ]);
    if (summary) {
      summary = counted[0] ?? summary;
      topNews = counted.slice(1);
    } else {
      topNews = counted;
    }
  } catch {
    /* counts are additive — never fail hero */
  }

  return jsonContract(HeroResponseSchema, {
    summary,
    topNews,
  });
}
