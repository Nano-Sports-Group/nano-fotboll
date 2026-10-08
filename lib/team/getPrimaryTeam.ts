import { currentUser } from "@clerk/nextjs/server";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { VERTICAL, SPORT } from "@/lib/vertical";
import { effectiveFavoriteFromMeta } from "@/lib/favorite-meta";

export interface PrimaryTeam {
  id: string;
  slug: string;
  name: string;
  /** entities.metadata.league — lagets serie, styr tittarens hemliga. */
  league: string | null;
}

/**
 * Serversidans enda källa för "mitt lag" — driver Hem/Mitt lag/Statistik-preset.
 * Läser Clerk unsafeMetadata.favoriteTeam (samma fält klienten skriver via
 * useFavoriteTeam) och slår upp entiteten. Ingen ny lagringsplats.
 */
export async function getPrimaryTeam(): Promise<PrimaryTeam | null> {
  const user = await currentUser();
  const slug = effectiveFavoriteFromMeta(user?.unsafeMetadata as Record<string, unknown> | undefined, VERTICAL);
  if (!slug || !isSupabaseConfigured()) return null;

  const db = createServerClient();
  const { data } = await db
    .from("entities")
    .select("id, slug, name, metadata")
    .eq("type", "team")
    .eq("sport", SPORT)
    .eq("slug", slug)
    .maybeSingle();

  return data
    ? {
        id: data.id as string,
        slug: data.slug as string,
        name: data.name as string,
        league: ((data.metadata ?? {}) as Record<string, unknown>).league as string | null ?? null,
      }
    : null;
}
