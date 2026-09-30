/**
 * /api/gamification/league — fan-ligor (en per lag i aktuell liga).
 *
 * GET:  ligorna som går att gå med i — fan_leagues filtrerade mot vertikalens lag i
 *       entities, så nedflyttade lag försvinner och hockeyn inte får fotbollslag.
 * POST: { teamSlug } → gå med i lagets liga (en liga per användare).
 *
 * Tidigare skrev klienten direkt med anon-nyckeln. anon/authenticated har bara SELECT
 * (säkerhetsdoktrinen), så ingen hade någonsin kommit med: 0 medlemskap 2026-09-30.
 * Identiteten kommer från sessionen, skrivningen sker med service_role.
 */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { enforceRateLimit } from "@/lib/ratelimit";
import { SPORT, vertical } from "@/lib/vertical";

type League = { id: string; team_slug: string; team_name: string };

async function joinableLeagues(): Promise<League[]> {
  const db = createServerClient();
  const { data: teams } = await db
    .from("entities")
    .select("slug")
    .eq("type", "team")
    .eq("sport", SPORT)
    .eq("metadata->>league", vertical.leagueEntity)
    .not("slug", "is", null);
  const slugs = (teams ?? []).map((t) => String(t.slug));
  if (slugs.length === 0) return [];
  const { data } = await db
    .from("fan_leagues")
    .select("id, team_slug, team_name")
    .in("team_slug", slugs)
    .order("team_name", { ascending: true });
  return (data ?? []) as League[];
}

export async function GET() {
  if (!isSupabaseConfigured()) return NextResponse.json({ leagues: [] });
  return NextResponse.json({ leagues: await joinableLeagues() });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Logga in först" }, { status: 401 });
  const blocked = await enforceRateLimit("write", req, userId);
  if (blocked) return blocked;

  let teamSlug: unknown;
  try {
    ({ teamSlug } = (await req.json()) as { teamSlug?: unknown });
  } catch {
    return NextResponse.json({ error: "Ogiltig begäran" }, { status: 400 });
  }
  if (typeof teamSlug !== "string" || !teamSlug) {
    return NextResponse.json({ error: "Välj ett lag" }, { status: 400 });
  }

  // Bara ligor för vertikalens nuvarande lag — slugen i bodyn väljer, avgör aldrig behörighet.
  const league = (await joinableLeagues()).find((l) => l.team_slug === teamSlug);
  if (!league) return NextResponse.json({ error: "Laget har ingen liga" }, { status: 404 });

  const { error } = await createServerClient()
    .from("user_league_memberships")
    .upsert({ clerk_user_id: userId, league_id: league.id }, { onConflict: "clerk_user_id" });
  if (error) return NextResponse.json({ error: "Kunde inte gå med" }, { status: 500 });

  return NextResponse.json({ ok: true, league });
}
