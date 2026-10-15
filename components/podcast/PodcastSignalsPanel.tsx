'use client'

import Link from 'next/link'
import { ExternalLink, Podcast } from 'lucide-react'
import type { PodcastEpisodeSignal } from '@/lib/types'
import type { Plan } from '@/lib/access-rules'
import { canAccess } from '@/lib/access-rules'
import { formatPodcastContextLine } from '@/lib/podcast/rights'
import {
  spotifyEpisodeEmbedUrl,
  spotifyShowEmbedUrl,
  teamSpotifyShowId,
} from '@/lib/podcast/spotify'

function EpisodeListenBlock({
  signal,
  teamSlug,
}: {
  signal: PodcastEpisodeSignal
  teamSlug?: string | null
}) {
  if (signal.spotifyEpisodeId) {
    return (
      <iframe
        src={spotifyEpisodeEmbedUrl(signal.spotifyEpisodeId)}
        width="100%"
        height="152"
        frameBorder="0"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
        className="rounded-xl"
        title={`Spela ${signal.title} på Spotify`}
      />
    )
  }

  const showId =
    signal.spotifyShowId ?? teamSpotifyShowId(teamSlug ?? null)

  if (showId) {
    return (
      <iframe
        src={spotifyShowEmbedUrl(showId)}
        width="100%"
        height="152"
        frameBorder="0"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
        className="rounded-xl"
        title={`${signal.showName} på Spotify`}
      />
    )
  }

  if (signal.listenUrl) {
    return (
      <a
        href={signal.listenUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-pitch-ink hover:border-pitch/40 transition-colors"
      >
        Lyssna hos {signal.showName}
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    )
  }

  return (
    <Link
      href={`/podcast/${signal.id}`}
      className="text-sm text-pitch-ink hover:underline"
    >
      Se avsnitt →
    </Link>
  )
}

function SignalCard({
  signal,
  teamSlug,
}: {
  signal: PodcastEpisodeSignal
  teamSlug?: string | null
}) {
  const context = formatPodcastContextLine(signal.topics, signal.mentionedTeams)
  const date = signal.publishedAt
    ? new Date(signal.publishedAt).toLocaleDateString('sv-SE', { timeZone: "Europe/Stockholm", day: 'numeric', month: 'short' })
    : null

  return (
    <article className="rounded-lg border border-border/70 bg-background/50 p-3 space-y-3">
      <div>
        <p className="text-xs font-medium text-muted-foreground">{signal.showName}{date ? ` · ${date}` : ''}</p>
        <h4 className="text-sm font-semibold text-foreground mt-1 leading-snug">{signal.title}</h4>
        {context && (
          <p className="text-xs text-muted-foreground mt-1">{context}</p>
        )}
      </div>
      <EpisodeListenBlock signal={signal} teamSlug={teamSlug} />
      <p className="text-xs text-muted-foreground/70">
        Ljud spelas via Spotify eller hos originalkällan — Nano Fotboll lagrar inga ljudfiler och publicerar inga transkript.
      </p>
    </article>
  )
}

export function PodcastSignalsPanel({
  signals,
  plan,
  title = 'Podcast',
  teamSlug,
}: {
  signals: PodcastEpisodeSignal[]
  plan: Plan
  title?: string
  teamSlug?: string | null
}) {
  if (signals.length === 0) return null

  const hasAccess = canAccess('podcastClips', plan)

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Podcast className="h-4 w-4 text-sky-400" />
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground text-balance">{title}</h2>
      </div>

      {!hasAccess ? (
        <p className="text-sm text-muted-foreground">
          PRO visar poddavsnitt relevanta för ditt lag — med officiell Spotify-spelare.{' '}
          <Link href="/prenumerera" className="text-pitch-ink hover:underline">
            Uppgradera
          </Link>
        </p>
      ) : (
        <div className="space-y-4">
          {signals.map((signal) => (
            <SignalCard key={signal.id} signal={signal} teamSlug={teamSlug} />
          ))}
        </div>
      )}
    </section>
  )
}

/** @deprecated Use PodcastSignalsPanel */
export const PodcastClipsPanel = PodcastSignalsPanel
