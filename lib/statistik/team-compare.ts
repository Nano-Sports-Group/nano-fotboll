import "server-only";

import { fetchStandingsFull } from "@/lib/db/fixtures";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { SPORT, vertical } from "@/lib/vertical";

export interface TeamCompareStats {
  name: string;
  slug: string;
  position: number;
  points: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  form: string[];
}

interface MatchRow {
  home_team_name: string;
  away_team_name: string;
  home_score: number;
  away_score: number;
  played_at: string | null;
}

export async function getTeamCompareStats(slug: string): Promise<TeamCompareStats | null> {
  if (!isSupabaseConfigured()) return null;

  const db = createServerClient();
  const { data: entity } = await db
    .from("entities")
    .select("id, name, slug, sportmonks_id, sportsmonks_id")
    .eq("slug", slug)
    .eq("type", "team")
    .eq("sport", SPORT).in("metadata->>league", [...vertical.leagueEntities])
    .maybeSingle();

  if (!entity?.slug) return null;

  const sportsmonksId =
    entity.sportmonks_id != null
      ? Number(entity.sportmonks_id)
      : entity.sportsmonks_id != null
        ? Number(entity.sportsmonks_id)
        : undefined;

  let matches: MatchRow[] = [];
  if (sportsmonksId) {
    const { data } = await db
      .from("match_stats")
      .select("home_team_name, away_team_name, home_score, away_score, played_at")
      .or(`home_sportsmonks_id.eq.${sportsmonksId},away_sportsmonks_id.eq.${sportsmonksId}`)
      .not("played_at", "is", null)
      .order("played_at", { ascending: true })
      .limit(20);
    matches = (data ?? []) as MatchRow[];
  }

  let won = 0;
  let drawn = 0;
  let lost = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  const form: string[] = [];
  const teamName = String(entity.name);

  for (const match of matches) {
    const isHome = match.home_team_name.toLowerCase() === teamName.toLowerCase();
    const myGoals = isHome ? match.home_score : match.away_score;
    const oppGoals = isHome ? match.away_score : match.home_score;

    goalsFor += myGoals;
    goalsAgainst += oppGoals;

    if (myGoals > oppGoals) won++;
    else if (myGoals === oppGoals) drawn++;
    else lost++;

    form.push(myGoals > oppGoals ? "W" : myGoals === oppGoals ? "D" : "L");
  }

  let position = 0;
  let points = won * 3 + drawn;

  try {
    const standings = await fetchStandingsFull();
    const normalized = teamName.toLowerCase();
    const standing = standings.find(
      (row) =>
        row.team.name.toLowerCase() === normalized ||
        row.team.name.toLowerCase().includes(normalized.split(" ")[0] ?? ""),
    );
    if (standing) {
      position = standing.position;
      points = standing.points;
    }
  } catch {
    // Standings optional — use computed values.
  }

  return {
    name: teamName,
    slug: String(entity.slug),
    position,
    points,
    played: matches.length,
    won,
    drawn,
    lost,
    goalsFor,
    goalsAgainst,
    goalDiff: goalsFor - goalsAgainst,
    form: form.slice(-5),
  };
}

export async function getTeamCompareAnalysis(
  slugA: string,
  slugB: string,
): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;

  const db = createServerClient();
  const { data } = await db
    .from("content_queue")
    .select("content")
    .eq("content_type", "digest")
    .contains("metadata", { subtype: "comparison", team_a: slugA, team_b: slugB })
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const content = data.content as Record<string, unknown>;
  return (content.text as string | undefined) ?? null;
}
