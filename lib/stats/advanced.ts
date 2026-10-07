import { SPORT } from "@/lib/vertical";
/**
 * lib/stats/advanced.ts — delade queries för projektion/luck/clutch (audit T5).
 * Konsumeras av både API-routes (iOS-kontrakt, oförändrade) och
 * /statistik-sidan direkt — tidigare gjorde server-sidan HTTP-self-fetch
 * mot sina egna routes.
 */
import { unstable_cache } from "next/cache";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { getTeamNameMap } from "@/lib/team-names";

const seasonId = () => Number(process.env.SPORTSMONKS_SEASON_ID_2026 ?? "26806");

export interface ProjectionRow {
  teamId: number; teamName: string; logoUrl: string | null;
  points: number; elo: number; pChampion: number; pTop3: number;
  pRelegation: number; pPlayoff: number; nSims: number; computedAt: string;
}

export interface ScheduleFormRow {
  teamId: number; teamName: string; logoUrl: string | null;
  actualPoints: number; xpts: number; luck: number; sos: number; computedAt: string;
}

export interface ClutchRow {
  rank: number; playerId: number; playerName: string; teamName: string;
  image: string | null; goals: number; clutchScore: number;
  trailingGoals: number; levelGoals: number; leadingGoals: number;
}

export type PlayerInfo = { name: string; team: string; image: string | null };

/**
 * Namn, lag och bild per spelare. `player_season_stats` bär inga namnkolumner — de tre
 * ytor som frågade efter `player_name` där fick alltid tomt svar och visade spelar-id:t som namn.
 */
export async function getPlayerInfoMap(
  db: ReturnType<typeof createServerClient>,
  playerIds: number[],
): Promise<Map<number, PlayerInfo>> {
  if (playerIds.length === 0) return new Map();
  const { data, error } = await db
    .from("players")
    .select("sportmonks_id,fullname,image,team_id")
    .eq("sport", SPORT)
    .in("sportmonks_id", playerIds);
  if (error) console.warn("[stats] spelarnamn föll:", error.message);
  const rows = data ?? [];
  const teams = await getTeamNameMap(db, [...new Set(rows.map((p) => Number(p.team_id)).filter(Boolean))]);
  return new Map(
    rows
      .filter((p) => p.fullname)
      .map((p) => [
        Number(p.sportmonks_id),
        { name: String(p.fullname), team: teams.get(Number(p.team_id))?.name ?? "", image: (p.image as string | null) ?? null },
      ]),
  );
}

async function teamEntityMap(db: ReturnType<typeof createServerClient>, teamIds: number[]) {
  // entities ensam missade rader för lag vars sync-jobb låg efter — gav rå
  // sportmonks_id (String(r.team_id)) i UI:t. getTeamNameMap slår även upp teams.
  return getTeamNameMap(db, teamIds);
}

export const getProjectionRows = unstable_cache(
  async (): Promise<ProjectionRow[]> => {
    if (!isSupabaseConfigured()) return [];
    const db = createServerClient();
    const { data } = await db
      .from("stats_season_projection")
      .select("team_id,current_points,elo,p_champion,p_top3,p_relegation,p_playoff,n_sims,computed_at")
      .eq("sport", SPORT)
      .eq("season_id", seasonId())
      .order("p_champion", { ascending: false });
    if (!data?.length) return [];
    const ents = await teamEntityMap(db, data.map((r) => r.team_id));
    return data.map((r) => {
      const ent = ents.get(r.team_id);
      return {
        teamId: r.team_id,
        teamName: ent?.name || `Lag ${r.team_id}`,
        logoUrl: ent?.logo ?? null,
        points: r.current_points, elo: r.elo,
        pChampion: r.p_champion, pTop3: r.p_top3,
        pRelegation: r.p_relegation, pPlayoff: r.p_playoff,
        nSims: r.n_sims, computedAt: r.computed_at,
      };
    });
  },
  ["stats-projection"],
  { revalidate: 3600, tags: ["stats"] },
);

export const getScheduleFormRows = unstable_cache(
  async (): Promise<ScheduleFormRow[]> => {
    if (!isSupabaseConfigured()) return [];
    const db = createServerClient();
    const { data } = await db
      .from("stats_schedule_form")
      .select("team_id,actual_points,xpts,luck,sos,computed_at")
      .eq("sport", SPORT)
      .eq("season_id", seasonId())
      .order("luck", { ascending: false });
    if (!data?.length) return [];
    const ents = await teamEntityMap(db, data.map((r) => r.team_id));
    return data.map((r) => {
      const ent = ents.get(r.team_id);
      return {
        teamId: r.team_id,
        teamName: ent?.name || `Lag ${r.team_id}`,
        logoUrl: ent?.logo ?? null,
        actualPoints: r.actual_points, xpts: r.xpts, luck: r.luck, sos: r.sos,
        computedAt: r.computed_at,
      };
    });
  },
  ["stats-schedule-form"],
  { revalidate: 3600, tags: ["stats"] },
);

export const getClutchRows = unstable_cache(
  async (): Promise<ClutchRow[]> => {
    if (!isSupabaseConfigured()) return [];
    const db = createServerClient();
    const { data } = await db
      .from("stats_clutch")
      .select("player_id,goals,clutch_score,trailing_goals,level_goals,leading_goals,computed_at")
      .eq("sport", SPORT)
      .eq("season_id", seasonId())
      .order("clutch_score", { ascending: false })
      .limit(25);
    if (!data?.length) return [];
    const playerMap = await getPlayerInfoMap(db, data.map((r) => r.player_id));
    return data.map((r, i) => {
      const p = playerMap.get(r.player_id);
      return {
        rank: i + 1,
        playerId: r.player_id,
        playerName: p?.name ?? `Spelare ${r.player_id}`,
        teamName: p?.team ?? "",
        image: p?.image ?? null,
        goals: r.goals, clutchScore: r.clutch_score,
        trailingGoals: r.trailing_goals, levelGoals: r.level_goals, leadingGoals: r.leading_goals,
      };
    });
  },
  ["stats-clutch"],
  { revalidate: 3600, tags: ["stats"] },
);
