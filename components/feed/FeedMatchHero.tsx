import { fixtureHref } from "@/lib/match/slug";
import Link from "next/link";
import { Clock, Radio } from "lucide-react";
import { formatKickoff } from "@/lib/matchday/helpers";
import { getFavoriteTeamMatchToday } from "@/lib/matchday/getFavoriteTeamMatchToday";
import { isLiveNow } from "@/lib/match/live";

export async function FeedMatchHero() {
  const data = await getFavoriteTeamMatchToday();
  if (!data) return null;

  const { teamName, match } = data;
  const isLive = isLiveNow(match.status, match.kickoff_at);
  const isFinished = match.status === "FT";
  const score =
    match.home_score != null && match.away_score != null
      ? `${match.home_score}–${match.away_score}`
      : null;

  return (
    <section className="mb-8" aria-label="Din match idag">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground text-balance">
          Din match idag
        </h2>
      </div>
      <Link
        href={fixtureHref(match)}
        className="group flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex min-w-0 items-center gap-2">
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-background">
              <Radio className="size-3 animate-pulse" />
              Live
            </span>
          ) : isFinished ? (
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Slutresultat
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Clock className="size-3" />
              Avspark {formatKickoff(match.kickoff_at)}
            </span>
          )}
          <span className="truncate text-sm font-medium text-foreground">
            {match.home_team_name} {score ?? "–"} {match.away_team_name}
          </span>
        </div>
        <span className="text-xs text-muted-foreground group-hover:text-foreground">
          {isLive
            ? `Följ ${teamName} live →`
            : isFinished
              ? "Se statistik & analys →"
              : "Inför matchen →"}
        </span>
      </Link>
    </section>
  );
}
