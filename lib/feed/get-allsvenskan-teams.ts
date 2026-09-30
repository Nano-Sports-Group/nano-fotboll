import { SPORT, vertical } from "@/lib/vertical";
import { unstable_cache } from "next/cache";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";

export interface FeedTeamOption {
  name: string;
  slug: string;
}

export interface FeedTypeOption {
  /** Värdet i articles.news_tag */
  value: string;
  label: string;
}

export interface FeedFilterOptions {
  teams: FeedTeamOption[];
  sources: string[];
  types: FeedTypeOption[];
}

/**
 * Nyhetstyperna som faktiskt finns i `news_tag`. Hårdkodad ordning och svensk
 * etikett — listan är kort, stabil och sätts av athopia-os klassificering.
 */
const TYPE_LABELS: Record<string, string> = {
  transfer: "Transfer",
  match: "Match",
  analysis: "Analys",
  news: "Nyheter",
  injury: "Skador",
};

/**
 * De 16 Allsvenskan-klubbarna för filterpanelen på /nyheter. `entities`
 * (type='team') är den kanoniska källan — slug kommer alltid därifrån,
 * aldrig ad-hoc slugify (se lib/team-names.ts för samma princip).
 */
export async function getAllsvenskanTeams(): Promise<FeedTeamOption[]> {
  return unstable_cache(fetchAllsvenskanTeams, ["allsvenskan-teams"], {
    revalidate: 3600,
    tags: ["entities"],
  })();
}

async function fetchAllsvenskanTeams(): Promise<FeedTeamOption[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const db = createServerClient();
    const { data } = await db
      .from("entities")
      .select("name, slug")
      .eq("type", "team")
      .eq("sport", SPORT)
      .in("metadata->>league", [...vertical.leagueEntities])
      .not("slug", "is", null)
      .order("name", { ascending: true });
    return (data ?? [])
      .filter((r: { name: unknown; slug: unknown }) => r.name && r.slug)
      .map((r: { name: unknown; slug: unknown }) => ({
        name: String(r.name),
        slug: String(r.slug),
      }));
  } catch {
    return [];
  }
}

/**
 * Alla tre filterdimensioner för /nyheter: klubb, nyhetstyp och källa.
 *
 * Källistan var tidigare härledd ur den aktuella sidans artiklar, vilket gjorde
 * filtret beroende av var man råkade befinna sig i pagineringen — sida 3 visade
 * andra källor än sida 1. Den läses nu ur hela flödesvyn så att listan är
 * densamma överallt.
 */
export async function getFeedFilterOptions(): Promise<FeedFilterOptions> {
  // Klubbar, typer och källor ändras i praktiken aldrig inom en session och är
  // identiska för alla besökare. Utan cache blev det ett extra Supabase-anrop
  // per sidladdning av /nyheter — den tyngsta ytan i produkten.
  return unstable_cache(fetchFeedFilterOptions, ["feed-filter-options"], {
    revalidate: 300,
    tags: ["news"],
  })();
}

async function fetchFeedFilterOptions(): Promise<FeedFilterOptions> {
  const teams = await getAllsvenskanTeams();
  if (!isSupabaseConfigured()) return { teams, sources: [], types: [] };

  try {
    const db = createServerClient();
    // Räckvidden håller frågan billig; äldre källor som inte publicerat på
    // månader hör inte hemma i ett filter för ett levande flöde.
    const { data } = await db
      .from("news_feed")
      .select("source_name, news_tag")
      .eq("sport", SPORT)
      .order("published_at", { ascending: false })
      .limit(2000);

    const rows = (data ?? []) as { source_name: string | null; news_tag: string | null }[];

    const sources = [...new Set(rows.map((r) => r.source_name).filter(Boolean) as string[])].sort(
      (a, b) => a.localeCompare(b, "sv"),
    );

    const presentTags = new Set(rows.map((r) => r.news_tag).filter(Boolean) as string[]);
    const types = Object.entries(TYPE_LABELS)
      .filter(([value]) => presentTags.has(value))
      .map(([value, label]) => ({ value, label }));

    return { teams, sources, types };
  } catch {
    return { teams, sources: [], types: [] };
  }
}
