/**
 * Statistik-datalager — läser Supabase-tabellerna som athopia-os fyller:
 *   teams, players, fixtures, team_season_stats, player_season_stats.
 *
 * Flöde: Sportmonks → athopia-os sync-jobb → Supabase → athopia-web.
 * athopia-web läser ENBART från Supabase — inga direkta Sportmonks-anrop.
 *
 * Tabellen härleds ur fixtures (status='FT') eftersom team_season_stats
 * saknar insläppta mål/poäng/position. Säsonger: 2026=26806, 2025=24943.
 */
import { unstable_cache } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { getTeamSlugMap } from "@/lib/db/fixtures";
import { getTeamNameMap } from "@/lib/team-names";
import { SPORT } from "@/lib/vertical";

/**
 * `player_season_stats` saknar sportkolumn och SEASON_IDS är fotbollens säsonger. Utan den här
 * spärren svarade hockeyns /api/stats/leaderboard med Allsvenskans skytteliga.
 * ponytail: hockeyns poängliga kräver egen säsongsuppslagning (seasonIdForTeam) — bygg då.
 */
const HAS_PLAYER_LEADERS = SPORT === "football";

export const SEASON_IDS: Record<string, string> = {
  "2026": process.env.SPORTSMONKS_SEASON_ID_2026 ?? "26806",
  "2025": process.env.SPORTSMONKS_SEASON_ID_2025 ?? "24943",
};

// Cache-fönster: syncen (Hetzner) kör var 30:e min → 5 min cache är färskt nog
// och delar den tunga fixture-aggregationen mellan ALLA besökare istället för
// att köra en ny Supabase-query per sidladdning. Lag ändras sällan → 1h.
const STATS_REVALIDATE = 300;
const TEAMS_REVALIDATE = 3600;

export interface StandingRow {
  position: number;
  /** `slug` är entities.slug — aldrig slugify() av namnet. Driver markeringen
   *  av användarens lag, som kräver exakt matchning. */
  team: { id: number; name: string; image_path: string | null; slug: string | null };
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_diff: number;
  points: number;
  form: string[]; // äldst → nyast, max 5
}

export interface ScorerRow {
  rank: number;
  player_id: number;
  team_id: number;
  player_name: string;
  team_name: string;
  team_slug: string | null;
  slug: string | null;
  image: string | null;
  position: string | null;
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  penalties: number;
  shots: number;
  shots_on_target: number;
  key_passes: number;
  passes: number;
  pass_accuracy: number | null;
  tackles: number;
  interceptions: number;
  rating: number | null;
  yellow_cards: number;
  red_cards: number;
  xg?: number;
  xa?: number;
}

interface FixtureLite {
  home_team_id: number | string;
  away_team_id: number | string;
  home_score: number | null;
  away_score: number | null;
  kickoff_at: string | null;
}

type TeamLite = { id: number; name: string | null; logo_path: string | null; slug: string | null };
type TeamSeasonLite = {
  team_id: number | string;
  played: number | null;
  wins: number | null;
  draws: number | null;
  losses: number | null;
  points: number | null;
  goals_for: number | null;
  goals_against: number | null;
  goal_diff?: number | null;
  form?: string | string[] | null;
};
type PlayerLite = {
  id: number;
  fullname: string;
  slug: string | null;
  image: string | null;
  position: string | null;
};
export type LeaderMetric =
  | "goals"
  | "assists"
  | "xg"
  | "rating"
  | "shots"
  | "key_passes"
  | "passes"
  | "tackles"
  | "yellow_cards";

export const LEADER_METRICS: readonly LeaderMetric[] = [
  "goals",
  "assists",
  "xg",
  "rating",
  "shots",
  "key_passes",
  "passes",
  "tackles",
  "yellow_cards",
] as const;

// Cachead teams-lista (JSON-serialiserbar — Map byggs utanför cachen).
// Slås upp via getTeamNameMap: entities (kanonisk) + teams (logga), inte bara
// `teams` ensam — den fylls av ett sync-jobb som kan ligga efter för enskilda
// lag och gav tidigare rå sportmonks_id ("Lag 620") i UI:t när raden saknades.
const cachedTeams = unstable_cache(
  async (): Promise<TeamLite[]> => {
    if (!isSupabaseConfigured()) return [];
    try {
      const db = createServerClient();
      const nameMap = await getTeamNameMap(db);
      return Array.from(nameMap.entries()).map(([id, t]) => ({ id, name: t.name || null, logo_path: t.logo, slug: t.slug }));
    } catch (e) {
      Sentry.captureException(e);
      return [];
    }
  },
  // -v2: posten fick fältet `slug`. Vercels datacache överlever deployer, så en
  // oförändrad nyckel hade serverat det gamla formatet utan slug i upp till en
  // timme — raderna renderades då utan slug och markeringen slutade fungera.
  ["statistik:teams-v2"],
  { revalidate: TEAMS_REVALIDATE, tags: ["statistik"] }
);

