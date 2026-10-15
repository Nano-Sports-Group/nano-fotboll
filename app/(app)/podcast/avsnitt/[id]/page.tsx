/**
 * app/podcast/avsnitt/[id] — Avsnittssida på Nano Podcast API.
 * ─────────────────────────────────────────────────────────────────────────────
 * Rättighetspolicy: metadata + länk till originalet, ingen RSS-beskrivning
 * (tredjepartstext), inget transkript. Ljud spelas i apparnas poddspelare direkt
 * från poddens egen källa; vi lagrar eller proxar aldrig ljud.
 * AI-delen (egen artikel + frågor) bara när podden godkänt AI-bearbetning.
 * Äldre avsnitt-id:n (nano-os) ligger kvar på /podcast/[id].
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { AppBreadcrumbs } from "@/components/ui/AppBreadcrumbs";
import { NanoEpisodeAI } from "@/components/podcast/NanoEpisodeAI";
import { jsonLd } from "@/lib/json-ld";
import { getEpisode, getShow, formatClock } from "@/lib/podcast/nano-api";
import { getSiteUrl } from "@/lib/site-url";
import { SPORT, vertical } from "@/lib/vertical";

export const revalidate = 300;

async function load(id: string) {
  const episode = await getEpisode(id);
  if (!episode) return null;
  const show = await getShow(episode.podcastId);
  // Sportseparation: hockeyavsnitt visas inte på fotbollssajten och tvärtom.
  if (!show || show.sport !== SPORT) return null;
  return { episode, show };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const data = await load((await params).id);
  if (!data) return { title: "Avsnitt hittades inte" };
  return {
    title: data.episode.title,
    description: `${data.show.title}: ${data.episode.title}`,
  };
}

export default async function NanoEpisodePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await load(id);
  if (!data) notFound();
  const { episode, show } = data;
  const listenUrl = episode.episodeUrl ?? show.websiteUrl;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            "@context": "https://schema.org",
            "@type": "PodcastEpisode",
            name: episode.title,
            partOfSeries: { "@type": "PodcastSeries", name: show.title },
            datePublished: episode.publishedAt,
            url: `${getSiteUrl()}/podcast/avsnitt/${episode.id}`,
          }),
        }}
      />
      <div className="mb-5">
        <AppBreadcrumbs
          items={[
            { label: "Poddar", href: "/podcast" },
            { label: episode.title },
          ]}
        />
      </div>

      <div className="flex items-center gap-3 mb-4">
        {(episode.artworkUrl ?? show.artworkUrl) && (
          // eslint-disable-next-line @next/next/no-img-element -- tredjeparts-CDN:er, okänd domänlista
          <img
            src={(episode.artworkUrl ?? show.artworkUrl)!}
            alt=""
            width={48}
            height={48}
            className="size-12 rounded-lg object-cover"
          />
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-pitch-ink truncate">
            {show.title}
          </p>
          {show.publisher && (
            <p className="text-xs text-muted-foreground truncate">
              {show.publisher}
            </p>
          )}
        </div>
      </div>

      <h1 className="font-bold text-3xl sm:text-4xl text-foreground mb-3 leading-tight text-balance">
        {episode.title}
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        {episode.publishedAt
          ? new Date(episode.publishedAt).toLocaleDateString("sv-SE", {
              timeZone: "Europe/Stockholm",
              day: "numeric",
              month: "long",
              year: "numeric",
            })
          : "Datum okänt"}
        {episode.durationMs ? ` · ${formatClock(episode.durationMs)}` : ""}
      </p>

      {listenUrl && (
        <a
          href={listenUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-8 inline-flex items-center gap-2 rounded-full border border-pitch/30 bg-pitch/10 px-5 py-2.5 text-sm font-medium text-pitch-ink hover:bg-pitch/15 transition-colors"
        >
          Lyssna hos {show.title}
          <ExternalLink className="size-4" />
        </a>
      )}

      <NanoEpisodeAI
        episodeId={episode.id}
        aiAvailable={show.aiFeaturesAvailable}
      />

      <p className="text-xs text-muted-foreground/80 border-t border-border pt-6">
        Ljudet kommer alltid från poddens egen källa — vi lagrar aldrig
        ljudfiler. Våra artiklar är egenskrivna med korta, exakta citat och
        angiven källa, och vi publicerar aldrig transkript.
      </p>
    </div>
  );
}
