"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy, ArrowRight, ChevronRight, Flame } from "lucide-react";
import { useFavoriteTeam } from "@/hooks/useFavoriteTeam";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlayerRow {
  player_id: number;
  fullname: string;
  goals: number;
  assists: number;
  appearances: number;
}

interface FixtureRow {
  sportmonks_id: number;
  home_team_name: string;
  away_team_name: string;
  home_score: number | null;
  away_score: number | null;
  kickoff_at: string | null;
  home_team_id: number;
  away_team_id: number;
}

interface UpcomingRow {
  sportmonks_id: number;
  home_team_name: string;
  away_team_name: string;
  home_score: number | null;
  away_score: number | null;
  kickoff_at: string | null;
}

interface DashThread {
  id: string;
  title: string;
  reply_count: number;
  created_at: string;
}

interface DashArticle {
  id: string;
  slug: string | null;
  title: string;
  summary: string | null;
  source_name: string | null;
  published_at: string | null;
  is_athopia_generated?: boolean;
}

interface HubPayload {
  team: { name: string; slug: string; logo_url: string | null };
  position: number | null;
  stats: {
    points: number;
    played: number;
    wins: number;
    draws: number;
    losses: number;
    goals_for: number;
    goals_against: number;
    goal_diff: number;
  } | null;
  form: ("W" | "D" | "L")[];
  topScorers: PlayerRow[];
  topAssists: PlayerRow[];
  recent: FixtureRow[];
  upcoming: UpcomingRow[];
  news: DashArticle[];
  threads: DashThread[];
  podcasts: unknown[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just nu";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Stockholm" });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" });
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-medium text-muted-foreground mb-3">{children}</p>
  );
}

/** Semantic card — fully light/dark aware */
function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl bg-card border border-border p-5 ${className}`}>
      {children}
    </div>
  );
}

/** Animated stat bar using semantic tokens */
function StatBar({
  value,
  max,
  accent = false,
}: {
  value: number;
  max: number;
  accent?: boolean;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex-1 h-1 rounded-full bg-secondary overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${
          accent ? "bg-blue-500" : "bg-pitch"
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Result badge — V / O / F */
function ResultBadge({ r }: { r: "W" | "D" | "L" }) {
  const label = r === "W" ? "V" : r === "D" ? "O" : "F";
  const cls =
    r === "W"
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      : r === "D"
      ? "bg-secondary text-muted-foreground"
      : "bg-red-500/15 text-red-600 dark:text-red-400";
  return (
    <span
      className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-[10px] font-bold ${cls}`}
    >
      {label}
    </span>
  );
}

// ─── AI Brief ─────────────────────────────────────────────────────────────────

function AIBriefCard({ news }: { news: DashArticle[] }) {
  const ai = news.find((n) => n.is_athopia_generated);
  const topNews = news.filter((n) => !n.is_athopia_generated).slice(0, 5);
  const bullets: string[] = ai?.summary
    ? ai.summary
        .split(/\n|\.(?=\s)/)
        .filter(Boolean)
        .slice(0, 5)
        .map((s) => s.trim())
        .filter((s) => s.length > 10)
    : topNews.map((n) => n.title);

  const now = new Date().toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Stockholm",
  });

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-pitch-ink">AI Brief</span>
        <span className="text-xs text-muted-foreground font-mono tabular-nums">{now}</span>
      </div>

      {bullets.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border">
          {bullets.slice(0, 5).map((b, i) => (
            <li
              key={i}
              className="flex gap-3 py-2.5 first:pt-0 last:pb-0 text-sm text-foreground/80 leading-snug"
            >
              <span className="text-pitch-ink shrink-0 mt-0.5 font-medium select-none">
                {i + 1}
              </span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Inga nyheter just nu.</p>
      )}

      {ai && (
        <Link
          href={`/artikel/${ai.slug ?? ai.id}`}
          className="inline-flex items-center gap-1 text-xs text-pitch-ink hover:text-pitch-ink transition-colors duration-150 mt-auto"
        >
          Läs djupare analys <ArrowRight className="w-3 h-3" />
        </Link>
      )}
    </Card>
  );
}

// ─── Position Card ─────────────────────────────────────────────────────────────

