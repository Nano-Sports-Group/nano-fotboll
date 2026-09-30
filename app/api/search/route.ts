import { SPORT, vertical } from "@/lib/vertical";
import { NextResponse } from "next/server";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { enforceRateLimit } from "@/lib/ratelimit";
import { jsonContract } from "@/lib/api-contract";
import { SearchResponseSchema } from "@/lib/api-schemas";
import { contentCutoffIso } from "@/lib/content-window";

export async function GET(req: Request) {
  // Sök är dyr + missbruksbar → rate-limit (per IP för anon, per user om inloggad)
  const blocked = await enforceRateLimit("search", req);
  if (blocked) return blocked;

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim().slice(0, 100);
  if (!q) return NextResponse.json({ articles: [], teams: [], players: [], podcasts: [] });
  if (!isSupabaseConfigured()) return NextResponse.json({ articles: [], teams: [], players: [], podcasts: [] });

  try {
    const supabase = createServerClient();

    const [{ data: articles }, { data: teams }, { data: players }, { data: podcasts }] =
      await Promise.all([
        supabase
          .from("articles")
          .select("id,slug,title")
          .eq("sport", SPORT)
          .eq("status", "published")
          .not("slug", "is", null)
          .neq("slug", "")
          .ilike("title", `%${q}%`)
          .gte("published_at", contentCutoffIso())
          .limit(6),
        supabase
          .from("entities")
          .select("id,slug,name")
          .eq("type", "team")
          .eq("sport", SPORT)
          .eq("metadata->>league", vertical.leagueEntity)
          .ilike("name", `%${q}%`)
          .limit(6),
        supabase
          .from("players")
          .select("sportmonks_id,slug,fullname")
          .eq("sport", SPORT)
          .ilike("fullname", `%${q}%`)
          .limit(6),
        supabase
          .from("podcasts")
          .select("id,title,rss_sources!inner(sport)")
          .eq("rss_sources.sport", SPORT)
          .ilike("title", `%${q}%`)
          .gte("published_at", contentCutoffIso())
          .limit(6),
      ]);

    return jsonContract(SearchResponseSchema, {
      articles: articles ?? [],
      teams: teams ?? [],
      players: (players ?? []).map((player) => ({
        id: player.sportmonks_id,
        slug: player.slug,
        name: player.fullname,
      })),
      podcasts: (podcasts ?? []).map(({ id, title }) => ({ id, title })),
    });
  } catch (e) {
    console.error("[search]", e);
    return NextResponse.json({ articles: [], teams: [], players: [], podcasts: [] });
  }
}

