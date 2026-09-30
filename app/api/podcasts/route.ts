import { SPORT } from "@/lib/vertical";
import { NextRequest, NextResponse } from "next/server";
import { listenMetaFromRow } from "@/lib/podcast/spotify";
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
};

function publicEpisode(row: PodcastRow) {
  const listen = listenMetaFromRow(row.metadata, null, row.audio_url);
  return {
    id: row.id,
    title: row.title,
    showName: row.show_name ?? "Podcast",
    publishedAt: row.published_at,
    durationSeconds: row.duration_seconds,
    mentionedTeams: row.mentioned_teams ?? [],
    listenUrl: listen.spotifyEpisodeId
      ? `https://open.spotify.com/episode/${listen.spotifyEpisodeId}`
      : listen.spotifyShowId
        ? `https://open.spotify.com/show/${listen.spotifyShowId}`
        : listen.listenUrl,
  };
}

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ episodes: [] });
  }

  const id = request.nextUrl.searchParams.get("id");
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? 40);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 50)
    : 40;
  const db = createServerClient();

  let query = db
    .from("podcasts")
    .select(
      "id,title,show_name,published_at,duration_seconds,mentioned_teams,metadata,audio_url,rss_sources!inner(sport)",
    )
    .eq("rss_sources.sport", SPORT);

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
