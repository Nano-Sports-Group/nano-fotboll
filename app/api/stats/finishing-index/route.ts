import { SPORT } from "@/lib/vertical";
import { NextResponse } from "next/server";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { getPlayerInfoMap } from "@/lib/stats/advanced";

export const revalidate = 3600;

export async function GET() {
  if (!isSupabaseConfigured()) return NextResponse.json({ rows: [] });

  const db = createServerClient();
  const seasonId = Number(process.env.SPORTSMONKS_SEASON_ID_2026 ?? "26806");

  const { data } = await db
    .from("stats_finishing_index")
    .select("player_id,goals,xg,overperf,ratio,goals_p90,xg_p90,overperf_percentile,regression_warning,computed_at")
    .eq("sport", SPORT)
    .eq("season_id", seasonId)
    .order("overperf", { ascending: false })
    .limit(25);

  if (!data || data.length === 0) return NextResponse.json({ rows: [] });

  const playerIds = data.map((r) => r.player_id);
  const playerMap = await getPlayerInfoMap(db, playerIds);

  const rows = data.map((r, i) => {
    const p = playerMap.get(r.player_id);
    return {
      rank: i + 1,
      playerId: r.player_id,
      playerName: p?.name ?? `Spelare ${r.player_id}`,
      teamName: p?.team ?? "",
      image: p?.image ?? null,
      goals: r.goals,
      xg: r.xg,
      overperf: r.overperf,
      ratio: r.ratio,
      goalsPer90: r.goals_p90,
      xgPer90: r.xg_p90,
      overperfPercentile: r.overperf_percentile,
      regressionWarning: r.regression_warning,
    };
  });

  return NextResponse.json(
    { rows },
    { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=7200" } }
  );
}
