import { unstable_cache } from "next/cache";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { SPORT } from "@/lib/vertical";

/** Landslagens entity-id (metadata.league = 'Landslag'). Tom i andra sporter. Cache 1 h. */
export const fetchNationalTeamIds = unstable_cache(
  async (): Promise<string[]> => {
    if (!isSupabaseConfigured() || SPORT !== "football") return [];
    const { data } = await createServerClient()
      .from("entities")
      .select("id")
      .eq("sport", SPORT)
      .eq("type", "team")
      .eq("metadata->>league", "Landslag");
    return (data ?? []).map((r) => String(r.id));
  },
  ["national-team-ids", SPORT],
  { revalidate: 3600 },
);
