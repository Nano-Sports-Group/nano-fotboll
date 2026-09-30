import { SPORT, vertical } from "@/lib/vertical";
import type { Metadata } from "next";
import Link from "next/link";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { TeamPlayerStatsTable, type TeamPlayerStat } from "./TeamPlayerStatsTable";
import { loadTeamSectionSafe } from "@/lib/team-hub/loadTeamSection";
import { TeamSection } from "@/components/team-hub/TeamSection";
import { ProductEventTracker } from "@/components/analytics/ProductEventTracker";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";

export const revalidate = 60;

const SEASON_2026 = 26806;

type PlayerStatRow = Record<string, unknown> & {
  player: Record<string, unknown> | null;
};

async function getTeamSmId(slug: string): Promise<{ name: string; smId: number | null }> {
  if (!isSupabaseConfigured()) return { name: slug, smId: null };
  const db = createServerClient();
  const { data } = await db.from("entities").select("name,metadata").eq("type", "team").eq("sport", SPORT).eq("slug", slug).maybeSingle();
  const meta = (data?.metadata ?? {}) as Record<string, unknown>;
  return { name: (data?.name as string) ?? slug, smId: (meta.sportsmonks_id as number | null) ?? null };
}

async function getTeamStandings(smId: number) {
  if (!isSupabaseConfigured()) return null;
  const db = createServerClient();
  const { data } = await db
    .from("team_season_stats")
    .select("played,wins,draws,losses,points,goals_for,goals_against,clean_sheets,xg_for,xg_against,form")
    .eq("team_id", smId)
    .eq("season_id", SEASON_2026)
    .maybeSingle();
  if (!data) return null;
  return {
    ...data,
    goal_diff: Number(data.goals_for ?? 0) - Number(data.goals_against ?? 0),
  } as Record<string, unknown>;
}

async function getPlayerStats(smId: number) {
  if (!isSupabaseConfigured()) return [];
  const db = createServerClient();
  const { data } = await db
    .from("player_season_stats")
    .select("player_id,goals,assists,appearances,minutes,yellow_cards,red_cards,shots,shots_on_target,rating,passes,tackles,interceptions,key_passes,pass_accuracy,dribbles,clearances,fouls,clean_sheets")
    .eq("team_id", smId)
    .eq("season_id", SEASON_2026)
    .order("goals", { ascending: false });
  const rows = (data ?? []) as Record<string, unknown>[];
  const playerIds = rows.map((r) => Number(r.player_id)).filter(Boolean);
  const { data: players } = playerIds.length
    ? await db.from("players").select("sportmonks_id,fullname,position,image,slug").in("sportmonks_id", playerIds)
    : { data: [] };
  const playerById = new Map(
    ((players ?? []) as Record<string, unknown>[]).map((p) => [Number(p.sportmonks_id), p])
  );
  return rows.map((row) => ({ ...row, player: playerById.get(Number(row.player_id)) ?? null })) as PlayerStatRow[];
}

async function getTeamFixtures(smId: number) {
  if (!isSupabaseConfigured()) return [];
  const db = createServerClient();
  const { data } = await db
    .from("fixtures")
    .select("sportmonks_id,home_team_name,away_team_name,home_score,away_score,kickoff_at,status,home_team_id,away_team_id")
    .eq("season_id", SEASON_2026)
    .eq("status", "FT")
    .or(`home_team_id.eq.${smId},away_team_id.eq.${smId}`)
    .order("kickoff_at", { ascending: false })
    .limit(10);
  return (data ?? []) as Record<string, unknown>[];
}

async function getSeasonProjection(smId: number) {
  if (!isSupabaseConfigured()) return null;
  const db = createServerClient();
  const { data } = await db
    .from("stats_season_projection")
    .select("p_champion,p_top3,p_relegation,p_playoff,elo,current_points")
    .eq("sport", SPORT)
    .eq("season_id", SEASON_2026)
    .eq("team_id", smId)
    .maybeSingle();
  return data as Record<string, unknown> | null;
}

