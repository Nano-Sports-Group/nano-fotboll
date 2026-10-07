import type { SupabaseClient } from "@supabase/supabase-js";
import { SPORT } from "@/lib/vertical";

export type FeedTeamTag = { slug: string; name: string };

type FeedRowBase = { id: string; entity_ids?: string[] | null };

export type FeedRowEnrichment = {
  slug: string | null;
  rights_status: string | null;
  is_athopia_generated: boolean | null;
  teams: FeedTeamTag[];
};

/** Högst så här många lagtaggar per nyhet — fler än tre är brus på en mobilrad. */
const MAX_TEAM_TAGS = 3;

/**
 * Vyn `news_feed_clustered` bär varken artikelns slug, rättighetsstatus eller lagnamn.
 * Utan slug föll länken tillbaka på `articles.url`, som för egna texter är en platshållare
 * (`/nyheter` eller `/lag/<id>`) — därför öppnade flödet aldrig själva artikeln, varken på
 * webben eller i apparna. Här hämtas det som saknas i två frågor per sida.
 */
export async function enrichFeedRows<T extends FeedRowBase>(
  db: SupabaseClient,
  rows: T[],
): Promise<Array<T & FeedRowEnrichment>> {
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const entityIds = [...new Set(rows.flatMap((r) => r.entity_ids ?? []))];

  const [articles, teams] = await Promise.all([
    db
      .from("articles")
      .select("id, slug, rights_status, is_athopia_generated")
      .eq("sport", SPORT)
      .in("id", ids),
    entityIds.length
      ? db.from("entities").select("id, slug, name").eq("sport", SPORT).eq("type", "team").in("id", entityIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (articles.error) console.warn("[feed] slug-berikning föll:", articles.error.message);
  if (teams.error) console.warn("[feed] lagtaggar föll:", teams.error.message);

  const articleById = new Map((articles.data ?? []).map((a) => [String(a.id), a]));
  const teamById = new Map(
    (teams.data ?? [])
      .filter((t) => t.slug && t.name)
      .map((t) => [String(t.id), { slug: String(t.slug), name: String(t.name) }]),
  );

  return rows.map((row) => {
    const article = articleById.get(row.id);
    return {
      ...row,
      slug: article?.slug ?? null,
      rights_status: article?.rights_status ?? null,
      is_athopia_generated: article?.is_athopia_generated ?? null,
      teams: (row.entity_ids ?? [])
        .map((id) => teamById.get(id))
        .filter((t): t is FeedTeamTag => Boolean(t))
        .slice(0, MAX_TEAM_TAGS),
    };
  });
}
