import { SPORT } from "@/lib/vertical";
/**
 * lib/team-hub/queries.ts — Team Hub aggregeringslager
 * ─────────────────────────────────────────────────────────────────────────────
 * All statistik hämtas från Supabase (synkad av athopia-os från Sportmonks):
 *   team_season_stats   (team_id = sportmonks_id, season_id)
 *   player_season_stats (team_id, season_id, players-join)
 *   fixtures            (home_team_id/away_team_id = sportmonks_id)
 * Inga hårdkodade värden — allt dynamiskt, normaliserat mot ligan.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { unstable_cache } from "next/cache";
import { getTeamNews, getTeamThreads } from "@/lib/dashboard/queries";
import type { DashArticle, DashThread } from "@/lib/dashboard/types";
import type { PodcastEpisodeSignal } from "@/lib/types";
import { contentCutoffIso } from "@/lib/content-window";

export const SEASON_2026 = 26806;

/**
 * Lagets säsong = den senaste säsong laget har en tabellrad i. Fungerar för SHL,
 * HockeyAllsvenskan och upp-/nedflyttade lag utan ligalogik. Fotbollen faller tillbaka
 * på SEASON_2026 som förut.
 */
export async function seasonIdForTeam(teamSmId: number): Promise<number> {
  if (!isSupabaseConfigured()) return SEASON_2026;
  try {
    const db = createServerClient();
    const { data: rows } = await db.from("team_season_stats").select("season_id").eq("team_id", teamSmId);
    const ids = [...new Set((rows ?? []).map((r) => Number(r.season_id)).filter(Boolean))];
    if (ids.length === 0) return SEASON_2026;
    const { data: seasons } = await db
      .from("seasons")
      .select("sportmonks_id")
      .eq("sport", SPORT)
      .in("sportmonks_id", ids)
      .order("start_date", { ascending: false, nullsFirst: false })
      .limit(1);
    return Number(seasons?.[0]?.sportmonks_id ?? ids[0]);
  } catch {
    return SEASON_2026;
  }
}

export interface TeamSeasonRow {
  team_id: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_diff: number;
  points: number;
  position: number | null;
  /** `team_season_stats` har ingen possession-kolumn — därför optional, inte
      `number | null`. Typen låg tidigare och påstod att fältet alltid fanns. */
  possession?: number | null;
  xg_for: number | null;
  xg_against: number | null;
  [k: string]: unknown;
}

function shapeLeagueSeasonStats(rows: Record<string, unknown>[]): TeamSeasonRow[] {
  const shaped = rows.map((row) => ({
    ...row,
    goal_diff: Number(row.goal_diff ?? Number(row.goals_for ?? 0) - Number(row.goals_against ?? 0)),
  })) as TeamSeasonRow[];

  const ranked = [...shaped].sort(
    (a, b) =>
      Number(b.points ?? 0) - Number(a.points ?? 0) ||
      Number(b.goal_diff ?? 0) - Number(a.goal_diff ?? 0) ||
      Number(b.goals_for ?? 0) - Number(a.goals_for ?? 0)
  );
  const positionByTeam = new Map(ranked.map((team, index) => [team.team_id, index + 1]));

  return shaped.map((row) => ({
    ...row,
    position: row.position ?? positionByTeam.get(row.team_id) ?? null,
  }));
}

export interface LeaderRow {
  player_id: number;
  fullname: string;
  slug: string | null;
  image: string | null;
  position: string | null;
  goals: number;
  assists: number;
  appearances: number;
  minutes: number;
  shots: number;
  shots_on_target: number;
  rating: number | null;
  yellow_cards: number;
  red_cards: number;
}

export interface FixtureRow {
  sportmonks_id: number;
  home_team_id: number;
  away_team_id: number;
  home_team_name: string;
  away_team_name: string;
  home_score: number | null;
  away_score: number | null;
  kickoff_at: string | null;
  status: string;
}

/** Hela ligans säsongsstatistik — används för normalisering + tabellposition. */
export async function getLeagueSeasonStats(seasonId: number = SEASON_2026): Promise<TeamSeasonRow[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const db = createServerClient();
    const { data } = await db
      .from("team_season_stats")
      .select("*")
      .eq("season_id", seasonId);
    return shapeLeagueSeasonStats((data ?? []) as Record<string, unknown>[]);
  } catch {
    return [];
  }
}

