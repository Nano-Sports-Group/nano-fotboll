import type { FeedItem } from "@/lib/types";
import { mapImportanceTier } from "@/lib/feed/importance";
import { articlePublicPath, resolveRightsStatus } from "@/lib/provenance";

/** Mappar news_feed / news_feed_clustered-rad till FeedItem. */
export function mapNewsFeedRow(a: {
  id: string;
  title: string;
  source_name?: string | null;
  url?: string | null;
  published_at: string | null;
  summary?: string | null;
  news_tag?: string | null;
  source_count?: number | null;
  story_cluster_id?: string | null;
  importance_score?: number | null;
  push_priority?: string | null;
  slug?: string | null;
  url_hash?: string | null;
  rights_status?: string | null;
  is_athopia_generated?: boolean | null;
  teams?: Array<{ slug: string; name: string }> | null;
}): FeedItem {
  const internal = articlePublicPath({
    slug: a.slug ?? a.url_hash,
    rights_status: a.rights_status,
    is_athopia_generated: a.is_athopia_generated,
    url: a.url,
  });
  const href =
    internal !== "#"
      ? internal
      : a.url ?? "#";

  const rights = resolveRightsStatus({
    rights_status: a.rights_status,
    is_athopia_generated: a.is_athopia_generated,
  });
  const subtitle =
    rights === "owned" || rights === "licensed" ? (a.summary ?? null) : null;

  return {
    id: a.id,
    type: "news",
    title: a.title,
    source: a.source_name ?? null,
    time: a.published_at ?? new Date().toISOString(),
    href,
    subtitle,
    newsTag: a.news_tag ?? null,
    sourceCount: a.source_count ?? null,
    storyClusterId: a.story_cluster_id ?? null,
    importanceTier: mapImportanceTier(a.importance_score ?? null, a.push_priority ?? null),
    ...(a.teams?.length ? { teams: a.teams } : {}),
  };
}
