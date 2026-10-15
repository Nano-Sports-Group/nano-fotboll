/**
 * app/podcast/page.tsx — Poddindex (Allsvenskans hemmaplan, M3)
 * ─────────────────────────────────────────────────────────────────────────────
 * Ersätter stub-redirecten till /mitt-lag (nav/Mer länkade till en död yta).
 * Rättighetspolicy (lib/podcast/rights.ts): endast metadata + länk till
 * avsnittssidan — aldrig transkripttext eller inline-audio på publik yta.
 * Data: Nano Podcast API (lib/podcast/nano-api.ts), filtrerat på SPORT.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Mic, Headphones } from "lucide-react";
import { PodcastSearch } from "./PodcastSearch";
import { NanoEpisodeList } from "@/components/podcast/NanoEpisodeList";
import { latestEpisodes, listShows, teamNames } from "@/lib/podcast/nano-api";
import { vertical } from "@/lib/vertical";

const HOCKEY = vertical.id === "hockey";

export const revalidate = 300;

export const metadata: Metadata = {
  title: `${vertical.leagueName}-poddar`,
  description: HOCKEY
    ? "SHL-poddarna samlade: TV4 Hockey, Klubben Hockey, lokaltidningarnas lagpoddar och fler — sök avsnitt per lag och ämne."
    : "Allsvenskans poddar samlade: Studio Allsvenskan, Lundh, klubbpoddarna och fler — sök avsnitt per lag och ämne.",
};

export default async function PodcastIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const team = (await searchParams).team?.trim() || undefined;
  const [latest, shows, names] = await Promise.all([
    latestEpisodes(40),
    listShows(),
    teamNames(),
  ]);
  // Okänt lag i URL:en (gammal länk med lagnamn i stället för slug) = inget filter.
  const activeTeam = team && names.has(team) ? team : undefined;
  const episodes = activeTeam ? await latestEpisodes(40, activeTeam) : latest;
  // Filterknapparna räknas ur samma 40-fönster som listan: bara lag som faktiskt hörs just nu.
  const chips = [...new Set(latest.flatMap((e) => e.teams))]
    .filter((s) => names.has(s))
    .sort((a, b) => names.get(a)!.localeCompare(names.get(b)!, "sv"));

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <header className="mb-6">
        <div className="flex items-center gap-2 text-pitch-ink mb-2">
          <Headphones className="w-5 h-5" />
          <span className="text-xs font-semibold uppercase tracking-wide">
            Poddintelligens
          </span>
        </div>
        <h1 className="text-3xl font-bold text-foreground text-balance">
          {vertical.leagueName}-poddar
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Allt som sägs i{" "}
          {shows.length > 0 ? `${shows.length} poddar` : "poddarna"} — samlat,
          taggat per lag och sökbart. PRO får sammanfattning och kan fråga om
          avsnittet.
        </p>
      </header>

      <PodcastSearch />

      {chips.length > 0 && (
        <nav className="mt-4 flex flex-wrap gap-2" aria-label="Filtrera på lag">
          {chips.map((slug) => {
            const active = slug === activeTeam;
            return (
              <Link
                key={slug}
                href={active ? "/podcast" : `/podcast?team=${slug}`}
                aria-current={active ? "page" : undefined}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "border-pitch bg-pitch/15 text-pitch-ink"
                    : "border-border bg-card text-muted-foreground hover:border-pitch/40 hover:text-foreground"
                }`}
              >
                {names.get(slug)}
              </Link>
            );
          })}
        </nav>
      )}

      {shows.length > 0 && (
        <section className="mt-8" aria-label="Poddar">
          <h2 className="text-sm font-semibold text-foreground mb-3">
            Poddarna
          </h2>
          <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {shows.map((s) => (
              <li key={s.id} className="w-20 shrink-0">
                {s.artworkUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- tredjeparts-CDN:er
                  <img
                    src={s.artworkUrl}
                    alt=""
                    width={80}
                    height={80}
                    loading="lazy"
                    className="size-20 rounded-xl object-cover"
                  />
                ) : (
                  <div className="size-20 rounded-xl bg-muted" />
                )}
                <p className="mt-1.5 text-xs text-foreground line-clamp-2 leading-tight">
                  {s.title}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-foreground mb-3 text-balance">
          {activeTeam
            ? `Avsnitt om ${names.get(activeTeam)}`
            : "Senaste avsnitten"}
        </h2>
        {episodes.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
            <Mic className="w-6 h-6 mx-auto mb-2 opacity-60" />
            Inga avsnitt inlästa ännu — poddarna hämtas löpande.
          </div>
        ) : (
          <NanoEpisodeList episodes={episodes} teamNames={names} />
        )}
      </section>
    </div>
  );
}
