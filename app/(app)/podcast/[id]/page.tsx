/**
 * app/podcast/[id]/page.tsx — Podcast-episodsida (copyright-säker)
 * ─────────────────────────────────────────────────────────────────────────────
 * - Spotify embed eller outbound listen link
 * - Ingen HTML5-spelare på raw enclosure
 * - Inget publikt transkript (intern RAG i athopia-os)
 * - JSON-LD: PodcastEpisode med url till denna sida
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ExternalLink, Mic } from "lucide-react";
import { createServerClient } from "@/lib/supabase";
import { formatPodcastContextLine } from "@/lib/podcast/rights";
import { PodcastEpisodeIntel } from "@/components/podcast/PodcastEpisodeIntel";
import {
  listenMetaFromRow,
  spotifyEpisodeEmbedUrl,
  spotifyShowEmbedUrl,
} from "@/lib/podcast/spotify";
import { AppBreadcrumbs } from "@/components/ui/AppBreadcrumbs";
import { jsonLd } from "@/lib/json-ld";
import { getSiteUrl } from "@/lib/site-url";

export const revalidate = 300;

type EpisodeRow = {
  id: string;
  title: string;
  show_name: string | null;
  published_at: string | null;
  duration_seconds: number | null;
  mentioned_teams: string[] | null;
  metadata: Record<string, unknown> | null;
  audio_url: string | null;
  is_transcribed: boolean;
};

async function getEpisode(id: string): Promise<EpisodeRow | null> {
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from("podcasts")
      .select("id, title, show_name, published_at, duration_seconds, mentioned_teams, metadata, audio_url, is_transcribed")
      .eq("id", id)
      .maybeSingle();
    return data as EpisodeRow | null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const episode = await getEpisode(id);
  if (!episode) return { title: "Avsnitt hittades inte" };

  return {
    title: episode.title,
    description: `${episode.show_name ?? "Podcast"}: ${episode.title}`,
  };
}

function EpisodeJsonLd({ ep }: { ep: EpisodeRow }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "PodcastEpisode",
    name: ep.title,
    partOfSeries: { "@type": "PodcastSeries", name: ep.show_name ?? "Podcast" },
    datePublished: ep.published_at,
    url: `${getSiteUrl()}/podcast/${ep.id}`,
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLd(data) }}
    />
  );
}

function formatDuration(s: number | null) {
  if (!s) return null;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default async function PodcastEpisodePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const episode = await getEpisode(id);
  if (!episode) notFound();

  const supabase = createServerClient();
  const { count } = await supabase
    .from("podcast_chunks")
    .select("id", { count: "exact", head: true })
    .eq("podcast_id", episode.id);

  const meta = (episode.metadata ?? {}) as Record<string, unknown>;
  const topics = Array.isArray(meta.topics) ? (meta.topics as string[]) : [];
  const listen = listenMetaFromRow(meta, null, episode.audio_url ?? null);
  const context = formatPodcastContextLine(topics, episode.mentioned_teams ?? []);
  const hasSource = episode.is_transcribed || (count ?? 0) > 0;

  return (
    <>
      <EpisodeJsonLd ep={episode} />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-5">
          <AppBreadcrumbs
            items={[
              { label: "Poddar", href: "/podcast" },
              { label: episode.title },
            ]}
          />
        </div>
        <div className="flex items-center gap-2 mb-3">
          <Mic className="w-4 h-4 text-pitch-ink" />
          <span className="text-sm text-pitch-ink font-medium">{episode.show_name ?? "Podcast"}</span>
        </div>

        <h1 className="font-bold text-3xl sm:text-4xl text-foreground mb-4 leading-tight text-balance">
          {episode.title}
        </h1>

        {context && (
          <p className="text-sm text-muted-foreground mb-4">{context}</p>
        )}

        <p className="text-sm text-muted-foreground mb-8">
          {episode.published_at
            ? new Date(episode.published_at).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm",
                day: "numeric",
                month: "long",
                year: "numeric",
              })
            : "Datum okänt"}
          {formatDuration(episode.duration_seconds) ? ` · ${formatDuration(episode.duration_seconds)}` : ""}
        </p>

        <div className="mb-8 space-y-4">
          {listen.spotifyEpisodeId ? (
            <iframe
              src={spotifyEpisodeEmbedUrl(listen.spotifyEpisodeId)}
              width="100%"
              height="352"
              frameBorder="0"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
              className="rounded-xl"
              title={`Spela ${episode.title} på Spotify`}
            />
          ) : listen.spotifyShowId ? (
            <iframe
              src={spotifyShowEmbedUrl(listen.spotifyShowId)}
              width="100%"
              height="352"
              frameBorder="0"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
              className="rounded-xl"
              title={`${episode.show_name ?? "Podcast"} på Spotify`}
            />
          ) : listen.listenUrl ? (
            <a
              href={listen.listenUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-pitch/30 bg-pitch/10 px-5 py-3 text-sm font-medium text-pitch-ink hover:bg-pitch/15 transition-colors"
            >
              Lyssna hos {episode.show_name ?? "källan"}
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">
              Ingen officiell lyssningslänk ännu — avsnittet indexeras internt för lagkontext.
            </p>
          )}
        </div>

        <PodcastEpisodeIntel
          episodeId={episode.id}
          episodeTitle={episode.title}
          mentionedTeams={episode.mentioned_teams ?? []}
          hasSource={hasSource}
        />

        <p className="text-xs text-muted-foreground/80 border-t border-border pt-6">
          Nano Fotboll länkar till originalkällan och använder Spotifys officiella spelare när det finns.
          Vi publicerar inte transkript eller strömmar ljudfiler direkt. Se{" "}
          <Link href="/podcast" className="text-pitch-ink hover:underline">
            alla avsnitt
          </Link>
          .
        </p>

        <div className="mt-8">
          <Link
            href="/podcast"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Tillbaka till alla avsnitt
          </Link>
        </div>
      </div>
    </>
  );
}
