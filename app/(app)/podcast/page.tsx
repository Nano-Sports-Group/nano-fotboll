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
import { latestEpisodes, listShows } from "@/lib/podcast/nano-api";
import { vertical } from "@/lib/vertical";

const HOCKEY = vertical.id === "hockey";

export const revalidate = 300;

export const metadata: Metadata = {
  title: `${vertical.leagueName}-poddar`,
  description: HOCKEY
    ? "SHL-poddarna samlade: TV4 Hockey, Klubben Hockey, lokaltidningarnas lagpoddar och fler — sök avsnitt per lag och ämne."
    : "Allsvenskans poddar samlade: Studio Allsvenskan, Lundh, klubbpoddarna och fler — sök avsnitt per lag och ämne.",
};

function relTime(iso: string | null): string {
  if (!iso) return "";
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return "idag";
  if (d === 1) return "igår";
  if (d < 30) return `${d} dagar sedan`;
  return new Date(iso).toLocaleDateString("sv-SE", {
    timeZone: "Europe/Stockholm",
  });
}

export default async function PodcastIndexPage() {
  const [episodes, shows] = await Promise.all([
    latestEpisodes(40),
    listShows(),
  ]);

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
          Senaste avsnitten
        </h2>
        {episodes.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
            <Mic className="w-6 h-6 mx-auto mb-2 opacity-60" />
            Inga avsnitt inlästa ännu — poddarna hämtas löpande.
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card divide-y divide-border/60">
            {episodes.map((ep) => (
              <Link
                key={ep.id}
                href={`/podcast/avsnitt/${ep.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
              >
                {(ep.artworkUrl ?? ep.podcast.artworkUrl) ? (
                  // eslint-disable-next-line @next/next/no-img-element -- tredjeparts-CDN:er
                  <img
                    src={(ep.artworkUrl ?? ep.podcast.artworkUrl)!}
                    alt=""
                    width={40}
                    height={40}
                    loading="lazy"
                    className="size-10 shrink-0 rounded-md object-cover"
                  />
                ) : null}
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground line-clamp-2">
                    {ep.title}
                  </span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    {ep.podcast.title} · {relTime(ep.publishedAt)}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