function PositionCard({
  team,
  position,
  stats,
  form,
}: {
  team: HubPayload["team"];
  position: number | null;
  stats: HubPayload["stats"];
  form: ("W" | "D" | "L")[];
}) {
  const last5 = form.slice(-5);

  return (
    <Card className="flex flex-col gap-4">
      {/* Team + position */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground mb-0.5">
            {team.name}
          </p>
          {position != null && (
            <p className="text-4xl font-bold text-foreground font-mono tabular-nums leading-none">
              #{position}
            </p>
          )}
        </div>
        {/* Form dots */}
        {last5.length > 0 && (
          <div className="flex gap-1 shrink-0 mt-1">
            {last5.map((r, i) => (
              <ResultBadge key={i} r={r} />
            ))}
          </div>
        )}
      </div>

      {/* Stats — list rows, no nested cards */}
      {stats && (
        <div className="flex flex-col divide-y divide-border">
          {[
            { label: "Poäng", val: stats.points },
            { label: "Spelade", val: stats.played },
            { label: "V / O / F", val: `${stats.wins} / ${stats.draws} / ${stats.losses}` },
            { label: "Målskillnad", val: (stats.goal_diff > 0 ? "+" : "") + stats.goal_diff },
          ].map(({ label, val }) => (
            <div
              key={label}
              className="flex items-center justify-between py-2 first:pt-0 last:pb-0"
            >
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className="text-sm font-semibold text-foreground font-mono tabular-nums">
                {val}
              </span>
            </div>
          ))}
        </div>
      )}

      <Link
        href="/statistik"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors duration-150 mt-auto"
      >
        Full tabell <ArrowRight className="w-3 h-3" />
      </Link>
    </Card>
  );
}

// ─── Upcoming Matches ─────────────────────────────────────────────────────────

function UpcomingCard({ upcoming }: { upcoming: UpcomingRow[] }) {
  const next3 = upcoming.slice(0, 3);
  return (
    <Card>
      <SectionLabel>Kommande matcher</SectionLabel>
      {next3.length === 0 ? (
        <p className="text-sm text-muted-foreground">Inga kommande matcher</p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {next3.map((m) => (
            <div
              key={m.sportmonks_id}
              className="py-3 first:pt-0 last:pb-0"
            >
              <div className="flex items-center gap-2 text-sm text-foreground/85">
                <span className="flex-1 truncate">{m.home_team_name}</span>
                <span className="text-muted-foreground text-xs shrink-0">vs</span>
                <span className="flex-1 truncate text-right">{m.away_team_name}</span>
              </div>
              {m.kickoff_at && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {fmtDate(m.kickoff_at)}{" "}
                  <span className="text-foreground/60">{fmtTime(m.kickoff_at)}</span>
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── Form Card ────────────────────────────────────────────────────────────────

function FormCard({
  form,
}: {
  form: ("W" | "D" | "L")[];
}) {
  const last5 = form.slice(-5);
  const pts = last5.reduce(
    (s, r) => s + (r === "W" ? 3 : r === "D" ? 1 : 0),
    0
  );
  const maxPts = last5.length * 3;

  return (
    <Card>
      <SectionLabel>Lagform</SectionLabel>
      <div className="flex gap-2 mb-4">
        {last5.map((r, i) => {
          const bg =
            r === "W"
              ? "bg-emerald-500/15"
              : r === "D"
              ? "bg-secondary"
              : "bg-red-500/15";
          const text =
            r === "W"
              ? "text-emerald-600 dark:text-emerald-400"
              : r === "D"
              ? "text-muted-foreground"
              : "text-red-600 dark:text-red-400";
          return (
            <span
              key={i}
              className={`flex-1 h-9 rounded-lg text-xs font-bold flex items-center justify-center ${bg} ${text}`}
            >
              {r === "W" ? "V" : r === "D" ? "O" : "F"}
            </span>
          );
        })}
        {last5.length === 0 && (
          <span className="text-sm text-muted-foreground">Ingen data</span>
        )}
      </div>
      {last5.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full bg-pitch transition-all duration-700"
              style={{ width: maxPts > 0 ? `${(pts / maxPts) * 100}%` : "0%" }}
            />
          </div>
          <span className="text-xs text-muted-foreground font-mono tabular-nums shrink-0">
            {pts}/{maxPts} p
          </span>
        </div>
      )}
    </Card>
  );
}

// ─── Forum Card ───────────────────────────────────────────────────────────────

function ForumCard({
  threads,
  teamSlug,
}: {
  threads: DashThread[];
  teamSlug: string;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Forum</SectionLabel>
        <Link
          href={`/forum/${teamSlug}`}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors duration-150 -mt-3"
        >
          Alla trådar <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      {threads.length === 0 ? (
        <p className="text-sm text-muted-foreground">Inga trådar ännu</p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {threads.slice(0, 3).map((t) => (
            <Link
              key={t.id}
              href={`/forum/${teamSlug}`}
              className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0 group"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Flame className="w-3 h-3 text-orange-500 shrink-0" />
                <span className="text-sm text-foreground/80 group-hover:text-foreground truncate transition-colors duration-150">
                  {t.title}
                </span>
              </div>
              <span className="text-sm font-semibold text-foreground font-mono tabular-nums shrink-0">
                {t.reply_count}
              </span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── Player Explorer ──────────────────────────────────────────────────────────

function PlayerExplorer({
  topScorers,
  topAssists,
}: {
  topScorers: PlayerRow[];
  topAssists: PlayerRow[];
}) {
  const map = new Map<number, PlayerRow>();
  [...topScorers, ...topAssists].forEach((p) => {
    const ex = map.get(p.player_id);
    if (!ex) {
      map.set(p.player_id, { ...p });
    } else {
      map.set(p.player_id, {
        ...ex,
        goals: Math.max(ex.goals, p.goals),
        assists: Math.max(ex.assists, p.assists),
        appearances: Math.max(ex.appearances, p.appearances),
      });
    }
  });
  const players = Array.from(map.values());
  const [selectedId, setSelectedId] = useState<number | null>(
    topScorers[0]?.player_id ?? null
  );
  const selected = players.find((p) => p.player_id === selectedId) ?? players[0] ?? null;
  const maxGoals = Math.max(...players.map((p) => p.goals), 1);
  const maxAssists = Math.max(...players.map((p) => p.assists), 1);

  if (players.length === 0) return null;

  return (
    <Card>
      <SectionLabel>Spelarexplorer</SectionLabel>

      {/* Horizontal scroll pill selector */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-3 mb-4 -mx-1 px-1">
        {players.slice(0, 8).map((p) => (
          <button
            key={p.player_id}
            onClick={() => setSelectedId(p.player_id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 active:scale-95 ${
              p.player_id === selectedId
                ? "bg-pitch text-white"
                : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-border"
            }`}
          >
            {p.fullname.split(" ").at(-1)}
          </button>
        ))}
      </div>

      {selected && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Stat numbers */}
          <div className="flex gap-4">
            {[
              { label: "Mål", val: selected.goals },
              { label: "Assist", val: selected.assists },
              { label: "Matcher", val: selected.appearances },
            ].map(({ label, val }) => (
              <div key={label} className="flex-1 text-center py-3 rounded-xl bg-secondary">
                <p className="text-2xl font-bold text-foreground font-mono tabular-nums leading-none">
                  {val}
                </p>
                <p className="text-xs text-muted-foreground font-medium mt-1">
                  {label}
                </p>
              </div>
            ))}
          </div>

          {/* Stat bars */}
          <div className="flex flex-col gap-3 justify-center">
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-10 shrink-0">Mål</span>
              <StatBar value={selected.goals} max={maxGoals} />
              <span className="text-sm font-semibold text-foreground font-mono tabular-nums w-5 text-right">
                {selected.goals}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-10 shrink-0">Assist</span>
              <StatBar value={selected.assists} max={maxAssists} accent />
              <span className="text-sm font-semibold text-foreground font-mono tabular-nums w-5 text-right">
                {selected.assists}
              </span>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Skytteliga ───────────────────────────────────────────────────────────────

function SkyListCard({ players }: { players: PlayerRow[] }) {
  const top5 = players.slice(0, 5);
  const max = top5[0]?.goals ?? 1;
  return (
    <Card>
      <SectionLabel>Skytteliga</SectionLabel>
      <div className="flex flex-col gap-2.5">
        {top5.map((p, i) => (
          <div key={p.player_id} className="flex items-center gap-2.5">
            <span className="text-xs font-medium text-muted-foreground/60 w-3 shrink-0 font-mono tabular-nums">
              {i + 1}
            </span>
            <span className="text-xs text-foreground/80 flex-1 truncate">
              {p.fullname}
            </span>
            <StatBar value={p.goals} max={max} />
            <span className="text-sm font-bold text-foreground font-mono tabular-nums w-4 text-right shrink-0">
              {p.goals}
            </span>
          </div>
        ))}
        {top5.length === 0 && (
          <p className="text-sm text-muted-foreground">Ingen data</p>
        )}
      </div>
    </Card>
  );
}

// ─── Assistligan ──────────────────────────────────────────────────────────────

function AssistListCard({ players }: { players: PlayerRow[] }) {
  const top5 = players.slice(0, 5);
  const max = top5[0]?.assists ?? 1;
  return (
    <Card>
      <SectionLabel>Assistligan</SectionLabel>
      <div className="flex flex-col gap-2.5">
        {top5.map((p, i) => (
          <div key={p.player_id} className="flex items-center gap-2.5">
            <span className="text-xs font-medium text-muted-foreground/60 w-3 shrink-0 font-mono tabular-nums">
              {i + 1}
            </span>
            <span className="text-xs text-foreground/80 flex-1 truncate">
              {p.fullname}
            </span>
            <StatBar value={p.assists} max={max} accent />
            <span className="text-sm font-bold text-foreground font-mono tabular-nums w-4 text-right shrink-0">
              {p.assists}
            </span>
          </div>
        ))}
        {top5.length === 0 && (
          <p className="text-sm text-muted-foreground">Ingen data</p>
        )}
      </div>
    </Card>
  );
}

// ─── Senaste Matcher ──────────────────────────────────────────────────────────

function RecentMatchesCard({
  recent,
}: {
  recent: FixtureRow[];
}) {
  const last3 = recent.slice(0, 3);
  return (
    <Card>
      <SectionLabel>Senaste matcher</SectionLabel>
      {last3.length === 0 ? (
        <p className="text-sm text-muted-foreground">Inga resultat</p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {last3.map((m) => {
            const hasScore = m.home_score != null && m.away_score != null;
            return (
              <div
                key={m.sportmonks_id}
                className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground/80 truncate">
                    {m.home_team_name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {m.away_team_name}
                  </p>
                </div>
                {hasScore && (
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-foreground font-mono tabular-nums leading-tight">
                      {m.home_score}–{m.away_score}
                    </p>
                    {m.kickoff_at && (
                      <p className="text-xs text-muted-foreground">
                        {fmtDate(m.kickoff_at)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ─── Trending ─────────────────────────────────────────────────────────────────

function TrendingCard({
  threads,
  news,
  teamSlug,
}: {
  threads: DashThread[];
  news: DashArticle[];
  teamSlug: string;
}) {
  const topThreads = [...threads]
    .sort((a, b) => b.reply_count - a.reply_count)
    .slice(0, 4);
  const recentNews = news.filter((n) => !n.is_athopia_generated).slice(0, 4);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Mest diskuterat */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <SectionLabel>Mest diskuterat</SectionLabel>
          <Link
            href={`/forum/${teamSlug}`}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors duration-150 -mt-3"
          >
            Forum <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="flex flex-col divide-y divide-border">
          {topThreads.map((t) => (
            <Link
              key={t.id}
              href={`/forum/${teamSlug}`}
              className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0 group"
            >
              <span className="text-sm text-foreground/80 group-hover:text-foreground truncate transition-colors duration-150">
                {t.title}
              </span>
              <span className="text-xs font-semibold text-muted-foreground font-mono tabular-nums shrink-0 bg-secondary px-2 py-0.5 rounded-full">
                {t.reply_count}
              </span>
            </Link>
          ))}
          {topThreads.length === 0 && (
            <p className="text-sm text-muted-foreground">Inga trådar</p>
          )}
        </div>
      </Card>

      {/* Senaste nyheter */}
      <Card>
        <SectionLabel>Senaste nyheter</SectionLabel>
        <div className="flex flex-col divide-y divide-border">
          {recentNews.map((a) => (
            <Link
              key={a.id}
              href={`/artikel/${a.slug ?? a.id}`}
              className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0 group"
            >
              <span className="text-sm text-foreground/80 group-hover:text-foreground line-clamp-2 flex-1 transition-colors duration-150">
                {a.title}
              </span>
              {a.published_at && (
                <span className="text-xs text-muted-foreground shrink-0 font-mono tabular-nums">
                  {timeAgo(a.published_at)}
                </span>
              )}
            </Link>
          ))}
          {recentNews.length === 0 && (
            <p className="text-sm text-muted-foreground">Inga nyheter</p>
          )}
        </div>
      </Card>
    </div>
  );
}

// ─── States ───────────────────────────────────────────────────────────────────

function NoTeamState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center">
        <Trophy className="w-8 h-8 text-muted-foreground" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1 text-balance">Välj ditt lag</h2>
        <p className="text-sm text-muted-foreground">
          Din personaliserade dashboard väntar.
        </p>
      </div>
      <Link
        href="/onboarding"
        className="px-6 py-2.5 rounded-xl bg-pitch text-white text-sm font-medium hover:bg-pitch-dark active:scale-[0.97] transition-all duration-150"
      >
        Kom igång
      </Link>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="w-full px-4 py-6 flex flex-col gap-4">
      {/* Row 1 skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-8 rounded-2xl bg-card border border-border p-5 h-52 skeleton-wave" />
        <div className="md:col-span-4 rounded-2xl bg-card border border-border p-5 h-52 skeleton-wave" />
      </div>
      {/* Row 2 skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-2xl bg-card border border-border p-5 h-36 skeleton-wave"
          />
        ))}
      </div>
      {/* Row 3 skeleton */}
      <div className="rounded-2xl bg-card border border-border p-5 h-32 skeleton-wave" />
      {/* Row 4 skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-2xl bg-card border border-border p-5 h-44 skeleton-wave"
          />
        ))}
      </div>
      {/* Row 5 skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="rounded-2xl bg-card border border-border p-5 h-40 skeleton-wave"
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function FeedDashboard() {
  const { slug, isLoaded } = useFavoriteTeam();
  const [hub, setHub] = useState<HubPayload | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isLoaded || !slug) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- startar en hämtning; laddnings-/felflaggan sätts synkront innan fetch (synk mot externt system).
    setLoading(true);
    fetch(`/api/feed/hub?team=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((data) => {
        setHub(data as HubPayload);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [isLoaded, slug]);

  if (!isLoaded || loading) return <DashboardSkeleton />;
  if (!slug || !hub) return <NoTeamState />;

  const { team, position, stats, form, topScorers, topAssists, recent, upcoming, news, threads } =
    hub;
  const teamSlug = team.slug;

  return (
    <div className="w-full px-4 py-6 flex flex-col gap-4">

      {/* Row 1: AI Brief (8/12) + Position (4/12) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 animate-fade-up">
        <div className="md:col-span-8">
          <AIBriefCard news={news} />
        </div>
        <div className="md:col-span-4">
          <PositionCard
            team={team}
            position={position}
            stats={stats}
            form={form}
          />
        </div>
      </div>

      {/* Row 2: Upcoming + Form + Forum */}
      <div
        className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-up"
        style={{ animationDelay: "60ms", animationFillMode: "both" }}
      >
        <UpcomingCard upcoming={upcoming} />
        <FormCard form={form} />
        <ForumCard threads={threads} teamSlug={teamSlug} />
      </div>

      {/* Row 3: Player Explorer */}
      <div
        className="animate-fade-up"
        style={{ animationDelay: "100ms", animationFillMode: "both" }}
      >
        <PlayerExplorer topScorers={topScorers} topAssists={topAssists} />
      </div>

      {/* Row 4: Skytteliga + Assistligan + Senaste matcher */}
      <div
        className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-up"
        style={{ animationDelay: "140ms", animationFillMode: "both" }}
      >
        <SkyListCard players={topScorers} />
        <AssistListCard players={topAssists} />
        <RecentMatchesCard recent={recent} />
      </div>

      {/* Row 5: Trending */}
      <div
        className="animate-fade-up"
        style={{ animationDelay: "180ms", animationFillMode: "both" }}
      >
        <TrendingCard threads={threads} news={news} teamSlug={teamSlug} />
      </div>
    </div>
  );
}