export async function getTeamLeaders(teamSmId: number, seasonId: number = SEASON_2026): Promise<LeaderRow[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const db = createServerClient();
    const { data: stats } = await db
      .from("player_season_stats")
      .select("player_id,goals,assists,appearances,minutes,shots,shots_on_target,rating,yellow_cards,red_cards")
      .eq("team_id", teamSmId)
      .eq("season_id", seasonId);

    const rows = (stats ?? []) as Record<string, unknown>[];
    const playerIds = rows.map((r) => Number(r.player_id)).filter(Boolean);
    const { data: players } = playerIds.length
      ? await db.from("players").select("sportmonks_id,fullname,position,image,slug").in("sportmonks_id", playerIds)
      : { data: [] };
    const playerById = new Map(
      ((players ?? []) as Record<string, unknown>[]).map((p) => [Number(p.sportmonks_id), p])
    );

    return rows.map((r: Record<string, unknown>) => {
      const playerId = Number(r.player_id ?? 0);
      const p = playerById.get(playerId);
      return {
        player_id: playerId,
        fullname: (p?.fullname as string) ?? `Spelare ${playerId}`,
        slug: (p?.slug as string | null) ?? null,
        image: (p?.image as string | null) ?? null,
        position: (p?.position as string | null) ?? null,
        goals: Number(r.goals ?? 0),
        assists: Number(r.assists ?? 0),
        appearances: Number(r.appearances ?? 0),
        minutes: Number(r.minutes ?? 0),
        shots: Number(r.shots ?? 0),
        shots_on_target: Number(r.shots_on_target ?? 0),
        rating: r.rating == null ? null : Number(r.rating),
        yellow_cards: Number(r.yellow_cards ?? 0),
        red_cards: Number(r.red_cards ?? 0),
      };
    });
  } catch {
    return [];
  }
}

export async function getTeamFixtures(teamSmId: number, seasonId: number = SEASON_2026): Promise<{ recent: FixtureRow[]; upcoming: FixtureRow[] }> {
  if (!isSupabaseConfigured()) return { recent: [], upcoming: [] };
  try {
    const db = createServerClient();
    const cols = "sportmonks_id,home_team_id,away_team_id,home_team_name,away_team_name,home_score,away_score,kickoff_at,status";
    const [{ data: recent }, { data: upcoming }] = await Promise.all([
      db.from("fixtures").select(cols)
        .eq("sport", SPORT).eq("season_id", seasonId).eq("status", "FT")
        .or(`home_team_id.eq.${teamSmId},away_team_id.eq.${teamSmId}`)
        .order("kickoff_at", { ascending: false }).limit(5),
      db.from("fixtures").select(cols)
        .eq("sport", SPORT).eq("season_id", seasonId).in("status", ["NS", "LIVE"])
        .or(`home_team_id.eq.${teamSmId},away_team_id.eq.${teamSmId}`)
        .order("kickoff_at", { ascending: true }).limit(3),
    ]);
    return { recent: (recent ?? []) as FixtureRow[], upcoming: (upcoming ?? []) as FixtureRow[] };
  } catch {
    return { recent: [], upcoming: [] };
  }
}

/** W/D/L-form från senaste matcherna (äldst → nyast). */
export function deriveForm(recent: FixtureRow[], teamSmId: number): ("W" | "D" | "L")[] {
  return [...recent]
    .reverse()
    .map((f) => {
      const isHome = f.home_team_id === teamSmId;
      const gf = (isHome ? f.home_score : f.away_score) ?? 0;
      const ga = (isHome ? f.away_score : f.home_score) ?? 0;
      return gf > ga ? "W" : gf === ga ? "D" : "L";
    });
}

// ── Aggregerad hub-payload (för interaktiv dashboard + API) ───────────────────

export interface TeamPulse {
  headline: string;
  dek: string | null;
  body: string;
  match_context_label: string | null;
  pulse_date: string;
}

export interface DailyEpisodeChapter {
  label: string;
  start_sec: number;
}

/** Publicerat Nano Fotboll Daily-avsnitt — ingen direkt MP3-URL (PRO via /api/daily/audio). */
export interface DailyEpisode {
  slug: string;
  title: string;
  has_audio: boolean;
  duration_sec: number | null;
  episode_date: string;
  episode_type: "league_daily" | "club_daily";
  chapter_markers: DailyEpisodeChapter[];
}

