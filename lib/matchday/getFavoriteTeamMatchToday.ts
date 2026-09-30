import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { getTeamFixtures, seasonIdForTeam } from "@/lib/team-hub/queries";
import { getPrimaryTeam } from "@/lib/team/getPrimaryTeam";
import { pickTodaysMatch } from "@/lib/matchday/helpers";
import type { FixtureRow } from "@/lib/team-hub/queries";

export interface FavoriteTeamMatchToday {
  teamName: string;
  match: FixtureRow;
}

/** Dagens match för inloggad användares favoritlag (null om ingen match idag). */
export async function getFavoriteTeamMatchToday(): Promise<FavoriteTeamMatchToday | null> {
  const team = await getPrimaryTeam();
  if (!team || !isSupabaseConfigured()) return null;

  const db = createServerClient();
  const { data } = await db
    .from("entities")
    .select("sportmonks_id, metadata")
    .eq("id", team.id)
    .maybeSingle();

  // Kolumnen först — hockeyns lag har inget metadata.sportsmonks_id.
  const raw = data?.sportmonks_id ?? (data?.metadata as Record<string, unknown> | null)?.sportsmonks_id;
  const smId = raw != null ? Number(raw) : NaN;
  if (!Number.isFinite(smId)) return null;

  const { recent, upcoming } = await getTeamFixtures(smId, await seasonIdForTeam(smId));
  const match = pickTodaysMatch(recent, upcoming);
  if (!match) return null;

  return { teamName: team.name, match };
}
