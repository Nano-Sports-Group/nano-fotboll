import { SPORT } from "@/lib/vertical";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import type { Narrative, Entity, Article } from "@/lib/types";
import { contentCutoffIso } from "@/lib/content-window";

/**
 * Queries bakom /lag/[slug]/analys.
 *
 * Lyfta ur den gamla `/sammanfattning`-sidan när analysytan slogs ihop. Den
 * sidan och laghubbens insights-flik var två separata ytor för samma sak
 * ("Sammanfattning" respektive "Analys"), vilket bröt regeln om en etikett per
 * betydelse. Nu finns en analysyta, och den här modulen äger dess data.
 */

/**
 * Kolumnnamnen är verifierade mot information_schema 2026-08-06.
 *
 * Den lyfta versionen läste `row.topic` och sorterade på `score` — inga av dem
 * finns i `narratives` (den har `title`, `description`, `importance_score`).
 * Supabase-js felar tyst, så `/lag/[slug]/sammanfattning` visade en permanent
 * tom narrativsektion utan att något loggades. Exakt felklassen CLAUDE.md
 * varnar för: verifiera kolumnen innan du mappar den.
 */
function mapNarrative(row: Record<string, unknown>): Narrative {
  return {
    id: String(row.id),
    topic: String(row.title ?? ""),
    score: typeof row.importance_score === "number" ? row.importance_score : 0,
    sourceCount: Number(row.source_count ?? 0),
    trend: (row.trend ?? "stable") as Narrative["trend"],
    sentimentScore: (row.sentiment_score as number) ?? null,
    entities: Array.isArray(row.entities)
      ? (row.entities as Record<string, unknown>[]).map((e): Entity => ({
          id: String(e.id ?? e.slug ?? ""),
          name: String(e.name ?? ""),
          type: (e.type ?? "team") as Entity["type"],
          slug: String(e.slug ?? ""),
          imageUrl: (e.image_url as string) ?? null,
        }))
      : [],
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

/** Athopia-skrivna sammanfattningar för laget. PRO-gated av anroparen. */
export async function getTeamAISummaries(teamName: string): Promise<Article[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from("articles")
      .select("*")
      .eq("source_name", "Nano Fotboll AI")
      .eq("status", "published")
      .ilike("metadata->>team_name", `%${teamName}%`)
      .gte("published_at", contentCutoffIso())
      .order("created_at", { ascending: false })
      .limit(3);
    return (data as Article[]) ?? [];
  } catch {
    return [];
  }
}

/**
 * Multi-källsynteser kopplade till laget.
 *
 * Matchar på `entity_ids` i stället för fritext i rubriken. Textmatchning på
 * lagnamn missar synteser som nämner laget i brödtexten och träffar fel på
 * namn som delar ordstam — entitetskopplingen är den som faktiskt är exakt.
 */
export async function getTeamNarratives(teamEntityId: string): Promise<Narrative[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("narratives")
      .select("*")
      .eq("sport", SPORT)
      .contains("entity_ids", [teamEntityId])
      .gte("last_updated_at", contentCutoffIso())
      .order("importance_score", { ascending: false })
      .limit(8);
    if (error) return [];
    return (data ?? []).map((r) => mapNarrative(r as Record<string, unknown>));
  } catch {
    return [];
  }
}
