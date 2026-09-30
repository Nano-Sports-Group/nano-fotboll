import { SPORT, vertical } from "@/lib/vertical";
/**
 * lib/waitlist/teams.ts — lagvalidering för waitlist-formuläret.
 *
 * Slugs kommer från `entities`, aldrig från en hårdkodad lista i kod och aldrig
 * från fritext. Samma källa som onboarding och `/api/team/list` använder, så en
 * ny klubb i Allsvenskan dyker upp båda ställena utan kodändring.
 */

import "server-only";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase";


export interface WaitlistTeam {
  slug: string;
  name: string;
}

/**
 * Allsvenskans lag, sorterade på namn. Cache:as inte här — anroparna är en
 * server component (ISR) och en POST-route som ändå måste vara färsk.
 */
export async function listWaitlistTeams(): Promise<WaitlistTeam[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("entities")
      .select("name, slug")
      .eq("sport", SPORT)
      .eq("type", "team")
      .in("metadata->>league", [...vertical.leagueEntities])
      .order("name");

    if (error || !data) return [];
    return (data as { name: string | null; slug: string | null }[])
      .filter((row): row is { name: string; slug: string } => Boolean(row.slug && row.name))
      .map((row) => ({ slug: row.slug, name: row.name }));
  } catch {
    return [];
  }
}

/**
 * Är slugen ett lag vi faktiskt täcker? Valideras mot DB vid submit — en
 * klientlista kan manipuleras, och `favorite_team` speglas sedan rakt in i
 * Clerk-metadata och `user_feed_config`.
 */
export async function isValidTeamSlug(slug: string): Promise<boolean> {
  const teams = await listWaitlistTeams();
  return teams.some((team) => team.slug === slug);
}