async function getScheduleForm(smId: number) {
  if (!isSupabaseConfigured()) return null;
  const db = createServerClient();
  const { data } = await db
    .from("stats_schedule_form")
    .select("actual_points,xpts,luck,sos")
    .eq("sport", SPORT)
    .eq("season_id", SEASON_2026)
    .eq("team_id", smId)
    .maybeSingle();
  return data as Record<string, unknown> | null;
}

interface AthopiaRatingRow {
  player_id: number;
  athopia_rating: number;
  attacking_rating: number | null;
  form_rating: number | null;
  fullname: string;
  slug: string | null;
  image: string | null;
  position: string | null;
}

/** Athopia-betyg (egen sammansatt spelarrating) för laget — orenderad tabell kopplas in här (FAS B2). */
async function getTeamAthopiaRatings(smId: number): Promise<AthopiaRatingRow[]> {
  if (!isSupabaseConfigured()) return [];
  const db = createServerClient();
  const { data: squad } = await db
    .from("player_season_stats")
    .select("player_id")
    .eq("team_id", smId)
    .eq("season_id", SEASON_2026);
  const playerIds = (squad ?? []).map((r) => Number(r.player_id)).filter(Boolean);
  if (!playerIds.length) return [];

  const { data: ratings } = await db
    .from("athopia_ratings")
    .select("player_id,athopia_rating,attacking_rating,form_rating")
    .eq("season_id", SEASON_2026)
    .in("player_id", playerIds)
    .not("athopia_rating", "is", null)
    .order("athopia_rating", { ascending: false })
    .limit(10);
  const rows = (ratings ?? []) as Record<string, unknown>[];
  if (!rows.length) return [];

  const { data: players } = await db
    .from("players")
    .select("sportmonks_id,fullname,slug,image,position")
    .in("sportmonks_id", rows.map((r) => Number(r.player_id)));
  const byId = new Map(((players ?? []) as Record<string, unknown>[]).map((p) => [Number(p.sportmonks_id), p]));

  return rows.map((r) => {
    const p = byId.get(Number(r.player_id));
    return {
      player_id: Number(r.player_id),
      athopia_rating: Number(r.athopia_rating),
      attacking_rating: r.attacking_rating == null ? null : Number(r.attacking_rating),
      form_rating: r.form_rating == null ? null : Number(r.form_rating),
      fullname: (p?.fullname as string) ?? `Spelare ${r.player_id}`,
      slug: (p?.slug as string | null) ?? null,
      image: (p?.image as string | null) ?? null,
      position: (p?.position as string | null) ?? null,
    };
  });
}

async function getGoalTiming(smId: number) {
  if (!isSupabaseConfigured()) return [];
  const db = createServerClient();
  const { data } = await db
    .from("stats_team_goal_timing")
    .select("minute_block,goal_count")
    .eq("sport", SPORT)
    .eq("season_id", SEASON_2026)
    .eq("team_id", smId)
    .order("minute_block");
  return (data ?? []) as { minute_block: string; goal_count: number }[];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { name } = await getTeamSmId(slug);
  return { title: `${name} — Statistik | Nano Fotboll` };
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-center">
      <p className="font-bold text-3xl text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

function ProbBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold text-foreground">{(pct * 100).toFixed(1)}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct * 100, 100)}%` }} />
      </div>
    </div>
  );
}

const BLOCK_ORDER = ["1-15", "16-30", "31-45", "46-60", "61-75", "76-90"];

