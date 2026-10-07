import { SPORT } from "@/lib/vertical";
import { NextResponse } from "next/server";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { getPlayerInfoMap } from "@/lib/stats/advanced";

export const revalidate = 3600;

// Returns top-5 twins for a given player (?playerId=123) or all twin pairs (limit 100)
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ rows: [] });

  const db = createServerClient();
  const seasonId = Number(process.env.SPORTSMONKS_SEASON_ID_2026 ?? "26806");
  const { searchParams } = new URL(request.url);
  const playerId = searchParams.get("playerId");

  let query = db
    .from("stats_player_twins")
    .select("player_id,twin_player_id,similarity,rank,computed_at")
    .eq("sport", SPORT)
    .eq("season_id", seasonId)
    .order("similarity", { ascending: false });

  if (playerId) {
    query = query.eq("player_id", Number(playerId));
  } else {
    query = query.eq("rank", 1).limit(100);
  }

  const { data } = await query;
  if (!data || data.length === 0) return NextResponse.json({ rows: [] });

  // Enrich with player names
  const allIds = [...new Set(data.flatMap((r) => [r.player_id, r.twin_player_id]))];
  const playerMap = await getPlayerInfoMap(db, allIds);

  const rows = data.map((r) => {
    const p = playerMap.get(r.player_id);
    const t = playerMap.get(r.twin_player_id);
    return {
      playerId: r.player_id,
      playerName: p?.name ?? `Spelare ${r.player_id}`,
      playerTeam: p?.team ?? "",
      playerImage: p?.image ?? null,
      twinId: r.twin_player_id,
      twinName: t?.name ?? `Spelare ${r.twin_player_id}`,
      twinTeam: t?.team ?? "",
      twinImage: t?.image ?? null,
      similarity: r.similarity,
      rank: r.rank,
    };
  });

  return NextResponse.json(
    { rows },
    { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=7200" } }
  );
}
