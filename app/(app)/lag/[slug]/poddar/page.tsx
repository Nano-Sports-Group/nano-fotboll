import type { Metadata } from "next";
import { PodcastCard } from "@/components/ui/PodcastCard";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import type { Podcast } from "@/lib/types";
import { Mic } from "lucide-react";
import { SPORT } from "@/lib/vertical";
import { contentCutoffIso } from "@/lib/content-window";

export const dynamic = 'force-dynamic';

function mapPodcast(row: any): Podcast {
  return {
    id: String(row.id),
    showName: String(row.show_name ?? "Podcast"),
    title: String(row.title ?? ""),
    audioUrl: String(row.audio_url ?? ""),
    durationSeconds: Number(row.duration_seconds ?? 0),
    publishedAt: String(row.published_at ?? new Date().toISOString()),
    imageUrl: row.image_url ?? null,
    hasTranscript: !!(row.transcript_html ?? row.has_transcript),
    entities: Array.isArray(row.entities) ? row.entities : [],
  };
}

async function getTeamName(slug: string): Promise<string> {
  if (!isSupabaseConfigured()) return slug;
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from("entities")
      .select("name")
      .eq("slug", slug)
      .eq("type", "team")
      .eq("sport", SPORT)
      .maybeSingle();
    return data?.name ?? slug;
  } catch {
    return slug;
  }
}

async function getTeamPodcasts(teamName: string): Promise<Podcast[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from("podcasts")
      .select("*")
      .ilike("title", `%${teamName}%`)
      .gte("published_at", contentCutoffIso())
      .order("published_at", { ascending: false })
      .limit(24);
    return (data ?? []).map(mapPodcast);
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const name = await getTeamName(slug);
  return {
    title: `${name} — Podcasts`,
    description: `Podcast-avsnitt om ${name} på Nano Fotboll.`,
  };
}

export default async function LagPodcastsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const teamName = await getTeamName(slug);
  const podcasts = await getTeamPodcasts(teamName);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="font-bold text-3xl text-foreground mb-6 text-balance">
        PODCASTS — {teamName.toUpperCase()}
      </h1>

      {podcasts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
          <Mic className="w-10 h-10 opacity-30" />
          <p className="max-w-sm text-center text-sm text-balance">
            Poddavsnitt som handlar om {teamName} samlas här. Inget har
            hittats ännu — hela poddflödet finns under Podcast.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Korten är h3. Utan sektionsrubriken hoppade sidan h1 → h3. */}
          <h2 className="sr-only">Avsnitt</h2>
          {podcasts.map((podcast) => (
            <PodcastCard key={podcast.id} podcast={podcast} />
          ))}
        </div>
      )}
    </div>
  );
}