export default async function LagStatistikPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { name: teamName, smId } = await getTeamSmId(slug);

  // Laget kan saknas i entities även när smId finns — då hoppar vi över
  // lagsektionen i stället för att 404:a hela statistiksidan.
  const teamSection = await loadTeamSectionSafe(slug);

  const [standings, players, fixtures, projection, scheduleForm, goalTiming, athopiaRatings] = await Promise.all([
    smId ? getTeamStandings(smId) : Promise.resolve(null),
    smId ? getPlayerStats(smId) : Promise.resolve([]),
    smId ? getTeamFixtures(smId) : Promise.resolve([]),
    smId ? getSeasonProjection(smId) : Promise.resolve(null),
    smId ? getScheduleForm(smId) : Promise.resolve(null),
    smId ? getGoalTiming(smId) : Promise.resolve([]),
    smId ? getTeamAthopiaRatings(smId) : Promise.resolve([]),
  ]);

  const byGoals   = [...players].sort((a, b) => (b.goals as number) - (a.goals as number)).slice(0, 5);
  const byAssists = [...players].sort((a, b) => (b.assists as number) - (a.assists as number)).slice(0, 5);
  const byApps    = [...players].sort((a, b) => (b.appearances as number) - (a.appearances as number)).slice(0, 5);
  const playerTableRows: TeamPlayerStat[] = players.map((row) => {
    const pl = row.player as Record<string, unknown> | null;
    return {
      player_id: Number(row.player_id ?? 0),
      fullname: (pl?.fullname as string) ?? `Spelare ${row.player_id}`,
      slug: (pl?.slug as string) ?? String(row.player_id ?? ""),
      position: (pl?.position as string | null) ?? null,
      appearances: Number(row.appearances ?? 0),
      goals: Number(row.goals ?? 0),
      assists: Number(row.assists ?? 0),
      shots: Number(row.shots ?? 0),
      shots_on_target: Number(row.shots_on_target ?? 0),
      passes: Number(row.passes ?? 0),
      tackles: Number(row.tackles ?? 0),
      interceptions: Number(row.interceptions ?? 0),
      rating: row.rating == null ? null : Number(row.rating),
      yellow_cards: Number(row.yellow_cards ?? 0),
      red_cards: Number(row.red_cards ?? 0),
    };
  });

  const maxGoals = goalTiming.length ? Math.max(...goalTiming.map((g) => g.goal_count), 1) : 1;
  const orderedTiming = BLOCK_ORDER.map((b) => ({
    block: b,
    count: goalTiming.find((g) => g.minute_block === b)?.goal_count ?? 0,
  }));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <ProductEventTracker
        event="team_hub_tab_selected"
        props={{ team_slug: slug, tab: "statistik" }}
      />
      <h1 className="font-bold text-3xl text-foreground text-balance">STATISTIK — {teamName.toUpperCase()}</h1>

      {/* Lagstatistiken (xG-form + ligaprofil) låg tidigare i laghubbens egen
          "Statistik"-flik, medan den här sidan hette "Spelarstatistik". Två
          etiketter som båda hette Statistik pekade alltså på olika innehåll.
          Nu är detta hela lagets statistik — lag först, sedan spelare. */}
      {teamSection && (
        <TeamSection
          section="statistik"
          hub={teamSection.hub}
          plan={teamSection.plan}
          insights={teamSection.insights}
        />
      )}

      {/* Tabellrad */}
      {standings && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="Spelade"    value={standings.played as number ?? 0} />
            <StatCard label="Vinster"    value={standings.wins as number ?? 0} />
            <StatCard label="Oavgjorda"  value={standings.draws as number ?? 0} />
            <StatCard label="Förluster"  value={standings.losses as number ?? 0} />
            <StatCard label="Gjorda mål" value={standings.goals_for as number ?? 0} />
            <StatCard label="Insläppta"  value={standings.goals_against as number ?? 0} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border bg-card p-4 flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Poäng</span>
              <span className="font-semibold text-2xl text-pitch-ink">{standings.points as number ?? 0}</span>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Målskillnad</span>
              <span className={`font-semibold text-2xl ${(standings.goal_diff as number ?? 0) >= 0 ? "text-success" : "text-red-400"}`}>
                {(standings.goal_diff as number ?? 0) >= 0 ? "+" : ""}{standings.goal_diff as number ?? 0}
              </span>
            </div>
            {(standings.clean_sheets as number) > 0 && (
              <div className="rounded-xl border border-border bg-card p-4 flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Nollor</span>
                <span className="font-semibold text-2xl text-foreground">{standings.clean_sheets as number}</span>
              </div>
            )}
            {((standings.xg_for as number) ?? 0) > 0 && (
              <div className="rounded-xl border border-border bg-card p-4 flex justify-between items-center">
                <span className="text-sm text-muted-foreground">xG för/mot</span>
                <span className="font-semibold text-lg text-foreground">
                  {Number(standings.xg_for ?? 0).toFixed(1)}/{Number(standings.xg_against ?? 0).toFixed(1)}
                </span>
              </div>
            )}
          </div>
          {typeof standings.form === "string" && (standings.form as string).length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-2">Form</p>
              <div className="flex gap-1">
                {(standings.form as string).split("").filter((c: string) => ["W","D","L"].includes(c)).slice(-10).map((r: string, i: number) => (
                  <span key={i} className={`w-6 h-6 rounded text-xs font-bold flex items-center justify-center ${r === "W" ? "bg-success/20 text-success" : r === "L" ? "bg-red-400/20 text-destructive-ink" : "bg-muted text-muted-foreground"}`}>
                    {r === "W" ? "V" : r === "L" ? "F" : "O"}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI-statistik: Säsongsprognos + Schemakorrigerad form */}
      {(projection || scheduleForm) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {projection && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <div className="flex items-baseline justify-between">
                <h2 className="font-semibold text-sm text-foreground text-balance">SÄSONGSPROGNOS</h2>
                {projection.elo != null && (
                  <span className="text-xs text-muted-foreground">Elo {String(projection.elo)}</span>
                )}
              </div>
              <ProbBar label="Mästare"   pct={projection.p_champion as number ?? 0}   color="bg-amber-400" />
              <ProbBar label="Top 3"     pct={projection.p_top3 as number ?? 0}        color="bg-pitch" />
              <ProbBar label="Playoff"   pct={projection.p_playoff as number ?? 0}     color="bg-blue-400" />
              <ProbBar label="Nedflyttning" pct={projection.p_relegation as number ?? 0} color="bg-red-400" />
            </div>
          )}
          {scheduleForm && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <h2 className="font-semibold text-sm text-foreground text-balance">SCHEMAKORRIGERAD FORM</h2>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="font-bold text-2xl text-foreground">{Number(scheduleForm.actual_points ?? 0)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Verkliga poäng</p>
                </div>
                <div>
                  <p className="font-bold text-2xl text-foreground">
                    {scheduleForm.xpts != null ? Number(scheduleForm.xpts).toFixed(1) : "–"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Förväntade (xP)</p>
                </div>
                <div>
                  <p className={`font-bold text-2xl ${Number(scheduleForm.luck ?? 0) >= 0 ? "text-success" : "text-red-400"}`}>
                    {scheduleForm.luck != null ? (Number(scheduleForm.luck) >= 0 ? "+" : "") + Number(scheduleForm.luck).toFixed(1) : "–"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Tur</p>
                </div>
              </div>
              {scheduleForm.sos != null && (
                <p className="text-xs text-muted-foreground border-t border-border pt-2">
                  Schemastyrka: motstånd Elo {Number(scheduleForm.sos)} i snitt
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Mål per 15-minutersblock */}
      {goalTiming.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold text-sm text-foreground mb-4 text-balance">MÅL PER PERIOD</h2>
          <div className="flex items-end gap-2 h-24">
            {orderedTiming.map(({ block, count }) => (
              <div key={block} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs font-semibold text-foreground">{count || ""}</span>
                <div
                  className="w-full rounded-t bg-pitch/60"
                  style={{ height: `${(count / maxGoals) * 72}px`, minHeight: count > 0 ? "4px" : "0" }}
                />
                <span className="text-xs text-muted-foreground">{block}′</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Athopia-betyg — egen sammansatt spelarrating (athopia_ratings) */}
      {athopiaRatings.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="font-semibold text-sm text-foreground text-balance">{vertical.wordmark}-BETYG</h2>
          </div>
          <div className="divide-y divide-border/50">
            {athopiaRatings.map((row, i) => (
              <Link
                key={row.player_id}
                href={row.slug ? `/spelare/${row.slug}` : "#"}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors"
              >
                <span className="text-xs text-muted-foreground w-4 font-mono tabular-nums">{i + 1}</span>
                {row.image ? (
                  <div className="relative w-7 h-7 rounded-full overflow-hidden bg-muted shrink-0">
                    <PlayerAvatar src={row.image} alt="" sizes="28px" />
                  </div>
                ) : (
                  <div className="w-7 h-7 rounded-full bg-muted shrink-0" />
                )}
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-foreground truncate">{row.fullname}</span>
                  {row.position && (
                    <span className="block text-xs text-muted-foreground">{row.position}</span>
                  )}
                </span>
                <span className="font-bold text-lg text-pitch-ink font-mono tabular-nums">{row.athopia_rating.toFixed(1)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Interna ligorna */}
      {players.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            { title: "SKYTTELIGA", rows: byGoals, key: "goals", label: "Mål" },
            { title: "ASSISTLIGA", rows: byAssists, key: "assists", label: "Ast" },
            { title: "SPELAD TID", rows: byApps, key: "appearances", label: "Mch" },
          ].map(({ title, rows, key, label }) => (
            <div key={title} className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h2 className="font-semibold text-sm text-foreground text-balance">{title}</h2>
              </div>
              <div className="divide-y divide-border/50">
                {rows.map((row, i) => {
                  const pl = row.player as Record<string, unknown> | null;
                  const playerSlug = (pl?.slug as string) ?? String(row.player_id ?? "");
                  return (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="text-xs text-muted-foreground w-4 font-mono tabular-nums">{i + 1}</span>
                      {!!pl?.image && (
                        <div className="relative w-7 h-7 rounded-full overflow-hidden bg-muted shrink-0">
                          <PlayerAvatar src={pl.image as string} alt="" sizes="28px" />
                        </div>
                      )}
                      <Link href={`/spelare/${playerSlug}`} className="flex-1 text-sm text-foreground hover:text-pitch-ink truncate">
                        {(pl?.fullname as string) ?? `Spelare ${row.player_id}`}
                      </Link>
                      <span className="text-sm font-bold text-foreground">{String(row[key] ?? 0)}</span>
                      <span className="text-xs text-muted-foreground w-6">{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Full spelarstatistik-tabell */}
      {players.length > 0 && (
        <TeamPlayerStatsTable players={playerTableRows} />
      )}

      {/* Senaste matcher */}
      {fixtures.length > 0 && (
        <div>
          <h2 className="font-semibold text-xl text-foreground mb-3 text-balance">SENASTE MATCHER</h2>
          <div className="space-y-2">
            {fixtures.map((f) => {
              const isHome = String(f.home_team_id) === String(smId);
              const opp  = isHome ? f.away_team_name : f.home_team_name;
              const hs   = f.home_score as number;
              const as_  = f.away_score as number;
              const won  = isHome ? hs > as_ : as_ > hs;
              const drew = hs === as_;
              const result = drew ? "O" : won ? "V" : "F";
              const color  = drew ? "text-muted-foreground" : won ? "text-success" : "text-red-400";
              return (
                <Link key={f.sportmonks_id as number} href={`/match/${f.sportmonks_id}`}
                  className="flex items-center gap-3 bg-card border border-border rounded-lg px-4 py-3 hover:border-pitch/50 transition-colors">
                  <span className={`font-bold text-sm w-5 ${color}`}>{result}</span>
                  <span className="text-sm text-muted-foreground flex-1 truncate">
                    {isHome ? "H" : "B"} · {opp as string}
                  </span>
                  <span className="font-semibold text-lg text-foreground">{hs}–{as_}</span>
                  <span className="text-xs text-muted-foreground">
                    {f.kickoff_at ? new Date(f.kickoff_at as string).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm", day: "numeric", month: "short" }) : ""}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {!standings && players.length === 0 && (
        <p className="text-sm text-muted-foreground">Ingen statistik tillgänglig ännu.</p>
      )}
    </div>
  );
}
