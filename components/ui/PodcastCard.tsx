/**
 * PodcastCard
 * Visar en podcast med:
 *  - show-namn + episodtitel
 *  - duration (1h 23min)
 *  - transkript-badge om transkript finns
 *  - entiteter (top 3)
 */

import Link from "next/link";
import { Mic, FileText, Clock, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EntityChip } from "./EntityChip";
import type { Podcast } from "@/lib/types";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface PodcastCardProps {
  podcast: Podcast;
}

function formatDuration(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

export function PodcastCard({ podcast }: PodcastCardProps) {
  return (
    <Link
      href={`/podcast/${podcast.id}`}
      className="group relative flex gap-4 p-4 rounded-2xl border border-border bg-card hover:border-pitch/40 transition-all duration-200 hover:shadow-[0_0_16px_color-mix(in_srgb,var(--pitch)_8%,transparent)] overflow-hidden"
    >
      {/* Thumbnail */}
      <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-secondary shrink-0">
        {podcast.imageUrl ? (
          <Image src={podcast.imageUrl} alt={podcast.title} fill className="object-cover" sizes="64px" />
        ) : (
          <div className="absolute inset-0 pitch-gradient opacity-60" />
        )}
        <div
          className={cn(
            "absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity",
            "bg-black/30"
          )}
        >
          <Play className="w-5 h-5 text-white" />
        </div>
      </div>

      {/* Innehåll */}
      <div className="flex flex-col gap-2 min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-pitch-ink font-medium mb-0.5 truncate">
              {podcast.showName}
            </p>
            <h3 className="font-heading text-lg text-foreground line-clamp-2 group-hover:text-pitch-ink transition-colors leading-tight text-balance">
              {podcast.title}
            </h3>
          </div>

          {/* Transkript-badge */}
          {podcast.hasTranscript && (
            <Badge
              variant="outline"
              className="text-xs border-pitch/40 text-pitch-ink shrink-0 gap-1"
            >
              <FileText className="w-3 h-3" />
              Indexerad
            </Badge>
          )}
        </div>

        <div className="flex items-center justify-between">
          {/* Entiteter */}
          <div className="flex flex-wrap gap-1">
            {podcast.entities?.slice(0, 3).map((e) => (
              <EntityChip key={e.id} entity={e} size="sm" linked={false} />
            ))}
          </div>

          {/* Duration */}
          <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
            <Clock className="w-3 h-3" />
            {formatDuration(podcast.durationSeconds)}
          </span>
        </div>
      </div>
    </Link>
  );
}
