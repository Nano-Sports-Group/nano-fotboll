import Link from "next/link";
import { getTour, playersOnTour, type GolfPlayer, type GolfTour } from "@/lib/golf/catalog";
import { FollowButton } from "./FollowButton";

/** Initialer i en rund bricka — golfens motsvarighet till klubbmärket tills det finns porträtt. */
export function PlayerMark({ name, size = "md" }: { name: string; size?: "md" | "lg" }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-pitch/15 font-semibold text-pitch-ink ${
        size === "lg" ? "size-20 text-2xl" : "size-11 text-sm"
      }`}
    >
      {initials}
    </span>
  );
}

/** En rad per spelare: länk till spelarsidan, följ-knapp till höger. */
export function PlayerList({ players }: { players: readonly GolfPlayer[] }) {
  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
      {players.map((player) => (
        <li key={player.slug} className="flex items-center gap-3 px-4 py-3">
          <Link href={`/golf/spelare/${player.slug}`} className="flex min-h-11 min-w-0 flex-1 items-center gap-3">
            <PlayerMark name={player.name} />
            <span className="min-w-0">
              <span className="block truncate font-semibold text-foreground">{player.name}</span>
              <span className="block truncate text-sm text-muted-foreground">
                {getTour(player.tour)?.name} · {player.country}
              </span>
            </span>
          </Link>
          <FollowButton kind="players" slug={player.slug} name={player.name} compact />
        </li>
      ))}
    </ul>
  );
}

export function TourList({ tours }: { tours: readonly GolfTour[] }) {
  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
      {tours.map((tour) => {
        const count = playersOnTour(tour.slug).length;
        return (
          <li key={tour.slug} className="flex items-center gap-3 px-4 py-3">
            <Link href={`/golf/tourer/${tour.slug}`} className="min-h-11 min-w-0 flex-1 py-1">
              <span className="block font-semibold text-foreground">{tour.name}</span>
              <span className="block text-sm text-muted-foreground">
                {tour.blurb}
                {count > 0 && ` ${count} av spelarna vi följer.`}
              </span>
            </Link>
            <FollowButton kind="tours" slug={tour.slug} name={tour.name} compact />
          </li>
        );
      })}
    </ul>
  );
}

export function GolfSection({ title, children, lead }: { title: string; lead?: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-semibold text-2xl text-foreground text-balance">{title}</h2>
      {lead && <p className="mt-1 max-w-xl text-muted-foreground">{lead}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