async function getTeamMap() {
  const teams = await cachedTeams();
  return new Map(
    teams.map((t) => [t.id, { name: t.name || `Lag ${t.id}`, image_path: t.logo_path, slug: t.slug }])
  );
}

// Cachead fixture-hämtning per säsong — delas mellan alla besökare.
const cachedSeasonFixtures = unstable_cache(
  async (seasonId: string): Promise<FixtureLite[]> => {
    if (!isSupabaseConfigured()) return [];
    try {
      const db = createServerClient();
      const { data } = await db
        .from("fixtures")
        .select("home_team_id,away_team_id,home_score,away_score,kickoff_at")
        .eq("season_id", Number(seasonId))
        .eq("status", "FT")
        .not("home_score", "is", null) // FT utan resultat (sync-glapp) skulle korrupta tabellen
        .order("kickoff_at", { ascending: true });
      return (data ?? []) as FixtureLite[];
    } catch (e) {
      Sentry.captureException(e);
      return [];
    }
  },
  ["statistik:fixtures"],
  { revalidate: STATS_REVALIDATE, tags: ["statistik"] }
);

const cachedSeasonTeamStats = unstable_cache(
  async (seasonId: string): Promise<TeamSeasonLite[]> => {
    if (!isSupabaseConfigured()) return [];
    try {
      const db = createServerClient();
      const { data } = await db
        .from("team_season_stats")
        .select("team_id,played,wins,draws,losses,points,goals_for,goals_against,goal_diff,form")
        .eq("season_id", Number(seasonId));
      return (data ?? []) as TeamSeasonLite[];
    } catch (e) {
      Sentry.captureException(e);
      return [];
    }
  },
  ["statistik:team-season-stats"],
  { revalidate: STATS_REVALIDATE, tags: ["statistik"] }
);

function normalizeForm(form: TeamSeasonLite["form"]): string[] {
  if (Array.isArray(form)) return form.map(String).filter(Boolean).slice(-5);
  if (typeof form === "string") return form.split("").filter(Boolean).slice(-5);
  return [];
}

/** Ligatabell härledd ur spelade matcher i Supabase. Tom array = ingen data. */
export async function getStandingsFromDb(seasonId: string): Promise<StandingRow[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const [teamStats, played, teamMap] = await Promise.all([
      cachedSeasonTeamStats(seasonId),
      cachedSeasonFixtures(seasonId),
      getTeamMap(),
    ]);

    if (teamStats.length > 0) {
      const rows = teamStats
        .map((r) => {
          const id = Number(r.team_id);
          if (!id) return null;
          const t = teamMap.get(id);
          const goalsFor = Number(r.goals_for ?? 0);
          const goalsAgainst = Number(r.goals_against ?? 0);
          return {
            position: 0,
            team: { id, name: t?.name ?? `Lag ${id}`, image_path: t?.image_path ?? null, slug: t?.slug ?? null },
            played: Number(r.played ?? 0),
            wins: Number(r.wins ?? 0),
            draws: Number(r.draws ?? 0),
            losses: Number(r.losses ?? 0),
            goals_for: goalsFor,
            goals_against: goalsAgainst,
            goal_diff: r.goal_diff == null ? goalsFor - goalsAgainst : Number(r.goal_diff),
            points: Number(r.points ?? 0),
            form: normalizeForm(r.form),
          } satisfies StandingRow;
        })
        .filter((row): row is StandingRow => Boolean(row));

      rows.sort(
        (a, b) =>
          b.points - a.points ||
          b.goal_diff - a.goal_diff ||
          b.goals_for - a.goals_for ||
          a.team.name.localeCompare(b.team.name, "sv")
      );
      rows.forEach((r, i) => { r.position = i + 1; });
      return rows;
    }

    if (played.length === 0) return [];

    const acc = new Map<number, StandingRow>();
    const ensure = (id: number): StandingRow => {
      let row = acc.get(id);
      if (!row) {
        const t = teamMap.get(id);
        row = {
          position: 0,
          team: { id, name: t?.name ?? `Lag ${id}`, image_path: t?.image_path ?? null, slug: t?.slug ?? null },
          played: 0, wins: 0, draws: 0, losses: 0,
          goals_for: 0, goals_against: 0, goal_diff: 0, points: 0,
          form: [],
        };
        acc.set(id, row);
      }
      return row;
    };

    for (const f of played) {
      const hs = f.home_score ?? 0;
      const as = f.away_score ?? 0;
      // home_team_id är text, away_team_id är bigint i DB → normalisera
      const home = ensure(Number(f.home_team_id));
      const away = ensure(Number(f.away_team_id));
      home.played++; away.played++;
      home.goals_for += hs; home.goals_against += as;
      away.goals_for += as; away.goals_against += hs;
      if (hs > as) { home.wins++; away.losses++; home.form.push("W"); away.form.push("L"); }
      else if (hs < as) { away.wins++; home.losses++; away.form.push("W"); home.form.push("L"); }
      else { home.draws++; away.draws++; home.form.push("D"); away.form.push("D"); }
    }

    const rows = [...acc.values()].map((r) => ({
      ...r,
      goal_diff: r.goals_for - r.goals_against,
      points: r.wins * 3 + r.draws,
      form: r.form.slice(-5),
    }));
    rows.sort(
      (a, b) =>
        b.points - a.points ||
        b.goal_diff - a.goal_diff ||
        b.goals_for - a.goals_for ||
        a.team.name.localeCompare(b.team.name, "sv")
    );
    rows.forEach((r, i) => { r.position = i + 1; });
    return rows;
  } catch (e) {
    Sentry.captureException(e);
    return [];
  }
}