function shapeDailyEpisode(row: Record<string, unknown> | null): DailyEpisode | null {
  if (!row) return null;
  const hasAudio = Boolean(row.audio_storage_path || row.audio_url);
  if (!hasAudio) return null;
  const rawChapters = Array.isArray(row.chapter_markers) ? row.chapter_markers : [];
  const chapter_markers = rawChapters
    .map((c) => {
      const ch = c as Record<string, unknown>;
      const start = Number(ch.start_sec ?? ch.startSec ?? 0);
      const label = String(ch.label ?? "").trim();
      if (!label || Number.isNaN(start)) return null;
      return { label, start_sec: start };
    })
    .filter((c): c is DailyEpisodeChapter => c !== null);

  return {
    slug: String(row.slug),
    title: String(row.title),
    has_audio: true,
    duration_sec: row.duration_sec == null ? null : Number(row.duration_sec),
    episode_date: String(row.episode_date),
    episode_type: row.episode_type === "club_daily" ? "club_daily" : "league_daily",
    chapter_markers,
  };
}

async function fetchLatestPublishedEpisode(
  db: ReturnType<typeof createServerClient>,
  episodeType: DailyEpisode["episode_type"],
  entityId?: string
): Promise<DailyEpisode | null> {
  let q = db
    .from("generated_episodes" as never)
    .select("slug,title,audio_storage_path,audio_url,duration_sec,episode_date,episode_type,chapter_markers")
    .eq("sport", SPORT)
    .eq("status", "published")
    .eq("episode_type", episodeType)
    .or("audio_storage_path.not.is.null,audio_url.not.is.null")
    .order("episode_date", { ascending: false })
    .limit(1);

  if (entityId) {
    q = q.eq("entity_id", entityId);
  }

  const { data } = await q.maybeSingle();
  return shapeDailyEpisode((data as Record<string, unknown> | null) ?? null);
}

/** Senaste publicerade Daily — lagspecifik först, annars ligans dagliga brief. */
export async function getDailyEpisodeForTeam(teamEntityId?: string | null): Promise<DailyEpisode | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const db = createServerClient();
    if (teamEntityId) {
      const club = await fetchLatestPublishedEpisode(db, "club_daily", teamEntityId);
      if (club) return club;
    }
    return fetchLatestPublishedEpisode(db, "league_daily");
  } catch {
    return null;
  }
}

/** Senaste ligans Nano Fotboll Daily (delbar /daily utan lagparameter). */
export async function getLeagueDailyEpisode(): Promise<DailyEpisode | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const db = createServerClient();
    return fetchLatestPublishedEpisode(db, "league_daily");
  } catch {
    return null;
  }
}

/** Delbar daily — valfritt ?lag=slug för klubbavsnitt, annars league daily. */
export async function getDailyEpisodeForShare(teamSlug?: string | null): Promise<DailyEpisode | null> {
  const slug = teamSlug?.trim();
  if (!slug) return getLeagueDailyEpisode();
  if (!isSupabaseConfigured()) return null;
  try {
    const db = createServerClient();
    const { data } = await db
      .from("entities")
      .select("id")
      .eq("type", "team")
      .eq("sport", SPORT)
      .eq("slug", slug)
      .maybeSingle();
    const entityId = data?.id ? String(data.id) : null;
    if (!entityId) return getLeagueDailyEpisode();
    return getDailyEpisodeForTeam(entityId);
  } catch {
    return getLeagueDailyEpisode();
  }
}

/** Cached variant for /daily and metadata (60s). */
export async function getDailyEpisodeForShareCached(teamSlug?: string | null): Promise<DailyEpisode | null> {
  const key = teamSlug?.trim() || "league";
  return unstable_cache(
    () => getDailyEpisodeForShare(teamSlug),
    ["daily-episode-share", key],
    { revalidate: 60 }
  )();
}

/** Dagens godkända AI-brief ("vad du behöver veta idag") för ett lag. */
export async function getTeamPulse(teamEntityId: string): Promise<TeamPulse | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const db = createServerClient();
    const { data } = await db
      .from("published_team_daily_pulses")
      .select("headline,dek,body,match_context_label,pulse_date")
      .eq("team_entity_id", teamEntityId)
      .eq("sport", SPORT)
      .order("pulse_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as TeamPulse | null) ?? null;
  } catch {
    return null;
  }
}

