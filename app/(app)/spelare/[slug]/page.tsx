import { SPORT, vertical } from "@/lib/vertical";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { buildPlayerProfile } from "@/lib/player/profile";
import { getSiteUrl } from "@/lib/site-url";
import { ListGroup } from "@/components/ui/ListGroup";
import { ListRow } from "@/components/ui/ListRow";
import { StatNumber } from "@/components/ui/StatNumber";
import { PlayerProfileAnalytics } from "./PlayerProfileAnalytics";
import { AppBreadcrumbs } from "@/components/ui/AppBreadcrumbs";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";

export const revalidate = 60;

const SEASON_2026 = 26806;

const POS_SV: Record<string, string> = {
  goalkeeper: "Målvakt", defender: "Försvarare",
  midfielder: "Mittfältare", attacker: "Forward",
};

async function getAthopiaRatings(playerId: number) {
  if (!isSupabaseConfigured()) return null;
  const db = createServerClient();
  const { data } = await db
    .from("athopia_ratings")
    .select("athopia_rating,attacking_rating,passing_rating,defensive_rating,physical_rating,form_rating")
    .eq("player_id", playerId)
    .eq("season_id", SEASON_2026)
    .maybeSingle();
  return data as Record<string, unknown> | null;
}

async function getClutch(playerId: number) {
  if (!isSupabaseConfigured()) return null;
  const db = createServerClient();
  const { data } = await db
    .from("stats_clutch")
    .select("goals,clutch_score,trailing_goals,level_goals,leading_goals")
    .eq("sport", SPORT)
    .eq("season_id", SEASON_2026)
    .eq("player_id", playerId)
    .maybeSingle();
  return data as Record<string, unknown> | null;
}

async function getFinishingIndex(playerId: number) {
  if (!isSupabaseConfigured()) return null;
  const db = createServerClient();
  const { data } = await db
    .from("stats_finishing_index")
    .select("goals,xg,overperf,ratio,goals_p90,xg_p90,overperf_percentile,regression_warning")
    .eq("sport", SPORT)
    .eq("season_id", SEASON_2026)
    .eq("player_id", playerId)
    .maybeSingle();
  return data as Record<string, unknown> | null;
}

async function getPlayerTwins(playerId: number) {
  if (!isSupabaseConfigured()) return [];
  const db = createServerClient();
  const { data } = await db
    .from("stats_player_twins")
    .select("twin_player_id,similarity,rank")
    .eq("sport", SPORT)
    .eq("season_id", SEASON_2026)
    .eq("player_id", playerId)
    .order("rank")
    .limit(5);
  if (!data?.length) return [];
  const twinIds = data.map(r => r.twin_player_id as number);
  const { data: twinPlayers } = await db
    .from("players")
    .select("sportmonks_id,fullname,position,image,slug")
    .in("sportmonks_id", twinIds);
  const byId = new Map(((twinPlayers ?? []) as Record<string, unknown>[]).map(p => [Number(p.sportmonks_id), p]));
  return data.map(r => ({ ...r, player: byId.get(r.twin_player_id as number) ?? null })) as Record<string, unknown>[];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  if (!isSupabaseConfigured()) return { title: "Spelare | Nano Fotboll" };
  const profile = await buildPlayerProfile(createServerClient(), slug);
  if (!profile.player) return { title: "Spelare | Nano Fotboll" };
  return {
    title: `${profile.player.fullname} | Nano Fotboll`,
    description: `Statistik för ${profile.player.fullname} i Allsvenskan på Nano Fotboll.`,
    alternates: { canonical: `${getSiteUrl()}/spelare/${slug}` },
    openGraph: {
      type: "profile",
      title: `${profile.player.fullname} | Nano Fotboll`,
      description: `Statistik för ${profile.player.fullname} i Allsvenskan på Nano Fotboll.`,
    },
  };
}

function StatBox({ label, value, suffix, sub }: { label: string; value: number; suffix?: string; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 text-center">
      <StatNumber value={value} suffix={suffix} className="text-3xl text-foreground" />
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
      {sub && <p className="text-xs text-pitch-ink mt-0.5">{sub}</p>}
    </div>
  );
}

