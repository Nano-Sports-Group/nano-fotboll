"use client";

import useSWR from "swr";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// ── Sticky kompakt resultatrad ────────────────────────────────────────────────
// 60fps x-nfl-game-pull-down-text-logo-morph: scoreboarden komprimeras till en
// smal sticky rad när man scrollar förbi den, och expanderar tillbaka vid scroll
// upp. IntersectionObserver på en sentinel, ingen scroll-listener per frame.

function useIsScrolledPast(): [React.RefObject<HTMLDivElement | null>, boolean] {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [scrolledPast, setScrolledPast] = useState(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setScrolledPast(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [sentinelRef, scrolledPast];
}

// ── Typer ─────────────────────────────────────────────────────────────────────

interface MatchStats {
  home_team_name: string;
  away_team_name: string;
  home_score: number;
  away_score: number;
  home_xg: number | null;
  away_xg: number | null;
  home_pressure: number | null;
  away_pressure: number | null;
  home_possession: number | null;
  away_possession: number | null;
  home_shots: number | null;
  away_shots: number | null;
  home_shots_on_target: number | null;
  away_shots_on_target: number | null;
  played_at: string | null;
  milo_analyzed: boolean;
}

interface ForumReply {
  id: string;
  content: string;
  author_name: string;
  created_at: string;
}

// ── SWR fetcher ───────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then((r) => r.json()) as Promise<MatchStats | null>;

// ── Stat-rad ──────────────────────────────────────────────────────────────────

function StatBar({ label, home, away, format = (v: number) => String(v) }: { label: string; home: number; away: number; format?: (value: number) => string }) {
  const total = home + away || 1;
  const homeW = Math.round((home / total) * 100);
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span className="font-semibold text-foreground">{format(home)}</span>
        <span>{label}</span>
        <span className="font-semibold text-foreground">{format(away)}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden flex">
        <div className="bg-pitch transition-all duration-700" style={{ width: `${homeW}%` }} />
        <div className="bg-away transition-all duration-700" style={{ width: `${100 - homeW}%` }} />
      </div>
    </div>
  );
}

// ── Live Forum-aktivitet ───────────────────────────────────────────────────────

function LiveForumFeed({ teamIds }: { teamIds: string[] }) {
  const [replies, setReplies] = useState<ForumReply[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    if (!url || !key || teamIds.length === 0) return;

    const db = createClient(url, key);

    // Hämta senaste 15 svar från dessa lag
    void db
      .from("forum_replies")
      .select("id, content, author_name, created_at")
      .order("created_at", { ascending: false })
      .limit(15)
      .then(({ data }) => {
        if (data) setReplies((data as ForumReply[]).reverse());
      });

    // Realtime subscription
    const channel = db
      .channel("match-forum-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "forum_replies" },
        (payload) => {
          const reply = payload.new as ForumReply;
          setReplies((prev) => [...prev.slice(-29), reply]);
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
        },
      )
      .subscribe();

    return () => { void db.removeChannel(channel); };
  }, [teamIds]);

  return (
    <div className="h-64 overflow-y-auto flex flex-col gap-2 pr-1">
      {replies.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-8">
          Inga forum-inlägg än...
        </p>
      ) : (
        replies.map((r) => (
          <div key={r.id} className="bg-muted/40 rounded-lg p-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-foreground">{r.author_name}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(r.created_at).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" })}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{r.content}</p>
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}

// ── Huvud-komponent ────────────────────────────────────────────────────────────

interface LiveMatchClientProps {
  fixtureId: number;
  initialStats: MatchStats | null;
  isLive: boolean;
  teamIds: string[];
}

export function LiveMatchClient({ fixtureId, initialStats, isLive, teamIds }: LiveMatchClientProps) {
  const { data: stats } = useSWR<MatchStats | null>(
    isLive ? `/api/match/${fixtureId}` : null,
    fetcher,
    { refreshInterval: 30_000, fallbackData: initialStats },
  );

  const match = stats ?? initialStats;
  const [sentinelRef, isCompact] = useIsScrolledPast();

  if (!match) {
    return (
      <p className="text-center py-12 text-muted-foreground text-sm">
        Ingen matchdata tillgänglig.
      </p>
    );
  }

  // En statistikrad visas bara när BÅDA lagens värden finns — annars skulle den
  // saknade sidan renderas som "0", vilket är en påhittad siffra (§4).
  const hasXg = match.home_xg != null && match.away_xg != null;
  const homeXg = match.home_xg ?? 0;
  const awayXg = match.away_xg ?? 0;
  const hasPossession = match.home_possession != null && match.away_possession != null;
  const hasShots = match.home_shots != null && match.away_shots != null;
  const hasShotsOnTarget =
    match.home_shots_on_target != null && match.away_shots_on_target != null;
  const hasAnyStats = hasXg || hasPossession || hasShots || hasShotsOnTarget;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Vänster: match-statistik */}
      <div className="lg:col-span-2 space-y-4">
        {/* Sticky kompakt resultatrad — morphar in när huvud-headern scrollas förbi */}
        <div
          className={`sticky top-0 z-20 -mx-4 px-4 bg-card/95 backdrop-blur border-b border-border overflow-hidden transition-[max-height,opacity] duration-300 ease-out ${
            isCompact ? "max-height-[48px] opacity-100 py-2" : "max-h-0 opacity-0 py-0"
          }`}
          style={{ maxHeight: isCompact ? "48px" : "0px" }}
          aria-hidden={!isCompact}
        >
          <div className="flex items-center justify-center gap-3 text-sm font-semibold text-foreground">
            <span className="truncate">{match.home_team_name}</span>
            <span className="tabular-nums">{match.home_score}–{match.away_score}</span>
            <span className="truncate">{match.away_team_name}</span>
            {isLive && <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />}
          </div>
        </div>

        {/* Resultat-header */}
        <div ref={sentinelRef} className="relative bg-card border border-border rounded-xl p-6 text-center overflow-hidden">
          {/* Ambient glow crossfadar accent → success när matchen går live — 60fps
              x-nfl-games-tab-switch-tekniken, nyckel på verkligt matchläge, ingen fejkad lagfärg. */}
          <div
            aria-hidden
            className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-56 rounded-full blur-3xl opacity-20 transition-colors duration-700 pointer-events-none ${
              isLive ? "bg-success" : "bg-pitch"
            }`}
          />
          <div className="relative flex items-center justify-between gap-4">
            <p className="text-lg font-bold text-foreground flex-1 text-right">
              {match.home_team_name}
            </p>
            <div className="flex items-center gap-3">
              <span className="text-5xl font-bold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
                {match.home_score}
              </span>
              <span className="text-2xl text-muted-foreground">–</span>
              <span className="text-5xl font-bold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
                {match.away_score}
              </span>
            </div>
            <p className="text-lg font-bold text-foreground flex-1 text-left">
              {match.away_team_name}
            </p>
          </div>
          {isLive && (
            <div className="relative mt-3 flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-xs text-success font-medium uppercase tracking-wide">Live</span>
            </div>
          )}
        </div>

        {/* Statistik */}
        {hasAnyStats && (
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4 text-balance">
              Matchstatistik
            </h3>
            {hasXg && (
              <StatBar label="xG" home={homeXg} away={awayXg} format={(v) => v.toFixed(2)} />
            )}
            {hasPossession && (
              <StatBar label="Bollinnehav %" home={match.home_possession!} away={match.away_possession!} />
            )}
            {hasShots && (
              <StatBar label="Skott" home={match.home_shots!} away={match.away_shots!} />
            )}
            {hasShotsOnTarget && (
              <StatBar label="Skott på mål" home={match.home_shots_on_target!} away={match.away_shots_on_target!} />
            )}
          </div>
        )}
      </div>

      {/* Höger: live forum */}
      <div className="bg-card border border-border rounded-xl p-4 flex flex-col">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 text-balance">
          Forum live
        </h3>
        <LiveForumFeed teamIds={teamIds} />
      </div>
    </div>
  );
}
