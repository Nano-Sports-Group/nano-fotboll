"use client";

import Link from "next/link";
import { useGolfFollows } from "@/hooks/useGolfFollows";
import { getPlayer, getTour } from "@/lib/golf/catalog";
import { followCount } from "@/lib/golf/follows";
import { PlayerMark } from "./cards";

/**
 * "Du följer" — golfens motsvarighet till Mitt lag. Den som inte följer någon får ett första steg
 * i stället för en tom lista. `manage` visar länkarna till hela listorna (profilen).
 */
export function Following({ manage = false }: { manage?: boolean }) {
  const { follows, isLoaded } = useGolfFollows();

  if (!isLoaded) return <div className="h-28 animate-pulse rounded-2xl bg-card" aria-hidden />;

  if (followCount(follows) === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="font-semibold text-foreground">Välj vilka du vill följa</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Följ spelare och tourer, så utgår flödet och startsidan från dem när bevakningen startar.
        </p>
        <Link
          href="/golf/spelare"
          className="mt-4 inline-flex min-h-11 items-center rounded-full border border-border bg-background px-5 text-sm font-medium text-foreground transition-colors hover:border-pitch/40 active:scale-[0.97] touch-manipulation"
        >
          Välj spelare
        </Link>
      </div>
    );
  }

  const players = follows.players.map(getPlayer).filter((p) => p !== undefined);
  const tours = follows.tours.map(getTour).filter((t) => t !== undefined);

  return (
    <div className="space-y-3">
      {players.length > 0 && (
        <ul className="flex gap-3 overflow-x-auto pb-1">
          {players.map((player) => (
            <li key={player.slug} className="shrink-0">
              <Link
                href={`/golf/spelare/${player.slug}`}
                className="flex w-24 flex-col items-center gap-2 rounded-2xl border border-border bg-card px-2 py-3 text-center transition-colors hover:border-pitch/40"
              >
                <PlayerMark name={player.name} />
                <span className="line-clamp-2 text-xs font-medium leading-tight text-foreground">{player.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {tours.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {tours.map((tour) => (
            <li key={tour.slug}>
              <Link
                href={`/golf/tourer/${tour.slug}`}
                className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:border-pitch/40"
              >
                {tour.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {manage && (
        <p className="text-sm text-muted-foreground">
          <Link href="/golf/spelare" className="text-pitch-ink hover:underline">Alla spelare</Link>
          {" · "}
          <Link href="/golf/tourer" className="text-pitch-ink hover:underline">Alla tourer</Link>
        </p>
      )}
    </div>
  );
}