// Spelarnamn-map (players-PK = sportmonks_id, namnkolumn = fullname).
const cachedPlayers = unstable_cache(
  async (): Promise<Record<number, PlayerLite>> => {
    if (!isSupabaseConfigured()) return {};
    try {
      const db = createServerClient();
      const { data } = await db.from("players").select("sportmonks_id,fullname,slug,image,position");
      const map: Record<number, PlayerLite> = {};
      for (const p of (data ?? []) as Record<string, unknown>[]) {
        const id = Number(p.sportmonks_id);
        if (!id) continue;
        map[id] = {
          id,
          fullname: (p.fullname as string | null) ?? `Spelare ${id}`,
          slug: (p.slug as string | null) ?? null,
          image: (p.image as string | null) ?? null,
          position: (p.position as string | null) ?? null,
        };
      }
      return map;
    } catch (e) {
      Sentry.captureException(e);
      return {};
    }
  },
  ["statistik:players"],
  { revalidate: TEAMS_REVALIDATE, tags: ["statistik"] }
);

const cachedLeaderRows = unstable_cache(
  async (seasonId: string, orderCol: LeaderMetric): Promise<Record<string, unknown>[]> => {
    if (!isSupabaseConfigured() || !HAS_PLAYER_LEADERS) return [];
    try {
      const db = createServerClient();
      let query = db
        .from("player_season_stats")
        .select("player_id,team_id,appearances,minutes,goals,assists,xg,xa,shots,shots_on_target,key_passes,passes,pass_accuracy,tackles,interceptions,rating,yellow_cards,red_cards")
        .eq("season_id", Number(seasonId))
        .order(orderCol, { ascending: false, nullsFirst: false })
        .order("minutes", { ascending: false })
        .limit(30);
      if (orderCol !== "rating") query = query.gt(orderCol, 0);
      const { data } = await query;
      return (data ?? []) as Record<string, unknown>[];
    } catch (e) {
      Sentry.captureException(e);
      return [];
    }
  },
  ["statistik:leaders"],
  { revalidate: STATS_REVALIDATE, tags: ["statistik"] }
);

const cachedAllPlayerRows = unstable_cache(
  async (seasonId: string): Promise<Record<string, unknown>[]> => {
    if (!isSupabaseConfigured() || !HAS_PLAYER_LEADERS) return [];
    try {
      const db = createServerClient();
      const { data } = await db
        .from("player_season_stats")
        .select("player_id,team_id,appearances,minutes,goals,assists,xg,xa,shots,shots_on_target,key_passes,passes,pass_accuracy,tackles,interceptions,rating,yellow_cards,red_cards")
        .eq("season_id", Number(seasonId));
      return (data ?? []) as Record<string, unknown>[];
    } catch (e) {
      Sentry.captureException(e);
      return [];
    }
  },
  ["statistik:all-player-rows"],
  { revalidate: STATS_REVALIDATE, tags: ["statistik"] }
);

