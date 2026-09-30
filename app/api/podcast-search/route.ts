import { NextResponse } from "next/server";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { enforceRateLimit } from "@/lib/ratelimit";
import { listenMetaFromRow } from "@/lib/podcast/spotify";
import { excerptAround } from "@/lib/podcast/rights";
import { getUserPlan } from "@/lib/user-plan";
import { canAccess } from "@/lib/access-rules";
import { contentCutoffIso } from "@/lib/content-window";

interface Clip {
  episodeId: string;
  episodeTitle: string;
  showName: string | null;
  publishedAt: string | null;
  quote: string;
  startSeconds: number | null;
}

/**
 * Sagt-i-poddarna: chunk-sök med KORTA citat + attribution.
 * Founder-beslut 2026-07-10 (rights.ts): PRO ser klippen, free ser ett
 * teaser-klipp + gated-flagga. Plan avgörs ALLTID server-side.
 */
async function searchClips(
  supabase: ReturnType<typeof createServerClient>,
  q: string,
  isPro: boolean,
): Promise<{ clips: Clip[]; clipsGated: boolean }> {
  const { data } = await supabase
    .from("podcast_chunks")
    .select("text, start_seconds, podcasts!inner(id, title, show_name, published_at)")
    .ilike("text", `%${q}%`)
    .limit(isPro ? 8 : 1);

  type Row = {
    text: string;
    start_seconds: number | null;
    podcasts: { id: string; title: string; show_name: string | null; published_at: string | null };
  };
  const clips = ((data ?? []) as unknown as Row[]).map((r) => ({
    episodeId: r.podcasts.id,
    episodeTitle: r.podcasts.title,
    showName: r.podcasts.show_name,
    publishedAt: r.podcasts.published_at,
    quote: excerptAround(r.text, q),
    startSeconds: r.start_seconds,
  }));
  return { clips, clipsGated: !isPro && clips.length > 0 };
}

/** Sök poddavsnitt (metadata) + PRO-gated citatklipp ur transkripten. */
export async function GET(req: Request) {
  const blocked = await enforceRateLimit("search", req);
  if (blocked) return blocked;

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim().slice(0, 100);
  if (!q) return NextResponse.json({ episodes: [], clips: [], clipsGated: false });
  if (!isSupabaseConfigured()) return NextResponse.json({ episodes: [], clips: [], clipsGated: false });

  try {
    const supabase = createServerClient();
    const plan = await getUserPlan();
    const isPro = canAccess("podcastClips", plan);

    const [{ data: episodes }, clipResult] = await Promise.all([
      supabase
        .from("podcasts")
        .select("id, title, show_name, published_at, mentioned_teams, metadata")
        .or(`title.ilike.%${q}%,show_name.ilike.%${q}%`)
        .gte("published_at", contentCutoffIso())
        .order("published_at", { ascending: false })
        .limit(10),
      searchClips(supabase, q, isPro),
    ]);

    const safe = (episodes ?? []).map((ep) => {
      const meta = (ep.metadata ?? {}) as Record<string, unknown>;
      const listen = listenMetaFromRow(meta);
      return {
        id: ep.id,
        title: ep.title,
        showName: ep.show_name,
        publishedAt: ep.published_at,
        mentionedTeams: ep.mentioned_teams ?? [],
        topics: Array.isArray(meta.topics) ? meta.topics : [],
        listenUrl: listen.listenUrl,
        spotifyEpisodeId: listen.spotifyEpisodeId,
      };
    });

    return NextResponse.json({ episodes: safe, ...clipResult });
  } catch (e) {
    console.error("[podcast-search]", e);
    return NextResponse.json({ episodes: [], clips: [], clipsGated: false });
  }
}
