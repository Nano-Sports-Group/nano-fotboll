"use client";

import { fixtureHref } from "@/lib/match/slug";
import Link from "next/link";
import { MessageSquare, Newspaper, Podcast, Star } from "lucide-react";
import type { TeamFeedItem, FixtureRow } from "@/lib/team-hub/queries";
import { type Plan, canAccess } from "@/lib/access-rules";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { Card as TactileCard } from "@/components/ui/TactileCard";

const rowClass =
  "group flex items-start justify-between gap-3 rounded-lg border border-border/60 px-3 py-2.5 hover:border-pitch/50 transition-colors active:bg-muted touch-manipulation";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just nu";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/**
 * TeamFeed — kronologiskt scroll av allt som hänt kring laget (Hypertexting-
 * inspirerat: en tidslinje istället för separata kort per innehållstyp).
 * Ren presentation — datan är redan hämtad och sammanslagen av buildTeamFeed().
 */
export function TeamFeed({
  items,
  teamSlug,
  teamName,
  plan,
}: {
  items: TeamFeedItem[];
  teamSlug: string;
  teamName: string;
  plan: Plan;
}) {
  if (items.length === 0) {
    return (
      <TactileCard className="px-4 py-10 text-center">
        <p className="text-sm text-muted-foreground">Inget att visa ännu — flödet fylls på när nyheter, matcher och diskussioner kommer in.</p>
      </TactileCard>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {items.map((item, i) => (
        <FeedRow key={`${item.kind}-${i}`} item={item} teamSlug={teamSlug} teamName={teamName} plan={plan} />
      ))}
    </div>
  );
}

function FeedRow({ item, teamSlug, teamName, plan }: { item: TeamFeedItem; teamSlug: string; teamName: string; plan: Plan }) {
  switch (item.kind) {
    case "pulse": {
      const p = item.pulse;
      const ctx = p.match_context_label === "pre_match" ? "Inför match"
        : p.match_context_label === "post_match_hold" ? "Efter match" : "Dagsläge";
      const unlocked = canAccess("aiSummaries", plan);
      return (
        <TactileCard className="px-4 py-3.5 space-y-2">
          <div className="flex items-center gap-2">
            <Star className="h-3.5 w-3.5 text-pitch-ink" />
            <span className="text-xs font-semibold uppercase tracking-wide text-pitch-ink">Nano Fotboll AI · {ctx}</span>
          </div>
          <h3 className="text-base font-bold leading-snug text-foreground text-balance">{p.headline}</h3>
          {unlocked ? (
            <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-line">{p.body}</p>
          ) : (
            <>
              {p.dek && <p className="text-sm text-muted-foreground">{p.dek}</p>}
              <UpgradePrompt feature="aiSummaries" teamName={teamName} />
            </>
          )}
        </TactileCard>
      );
    }

    case "news":
      return (
        <Link href={`/artikel/${item.article.slug}`} className={rowClass}>
          <span className="flex items-center gap-2 min-w-0">
            <Newspaper className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-sm text-foreground group-hover:text-pitch-ink line-clamp-2">{item.article.title}</span>
          </span>
          <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{timeAgo(item.article.published_at)}</span>
        </Link>
      );

    case "thread":
      return (
        <Link href={`/forum/${teamSlug}/${item.thread.id}`} className={rowClass}>
          <span className="flex items-center gap-2 min-w-0">
            <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-sm text-foreground group-hover:text-pitch-ink line-clamp-2">{item.thread.title}</span>
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
            {item.thread.reply_count > 0 && `${item.thread.reply_count} svar · `}{timeAgo(item.thread.created_at)}
          </span>
        </Link>
      );

    case "fixture":
      return <FixtureRowCard fixture={item.fixture} />;

    case "podcast":
      return (
        <a href={item.podcast.listenUrl ?? "#"} target="_blank" rel="noreferrer" className={rowClass}>
          <span className="flex items-center gap-2 min-w-0">
            <Podcast className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="block text-sm text-foreground group-hover:text-pitch-ink line-clamp-1">{item.podcast.title}</span>
              <span className="block text-xs text-muted-foreground">{item.podcast.showName}</span>
            </span>
          </span>
          {item.podcast.publishedAt && (
            <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{timeAgo(item.podcast.publishedAt)}</span>
          )}
        </a>
      );
  }
}

function FixtureRowCard({ fixture: f }: { fixture: FixtureRow }) {
  return (
    <Link href={fixtureHref(f)} className={rowClass}>
      <span className="text-sm text-foreground group-hover:text-pitch-ink">
        {f.home_team_name} <span className="font-semibold font-mono tabular-nums">{f.home_score}–{f.away_score}</span> {f.away_team_name}
      </span>
      <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
        {f.kickoff_at ? timeAgo(f.kickoff_at) : ""}
      </span>
    </Link>
  );
}
