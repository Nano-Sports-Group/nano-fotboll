import { SPORT } from "@/lib/vertical";
/**
 * Player profile snapshot for iOS/web (closes StatsRepository Supabase-direct).
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SEASON_IDS } from "@/lib/statistik";
import { getTeamNameMap } from "@/lib/team-names";

const QUALIFYING_MINUTES = 300;

export type PlayerProfilePlayer = {
  sportmonksId: number;
  fullname: string;
  slug: string | null;
  image: string | null;
  position: string | null;
  birthdate: string | null;
  height: number | null;
  weight: number | null;
};

export type PlayerProfileSeasonStats = {
  seasonId: number;
  playerId: number;
  teamId: number;
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  keyPasses: number;
  passes: number;
  passAccuracy: number | null;
  tackles: number;
  interceptions: number;
  rating: number | null;
  yellowCards: number;
  redCards: number;
  clearances: number | null;
  dribbles: number | null;
  fouls: number | null;
  cleanSheets: number | null;
  xg: number | null;
  xa: number | null;
  xgPer90: number | null;
  xaPer90: number | null;
};

export type PlayerProfileMetric = {
  key: string;
  label: string;
  value: number;
  average: number;
  percentile: number;
  decimals: number;
};

export type PlayerProfileMatch = {
  fixtureId: number;
  sportsmonksPlayerId: number;
  minutesPlayed: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  rating: number | null;
  xg: number | null;
  xa: number | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  homeScore: number | null;
  awayScore: number | null;
  kickoffAt: string | null;
  status: string | null;
};

export type PlayerProfileResponse = {
  player: PlayerProfilePlayer | null;
  teamName: string | null;
  /** entities.slug för spelarens lag — för getTeamColors(), aldrig ad-hoc slugify(). */
  teamSlug: string | null;
  seasonStats: PlayerProfileSeasonStats | null;
  qualifyingMinutes: number;
  metrics: PlayerProfileMetric[];
  matchHistory: PlayerProfileMatch[];
  snapshotRevision: string;
};

type PoolRow = {
  minutes: number;
  goals: number;
  assists: number;
  shots: number;
  key_passes: number;
  passes: number;
  tackles: number;
  rating: number | null;
  xg: number | null;
};

function n(v: unknown): number {
  return Number(v ?? 0);
}

