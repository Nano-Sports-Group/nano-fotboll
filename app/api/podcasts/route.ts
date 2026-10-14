import { SPORT } from "@/lib/vertical";
import { NextRequest, NextResponse } from "next/server";
import { listenMetaFromRow } from "@/lib/podcast/spotify";
import { applePodcastShowUrl } from "@/lib/podcast/apple";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { jsonContract } from "@/lib/api-contract";
import { PodcastListResponseSchema, PodcastEpisodeResponseSchema } from "@/lib/api-schemas";
import { contentCutoffIso } from "@/lib/content-window";


type PodcastRow = {
  id: string;
  title: string;
  show_name: string | null;
  published_at: string | null;
  duration_seconds: number | null;
  mentioned_teams: string[] | null;
  metadata: Record<string, unknown> | null;
  audio_url: string | null;
  rss_sources: { apple_podcast_show_id: string | null } | { apple_podcast_show_id: string | null }[] | null;
};

/** Supabase embedar en-till-en-relationer som objekt eller en array beroende på join-form. */
function appleShowIdFromRow(row: PodcastRow): string | null {
  const rel = row.rss_sources;
  if (!rel) return null;
  const source = Array.isArray(rel) ? rel[0] : rel;
  return source?.apple_podcast_show_id ?? null;
}

/** metadata.discussed_teams skrivs av nano-os (podcast-processor.ts) — alltid en delmängd
 * av mentioned_teams, lag avsnittet faktiskt handlar om, inte bara nämner. */
function discussedTeamsFromMeta(metadata: Record<string, unknown> | null): string[] {
  const raw = metadata?.discussed_teams;
  return Array.isArray(raw) ? raw.filter((t): t is string => typeof t === "string") : [];
}

function publicEpisode(row: PodcastRow) {
  const listen = listenMetaFromRow(row.metadata, null, row.audio_url);
  return {
    id: row.id,
    title: row.title,
    showName: row.show_name ?? "Podcast",
    publishedAt: row.published_at,
    durationSeconds: row.duration_seconds,
    mentionedTeams: row.mentioned_teams ?? [],
    discussedTeams: discussedTeamsFromMeta(row.metadata),
    listenUrl: listen.spotifyEpisodeId
      ? `https://open.spotify.com/episode/${listen.spotifyEpisodeId}`
      : listen.spotifyShowId
        ? `https://open.spotify.com/show/${listen.spotifyShowId}`
        : listen.listenUrl,
    applePodcastUrl: applePodcastShowUrl(appleShowIdFromRow(row)),
  };
}

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ episodes: [] });
  }

  const id = request.nextUrl.searchParams.get("id");
  const team = request.nextUrl.searchParams.get("team")?.trim() || null;
  const show = request.nextUrl.searchParams.get("show")?.trim() || null;
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? 40);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 50)
    : 40;
  const db = createServerClient();

  let query = db
    .from("podcasts")
    .select(
      "id,title,show_name,published_at,duration_seconds,mentioned_teams,metadata,audio_url,rss_sources!inner(sport,apple_podcast_show_id)",
    )
    .eq("rss_sources.sport", SPORT);
  // Filter på lag matchar både nämnt och diskuterat — diskuterat är en delmängd av nämnt,
  // så ett overlaps mot mentioned_teams täcker filtret utan en separat kolumnfråga.
  if (team) query = query.overlaps("mentioned_teams", [team]);
  if (show) query = query.eq("show_name", show);

  if (id) {
    const { data, error } = await query.eq("id", id).maybeSingle();
    if (error || !data) {
      return NextResponse.json(
        { error: "Avsnitt hittades inte", code: "not_found" },
        { status: 404 },
      );
    }
    return jsonContract(PodcastEpisodeResponseSchema, { episode: publicEpisode(data as unknown as PodcastRow) });
  }

  const { data, error } = await query
    .gte("published_at", contentCutoffIso())
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[podcasts GET]", error);
    return NextResponse.json({ error: "Kunde inte ladda poddar" }, { status: 500 });
  }

  return jsonContract(PodcastListResponseSchema, {
    episodes: (data ?? []).map((row) => publicEpisode(row as unknown as PodcastRow)),
  });
}