export interface TeamHubPayload {
  team: { id: string; name: string; slug: string; logo_url: string | null; sportsmonks_id: number | null };
  position: number | null;
  pulse: TeamPulse | null;
  dailyEpisode: DailyEpisode | null;
  stats: TeamSeasonRow | null;
  form: ("W" | "D" | "L")[];
  radar: { metric: string; value: number; raw: number }[];
  topScorers: LeaderRow[];
  topAssists: LeaderRow[];
  squad: LeaderRow[];
  recent: FixtureRow[];
  upcoming: FixtureRow[];
  news: DashArticle[];
  threads: DashThread[];
}

// ── Unified team feed (Hypertexting-inspirerat kronologiskt scroll) ───────────
// Slår ihop redan hämtad hub-data (nyheter, forumtrådar, spelade matcher,
// AI-brief, podcastsignaler) till ett enda reverse-kronologiskt flöde.
// Hämtar ingen ny data — bara merge+sort av det getTeamHub() redan levererar.

export type TeamFeedItem =
  | { ts: string; kind: "pulse"; pulse: TeamPulse }
  | { ts: string; kind: "news"; article: DashArticle }
  | { ts: string; kind: "thread"; thread: DashThread }
  | { ts: string; kind: "fixture"; fixture: FixtureRow }
  | { ts: string; kind: "podcast"; podcast: PodcastEpisodeSignal };

export function buildTeamFeed(input: {
  pulse: TeamPulse | null;
  news: DashArticle[];
  threads: DashThread[];
  recent: FixtureRow[];
  podcastSignals: PodcastEpisodeSignal[];
}): TeamFeedItem[] {
  const items: TeamFeedItem[] = [];

  if (input.pulse) {
    items.push({ ts: input.pulse.pulse_date, kind: "pulse", pulse: input.pulse });
  }
  for (const article of input.news) {
    if (article.published_at) items.push({ ts: article.published_at, kind: "news", article });
  }
  for (const thread of input.threads) {
    items.push({ ts: thread.created_at, kind: "thread", thread });
  }
  for (const fixture of input.recent) {
    // Bara avslutade matcher — kommande matcher visas redan i MatchdayBanner.
    if (fixture.status === "FT" && fixture.kickoff_at) {
      items.push({ ts: fixture.kickoff_at, kind: "fixture", fixture });
    }
  }
  for (const podcast of input.podcastSignals) {
    if (podcast.publishedAt) items.push({ ts: podcast.publishedAt, kind: "podcast", podcast });
  }

  return items.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
}

const RADAR_DEF: { key: keyof TeamSeasonRow; label: string; invert?: boolean }[] = [
  { key: "goals_for", label: "Anfall" },
  { key: "goals_against", label: "Försvar", invert: true },
  { key: "points", label: "Poäng" },
  { key: "possession", label: "Boll%" },
  { key: "goal_diff", label: "Målskillnad" },
  { key: "wins", label: "Vinster" },
];

/** Team-scoped news; optional news_tag filter from onboarding interests. */
export async function getTeamNewsPersonalized(
  teamSlug: string,
  newsTags: string[] | null
): Promise<DashArticle[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createServerClient();
    const { data: team } = await supabase
      .from("entities")
      .select("id")
      .eq("type", "team")
      .eq("sport", SPORT)
      .eq("slug", teamSlug)
      .maybeSingle();
    if (!team?.id) return [];

    let q = supabase
      .from("articles")
      .select("id, title, slug, summary, published_at, news_tag, rights_status, is_athopia_generated")
      .eq("sport", SPORT)
      .eq("status", "published")
      .contains("entity_ids", [String(team.id)])
      .gte("published_at", contentCutoffIso())
      .order("published_at", { ascending: false })
      .limit(8);

    if (newsTags?.length) {
      q = q.in("news_tag", newsTags);
    }

    const { data } = await q;
    type Row = { id: string; title: string; slug: string | null; summary: string | null; published_at: string; news_tag: string | null; rights_status: string | null; is_athopia_generated: boolean | null };
    // Rättighetsgrinden: tredjeparts teaser visas aldrig ordagrant (CLAUDE.md §5).
    return ((data ?? []) as Row[]).map(({ rights_status, is_athopia_generated, ...r }) => {
      const rights = rights_status ?? (is_athopia_generated ? "owned" : "link_only");
      return { ...r, summary: rights === "owned" || rights === "licensed" ? r.summary : null, image_url: null, rights_status: rights };
    }) as DashArticle[];
  } catch {
    return [];
  }
}

