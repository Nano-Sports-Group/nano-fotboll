/**
 * lib/match/resolve.ts — adressparametern på /match/[id] → matchens id och dess läsbara adress.
 * En uppslagning per sidvisning (React `cache`: metadata och sida delar den).
 */

import "server-only";
import { cache } from "react";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { SPORT } from "@/lib/vertical";
import { matchSlug, parseMatchParam } from "@/lib/match/slug";

export interface ResolvedMatch {
  id: number;
  /** Läsbar adress, eller den numeriska om namn eller tid saknas. */
  path: string;
}

export const resolveMatchParam = cache(async (param: string): Promise<ResolvedMatch | null> => {
  const parsed = parseMatchParam(decodeURIComponent(param));
  if (!parsed || !isSupabaseConfigured()) return null;
  const db = createServerClient();
  const cols = "sportmonks_id,home_team_name,away_team_name,kickoff_at";

  if ("id" in parsed) {
    const { data } = await db.from("fixtures").select(cols).eq("sport", SPORT).eq("sportmonks_id", parsed.id).maybeSingle();
    // Okänd match: sidan visar sitt eget "ingen data"-läge för id:t.
    if (!data) return { id: parsed.id, path: `/match/${parsed.id}` };
    return { id: parsed.id, path: `/match/${matchSlug(data.home_team_name, data.away_team_name, data.kickoff_at) ?? parsed.id}` };
  }

  // Svensk matchdag kan börja 22:00 UTC dagen innan och sluta 23:00 UTC samma dag — ta ett dygn med marginal.
  const from = new Date(`${parsed.day}T00:00:00Z`).getTime() - 3 * 3_600_000;
  const { data } = await db
    .from("fixtures")
    .select(cols)
    .eq("sport", SPORT)
    .gte("kickoff_at", new Date(from).toISOString())
    .lt("kickoff_at", new Date(from + 30 * 3_600_000).toISOString());
  const hit = (data ?? []).find((f) => matchSlug(f.home_team_name, f.away_team_name, f.kickoff_at) === parsed.slug);
  return hit ? { id: Number(hit.sportmonks_id), path: `/match/${parsed.slug}` } : null;
});
