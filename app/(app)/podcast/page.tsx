/**
 * app/podcast/page.tsx — Poddindex (Allsvenskans hemmaplan, M3)
 * ─────────────────────────────────────────────────────────────────────────────
 * Ersätter stub-redirecten till /mitt-lag (nav/Mer länkade till en död yta).
 * Rättighetspolicy (lib/podcast/rights.ts): endast metadata + länk till
 * avsnittssidan — aldrig transkripttext eller inline-audio på publik yta.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Mic, Headphones } from "lucide-react";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { PodcastSearch } from "./PodcastSearch";
import { contentCutoffIso } from "@/lib/content-window";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Allsvenskan-poddar",
  description:
    "Allsvenskans poddar samlade: Studio Allsvenskan, Lundh, klubbpoddarna och fler — sök avsnitt per lag och ämne.",
};

type EpisodeRow = {
  id: string;
  title: string;
  show_name: string | null;
  published_at: string | null;
  mentioned_teams: string[] | null;
};

async function getLatest(): Promise<{ episodes: EpisodeRow[]; shows: string[] }> {
  if (!isSupabaseConfigured()) return { episodes: [], shows: [] };
  try {
    const db = createServerClient();
    const { data } = await db
      .from("podcasts")
      .select("id, title, show_name, published_at, mentioned_teams")
      .gte("published_at", contentCutoffIso())
      .order("published_at", { ascending: false })
      .limit(40);
    const episodes = (data ?? []) as EpisodeRow[];
    const shows = [...new Set(episodes.map((e) => e.show_name).filter((s): s is string => !!s))];
    return { episodes, shows };
  } catch {
    return { episodes: [], shows: [] };
  }
}

function relTime(iso: string | null): string {
  if (!iso) return "";
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return "idag";
  if (d === 1) return "igår";
  if (d < 30) return `${d} dagar sedan`;
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
}

export default async function PodcastIndexPage() {
  const { episodes, shows } = await getLatest();

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <header className="mb-6">
        <div className="flex items-center gap-2 text-pitch-ink mb-2">
          <Headphones className="w-5 h-5" />
          <span className="text-xs font-semibold uppercase tracking-wide">Poddintelligens</span>
        </div>
        <h1 className="text-3xl font-bold text-foreground text-balance">Allsvenskan-poddar</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Allt som sägs i {shows.length > 0 ? `${shows.length} poddar` : "poddarna"} — samlat,
          taggat per lag och sökbart. PRO får sammanfattning och kan fråga om avsnittet.
        </p>
      </header>

      <PodcastSearch />

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-foreground mb-3 text-balance">Senaste avsnitten</h2>
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
                href={`/podcast/${ep.id}`}
                className="block px-4 py-3 hover:bg-muted/40 transition-colors"
              >
                <p className="text-sm font-medium text-foreground line-clamp-2">{ep.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {ep.show_name ?? "Podd"} · {relTime(ep.published_at)}
                  {(ep.mentioned_teams?.length ?? 0) > 0 &&
                    ` · ${ep.mentioned_teams!.slice(0, 3).join(", ")}`}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