function RatingBar({ label, value, max = 10 }: { label: string; value: number; max?: number }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold text-foreground">{value.toFixed(1)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-pitch" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default async function SpelarePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isSupabaseConfigured()) notFound();
  const db = createServerClient();
  const profile = await buildPlayerProfile(db, slug);
  if (!profile.player) notFound();

  const player = profile.player;
  const stats = profile.seasonStats;
  const matches = profile.matchHistory;
  const profileMetrics = profile.metrics;
  const smId = player.sportmonksId;

  const [athopiaRatings, clutch, finishing, twins] = await Promise.all([
    getAthopiaRatings(smId),
    getClutch(smId),
    getFinishingIndex(smId),
    getPlayerTwins(smId),
  ]);

  const age = player.birthdate
    ? Math.floor((Date.now() - new Date(player.birthdate).getTime()) / 3.156e10)
    : null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <AppBreadcrumbs
        items={[
          { label: "Statistik", href: "/statistik" },
          { label: player.fullname },
        ]}
      />
      <div className="flex items-center gap-6">
        {!!player.image && (
          <div className="relative w-20 h-20 rounded-full overflow-hidden bg-card border border-border shrink-0">
            <PlayerAvatar src={player.image} alt={player.fullname} sizes="80px" />
          </div>
        )}
        <div>
          <h1 className="font-bold text-5xl text-foreground leading-none mb-1 text-balance">{player.fullname}</h1>
          <p className="text-muted-foreground text-sm">
            {POS_SV[player.position ?? ""] ?? player.position ?? "–"}
            {age ? ` · ${age} år` : ""}
            {player.height ? ` · ${player.height} cm` : ""}
            {player.weight ? ` · ${player.weight} kg` : ""}
            {profile.teamName ? ` · ${profile.teamName}` : ""}
          </p>
        </div>
      </div>

      {athopiaRatings && (
        <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold text-sm text-foreground text-balance">{vertical.wordmark} AI-BETYG</h2>
            {athopiaRatings.athopia_rating != null && (
              <span className="font-bold text-2xl text-pitch-ink">{Number(athopiaRatings.athopia_rating).toFixed(1)}</span>
            )}
          </div>
          {(athopiaRatings.attacking_rating != null) && (
            <RatingBar label="Offensiv"   value={Number(athopiaRatings.attacking_rating)} />
          )}
          {(athopiaRatings.passing_rating != null) && (
            <RatingBar label="Passning"   value={Number(athopiaRatings.passing_rating)} />
          )}
          {(athopiaRatings.defensive_rating != null) && (
            <RatingBar label="Defensiv"   value={Number(athopiaRatings.defensive_rating)} />
          )}
          {(athopiaRatings.physical_rating != null) && (
            <RatingBar label="Fysik"      value={Number(athopiaRatings.physical_rating)} />
          )}
          {(athopiaRatings.form_rating != null) && (
            <RatingBar label="Aktuell form" value={Number(athopiaRatings.form_rating)} />
          )}
        </div>
      )}

      {stats && (
        <div>
          <h2 className="font-semibold text-xl text-foreground mb-3 text-balance">ALLSVENSKAN 2026</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <StatBox label="Matcher"    value={stats.appearances} />
            <StatBox label="Mål"        value={stats.goals} />
            <StatBox label="Assist"     value={stats.assists} />
            <StatBox label="Speltid"    value={stats.minutes} suffix="′" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatBox label="Skott"      value={stats.shots} />
            <StatBox label="Sk. på mål" value={stats.shotsOnTarget} />
            <StatBox label="Gula kort"  value={stats.yellowCards} />
            <StatBox label="Röda kort"  value={stats.redCards} />
          </div>
          {stats.xg != null && stats.xg > 0 && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatBox label="xG" value={stats.xg} suffix="" sub="Expected goals" />
              <StatBox
                label="xG/90"
                value={stats.xgPer90 ?? (stats.minutes > 0 ? Math.round((stats.xg / stats.minutes) * 90 * 100) / 100 : 0)}
                sub="Per 90 min"
              />
            </div>
          )}
          {stats.passes > 0 && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatBox label="Passningar"     value={stats.passes} />
              <StatBox label="Nyckelpass"     value={stats.keyPasses} />
              <StatBox label="Tacklingar"     value={stats.tackles} />
              <StatBox label="Interceptions"  value={stats.interceptions} />
              {stats.dribbles != null && stats.dribbles > 0 && (
                <StatBox label="Dribblingar" value={stats.dribbles} />
              )}
              {stats.clearances != null && stats.clearances > 0 && (
                <StatBox label="Rensningar" value={stats.clearances} />
              )}
              {stats.fouls != null && stats.fouls > 0 && (
                <StatBox label="Frisparkar mot" value={stats.fouls} />
              )}
              {stats.passAccuracy != null && stats.passAccuracy > 0 && (
                <StatBox label="Passn.-%" value={Math.round(stats.passAccuracy)} suffix="%" />
              )}
            </div>
          )}
          {stats.rating != null && stats.rating > 0 && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatBox label="Snittbetyg" value={Math.round(stats.rating * 100) / 100} sub="Sportsmonks" />
            </div>
          )}
          {stats.cleanSheets != null && stats.cleanSheets > 0 && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatBox label="Nollor" value={stats.cleanSheets} />
            </div>
          )}
        </div>
      )}

      {finishing && Number(finishing.goals ?? 0) > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <h2 className="font-semibold text-sm text-foreground mb-4 text-balance">MÅLSKYTTEINDEX</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="text-center">
              <p className="font-bold text-3xl text-foreground">{finishing.goals as number}</p>
              <p className="text-xs text-muted-foreground mt-1">Mål</p>
            </div>
            <div className="text-center">
              <p className="font-bold text-3xl text-foreground">{finishing.xg != null ? Number(finishing.xg).toFixed(1) : "–"}</p>
              <p className="text-xs text-muted-foreground mt-1">xG</p>
            </div>
            <div className="text-center">
              <p className={`font-bold text-3xl ${Number(finishing.overperf ?? 0) >= 0 ? "text-success" : "text-red-400"}`}>
                {finishing.overperf != null ? (Number(finishing.overperf) >= 0 ? "+" : "") + Number(finishing.overperf).toFixed(1) : "–"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Över xG</p>
            </div>
            {finishing.overperf_percentile != null && (
              <div className="text-center">
                <p className="font-bold text-3xl text-foreground">{Math.round(finishing.overperf_percentile as number)}</p>
                <p className="text-xs text-muted-foreground mt-1">Percentil</p>
              </div>
            )}
          </div>
          {!!finishing.regression_warning && (
            <p className="text-xs text-amber-400 border border-amber-400/20 bg-amber-400/5 rounded-lg px-3 py-2">
              Varning: Spelaren presterar avsevärt över sitt xG — regression mot medel är sannolik.
            </p>
          )}
        </div>
      )}

      {clutch && Number(clutch.goals ?? 0) > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-semibold text-sm text-foreground text-balance">CLUTCH INDEX</h2>
            <span className="font-bold text-2xl text-foreground">{clutch.clutch_score as number}</span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="font-bold text-2xl text-red-400">{clutch.trailing_goals as number}</p>
              <p className="text-xs text-muted-foreground mt-1">Mål när bakåt</p>
            </div>
            <div>
              <p className="font-bold text-2xl text-muted-foreground">{clutch.level_goals as number}</p>
              <p className="text-xs text-muted-foreground mt-1">Mål lika läge</p>
            </div>
            <div>
              <p className="font-bold text-2xl text-pitch-ink">{clutch.leading_goals as number}</p>
              <p className="text-xs text-muted-foreground mt-1">Mål när framåt</p>
            </div>
          </div>
        </div>
      )}

      {stats && (
        <PlayerProfileAnalytics
          playerName={player.fullname}
          minutes={stats.minutes}
          qualifyingMinutes={profile.qualifyingMinutes}
          metrics={profileMetrics}
        />
      )}

      {twins.length > 0 && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-sm text-foreground text-balance">LIKNANDE SPELARE</h2>
          </div>
          <div className="divide-y divide-border/50">
            {twins.map((t, i) => {
              const pl = t.player as Record<string, unknown> | null;
              const twinSlug = (pl?.slug as string) ?? String(t.twin_player_id ?? "");
              return (
                <Link key={i} href={`/spelare/${twinSlug}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-muted/20 transition-colors">
                  {!!pl?.image && (
                    <div className="relative w-8 h-8 rounded-full overflow-hidden bg-muted shrink-0">
                      <PlayerAvatar src={pl.image as string} alt="" sizes="32px" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{(pl?.fullname as string) ?? `Spelare ${t.twin_player_id}`}</p>
                    <p className="text-xs text-muted-foreground capitalize">{(pl?.position as string) ?? ""}</p>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono tabular-nums">
                    {Math.round((t.similarity as number) * 100)}% likhet
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {matches.length > 0 && (
        <div>
          <h2 className="font-semibold text-xl text-foreground mb-3 text-balance">MATCH FÖR MATCH</h2>
          <ListGroup footer="Senaste 10 matcherna. Tryck på en match för detaljer.">
            {matches.map((m) => {
              const goals = m.goals;
              const assists = m.assists;
              const parts = [
                `${m.minutesPlayed}′`,
                m.yellowCards > 0 ? `${m.yellowCards} gult` : null,
                m.redCards > 0 ? `${m.redCards} rött` : null,
              ].filter(Boolean);
              const contribution = [
                goals > 0 ? `${goals} mål` : null,
                assists > 0 ? `${assists} ast` : null,
              ].filter(Boolean).join(" · ");
              const hasScore = m.homeScore != null && m.awayScore != null;
              const title =
                m.homeTeamName && m.awayTeamName
                  ? hasScore
                    ? `${m.homeTeamName} ${m.homeScore}–${m.awayScore} ${m.awayTeamName}`
                    : `${m.homeTeamName} – ${m.awayTeamName}`
                  : `Match #${m.fixtureId}`;
              return (
                <ListRow
                  key={m.fixtureId}
                  href={`/match/${m.fixtureId}`}
                  title={title}
                  subtitle={parts.join(" · ")}
                  trailing={
                    contribution
                      ? <span className="font-semibold font-mono tabular-nums text-foreground">{contribution}</span>
                      : <span className="font-mono tabular-nums">–</span>
                  }
                />
              );
            })}
          </ListGroup>
        </div>
      )}

      {!stats && matches.length === 0 && (
        <p className="text-sm text-muted-foreground text-balance">
          Matcher, mål och betyg för {player.fullname} visas här så snart
          spelaren varit med i en synkad match.
        </p>
      )}
    </div>
  );
}