async function getLeaders(
  seasonId: string,
  orderCol: LeaderMetric
): Promise<ScorerRow[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const [data, teamMap, playerMap, teamSlugMap] = await Promise.all([
      cachedLeaderRows(seasonId, orderCol),
      getTeamMap(),
      cachedPlayers(),
      getTeamSlugMap(),
    ]);
    return (data as Record<string, unknown>[]).map((r, i) => {
      const pid = Number(r.player_id ?? 0);
      const player = playerMap[pid];
      return {
        rank: i + 1,
        player_id: pid,
        team_id: Number(r.team_id ?? 0),
        player_name: player?.fullname ?? `Spelare ${pid}`,
        team_name: teamMap.get(Number(r.team_id))?.name ?? "–",
        team_slug: teamSlugMap[Number(r.team_id)] ?? null,
        slug: player?.slug ?? null,
        image: player?.image ?? null,
        position: player?.position ?? null,
        appearances: Number(r.appearances ?? 0),
        minutes: Number(r.minutes ?? 0),
        goals: Number(r.goals ?? 0),
        assists: Number(r.assists ?? 0),
        xg: r.xg != null ? Number(r.xg) : undefined,
        xa: r.xa != null ? Number(r.xa) : undefined,
        penalties: 0, // dedikerad kolumn saknas i player_season_stats (finns ev. i raw_stats)
        shots: Number(r.shots ?? 0),
        shots_on_target: Number(r.shots_on_target ?? 0),
        key_passes: Number(r.key_passes ?? 0),
        passes: Number(r.passes ?? 0),
        pass_accuracy: r.pass_accuracy == null ? null : Number(r.pass_accuracy),
        tackles: Number(r.tackles ?? 0),
        interceptions: Number(r.interceptions ?? 0),
        rating: r.rating == null ? null : Number(r.rating),
        yellow_cards: Number(r.yellow_cards ?? 0),
        red_cards: Number(r.red_cards ?? 0),
      };
    });
  } catch (e) {
    Sentry.captureException(e);
    return [];
  }
}

export const getTopScorersFromDb = (seasonId: string) => getLeaders(seasonId, "goals");
export const getTopAssistsFromDb = (seasonId: string) => getLeaders(seasonId, "assists");
export const getTopXgFromDb = (seasonId: string) => getLeaders(seasonId, "xg");
export const getTopRatingsFromDb = (seasonId: string) => getLeaders(seasonId, "rating");
export const getTopShotsFromDb = (seasonId: string) => getLeaders(seasonId, "shots");
export const getTopKeyPassesFromDb = (seasonId: string) => getLeaders(seasonId, "key_passes");
export const getTopPassersFromDb = (seasonId: string) => getLeaders(seasonId, "passes");
export const getTopDefendersFromDb = (seasonId: string) => getLeaders(seasonId, "tackles");
export const getMostCardsFromDb = (seasonId: string) => getLeaders(seasonId, "yellow_cards");

/** iOS/web shared leaderboard — season year key (`2026` / `2025`) → Sportmonks season id. */
export function getLeaderboardForMetric(
  metric: LeaderMetric,
  seasonYear: string = "2026"
): Promise<ScorerRow[]> {
  const seasonId = SEASON_IDS[seasonYear] ?? SEASON_IDS["2026"]!;
  return getLeaders(seasonId, metric);
}

export async function getAllPlayerStatsFromDb(seasonId: string): Promise<ScorerRow[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const [data, teamMap, playerMap, teamSlugMap] = await Promise.all([
      cachedAllPlayerRows(seasonId),
      getTeamMap(),
      cachedPlayers(),
      getTeamSlugMap(),
    ]);
    return data.map((r, i) => {
      const pid = Number(r.player_id ?? 0);
      const player = playerMap[pid];
      return {
        rank: i + 1,
        player_id: pid,
        team_id: Number(r.team_id ?? 0),
        player_name: player?.fullname ?? `Spelare ${pid}`,
        team_name: teamMap.get(Number(r.team_id))?.name ?? "–",
        team_slug: teamSlugMap[Number(r.team_id)] ?? null,
        slug: player?.slug ?? null,
        image: player?.image ?? null,
        position: player?.position ?? null,
        appearances: Number(r.appearances ?? 0),
        minutes: Number(r.minutes ?? 0),
        goals: Number(r.goals ?? 0),
        assists: Number(r.assists ?? 0),
        xg: r.xg != null ? Number(r.xg) : undefined,
        xa: r.xa != null ? Number(r.xa) : undefined,
        penalties: 0,
        shots: Number(r.shots ?? 0),
        shots_on_target: Number(r.shots_on_target ?? 0),
        key_passes: Number(r.key_passes ?? 0),
        passes: Number(r.passes ?? 0),
        pass_accuracy: r.pass_accuracy == null ? null : Number(r.pass_accuracy),
        tackles: Number(r.tackles ?? 0),
        interceptions: Number(r.interceptions ?? 0),
        rating: r.rating == null ? null : Number(r.rating),
        yellow_cards: Number(r.yellow_cards ?? 0),
        red_cards: Number(r.red_cards ?? 0),
      };
    });
  } catch (e) {
    Sentry.captureException(e);
    return [];
  }
}
