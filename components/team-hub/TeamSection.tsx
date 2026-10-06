"use client";

import { fixtureHref } from "@/lib/match/slug";
import { VERTICAL } from "@/lib/vertical";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronDown, Trophy, BarChart3, Users, MessageSquare,
  Newspaper, Activity, Star, ArrowRight,
} from "lucide-react";
import dynamic from "next/dynamic";
import type { TeamHubPayload, LeaderRow, FixtureRow } from "@/lib/team-hub/queries";
import type { EntityInsight } from "@/lib/types";
import { isLiveNow } from "@/lib/match/live";
import { type Plan, canAccess } from "@/lib/access-rules";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { EntityInsightsPanel } from "@/components/team-hub/EntityInsightsPanel";
import { Card as TactileCard } from "@/components/ui/TactileCard";
import { StatNumber } from "@/components/ui/StatNumber";
import { ListGroup } from "@/components/ui/ListGroup";
import { ListRow } from "@/components/ui/ListRow";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/TactileSheet";

// recharts är tungt — ladda radarn först när den ska visas (bevarad lazy-load).
const TeamRadar = dynamic(
  () => import("@/components/team-hub/TeamRadar").then((m) => m.TeamRadar),
  { ssr: false, loading: () => <div className="h-64 rounded-xl skeleton-wave bg-muted/40" /> }
);

export type TeamSectionId = "oversikt" | "statistik" | "trupp" | "matcher" | "forum";

/**
 * TeamSection — renderar EN lagsektion. All data kommer serverhämtad via props
 * (getTeamHub i respektive page.tsx) — ingen egen fetching.
 *
 * Sektionen väljs av routen, inte av `?tab=`. Den gamla SegmentedControl-raden
 * som låg här är borttagen: den var laghubbens andra flikrad och kolliderade
 * med layoutens. Navigationen ägs nu uteslutande av `TeamNav` i layouten.
 *
 * Kvar som klientkomponent enbart för match-quickviewen (Sheet + state).
 */
export function TeamSection({
  section,
  hub,
  plan,
  insights,
}: {
  section: TeamSectionId;
  hub: TeamHubPayload;
  plan: Plan;
  insights: EntityInsight[];
}) {
  const [quickview, setQuickview] = useState<FixtureRow | null>(null);
  const smId = hub.team.sportsmonks_id;

  return (
    <div className="px-4 sm:px-6 pt-5 space-y-5">
      <div className="space-y-5">
        {section === "oversikt" && <Oversikt hub={hub} plan={plan} insights={insights} onFixture={setQuickview} />}
        {section === "statistik" && <Statistik hub={hub} plan={plan} />}
        {section === "trupp" && <Trupp squad={hub.squad} />}
        {section === "matcher" && <Matcher recent={hub.recent} upcoming={hub.upcoming} smId={smId} onFixture={setQuickview} />}
        {section === "forum" && <Forum hub={hub} />}
      </div>

      <MatchQuickview fixture={quickview} smId={smId} onClose={() => setQuickview(null)} />
    </div>
  );
}

