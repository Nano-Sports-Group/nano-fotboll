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
import { SPORT, vertical } from "@/lib/vertical";

const HOCKEY = vertical.id === "hockey";

export const revalidate = 300;

export const metadata: Metadata = {
  title: `${vertical.leagueName}-poddar`,
  description: HOCKEY
    ? "SHL-poddarna samlade: TV4 Hockey, Klubben Hockey, lokaltidningarnas lagpoddar och fler — sök avsnitt per lag och ämne."
    : "Allsvenskans poddar samlade: Studio Allsvenskan, Lundh, klubbpoddarna och fler — sök avsnitt per lag och ämne.",
};

type EpisodeRow = {
  id: string;
  title: string;
  show_name: string | null;
  published_at: string | null;
  mentioned_teams: string[] | null;
  metadata: Record<string, unknown> | null;
};

type EpisodeDisplay = EpisodeRow & { context_teams: string[] };
type FacetRow = Pick<EpisodeRow, "show_name" | "mentioned_teams" | "metadata">;

function contextTeamsFromRow(row: FacetRow): string[] {
  const discussed = row.metadata?.discussed_teams;
  const list = Array.isArray(discussed) ? discussed.filter((t): t is string => typeof t === "string") : [];
  return list.length > 0 ? list : row.mentioned_teams ?? [];
}

async function getLatest(filters: {
  team?: string;
  show?: string;
}): Promise<{ episodes: EpisodeDisplay[]; shows: string[]; teams: string[] }> {
  if (!isSupabaseConfigured()) return { episodes: [], shows: [], teams: [] };
  try {
    const db = createServerClient();
    // Facetterna (lag/källa-chips) räknas ur samma 40-fönster som listan — samma avvägning
    // som showlistan redan gjorde innan filtret fanns, inte en separat distinct-fråga.
    const { data: unfiltered } = await db
      .from("podcasts")
      .select("show_name, mentioned_teams, metadata, rss_sources!inner(sport)")
      .eq("rss_sources.sport", SPORT)
      .gte("published_at", contentCutoffIso())
      .order("published_at", { ascending: false })
      .limit(40);
    const facetSource = (unfiltered ?? []) as FacetRow[];
    const shows = [...new Set(facetSource.map((e) => e.show_name).filter((s): s is string => !!s))];
    const teams = [...new Set(facetSource.flatMap(contextTeamsFromRow))].sort((a, b) => a.localeCompare(b, "sv"));

    let query = db
      .from("podcasts")
      .select("id, title, show_name, published_at, mentioned_teams, metadata, rss_sources!inner(sport)")
      .eq("rss_sources.sport", SPORT)
      .gte("published_at", contentCutoffIso());
    if (filters.team) query = query.overlaps("mentioned_teams", [filters.team]);
    if (filters.show) query = query.eq("show_name", filters.show);
    const { data } = await query.order("published_at", { ascending: false }).limit(40);
    const episodes = ((data ?? []) as EpisodeRow[]).map((row) => ({ ...row, context_teams: contextTeamsFromRow(row) }));
    return { episodes, shows, teams };
  } catch {
    return { episodes: [], shows: [], teams: [] };
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

function chipHref(current: { team?: string; show?: string }, next: { team?: string; show?: string }): string {
  const params = new URLSearchParams();
  const team = next.team !== undefined ? next.team : current.team;
  const show = next.show !== undefined ? next.show : current.show;
  if (team) params.set("team", team);
  if (show) params.set("show", show);
  const qs = params.toString();
  return qs ? `/podcast?${qs}` : "/podcast";
}

export default async function PodcastIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string; show?: string }>;
}) {
  const params = await searchParams;
  const activeTeam = params.team?.trim() || undefined;
  const activeShow = params.show?.trim() || undefined;
  const { episodes, shows, teams } = await getLatest({ team: activeTeam, show: activeShow });
  const hasFilter = !!activeTeam || !!activeShow;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <header className="mb-6">
        <div className="flex items-center gap-2 text-pitch-ink mb-2">
          <Headphones className="w-5 h-5" />
          <span className="text-xs font-semibold uppercase tracking-wide">Poddintelligens</span>
        </div>
        <h1 className="text-3xl font-bold text-foreground text-balance">{vertical.leagueName}-poddar</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Allt som sägs i {shows.length > 0 ? `${shows.length} poddar` : "poddarna"} — samlat,
          taggat per lag och sökbart. PRO får sammanfattning och kan fråga om avsnittet.
        </p>
      </header>

      <PodcastSearch />

      {(teams.length > 0 || shows.length > 0) && (
        <section className="mt-4 flex flex-wrap gap-2" aria-label="Filtrera poddavsnitt">
          {teams.map((team) => {
            const active = team === activeTeam;
            return (
              <Link
                key={`team-${team}`}
                href={chipHref({ team: activeTeam, show: activeShow }, { team: active ? undefined : team })}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "border-pitch bg-pitch/15 text-pitch-ink"
                    : "border-border bg-card text-muted-foreground hover:border-pitch/40 hover:text-foreground"
                }`}
              >
                {team}
              </Link>
            );
          })}
          {shows.map((show) => {
            const active = show === activeShow;
            return (
              <Link
                key={`show-${show}`}
                href={chipHref({ team: activeTeam, show: activeShow }, { show: active ? undefined : show })}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "border-pitch bg-pitch/15 text-pitch-ink"
                    : "border-border bg-card text-muted-foreground hover:border-pitch/40 hover:text-foreground"
                }`}
              >
                {show}
              </Link>
            );
          })}
          {hasFilter && (
            <Link href="/podcast" className="rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground underline hover:text-foreground">
              Ta bort filter
            </Link>
          )}
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-foreground mb-3 text-balance">
          {hasFilter ? "Filtrerade avsnitt" : "Senaste avsnitten"}
        </h2>
        {episodes.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
            <Mic className="w-6 h-6 mx-auto mb-2 opacity-60" />
            {hasFilter ? "Inga avsnitt matchade filtret." : "Inga avsnitt inlästa ännu — poddarna hämtas löpande."}
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
                  {ep.context_teams.length > 0 && ` · ${ep.context_teams.slice(0, 3).join(", ")}`}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