/** Hämtar och aggregerar hela hub-payloaden för ett lag (slug). */
export async function getTeamHub(
  slug: string,
  options?: { newsTags?: string[] | null }
): Promise<TeamHubPayload | null> {
  // Ingen mock-/demodata på publika ytor (CLAUDE.md / LAUNCH).
  if (!isSupabaseConfigured()) return null;
  const db = createServerClient();
  const { data } = await db.from("entities").select("*").eq("type", "team").eq("sport", SPORT).eq("slug", slug).maybeSingle();
  if (!data) return null;
  const meta = (data.metadata ?? {}) as Record<string, unknown>;
  // Kolumnen först: hockeyns lag (Sportradar) har inget metadata.sportsmonks_id, så hockeyns
  // lagsidor visade aldrig tabellplats, statistik eller matcher.
  const smId =
    (data.sportmonks_id != null ? Number(data.sportmonks_id) : null) ??
    ((meta.sportsmonks_id as number | null) ?? null);
  const team = {
    id: String(data.id),
    name: String(data.name),
    slug: String(data.slug),
    logo_url: (meta.logo_url as string | null) ?? null,
    sportsmonks_id: smId,
  };

  const newsFetcher =
    options?.newsTags !== undefined
      ? getTeamNewsPersonalized(slug, options.newsTags)
      : getTeamNews(slug);

  const [news, threads, pulse, dailyEpisode] = await Promise.all([
    newsFetcher,
    getTeamThreads(team.id),
    getTeamPulse(team.id),
    getDailyEpisodeForTeam(team.id),
  ]);

  if (!smId) {
    return {
      team,
      position: null,
      pulse,
      dailyEpisode,
      stats: null,
      form: [],
      radar: [],
      topScorers: [],
      topAssists: [],
      squad: [],
      recent: [],
      upcoming: [],
      news,
      threads,
    };
  }

  const seasonId = await seasonIdForTeam(smId);
  const [league, leaders, fixtures] = await Promise.all([
    getLeagueSeasonStats(seasonId),
    getTeamLeaders(smId, seasonId),
    getTeamFixtures(smId, seasonId),
  ]);

  const stats = league.find((t) => t.team_id === smId) ?? null;
  const sorted = [...league].sort((a, b) => (b.points - a.points) || (b.goal_diff - a.goal_diff));
  const position = stats?.position ?? (stats ? sorted.findIndex((t) => t.team_id === smId) + 1 : null);
  const form = deriveForm(fixtures.recent, smId);
  const radar = stats ? normalizeAgainstLeague(league, stats, RADAR_DEF) : [];
  const topScorers = [...leaders].sort((a, b) => b.goals - a.goals).slice(0, 5);
  const topAssists = [...leaders].sort((a, b) => b.assists - a.assists).slice(0, 5);
  const squad = [...leaders].sort((a, b) => b.appearances - a.appearances);

  return {
    team,
    position,
    pulse,
    dailyEpisode,
    stats,
    form,
    radar,
    topScorers,
    topAssists,
    squad,
    recent: fixtures.recent,
    upcoming: fixtures.upcoming,
    news,
    threads,
  };
}

/**
 * z-score-normalisering → 0–100-skala, för radar-profilering mot ligan.
 *
 * En metrik vars kolumn ligan saknar helt tas bort ur radarn i stället för att
 * ritas. `?? 0` nedan gjorde annars varje osyncad metrik till en axel där alla
 * lag låg på exakt ligasnittet (0 mot ett snitt på 0 → z = 0 → 50) — en
 * uppdiktad stat. Saknad data döljer fältet, den fyller det inte med nollor.
 */
export function normalizeAgainstLeague(
  league: TeamSeasonRow[],
  team: TeamSeasonRow,
  metrics: { key: keyof TeamSeasonRow; label: string; invert?: boolean }[]
): { metric: string; value: number; raw: number }[] {
  const hasData = (key: keyof TeamSeasonRow) =>
    league.some((t) => t[key] != null && !Number.isNaN(Number(t[key])));

  return metrics.flatMap(({ key, label, invert }) => {
    if (!hasData(key) || team[key] == null) return [];
    const vals = league.map((t) => Number(t[key] ?? 0)).filter((v) => !Number.isNaN(v));
    const raw = Number(team[key] ?? 0);
    if (vals.length < 2) return { metric: label, value: 50, raw };
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length) || 1;
    let z = (raw - mean) / std;
    if (invert) z = -z;
    // klipp z till ±2.5 och skala till 0–100
    const clamped = Math.max(-2.5, Math.min(2.5, z));
    return { metric: label, value: Math.round(((clamped + 2.5) / 5) * 100), raw };
  });
}