function nNull(v: unknown): number | null {
  if (v == null) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function shouldShow(v: number | null | undefined): boolean {
  return v != null && v > 0;
}

function per90(v: number, mins: number): number {
  return (v / Math.max(mins, 1)) * 90;
}

function percentile(value: number, arr: number[]): number {
  const below = arr.filter((x) => x < value).length;
  const equal = arr.filter((x) => x === value).length;
  return ((below + equal / 2) / arr.length) * 100;
}

function computeMetrics(
  stats: PlayerProfileSeasonStats,
  pool: PoolRow[]
): PlayerProfileMetric[] {
  const mins = Math.max(stats.minutes, 1);
  const poolVals = pool.filter((p) => p.minutes > 0);
  if (poolVals.length === 0) return [];

  type Spec = {
    key: string;
    label: string;
    value: number;
    poolArr: number[];
    dec: number;
  };

  const specs: Spec[] = [
    {
      key: "goals90",
      label: "Mål/90",
      value: per90(stats.goals, mins),
      poolArr: poolVals.map((p) => per90(p.goals, p.minutes)),
      dec: 2,
    },
    {
      key: "assists90",
      label: "Assist/90",
      value: per90(stats.assists, mins),
      poolArr: poolVals.map((p) => per90(p.assists, p.minutes)),
      dec: 2,
    },
    {
      key: "shots90",
      label: "Skott/90",
      value: per90(stats.shots, mins),
      poolArr: poolVals.map((p) => per90(p.shots, p.minutes)),
      dec: 2,
    },
    {
      key: "keyPass90",
      label: "Nyckelpass/90",
      value: per90(stats.keyPasses, mins),
      poolArr: poolVals.map((p) => per90(p.key_passes, p.minutes)),
      dec: 2,
    },
    {
      key: "passes90",
      label: "Passningar/90",
      value: per90(stats.passes, mins),
      poolArr: poolVals.map((p) => per90(p.passes, p.minutes)),
      dec: 1,
    },
    {
      key: "tackles90",
      label: "Tacklingar/90",
      value: per90(stats.tackles, mins),
      poolArr: poolVals.map((p) => per90(p.tackles, p.minutes)),
      dec: 2,
    },
  ];

  if (
    shouldShow(stats.rating) ||
    poolVals.some((p) => shouldShow(p.rating))
  ) {
    specs.push({
      key: "rating",
      label: "Betyg",
      value: stats.rating ?? 0,
      poolArr: poolVals.map((p) => p.rating).filter((x): x is number => x != null),
      dec: 2,
    });
  }

  if (
    shouldShow(stats.xg) ||
    poolVals.some((p) => shouldShow(p.xg))
  ) {
    specs.push({
      key: "xg90",
      label: "xG/90",
      value: per90(stats.xg ?? 0, mins),
      poolArr: poolVals
        .filter((p) => shouldShow(p.xg))
        .map((p) => per90(p.xg!, p.minutes)),
      dec: 2,
    });
  }

  return specs.flatMap((m) => {
    const arr = m.poolArr.filter((x) => Number.isFinite(x));
    if (arr.length === 0) return [];
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    return [
      {
        key: m.key,
        label: m.label,
        value: m.value,
        average: avg,
        percentile: percentile(m.value, arr),
        decimals: m.dec,
      },
    ];
  });
}

export async function buildPlayerProfile(
  db: SupabaseClient,
  idOrSlug: string
): Promise<PlayerProfileResponse> {
  const seasonId = Number(SEASON_IDS["2026"] ?? "26806");
  const asId = Number(idOrSlug);
  const byId = Number.isFinite(asId) && asId > 0 && String(asId) === idOrSlug;

  let playerQuery = db
    .from("players")
    .select("sportmonks_id,fullname,slug,image,position,birthdate,height,weight")
    .eq("sport", SPORT)
    .limit(1);
  playerQuery = byId
    ? playerQuery.eq("sportmonks_id", asId)
    : playerQuery.eq("slug", idOrSlug);

  const { data: playerRow } = await playerQuery.maybeSingle();

  if (!playerRow) {
    return {
      player: null,
      teamName: null,
      teamSlug: null,
      seasonStats: null,
      qualifyingMinutes: QUALIFYING_MINUTES,
      metrics: [],
      matchHistory: [],
      snapshotRevision: "empty",
    };
  }

  const playerId = Number(playerRow.sportmonks_id);
  const player: PlayerProfilePlayer = {
    sportmonksId: playerId,
    fullname: String(playerRow.fullname ?? `Spelare ${playerId}`),
    slug: (playerRow.slug as string | null) ?? null,
    image: (playerRow.image as string | null) ?? null,
    position: (playerRow.position as string | null) ?? null,
    birthdate: (playerRow.birthdate as string | null) ?? null,
    height: (() => {
      const h = nNull(playerRow.height);
      return h == null ? null : Math.round(h);
    })(),
    weight: (() => {
      const w = nNull(playerRow.weight);
      return w == null ? null : Math.round(w);
    })(),
  };

  const [{ data: seasonRow }, { data: poolRows }, { data: historyRows }, teamMap] =
    await Promise.all([
      db
        .from("player_season_stats")
        .select(
          "season_id,player_id,team_id,appearances,minutes,goals,assists,shots,shots_on_target,key_passes,passes,pass_accuracy,tackles,interceptions,rating,yellow_cards,red_cards,clearances,dribbles,fouls,clean_sheets,xg,xa,xg_per_90,xa_per_90"
        )
        .eq("player_id", playerId)
        .eq("season_id", seasonId)
        .limit(1)
        .maybeSingle(),
      db
        .from("player_season_stats")
        .select(
          "minutes,goals,assists,shots,key_passes,passes,tackles,rating,xg"
        )
        .eq("season_id", seasonId)
        .gte("minutes", QUALIFYING_MINUTES),
      db
        .from("player_match_stats")
        .select(
          "fixture_id,sportsmonks_player_id,minutes_played,goals,assists,yellow_cards,red_cards,rating,xg,xa"
        )
        .eq("sportsmonks_player_id", playerId)
        .order("fixture_id", { ascending: false })
        .limit(10),
      getTeamNameMap(db),
    ]);

  let seasonStats: PlayerProfileSeasonStats | null = null;
  let teamName: string | null = null;
  let teamSlug: string | null = null;
  if (seasonRow) {
    const teamId = n(seasonRow.team_id);
    seasonStats = {
      seasonId: n(seasonRow.season_id),
      playerId: n(seasonRow.player_id),
      teamId,
      appearances: n(seasonRow.appearances),
      minutes: n(seasonRow.minutes),
      goals: n(seasonRow.goals),
      assists: n(seasonRow.assists),
      shots: n(seasonRow.shots),
      shotsOnTarget: n(seasonRow.shots_on_target),
      keyPasses: n(seasonRow.key_passes),
      passes: n(seasonRow.passes),
      passAccuracy: nNull(seasonRow.pass_accuracy),
      tackles: n(seasonRow.tackles),
      interceptions: n(seasonRow.interceptions),
      rating: nNull(seasonRow.rating),
      yellowCards: n(seasonRow.yellow_cards),
      redCards: n(seasonRow.red_cards),
      clearances: nNull(seasonRow.clearances),
      dribbles: nNull(seasonRow.dribbles),
      fouls: nNull(seasonRow.fouls),
      cleanSheets: nNull(seasonRow.clean_sheets),
      xg: nNull(seasonRow.xg),
      xa: nNull(seasonRow.xa),
      xgPer90: nNull(seasonRow.xg_per_90),
      xaPer90: nNull(seasonRow.xa_per_90),
    };
    teamName = teamMap.get(teamId)?.name ?? null;
    teamSlug = teamMap.get(teamId)?.slug ?? null;
  }

  const metrics =
    seasonStats != null
      ? computeMetrics(seasonStats, (poolRows ?? []) as PoolRow[])
      : [];

  const history = (historyRows ?? []) as Record<string, unknown>[];
  const fixtureIds = history.map((h) => n(h.fixture_id)).filter(Boolean);
  const fixtureMap = new Map<
    number,
    {
      home_team_name: string | null;
      away_team_name: string | null;
      home_score: number | null;
      away_score: number | null;
      kickoff_at: string | null;
      status: string | null;
    }
  >();

  if (fixtureIds.length > 0) {
    const { data: fixtures } = await db
      .from("fixtures")
      .select(
        "sportmonks_id,home_team_name,away_team_name,home_score,away_score,kickoff_at,status"
      )
      .eq("sport", SPORT)
      .in("sportmonks_id", fixtureIds);
    for (const f of fixtures ?? []) {
      fixtureMap.set(Number(f.sportmonks_id), {
        home_team_name: (f.home_team_name as string | null) ?? null,
        away_team_name: (f.away_team_name as string | null) ?? null,
        home_score: nNull(f.home_score),
        away_score: nNull(f.away_score),
        kickoff_at: (f.kickoff_at as string | null) ?? null,
        status: (f.status as string | null) ?? null,
      });
    }
  }

  const matchHistory: PlayerProfileMatch[] = history.map((h) => {
    const fid = n(h.fixture_id);
    const fx = fixtureMap.get(fid);
    return {
      fixtureId: fid,
      sportsmonksPlayerId: n(h.sportsmonks_player_id),
      minutesPlayed: n(h.minutes_played),
      goals: n(h.goals),
      assists: n(h.assists),
      yellowCards: n(h.yellow_cards),
      redCards: n(h.red_cards),
      rating: nNull(h.rating),
      xg: nNull(h.xg),
      xa: nNull(h.xa),
      homeTeamName: fx?.home_team_name ?? null,
      awayTeamName: fx?.away_team_name ?? null,
      homeScore: fx?.home_score ?? null,
      awayScore: fx?.away_score ?? null,
      kickoffAt: fx?.kickoff_at ?? null,
      status: fx?.status ?? null,
    };
  });

  const snapshotRevision = createHash("sha1")
    .update(
      JSON.stringify({
        playerId,
        season: seasonStats?.minutes,
        metrics: metrics.map((m) => [m.key, m.percentile]),
        history: matchHistory.map((m) => m.fixtureId),
      })
    )
    .digest("hex")
    .slice(0, 16);

  return {
    player,
    teamName,
    teamSlug,
    seasonStats,
    qualifyingMinutes: QUALIFYING_MINUTES,
    metrics,
    matchHistory,
    snapshotRevision,
  };
}
