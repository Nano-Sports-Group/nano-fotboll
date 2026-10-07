import { NextRequest, NextResponse } from "next/server";
import { fetchH2HFixtures } from "@/lib/db/fixtures";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { jsonContract } from "@/lib/api-contract";
import { H2HResponseSchema } from "@/lib/api-schemas";
import { SPORT, vertical } from "@/lib/vertical";

export const revalidate = 3600;

type TeamRow = {
  name: string;
  slug: string;
  sportmonks_id: number | null;
  sportsmonks_id: number | null;
};

async function resolveTeam(slug: string): Promise<TeamRow | null> {
  const { data } = await createServerClient()
    .from("entities")
    .select("name,slug,sportmonks_id,sportsmonks_id")
    .eq("sport", SPORT)
    .eq("type", "team")
    .in("metadata->>league", [...vertical.leagueEntities])
    .eq("slug", slug)
    .maybeSingle();
  if (!data?.slug) return null;
  return data as TeamRow;
}

function teamId(row: TeamRow): number | null {
  const id = row.sportmonks_id ?? row.sportsmonks_id;
  return id != null ? Number(id) : null;
}

function homeGoals(fixture: Awaited<ReturnType<typeof fetchH2HFixtures>>[number]) {
  return fixture.scores?.find((s) => s.score.participant === "home")?.score.goals ?? null;
}

function awayGoals(fixture: Awaited<ReturnType<typeof fetchH2HFixtures>>[number]) {
  return fixture.scores?.find((s) => s.score.participant === "away")?.score.goals ?? null;
}

export async function GET(request: NextRequest) {
  const teamASlug = request.nextUrl.searchParams.get("teamA")?.trim();
  const teamBSlug = request.nextUrl.searchParams.get("teamB")?.trim();

  if (!teamASlug || !teamBSlug) {
    return NextResponse.json(
      { error: "teamA och teamB krävs som slug-parametrar." },
      { status: 400 },
    );
  }
  if (teamASlug === teamBSlug) {
    return NextResponse.json(
      { error: "Välj två olika lag." },
      { status: 400 },
    );
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ teamA: null, teamB: null, summary: null, fixtures: [] });
  }

  const [teamA, teamB] = await Promise.all([
    resolveTeam(teamASlug),
    resolveTeam(teamBSlug),
  ]);
  if (!teamA || !teamB) {
    return NextResponse.json({ error: "Lag hittades inte." }, { status: 404 });
  }

  const teamAId = teamId(teamA);
  const teamBId = teamId(teamB);
  if (!teamAId || !teamBId) {
    return NextResponse.json({ error: "Lag saknar sportmonks-id." }, { status: 404 });
  }

  const fixtures = await fetchH2HFixtures(teamAId, teamBId);

  let teamAWins = 0;
  let teamBWins = 0;
  let draws = 0;

  const rows = fixtures.map((fixture) => {
    const home = fixture.participants.find((p) => p.meta.location === "home");
    const away = fixture.participants.find((p) => p.meta.location === "away");
    const hg = homeGoals(fixture);
    const ag = awayGoals(fixture);

    if (hg != null && ag != null) {
      const aIsHome = home?.id === teamAId;
      const aGoals = aIsHome ? hg : ag;
      const bGoals = aIsHome ? ag : hg;
      if (aGoals > bGoals) teamAWins++;
      else if (bGoals > aGoals) teamBWins++;
      else draws++;
    }

    return {
      id: fixture.id,
      kickoff: fixture.starting_at,
      status: fixture.state.short_name ?? fixture.state.state,
      homeTeam: home?.name ?? "",
      awayTeam: away?.name ?? "",
      homeScore: hg,
      awayScore: ag,
    };
  });

  return jsonContract(H2HResponseSchema,
    {
      teamA: { name: teamA.name, slug: teamA.slug },
      teamB: { name: teamB.name, slug: teamB.slug },
      summary: { teamAWins, teamBWins, draws },
      fixtures: rows,
    },
    { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=7200" } },
  );
}
