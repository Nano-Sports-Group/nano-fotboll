import { NextRequest, NextResponse } from "next/server";
import { fetchStandingsFull, fetchStandingsCoveredThrough } from "@/lib/db/fixtures";
import { freshnessOf } from "@/lib/data-freshness";
import { jsonContract } from "@/lib/api-contract";
import { StandingsResponseSchema } from "@/lib/api-schemas";
import { leagueFromParam } from "@/lib/vertical";

export const revalidate = 300;

/** `?liga=superettan` / `?liga=hockeyallsvenskan` väljer serie. Utan param = huvudligan. */
export async function GET(request: NextRequest) {
  const league = leagueFromParam(request.nextUrl.searchParams.get("liga") ?? undefined);
  const [rows, coveredThrough] = await Promise.all([
    fetchStandingsFull(league),
    fetchStandingsCoveredThrough(),
  ]);
  const standings = rows.map((r, i) => ({
    id: String(r.team.id || i),
    position: r.position,
    teamId: r.team.id,
    teamName: r.team.name,
    teamSlug: r.team.slug,
    played: r.played,
    won: r.wins,
    drawn: r.draws,
    lost: r.losses,
    goalsFor: r.goals_for,
    goalsAgainst: r.goals_against,
    points: r.points,
    form: r.form,
    trend: r.trend,
  }));

  // Konsumenten (web, iOS) ska kunna se hur gammal tabellen är utan att gissa.
  const freshness = freshnessOf(coveredThrough);

  return jsonContract(StandingsResponseSchema,
    { standings, coveredThrough: freshness.coveredThrough, stale: freshness.stale },
    { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" } }
  );
}
