import "server-only";
import { contentCutoffIso } from "@/lib/content-window";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";

export interface GolfStory {
  slug: string;
  title: string;
  summary: string | null;
}

/**
 * Senaste publicerade golftexter, eventuellt bara de vars rubrik nämner ett namn (spelare, tour).
 * ponytail: namnmatchning i rubriken. Byts mot entitetskoppling (article → entities) när intaget
 * är på och golfens entiteter finns — då hittas även texter där namnet bara står i brödtexten.
 */
export async function golfStories(mention?: string, limit = 5): Promise<GolfStory[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    let query = createServerClient()
      .from("articles")
      .select("slug, title, summary")
      .eq("status", "published")
      .eq("is_processed", true)
      .eq("sport", "golf")
      .gte("published_at", contentCutoffIso());
    if (mention) query = query.ilike("title", `%${mention.replace(/[%_]/g, "")}%`);
    const { data } = await query.order("published_at", { ascending: false }).limit(limit);
    return ((data ?? []) as GolfStory[]).filter((a) => a.slug && a.title);
  } catch {
    return [];
  }
}