// ─── Match-quickview Sheet ──────────────────────────────────────────────────
function MatchQuickview({ fixture, smId, onClose }: { fixture: FixtureRow | null; smId: number | null; onClose: () => void }) {
  const f = fixture;
  const played = f?.status === "FT";
  return (
    <Sheet open={!!f} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent>
        {f && (
          <div className="space-y-5 pb-2">
            <div className="space-y-1 text-center">
              <SheetTitle>{f.home_team_name} – {f.away_team_name}</SheetTitle>
              <SheetDescription>
                {f.kickoff_at
                  ? new Date(f.kickoff_at).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm", weekday: "long", day: "numeric", month: "long" })
                  : "Datum ej satt"}
                {isLiveNow(f.status, f.kickoff_at) && " · LIVE"}
              </SheetDescription>
            </div>

            <div className="flex items-center justify-center gap-6">
              <span className="flex-1 truncate text-right text-sm font-medium">{f.home_team_name}</span>
              {played || isLiveNow(f.status, f.kickoff_at) ? (
                <span className="flex items-baseline gap-1.5 text-3xl font-bold font-mono tabular-nums">
                  <StatNumber value={f.home_score ?? 0} />
                  <span className="text-muted-foreground">–</span>
                  <StatNumber value={f.away_score ?? 0} />
                </span>
              ) : (
                <span className="text-2xl font-bold text-muted-foreground">
                  {f.kickoff_at ? new Date(f.kickoff_at).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" }) : "–"}
                </span>
              )}
              <span className="flex-1 truncate text-sm font-medium">{f.away_team_name}</span>
            </div>

            {played && smId != null && (
              <p className="text-center text-xs text-muted-foreground">
                {(() => {
                  const isHome = f.home_team_id === smId;
                  const gf = (isHome ? f.home_score : f.away_score) ?? 0;
                  const ga = (isHome ? f.away_score : f.home_score) ?? 0;
                  return gf > ga ? "Vinst" : gf === ga ? "Oavgjort" : "Förlust";
                })()}
                {" · "}{f.home_team_id === smId ? "Hemma" : "Borta"}
              </p>
            )}

            <Link
              href={fixtureHref(f)}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-pitch px-4 py-3 text-sm font-medium text-white transition-opacity active:opacity-80"
            >
              Till matchsidan <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

import { TEAM_SPOTIFY_SHOW_IDS, spotifyShowEmbedUrl } from "@/lib/podcast/spotify";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";

function SpotifyPodcast({ slug }: { slug: string }) {
  const showId = TEAM_SPOTIFY_SHOW_IDS[slug];
  if (!showId) return null;
  return (
    <SectionCard title="Podcast" icon={Activity}>
      <iframe
        src={spotifyShowEmbedUrl(showId)}
        width="100%"
        height="152"
        frameBorder="0"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
        style={{ borderRadius: 12 }}
        title="Podcast"
      />
    </SectionCard>
  );
}

// ─── Tab: Översikt ──────────────────────────────────────────────────────────
function Oversikt({ hub, plan, insights, onFixture }: { hub: TeamHubPayload; plan: Plan; insights: EntityInsight[]; onFixture: (f: FixtureRow) => void }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {insights.length > 0 && (
        <div className="lg:col-span-3">
          <EntityInsightsPanel insights={insights} teamSlug={hub.team.slug} />
        </div>
      )}

      <SectionCard title="Vad du behöver veta idag" icon={Star} className="lg:col-span-3">
        {hub.pulse
          ? canAccess("aiSummaries", plan)
            ? <TeamDailyPulse pulse={hub.pulse} />
            : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Dagens rubrik visas ovan — full brief kräver PRO.</p>
                <UpgradePrompt feature="aiSummaries" teamName={hub.team.name} />
              </div>
            )
          : <p className="py-4 text-center text-sm text-muted-foreground">Ingen brief publicerad för ditt lag idag. Nya kort släpps på morgonen.</p>}
      </SectionCard>

      <SectionCard title="Lagprofil mot ligan" icon={BarChart3} className="lg:col-span-2">
        <RadarOrEmpty data={hub.radar} />
      </SectionCard>

      <SectionCard title="Ledare" icon={Trophy}>
        {/* Hockeyns huvudtabell är poäng (mål + assist). */}
        {VERTICAL === "hockey" && (
          <LeaderList
            title="Poängliga"
            rows={[...hub.squad].sort((a, b) => b.goals + b.assists - (a.goals + a.assists)).slice(0, 5)}
            value={(r) => r.goals + r.assists}
            suffix="p"
          />
        )}
        <LeaderList title="Skytteliga" rows={hub.topScorers} statKey="goals" suffix="mål" />
        <LeaderList title="Assist" rows={hub.topAssists} statKey="assists" suffix="ast" />
        {hub.topScorers.length === 0 && <p className="text-sm text-muted-foreground">Ingen spelardata ännu.</p>}
      </SectionCard>

      <SectionCard title="Senaste nyheter" icon={Newspaper} className="lg:col-span-2" footer={<Link href={`/nyheter?lag=${encodeURIComponent(hub.team.name)}`} className="text-sm text-muted-foreground hover:text-foreground">Fler nyheter om {hub.team.name} →</Link>}>
        {hub.news.length === 0 ? <p className="text-sm text-muted-foreground">Inga artiklar ännu.</p> : (
          <div className="flex flex-col gap-2">
            {hub.news.slice(0, 4).map((a) => (
              <Link key={a.id} href={`/artikel/${a.slug}`} className="group flex items-start justify-between gap-3 rounded-lg border border-border/60 px-3 py-2.5 hover:border-pitch/50 transition-colors active:bg-muted touch-manipulation">
                <span className="text-sm text-foreground group-hover:text-pitch-ink line-clamp-2">{a.title}</span>
                <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{a.published_at ? new Date(a.published_at).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm", day: "numeric", month: "short" }) : ""}</span>
              </Link>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Händelser" icon={Activity}>
        <FixtureFeed recent={hub.recent} upcoming={hub.upcoming} smId={hub.team.sportsmonks_id} onFixture={onFixture} />
      </SectionCard>

      <SpotifyPodcast slug={hub.team.slug} />
    </div>
  );
}

// ─── Tab: Statistik ─────────────────────────────────────────────────────────
function Statistik({ hub, plan }: { hub: TeamHubPayload; plan: Plan }) {
  const s = hub.stats;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <SectionCard title="xG-form" icon={Activity}>
        {canAccess("advancedFilter", plan)
          ? <TeamXgForm stats={s} />
          : <UpgradePrompt feature="advancedFilter" teamName={hub.team.name} />}
      </SectionCard>
      <SectionCard title="Profilradar" icon={BarChart3}><RadarOrEmpty data={hub.radar} /></SectionCard>
      <SectionCard title="Säsongsstatistik" icon={Trophy}>
        {!s ? <p className="text-sm text-muted-foreground">Ingen statistik ännu.</p> : (
          <div className="divide-y divide-border/40">
            <StatTextRow label="Tabellposition" value={hub.position ? `#${hub.position}` : "–"} />
            <StatTextRow label="Poäng"><StatNumber value={s.points} className="text-sm" /></StatTextRow>
            <StatTextRow label="Vinster / Oavgjorda / Förluster" value={`${s.wins} / ${s.draws} / ${s.losses}`} />
            <StatTextRow label="Mål gjorda / insläppta" value={`${s.goals_for} / ${s.goals_against}`} />
            <StatTextRow label="Målskillnad"><StatNumber value={s.goal_diff} format={{ signDisplay: "exceptZero" }} className="text-sm" /></StatTextRow>
            <StatTextRow label="Bollinnehav" value={s.possession != null ? `${Number(s.possession).toFixed(0)}%` : "–"} />
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ─── Tab: Trupp ─────────────────────────────────────────────────────────────
function Trupp({ squad }: { squad: LeaderRow[] }) {
  if (squad.length === 0)
    return (
      <p className="text-sm text-muted-foreground py-8 text-center text-balance">
        Här listas spelartruppen med matcher, mål och betyg. Den fylls på när
        säsongens första matcher är synkade.
      </p>
    );
  return (
    <SectionCard title="Trupp" icon={Users}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[420px]">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="text-left py-2">Spelare</th>
              <th className="text-center py-2">Pos</th>
              <th className="text-center py-2">M</th>
              <th className="text-center py-2">Min</th>
              <th className="text-center py-2">Mål</th>
              <th className="text-center py-2">Ast</th>
              <th className="text-center py-2">Skott</th>
              <th className="text-center py-2">Betyg</th>
            </tr>
          </thead>
          <tbody>
            {squad.map((p) => (
              <tr key={p.player_id} className="border-b border-border/40 last:border-0 hover:bg-muted/20">
                <td className="py-2">
                  <Link href={`/spelare/${p.slug ?? p.player_id}`} className="flex items-center gap-2 text-foreground hover:text-pitch-ink">
                    {p.image && <span className="relative w-6 h-6 rounded-full overflow-hidden bg-muted shrink-0"><PlayerAvatar src={p.image} alt="" sizes="24px" /></span>}
                    <span className="truncate">{p.fullname}</span>
                  </Link>
                </td>
                <td className="text-center text-muted-foreground capitalize">{p.position?.slice(0, 3) ?? "–"}</td>
                <td className="text-center text-muted-foreground">{p.appearances}</td>
                <td className="text-center text-muted-foreground">{p.minutes}</td>
                <td className="text-center font-semibold text-foreground">{p.goals}</td>
                <td className="text-center text-foreground">{p.assists}</td>
                <td className="text-center text-muted-foreground">{p.shots}</td>
                <td className="text-center text-muted-foreground">{p.rating != null ? p.rating.toFixed(2) : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

// ─── Tab: Matcher ───────────────────────────────────────────────────────────
function Matcher({ recent, upcoming, smId, onFixture }: { recent: FixtureRow[]; upcoming: FixtureRow[]; smId: number | null; onFixture: (f: FixtureRow) => void }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <ListGroup header="Kommande">
        {upcoming.length === 0
          ? <p className="px-4 py-3 text-sm text-muted-foreground">Inga inplanerade matcher.</p>
          : upcoming.map((f) => <FixtureListRow key={f.sportmonks_id} fixture={f} smId={smId} onSelect={onFixture} />)}
      </ListGroup>
      <ListGroup header="Senaste resultat">
        {recent.length === 0
          ? <p className="px-4 py-3 text-sm text-muted-foreground">Inga spelade matcher ännu.</p>
          : recent.map((f) => <FixtureListRow key={f.sportmonks_id} fixture={f} smId={smId} onSelect={onFixture} />)}
      </ListGroup>
    </div>
  );
}

// ─── Tab: Forum ─────────────────────────────────────────────────────────────
function Forum({ hub }: { hub: TeamHubPayload }) {
  return (
    <SectionCard title="Forum — senaste diskussioner" icon={MessageSquare} footer={<Link href={`/lag/${hub.team.slug}/forum`} className="text-sm text-muted-foreground hover:text-foreground">Till forumet →</Link>}>
      {hub.threads.length === 0 ? <p className="text-sm text-muted-foreground">Inga trådar ännu — starta en diskussion.</p> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {hub.threads.slice(0, 8).map((t) => (
            <Link key={t.id} href={`/lag/${hub.team.slug}/forum/${t.id}`} className="group flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2.5 hover:border-pitch/50 transition-colors active:bg-muted touch-manipulation">
              <span className="text-sm text-foreground group-hover:text-pitch-ink line-clamp-1">{t.title}</span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0"><MessageSquare className="h-3 w-3" /> {t.reply_count ?? 0}</span>
            </Link>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ─── Delade byggstenar ──────────────────────────────────────────────────────
/** Dagens godkända AI-brief för laget ("vad du behöver veta idag"). Elite. */
function TeamDailyPulse({ pulse }: { pulse: TeamHubPayload["pulse"] }) {
  if (!pulse) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Ingen brief publicerad för ditt lag idag. Nya kort släpps på morgonen.</p>;
  }
  const ctx = pulse.match_context_label === "pre_match" ? "Inför match"
    : pulse.match_context_label === "post_match_hold" ? "Efter match" : "Dagsläge";
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-pitch/10 border border-pitch/30 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-pitch-ink">Nano Fotboll AI · {ctx}</span>
      </div>
      <h3 className="text-lg font-bold leading-snug text-foreground text-balance">{pulse.headline}</h3>
      {pulse.dek && <p className="text-sm font-medium text-muted-foreground">{pulse.dek}</p>}
      <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-line">{pulse.body}</p>
    </div>
  );
}

/** Lagets xG-form: skapat vs insläppt + finishing/regression-signal mot faktiska mål. */
function TeamXgForm({ stats }: { stats: TeamHubPayload["stats"] }) {
  const xgFor = stats?.xg_for;
  const xgAgainst = stats?.xg_against;
  if (xgFor == null && xgAgainst == null) {
    return <p className="py-6 text-center text-sm text-muted-foreground">xG-data saknas ännu för säsongen.</p>;
  }
  const finishing = xgFor != null && stats?.goals_for != null ? stats.goals_for - xgFor : null;
  const defending = xgAgainst != null && stats?.goals_against != null ? stats.goals_against - xgAgainst : null;
  const verdict = (d: number | null) =>
    d == null ? "" : d >= 2 ? "överpresterar — regression möjlig" : d <= -2 ? "underpresterar — otur i avsluten" : "i linje med xG";
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <XgStat label="xG skapat" value={xgFor != null ? +xgFor.toFixed(1) : null} accent />
        <XgStat label="xG insläppt" value={xgAgainst != null ? +xgAgainst.toFixed(1) : null} />
      </div>
      <div className="divide-y divide-border/40">
        {finishing != null && (
          <StatTextRow label={`Mål mot xG (${stats?.goals_for ?? 0} vs ${xgFor!.toFixed(1)})`}>
            <span className={`text-sm font-semibold ${finishing >= 0 ? "text-success" : "text-red-400"}`}>
              {finishing >= 0 ? "+" : ""}{finishing.toFixed(1)} · {verdict(finishing)}
            </span>
          </StatTextRow>
        )}
        {defending != null && (
          <StatTextRow label={`Insläppt mot xGA (${stats?.goals_against ?? 0} vs ${xgAgainst!.toFixed(1)})`}>
            <span className={`text-sm font-semibold ${defending <= 0 ? "text-success" : "text-red-400"}`}>
              {defending >= 0 ? "+" : ""}{defending.toFixed(1)}
            </span>
          </StatTextRow>
        )}
      </div>
      <p className="text-xs text-muted-foreground">xG = förväntade mål utifrån chansernas kvalitet. Stor avvikelse mot faktiska mål signalerar tur/otur eller form som ofta normaliseras.</p>
    </div>
  );
}

function XgStat({ label, value, accent }: { label: string; value: number | null; accent?: boolean }) {
  return (
    <TactileCard className="rounded-xl p-2.5 text-center">
      {value == null ? (
        <p className={`text-xl font-bold ${accent ? "text-pitch-ink" : "text-foreground"}`}>–</p>
      ) : (
        <StatNumber
          value={value}
          format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }}
          className={`text-xl ${accent ? "text-pitch-ink" : "text-foreground"}`}
        />
      )}
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </TactileCard>
  );
}

function RadarOrEmpty({ data }: { data: TeamHubPayload["radar"] }) {
  if (!data || data.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Profilradar visas när säsongsstatistik finns — ofta efter ett par omgångar.
      </p>
    );
  }
  return (
    <>
      <TeamRadar data={data} />
      <p className="text-xs text-muted-foreground text-center mt-1">Normaliserat (z-score → 0–100). 50 = ligasnitt.</p>
    </>
  );
}

function SectionCard({ title, icon: Icon, children, className = "", footer }: {
  title: string; icon: typeof Trophy; children: React.ReactNode; className?: string; footer?: React.ReactNode;
}) {
  // Collapse-state persisteras per kort-titel så valet överlever omladdning.
  const storageKey = `mittlag:card:${title}`;
  const [open, setOpen] = useState(true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- läser webbläsar-API (localStorage/navigator/Notification) efter hydrering; finns inte under SSR.
    try { if (localStorage.getItem(storageKey) === "0") setOpen(false); } catch { /* SSR/privat läge */ }
  }, [storageKey]);
  const toggle = () => setOpen((o) => {
    try { localStorage.setItem(storageKey, o ? "0" : "1"); } catch { /* ignorera */ }
    return !o;
  });
  return (
    <TactileCard className={`flex flex-col ${className}`}>
      <button
        onClick={toggle}
        aria-expanded={open}
        className="flex items-center gap-2 px-4 py-3 text-left touch-manipulation select-none active:opacity-70 transition-opacity"
      >
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-base font-semibold text-foreground flex-1">{title}</span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && <div className="px-4 pb-4 flex-1 space-y-4">{children}</div>}
      {open && footer && <div className="px-4 pb-3 flex justify-end">{footer}</div>}
    </TactileCard>
  );
}

function StatTextRow({ label, value, children }: { label: string; value?: string | number; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children ?? <span className="text-sm font-semibold text-foreground">{value}</span>}
    </div>
  );
}

function LeaderList({ title, rows, statKey = "goals", value, suffix }: { title: string; rows: LeaderRow[]; statKey?: "goals" | "assists"; value?: (r: LeaderRow) => number; suffix: string }) {
  const stat = value ?? ((r: LeaderRow) => r[statKey]);
  if (rows.length === 0 || rows.every((r) => stat(r) === 0)) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{title}</p>
      <div className="space-y-1">
        {rows.slice(0, 3).map((r, i) => (
          <div key={r.player_id} className="flex items-center gap-2.5">
            <span className="text-xs text-muted-foreground w-3 font-mono tabular-nums">{i + 1}</span>
            {r.image && <span className="relative w-6 h-6 rounded-full overflow-hidden bg-muted shrink-0"><PlayerAvatar src={r.image} alt="" sizes="24px" /></span>}
            {/* Spelarsidan är byggd för fotbollens siffror (matcher, minuter, betyg) — hockeyn länkar inte dit än. */}
            {VERTICAL === "hockey" ? (
              <span className="flex-1 text-sm text-foreground truncate">{r.fullname}</span>
            ) : (
              <Link href={`/spelare/${r.slug ?? r.player_id}`} className="flex-1 text-sm text-foreground hover:text-pitch-ink truncate">{r.fullname}</Link>
            )}
            <span className="text-sm font-bold text-foreground font-mono tabular-nums">{stat(r)}</span>
            <span className="text-xs text-muted-foreground w-6">{suffix}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Rad för en match — öppnar quickview-sheet vid tap. */
function FixtureListRow({ fixture: f, smId, onSelect, density }: { fixture: FixtureRow; smId: number | null; onSelect: (f: FixtureRow) => void; density?: "default" | "compact" }) {
  const isHome = f.home_team_id === smId;
  const opp = isHome ? f.away_team_name : f.home_team_name;
  const played = f.status === "FT";
  const gf = (isHome ? f.home_score : f.away_score) ?? 0;
  const ga = (isHome ? f.away_score : f.home_score) ?? 0;
  const r = gf > ga ? "V" : gf === ga ? "O" : "F";
  const color = gf > ga ? "text-success" : gf === ga ? "text-muted-foreground" : "text-red-400";

  return (
    <ListRow
      density={density}
      onClick={() => onSelect(f)}
      leading={
        played
          ? <span className={`text-xs font-bold ${color}`}>{r}</span>
          : isLiveNow(f.status, f.kickoff_at)
            ? <span className="text-xs font-bold text-pitch-ink animate-pulse">LIVE</span>
            : <span className="text-xs font-bold text-muted-foreground">KOMMER</span>
      }
      title={`${isHome ? "H" : "B"} · ${opp}`}
      trailing={
        played
          ? <span className="text-sm font-semibold font-mono tabular-nums text-foreground">{gf}–{ga}</span>
          : <span className="text-xs">{f.kickoff_at ? new Date(f.kickoff_at).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm", day: "numeric", month: "short" }) : ""}</span>
      }
      chevron
    />
  );
}

/** Kompakt blandat flöde (Översikt) — samma quickview. */
function FixtureFeed({ recent, upcoming, smId, onFixture }: { recent: FixtureRow[]; upcoming: FixtureRow[]; smId: number | null; onFixture: (f: FixtureRow) => void }) {
  if (recent.length === 0 && upcoming.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-balance">
        Spelade och kommande matcher dyker upp här så snart omgången är satt.
      </p>
    );
  }
  return (
    <div className="-mx-2 space-y-0.5">
      {[...upcoming, ...recent].map((f) => (
        <FixtureListRow key={f.sportmonks_id} fixture={f} smId={smId} onSelect={onFixture} density="compact" />
      ))}
    </div>
  );
}
