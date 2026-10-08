import { SPORT, vertical } from "@/lib/vertical";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { fetchLeaguesWithData } from "@/lib/db/fixtures";
import { jsonContract } from "@/lib/api-contract";
import { TeamListResponseSchema } from "@/lib/api-schemas";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseConfigured()) return NextResponse.json({ teams: [], leagues: [] });
  try {
    const db = createServerClient();
    const [{ data }, withData] = await Promise.all([db
      .from("entities")
      .select("id,name,slug,metadata")
      .eq("sport", SPORT)
      .eq("type", "team")
      .in("metadata->>league", [...vertical.leagueEntities])
      .order("name"), fetchLeaguesWithData()]);
    const teams = (data ?? [])
      .filter((t) => t.slug)
      .map((t) => {
        const meta = (t.metadata ?? {}) as Record<string, unknown>;
        return {
          id: String(t.id),
          name: String(t.name),
          slug: String(t.slug),
          logo_url: (meta.logo_url as string | null) ?? null,
          league: (meta.league as string | null) ?? null,
        };
      });
    // Samma regel som webbens LeagueSwitcher: huvudligan alltid, övriga när en säsong finns.
    // Apparnas ligaväxlare ritas ur den här listan; `param` är värdet för ?liga= (null = huvudligan).
    const leagues = vertical.leagues
      .filter((l, i) => i === 0 || withData.includes(l.name))
      .map((l) => ({ name: l.name, param: l.param }));
    return jsonContract(TeamListResponseSchema, { teams, leagues }, { headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=1200" } });
  } catch (e) {
    Sentry.captureException(e);
    return NextResponse.json({ teams: [], leagues: [] }, { status: 500 });
  }
}
