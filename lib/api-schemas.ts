import { z } from "zod";

/**
 * Enda källan för de API-svar iOS avkodar.
 *
 * Servern validerar sina egna svar mot dessa scheman (`jsonContract`), OpenAPI
 * genereras ur dem, och `lib/swift-decode.test.ts` jämför de handskrivna
 * Swift-modellerna mot dem. En serverändring som skulle bryta iOS-decoden
 * failar därför i CI i stället för hos användaren.
 *
 * Regler:
 * - `.nullable()` = fältet skickas men kan vara null → Swift-typen MÅSTE vara optional.
 * - `.optional()` = fältet kan saknas helt → Swift-typen MÅSTE vara optional.
 * - Nya fält är alltid additiva. Ta aldrig bort ett fält som iOS avkodar
 *   non-optional utan att skeppa iOS-ändringen först.
 */

export const ImportanceTierSchema = z.enum(["breaking", "major", "normal", "noise"]);

export const FeedItemSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  subtitle: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  time: z.string(),
  href: z.string(),
  newsTag: z.string().nullable().optional(),
  sourceCount: z.number().int().nullable().optional(),
  storyClusterId: z.string().nullable().optional(),
  importanceTier: ImportanceTierSchema.nullable().optional(),
  /** Forum posts linked via forum_posts.article_id — omit when 0. */
  discussionCount: z.number().int().optional(),
  /** Lagtaggar (högst tre). Utelämnas när inga är kända. */
  teams: z.array(z.object({ slug: z.string(), name: z.string() })).optional(),
});

export const FeedModuleTypeSchema = z.enum([
  "live_match",
  "upcoming_matches",
  "headline_stack",
  "short_post",
  "podcast",
  "discussion",
  "standings_snapshot",
  "audio_briefing",
]);

export const FeedModuleSchema = z.object({
  id: z.string(),
  type: FeedModuleTypeSchema,
  schemaVersion: z.literal(1),
  tracking: z.object({
    reason: z.string(),
    position: z.number().int(),
    /** Ranking v1 explainable score (optional for older clients). */
    score: z.number().optional(),
    /** Human-readable score factors, e.g. type:discussion=55. */
    factors: z.array(z.string()).optional(),
  }),
  /** Opaque per-type payload; clients switch on `type`. */
  payload: z.record(z.string(), z.unknown()),
});

export const FeedResponseSchema = z.object({
  items: z.array(FeedItemSchema),
  hasMore: z.boolean(),
  /** Legacy — grundfeeden är gratis och obegränsad. Får aldrig skapa klient-paywall. */
  gated: z.boolean(),
  remainingToday: z.number().int().nullable(),
  isPro: z.boolean().optional(),
  isElite: z.boolean().optional(),
  /** Server-directed Home modules (iOS/web). Optional for backward compatibility. */
  modules: z.array(FeedModuleSchema).optional(),
});

export const TeamRefSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  slug: z.string().nullable(),
  logoUrl: z.string().nullable(),
});

export const ScoreItemSchema = z.object({
  id: z.number().int(),
  startingAt: z.string(),
  status: z.string(),
  minute: z.number().int().nullable(),
  home: TeamRefSchema,
  away: TeamRefSchema,
  scoreHome: z.number().int().nullable(),
  scoreAway: z.number().int().nullable(),
});

export const ScoresResponseSchema = z.array(ScoreItemSchema);

export const NativeArticleDetailSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  sourceName: z.string(),
  sourceUrl: z.string().nullable(),
  publishedAt: z.string(),
  updatedAt: z.string().nullable(),
  imageUrl: z.string().nullable(),
  kind: z.enum(["athopia", "external"]),
  summary: z.string().nullable(),
  summaryPreview: z.string().nullable(),
  content: z.string().nullable(),
  hasProtectedContent: z.boolean(),
  discussionCount: z.number().int(),
});

export const ArticleAccessStateSchema = z.object({
  feature: z.string(),
  unlocked: z.boolean(),
  requiredPlan: z.enum(["free", "pro", "elite"]),
  upgradePath: z.string(),
});

export const ArticleDetailResponseSchema = z.object({
  article: NativeArticleDetailSchema,
  access: ArticleAccessStateSchema,
});

// ── Team hub (GET /api/team/{slug}/hub) ──────────────────────────────────────
//
// Routen är en superset: web (onboarding + gäst-preview) läser points/nextMatch/
// lastMatch/href, iOS avkodar stats/radar/leaders/squad/recent/upcoming.
// Wire-formatet är explicit camelCase — förlita dig aldrig på iOS
// `.convertFromSnakeCase` här: DB blandar `sportmonks_id` och `sportsmonks_id`.
// AI-ytor (pulse, dailyEpisode) ligger medvetet UTANFÖR denna route: de är
// PRO-gatede och får inte läcka via en publik preview.

export const TeamSeasonStatsSchema = z.object({
  teamId: z.number().int().nullable(),
  played: z.number().int(),
  wins: z.number().int(),
  draws: z.number().int(),
  losses: z.number().int(),
  goalsFor: z.number().int(),
  goalsAgainst: z.number().int(),
  goalDiff: z.number().int(),
  points: z.number().int(),
  position: z.number().int().nullable(),
  possession: z.number().nullable(),
  /** Endast verkligt syncade värden — aldrig placeholder-nollor. */
  xgFor: z.number().nullable(),
  xgAgainst: z.number().nullable(),
  xg: z.number().nullable().optional(),
  xga: z.number().nullable().optional(),
});

export const RadarPointSchema = z.object({
  metric: z.string(),
  value: z.number(),
  raw: z.number(),
});

export const LeaderRowSchema = z.object({
  playerId: z.number().int(),
  fullname: z.string(),
  slug: z.string().nullable(),
  image: z.string().nullable(),
  position: z.string().nullable(),
  goals: z.number().int(),
  assists: z.number().int(),
  appearances: z.number().int(),
});

export const FixtureRowSchema = z.object({
  sportsmonksId: z.number().int(),
  homeTeamId: z.number().int(),
  awayTeamId: z.number().int(),
  homeTeamName: z.string(),
  awayTeamName: z.string(),
  homeScore: z.number().int().nullable(),
  awayScore: z.number().int().nullable(),
  kickoffAt: z.string().nullable(),
  status: z.string(),
});

export const DashArticleSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  href: z.string(),
  publishedAt: z.string().nullable(),
  sourceName: z.string().nullable(),
});

export const DashThreadSchema = z.object({
  id: z.string(),
  title: z.string(),
  replyCount: z.number().int().nullable(),
  href: z.string(),
  createdAt: z.string().nullable(),
});

export const TeamInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  logoUrl: z.string().nullable(),
  sportsmonksId: z.number().int().nullable(),
});

export const TeamHubPayloadSchema = z.object({
  team: TeamInfoSchema,
  position: z.number().int().nullable(),
  stats: TeamSeasonStatsSchema.nullable(),
  form: z.array(z.string()),
  radar: z.array(RadarPointSchema),
  topScorers: z.array(LeaderRowSchema),
  topAssists: z.array(LeaderRowSchema),
  squad: z.array(LeaderRowSchema),
  recent: z.array(FixtureRowSchema),
  upcoming: z.array(FixtureRowSchema),
  news: z.array(DashArticleSchema),
  threads: z.array(DashThreadSchema),
  // Preview-fält som webbens onboarding och gäst-preview läser.
  points: z.number().int().nullable(),
  played: z.number().int().nullable(),
  nextMatch: z
    .object({
      id: z.number().int(),
      home: z.string(),
      away: z.string(),
      kickoffAt: z.string().nullable(),
      status: z.string(),
    })
    .nullable(),
  lastMatch: z
    .object({
      id: z.number().int(),
      home: z.string(),
      away: z.string(),
      homeScore: z.number().int().nullable(),
      awayScore: z.number().int().nullable(),
      kickoffAt: z.string().nullable(),
    })
    .nullable(),
  guest: z.boolean(),
});

// ── Matcher, tabell, statistik ───────────────────────────────────────────────

export const StandingRowSchema = z.object({
  id: z.string(),
  position: z.number().int(),
  teamId: z.number().int().nullable(),
  teamName: z.string(),
  teamSlug: z.string().nullable(),
  played: z.number().int(),
  won: z.number().int(),
  drawn: z.number().int(),
  lost: z.number().int(),
  goalsFor: z.number().int(),
  goalsAgainst: z.number().int(),
  points: z.number().int(),
  form: z.array(z.string()).nullable(),
  trend: z.number().int().nullable(),
});

export const StandingsResponseSchema = z.object({
  standings: z.array(StandingRowSchema),
  /**
   * Sista spelade match tabellen bygger på (ISO), och om den är för gammal för
   * att presenteras som aktuell. Konsumenten ska slippa gissa: tabellen räknas
   * om varje natt även när underlaget är veckor gammalt (Sportmonks-planen
   * täcker inte Allsvenskan). Valfria så iOS-klienter på äldre kontrakt inte
   * bryts.
   */
  coveredThrough: z.string().nullable().optional(),
  stale: z.boolean().optional(),
});

/**
 * GET /api/match/{fixtureId} — routen svarar med den råa fixtures-raden plus
 * stats, alltså snake_case. iOS avkodar via `.convertFromSnakeCase`.
 */
export const FixtureDetailSchema = z.object({
  home_team_id: z.number().int(),
  away_team_id: z.number().int(),
  home_team_name: z.string(),
  away_team_name: z.string(),
  home_score: z.number().int().nullable(),
  away_score: z.number().int().nullable(),
  kickoff_at: z.string().nullable(),
  status: z.string(),
  home_xg: z.number().nullable(),
  away_xg: z.number().nullable(),
  home_pressure: z.number().nullable(),
  away_pressure: z.number().nullable(),
  home_ppda: z.number().nullable(),
  away_ppda: z.number().nullable(),
  home_possession: z.number().nullable(),
  away_possession: z.number().nullable(),
  home_shots: z.number().int().nullable(),
  away_shots: z.number().int().nullable(),
  home_shots_on_target: z.number().int().nullable(),
  away_shots_on_target: z.number().int().nullable(),
});

/** GET /api/match/{fixtureId}/timeline — events + lineups (B-08). */
export const MatchEventSchema = z.object({
  eventId: z.number().int(),
  fixtureId: z.number().int(),
  sequence: z.number().int(),
  minute: z.number().int().nullable(),
  extraMinute: z.number().int().nullable(),
  teamId: z.number().int().nullable(),
  playerId: z.number().int().nullable(),
  relatedPlayerId: z.number().int().nullable(),
  playerName: z.string().nullable(),
  eventType: z.string(),
  result: z.string().nullable(),
  revision: z.number().int(),
  rescinded: z.boolean(),
  isCorrected: z.boolean(),
});

export const MatchLineupRowSchema = z.object({
  playerId: z.number().int(),
  teamId: z.number().int().nullable(),
  starter: z.boolean(),
  jersey: z.number().int().nullable(),
  position: z.string().nullable(),
  playerName: z.string().nullable(),
  image: z.string().nullable(),
  slug: z.string().nullable(),
});

export const MatchTimelineResponseSchema = z.object({
  fixtureId: z.number().int(),
  snapshotRevision: z.string(),
  events: z.array(MatchEventSchema),
  lineups: z.array(MatchLineupRowSchema),
});

/** GET /api/player/{idOrSlug} — player profile (ungated wrap). */
export const PlayerProfilePlayerSchema = z.object({
  sportmonksId: z.number().int(),
  fullname: z.string(),
  slug: z.string().nullable(),
  image: z.string().nullable(),
  position: z.string().nullable(),
  birthdate: z.string().nullable(),
  height: z.number().int().nullable(),
  weight: z.number().int().nullable(),
});

export const PlayerProfileSeasonStatsSchema = z.object({
  seasonId: z.number().int(),
  playerId: z.number().int(),
  teamId: z.number().int(),
  appearances: z.number().int(),
  minutes: z.number().int(),
  goals: z.number().int(),
  assists: z.number().int(),
  shots: z.number().int(),
  shotsOnTarget: z.number().int(),
  keyPasses: z.number().int(),
  passes: z.number().int(),
  passAccuracy: z.number().nullable(),
  tackles: z.number().int(),
  interceptions: z.number().int(),
  rating: z.number().nullable(),
  yellowCards: z.number().int(),
  redCards: z.number().int(),
  clearances: z.number().nullable(),
  dribbles: z.number().nullable(),
  fouls: z.number().nullable(),
  cleanSheets: z.number().nullable(),
  xg: z.number().nullable(),
  xa: z.number().nullable(),
  xgPer90: z.number().nullable(),
  xaPer90: z.number().nullable(),
});

export const PlayerProfileMetricSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.number(),
  average: z.number(),
  percentile: z.number(),
  decimals: z.number().int(),
});

export const PlayerProfileMatchSchema = z.object({
  fixtureId: z.number().int(),
  sportsmonksPlayerId: z.number().int(),
  minutesPlayed: z.number().int(),
  goals: z.number().int(),
  assists: z.number().int(),
  yellowCards: z.number().int(),
  redCards: z.number().int(),
  rating: z.number().nullable(),
  xg: z.number().nullable(),
  xa: z.number().nullable(),
  homeTeamName: z.string().nullable(),
  awayTeamName: z.string().nullable(),
  homeScore: z.number().int().nullable(),
  awayScore: z.number().int().nullable(),
  kickoffAt: z.string().nullable(),
  status: z.string().nullable(),
});

export const PlayerProfileResponseSchema = z.object({
  player: PlayerProfilePlayerSchema.nullable(),
  teamName: z.string().nullable(),
  seasonStats: PlayerProfileSeasonStatsSchema.nullable(),
  qualifyingMinutes: z.number().int(),
  metrics: z.array(PlayerProfileMetricSchema),
  matchHistory: z.array(PlayerProfileMatchSchema),
  snapshotRevision: z.string(),
});

export const ProjectionRowSchema = z.object({
  teamId: z.number().int(),
  teamName: z.string(),
  logoUrl: z.string().nullable(),
  points: z.number().int(),
  elo: z.number(),
  pChampion: z.number(),
  pTop3: z.number(),
  pRelegation: z.number(),
  pPlayoff: z.number(),
  nSims: z.number().int(),
  computedAt: z.string(),
});

export const ProjectionResponseSchema = z.object({
  rows: z.array(ProjectionRowSchema),
});

export const ScheduleFormRowSchema = z.object({
  teamId: z.number().int(),
  teamName: z.string(),
  logoUrl: z.string().nullable(),
  actualPoints: z.number().int(),
  xpts: z.number(),
  luck: z.number(),
  sos: z.number(),
  computedAt: z.string(),
});

export const ScheduleFormResponseSchema = z.object({
  rows: z.array(ScheduleFormRowSchema),
});

export const ClutchRowSchema = z.object({
  rank: z.number().int(),
  playerId: z.number().int(),
  playerName: z.string(),
  teamName: z.string(),
  image: z.string().nullable(),
  goals: z.number().int(),
  clutchScore: z.number(),
  trailingGoals: z.number().int(),
  levelGoals: z.number().int(),
  leadingGoals: z.number().int(),
});

export const ClutchResponseSchema = z.object({
  rows: z.array(ClutchRowSchema),
});

/** Spelarstats / skytteliga — shared web↔iOS leaderboard (B-06). */
export const StatsLeaderboardEntrySchema = z.object({
  rank: z.number().int(),
  playerId: z.number().int(),
  teamId: z.number().int(),
  playerName: z.string(),
  teamName: z.string(),
  teamSlug: z.string().nullable(),
  slug: z.string().nullable(),
  image: z.string().nullable(),
  position: z.string().nullable(),
  appearances: z.number().int(),
  minutes: z.number().int(),
  goals: z.number().int(),
  assists: z.number().int(),
  shots: z.number().int(),
  shotsOnTarget: z.number().int(),
  keyPasses: z.number().int(),
  passes: z.number().int(),
  passAccuracy: z.number().nullable(),
  tackles: z.number().int(),
  interceptions: z.number().int(),
  rating: z.number().nullable(),
  yellowCards: z.number().int(),
  redCards: z.number().int(),
  xg: z.number().nullable(),
  xa: z.number().nullable(),
});

export const StatsLeaderboardResponseSchema = z.object({
  metric: z.string(),
  seasonId: z.number().int(),
  entries: z.array(StatsLeaderboardEntrySchema),
});

export const H2HTeamRefSchema = z.object({
  name: z.string(),
  slug: z.string(),
});

export const H2HSummarySchema = z.object({
  teamAWins: z.number().int(),
  teamBWins: z.number().int(),
  draws: z.number().int(),
});

export const H2HFixtureRowSchema = z.object({
  id: z.number().int(),
  kickoff: z.string(),
  status: z.string(),
  homeTeam: z.string(),
  awayTeam: z.string(),
  homeScore: z.number().int().nullable(),
  awayScore: z.number().int().nullable(),
});

export const H2HResponseSchema = z.object({
  teamA: H2HTeamRefSchema,
  teamB: H2HTeamRefSchema,
  summary: H2HSummarySchema,
  fixtures: z.array(H2HFixtureRowSchema),
});

export const TeamCompareStatsSchema = z.object({
  name: z.string(),
  slug: z.string(),
  position: z.number().int(),
  points: z.number().int(),
  played: z.number().int(),
  won: z.number().int(),
  drawn: z.number().int(),
  lost: z.number().int(),
  goalsFor: z.number().int(),
  goalsAgainst: z.number().int(),
  goalDiff: z.number().int(),
  form: z.array(z.string()),
});

export const TeamCompareResponseSchema = z.object({
  teamA: TeamCompareStatsSchema,
  teamB: TeamCompareStatsSchema,
  analysis: z.string().nullable(),
});

/** GET /api/scout — rå ScoutPlayer-rad (snake_case), PRO-gatead. */
export const ScoutPlayerRowSchema = z.object({
  player_id: z.number().int(),
  fullname: z.string(),
  slug: z.string().nullable(),
  position: z.string().nullable(),
  team_id: z.number().int(),
  team_name: z.string(),
  appearances: z.number().int(),
  minutes: z.number().int(),
  goals: z.number().int(),
  assists: z.number().int(),
  shots: z.number().int(),
  shots_on_target: z.number().int(),
  key_passes: z.number().int(),
  passes: z.number().int(),
  pass_accuracy: z.number(),
  tackles: z.number().int(),
  interceptions: z.number().int(),
  rating: z.number(),
  xg: z.number(),
  xa: z.number(),
  yellow_cards: z.number().int(),
  red_cards: z.number().int(),
});

export const ScoutPoolResponseSchema = z.object({
  pool: z.array(ScoutPlayerRowSchema),
});

export const TeamListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  logo_url: z.string().nullable(),
  /** entities.metadata.league — apparna härleder hemligan ur favoritlagets liga. */
  league: z.string().nullable(),
});

export const TeamListResponseSchema = z.object({
  teams: z.array(TeamListItemSchema),
  /** Ligor att visa i växlaren, huvudligan först. `param` = värdet för ?liga= (null = huvudligan). */
  leagues: z.array(z.object({ name: z.string(), param: z.string().nullable(), hasData: z.boolean() })),
});

export const HeroResponseSchema = z.object({
  summary: FeedItemSchema.nullable(),
  topNews: z.array(FeedItemSchema),
});

// ── Daily, analyser, poddar, sök ─────────────────────────────────────────────

export const DailyChapterSchema = z.object({
  label: z.string(),
  start_sec: z.number().int(),
});

export const DailyEpisodeSchema = z.object({
  slug: z.string(),
  title: z.string(),
  has_audio: z.boolean(),
  duration_sec: z.number().int().nullable(),
  episode_date: z.string(),
  episode_type: z.enum(["league_daily", "club_daily"]),
  chapter_markers: z.array(DailyChapterSchema),
});

export const DailyResponseSchema = z.object({
  episode: DailyEpisodeSchema.nullable(),
  access: ArticleAccessStateSchema,
});

export const DailyAudioResponseSchema = z.object({
  url: z.string(),
  expiresIn: z.number().int(),
});

/** Wire-formatet är snake_case här; iOS konverterar till `shotsOnTarget`. */
export const AnalysisCurrentStatsSchema = z.object({
  xg: z.number().nullable(),
  pressure: z.number().nullable(),
  possession: z.number().nullable(),
  shots: z.number().nullable(),
  shots_on_target: z.number().nullable(),
});

export const AnalysisComparisonSchema = z.object({
  team: z.string(),
  opponent: z.string(),
  score: z.string(),
  current: AnalysisCurrentStatsSchema,
  readable: z.array(z.string()),
});

export const AnalysisListItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  publishedAt: z.string(),
  fixtureId: z.number().int().nullable(),
  matchName: z.string().nullable(),
  playedAt: z.string().nullable(),
});

export const AnalysisListResponseSchema = z.object({
  analyses: z.array(AnalysisListItemSchema),
});

export const AnalysisDetailSchema = AnalysisListItemSchema.extend({
  body: z.string().nullable(),
  bodyPreview: z.string().nullable(),
  comparisons: z.array(AnalysisComparisonSchema),
  hasProtectedContent: z.boolean(),
});

export const AnalysisDetailResponseSchema = z.object({
  analysis: AnalysisDetailSchema,
  access: ArticleAccessStateSchema,
});

export const PodcastEpisodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  showName: z.string(),
  publishedAt: z.string().nullable(),
  durationSeconds: z.number().int().nullable(),
  mentionedTeams: z.array(z.string()),
  listenUrl: z.string().nullable(),
});

export const PodcastListResponseSchema = z.object({
  episodes: z.array(PodcastEpisodeSchema),
});

export const PodcastEpisodeResponseSchema = z.object({
  episode: PodcastEpisodeSchema,
});

export const SearchResponseSchema = z.object({
  articles: z.array(z.object({ id: z.string(), slug: z.string(), title: z.string() })),
  teams: z.array(z.object({ id: z.string(), slug: z.string(), name: z.string() })),
  players: z.array(
    z.object({
      id: z.number().int(),
      slug: z.string().nullable(),
      name: z.string().nullable(),
    }),
  ),
  podcasts: z.array(z.object({ id: z.string(), title: z.string() })),
});

// ── Forum, profil, commerce ──────────────────────────────────────────────────

/** GET /api/forum/posts — råa forum_posts-rader (snake_case). */
export const ForumPostSchema = z.object({
  id: z.string(),
  content: z.string(),
  parent_id: z.string().nullable(),
  root_id: z.string().nullable(),
  quoted_post_id: z.string().nullable(),
  depth: z.number().int(),
  author_id: z.string(),
  author_name: z.string(),
  author_avatar: z.string().nullable(),
  sport: z.string(),
  team_slug: z.string().nullable(),
  article_id: z.string().nullable(),
  like_count: z.number().int(),
  reply_count: z.number().int(),
  pinned: z.boolean(),
  hot_score: z.number(),
  status: z.string(),
  created_at: z.string(),
});

export const ForumPostsResponseSchema = z.object({
  posts: z.array(ForumPostSchema),
});

export const LikeResponseSchema = z.object({
  liked: z.boolean(),
});

/**
 * GET /api/profile — `profile` är den råa profiles-raden (`select("*")`), så
 * kolumnerna är inte garanterade. Allt är optional: iOS måste tåla att en
 * kolumn saknas.
 */
export const SessionProfileSchema = z.object({
  favourite_team_id: z.string().nullable().optional(),
  display_name: z.string().nullable().optional(),
  nickname: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
});

export const SessionProfileResponseSchema = z.object({
  profile: SessionProfileSchema.nullable(),
  favouriteTeamSlug: z.string().nullable(),
  email: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  imageUrl: z.string().nullable(),
  plan: z.enum(["free", "pro", "elite"]),
});

export const DeleteAccountResponseSchema = z.object({
  ok: z.boolean(),
  deleted: z.boolean(),
});

// ── Widget (GET /api/widget) ─────────────────────────────────────────────────
//
// Hem- och låsskärmswidget. Ett publikt anrop, inga plan-gatede värden.

export const WidgetMatchSchema = z.object({
  id: z.number().int(),
  isLive: z.boolean(),
  minute: z.number().int().nullable(),
  kickoffAt: z.string(),
  status: z.string(),
  homeName: z.string(),
  awayName: z.string(),
  homeScore: z.number().int().nullable(),
  awayScore: z.number().int().nullable(),
});

export const WidgetNewsItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  href: z.string(),
  source: z.string().nullable(),
  publishedAt: z.string(),
  importanceTier: ImportanceTierSchema.nullable(),
});

export const WidgetSnapshotSchema = z.object({
  teamName: z.string().nullable(),
  teamSlug: z.string().nullable(),
  match: WidgetMatchSchema.nullable(),
  news: z.array(WidgetNewsItemSchema),
  generatedAt: z.string(),
});

// ── Transfer radar, commerce, push, feed-config ──────────────────────────────

/** Free-läget skickar bara id/title/publishedAt — resten är PRO. */
export const TransferRadarItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  publishedAt: z.string().nullable(),
  slug: z.string().nullable().optional(),
  sourceName: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
  sourceCount: z.number().int().nullable().optional(),
});

export const TransferRadarResponseSchema = z.object({
  items: z.array(TransferRadarItemSchema),
  unlocked: z.boolean(),
  requiredPlan: z.enum(["free", "pro", "elite"]).nullable(),
  tease: z.string().nullable(),
});

export const StoreAccountTokenResponseSchema = z.object({
  appAccountToken: z.string().uuid(),
});

export const StoreEntitlementSyncResponseSchema = z.object({
  ok: z.boolean(),
  plan: z.enum(["free", "pro", "elite"]),
  storekitPlan: z.enum(["free", "pro", "elite"]),
  expiresAt: z.string().nullable(),
});

export const APNSSubscriptionResponseSchema = z.object({
  ok: z.boolean(),
});

/** GET /api/feed/config svarar med den råa raden ELLER null. */
export const FeedConfigResponseSchema = z.object({
  content_types: z.array(z.string()).nullable().optional(),
  /** Landslaget: none | some | second_team (lib/national-interest.ts). */
  national_interest: z.enum(["none", "some", "second_team"]).optional(),
});

/** GET /api/forum/summary — PRO-gated teaser/full summary. */
export const ForumSummaryResponseSchema = z.object({
  summary: z.string().nullable(),
  teaser: z.string().nullable(),
  unlocked: z.boolean(),
  requiredPlan: z.enum(["free", "pro", "elite"]).nullable().optional(),
});

/** GET /api/elite/podcast-summary — läser os-skriven Athopia-text, aldrig transkript. */
export const PodcastSummaryResponseSchema = z.object({
  headline: z.string().nullable(),
  bullets: z.array(z.string()),
  teaser: z.string().nullable(),
  unlocked: z.boolean(),
  hasSource: z.boolean(),
  requiredPlan: z.enum(["free", "pro", "elite"]).nullable().optional(),
});

/** Strukturerad 403 — klienterna renderar paywall ur detta, aldrig ur copy. */
export const PlanRequiredErrorSchema = z.object({
  error: z.string(),
  code: z.literal("plan_required"),
  feature: z.string(),
  requiredPlan: z.enum(["free", "pro", "elite"]),
  upgradePath: z.string(),
});

/** Endpoint-registret som OpenAPI genereras ur. */
export const API_CONTRACTS = [
  { method: "get", path: "/api/feed", name: "FeedResponse", schema: FeedResponseSchema },
  { method: "get", path: "/api/scores", name: "ScoresResponse", schema: ScoresResponseSchema },
  {
    method: "get",
    path: "/api/articles/{slug}",
    name: "ArticleDetailResponse",
    schema: ArticleDetailResponseSchema,
  },
  {
    method: "get",
    path: "/api/team/{slug}/hub",
    name: "TeamHubPayload",
    schema: TeamHubPayloadSchema,
  },
  { method: "get", path: "/api/team/list", name: "TeamListResponse", schema: TeamListResponseSchema },
  { method: "get", path: "/api/feed/hero", name: "HeroResponse", schema: HeroResponseSchema },
  { method: "get", path: "/api/standings", name: "StandingsResponse", schema: StandingsResponseSchema },
  { method: "get", path: "/api/match/{fixtureId}", name: "FixtureDetail", schema: FixtureDetailSchema },
  { method: "get", path: "/api/match/{fixtureId}/timeline", name: "MatchTimelineResponse", schema: MatchTimelineResponseSchema },
  { method: "get", path: "/api/player/{idOrSlug}", name: "PlayerProfileResponse", schema: PlayerProfileResponseSchema },
  { method: "get", path: "/api/stats/projection", name: "ProjectionResponse", schema: ProjectionResponseSchema },
  { method: "get", path: "/api/stats/schedule-form", name: "ScheduleFormResponse", schema: ScheduleFormResponseSchema },
  { method: "get", path: "/api/stats/clutch", name: "ClutchResponse", schema: ClutchResponseSchema },
  { method: "get", path: "/api/stats/leaderboard", name: "StatsLeaderboardResponse", schema: StatsLeaderboardResponseSchema },
  { method: "get", path: "/api/stats/h2h", name: "H2HResponse", schema: H2HResponseSchema },
  { method: "get", path: "/api/stats/compare", name: "TeamCompareResponse", schema: TeamCompareResponseSchema },
  { method: "get", path: "/api/scout", name: "ScoutPoolResponse", schema: ScoutPoolResponseSchema },
  { method: "get", path: "/api/daily", name: "DailyResponse", schema: DailyResponseSchema },
  { method: "get", path: "/api/daily/audio", name: "DailyAudioResponse", schema: DailyAudioResponseSchema },
  { method: "get", path: "/api/analyses", name: "AnalysisListResponse", schema: AnalysisListResponseSchema },
  { method: "get", path: "/api/podcasts", name: "PodcastListResponse", schema: PodcastListResponseSchema },
  { method: "get", path: "/api/search", name: "SearchResponse", schema: SearchResponseSchema },
  { method: "get", path: "/api/forum/posts", name: "ForumPostsResponse", schema: ForumPostsResponseSchema },
  { method: "get", path: "/api/profile", name: "SessionProfileResponse", schema: SessionProfileResponseSchema },
  { method: "get", path: "/api/widget", name: "WidgetSnapshot", schema: WidgetSnapshotSchema },
  { method: "get", path: "/api/team/{slug}/transfers", name: "TransferRadarResponse", schema: TransferRadarResponseSchema },
  { method: "get", path: "/api/storekit/entitlements", name: "StoreAccountTokenResponse", schema: StoreAccountTokenResponseSchema },
  { method: "post", path: "/api/storekit/entitlements", name: "StoreEntitlementSyncResponse", schema: StoreEntitlementSyncResponseSchema },
  { method: "post", path: "/api/push/apns-subscribe", name: "APNSSubscriptionResponse", schema: APNSSubscriptionResponseSchema },
  { method: "get", path: "/api/feed/config", name: "FeedConfigResponse", schema: FeedConfigResponseSchema },
  {
    method: "get",
    path: "/api/forum/summary",
    name: "ForumSummaryResponse",
    schema: ForumSummaryResponseSchema,
  },
  {
    method: "get",
    path: "/api/elite/podcast-summary",
    name: "PodcastSummaryResponse",
    schema: PodcastSummaryResponseSchema,
  },
] as const;

/**
 * Swift-modeller som avkodar dessa svar. Testet failar om en handskriven
 * Swift-struct har ett fält servern inte skickar, eller avkodar ett
 * nullable/optional fält som non-optional.
 *
 * ponytail: handskrivna Swift-modeller behålls och gate:as i stället för att
 * kodgenereras — codegen kan inte kompileras på Windows. Byt till genererade
 * modeller när bygget körs på macOS; kontraktet nedan är då redan källan.
 */
export const SWIFT_MODEL_CONTRACTS = [
  { swiftStruct: "FeedItem", schema: FeedItemSchema },
  { swiftStruct: "FeedResponse", schema: FeedResponseSchema },
  { swiftStruct: "ScoreItem", schema: ScoreItemSchema },
  { swiftStruct: "TeamRef", schema: TeamRefSchema },
  { swiftStruct: "NativeArticleDetail", schema: NativeArticleDetailSchema },
  { swiftStruct: "ArticleAccessState", schema: ArticleAccessStateSchema },
  { swiftStruct: "TeamHubPayload", schema: TeamHubPayloadSchema },
  { swiftStruct: "TeamInfo", schema: TeamInfoSchema },
  { swiftStruct: "TeamSeasonStats", schema: TeamSeasonStatsSchema },
  { swiftStruct: "RadarPoint", schema: RadarPointSchema },
  { swiftStruct: "LeaderRow", schema: LeaderRowSchema },
  { swiftStruct: "FixtureRow", schema: FixtureRowSchema },
  { swiftStruct: "DashArticle", schema: DashArticleSchema },
  { swiftStruct: "DashThread", schema: DashThreadSchema },
  { swiftStruct: "TeamListItem", schema: TeamListItemSchema },
  { swiftStruct: "HeroResponse", schema: HeroResponseSchema },
  { swiftStruct: "StandingsResponse", schema: StandingsResponseSchema },
  { swiftStruct: "StandingRow", schema: StandingRowSchema },
  { swiftStruct: "FixtureDetail", schema: FixtureDetailSchema },
  { swiftStruct: "MatchEvent", schema: MatchEventSchema },
  { swiftStruct: "MatchLineupRow", schema: MatchLineupRowSchema },
  { swiftStruct: "MatchTimelineResponse", schema: MatchTimelineResponseSchema },
  { swiftStruct: "PlayerProfileResponse", schema: PlayerProfileResponseSchema },
  { swiftStruct: "PlayerProfilePlayer", schema: PlayerProfilePlayerSchema },
  { swiftStruct: "PlayerProfileSeasonStats", schema: PlayerProfileSeasonStatsSchema },
  { swiftStruct: "PlayerProfileMetric", schema: PlayerProfileMetricSchema },
  { swiftStruct: "PlayerProfileMatch", schema: PlayerProfileMatchSchema },
  { swiftStruct: "ProjectionRow", schema: ProjectionRowSchema },
  { swiftStruct: "ScheduleFormRow", schema: ScheduleFormRowSchema },
  { swiftStruct: "ClutchRow", schema: ClutchRowSchema },
  { swiftStruct: "StatsLeaderboardEntry", schema: StatsLeaderboardEntrySchema },
  { swiftStruct: "StatsLeaderboardResponse", schema: StatsLeaderboardResponseSchema },
  { swiftStruct: "H2HResponse", schema: H2HResponseSchema },
  { swiftStruct: "H2HTeamRef", schema: H2HTeamRefSchema },
  { swiftStruct: "H2HSummary", schema: H2HSummarySchema },
  { swiftStruct: "H2HFixtureRow", schema: H2HFixtureRowSchema },
  { swiftStruct: "TeamCompareResponse", schema: TeamCompareResponseSchema },
  { swiftStruct: "TeamCompareStats", schema: TeamCompareStatsSchema },
  { swiftStruct: "ScoutPlayerRow", schema: ScoutPlayerRowSchema },
  { swiftStruct: "DailyResponse", schema: DailyResponseSchema },
  { swiftStruct: "DailyEpisode", schema: DailyEpisodeSchema },
  { swiftStruct: "DailyChapter", schema: DailyChapterSchema },
  { swiftStruct: "DailyAudioResponse", schema: DailyAudioResponseSchema },
  { swiftStruct: "AnalysisListItem", schema: AnalysisListItemSchema },
  { swiftStruct: "AnalysisDetail", schema: AnalysisDetailSchema },
  { swiftStruct: "AnalysisComparison", schema: AnalysisComparisonSchema },
  { swiftStruct: "AnalysisCurrentStats", schema: AnalysisCurrentStatsSchema },
  { swiftStruct: "PodcastEpisode", schema: PodcastEpisodeSchema },
  { swiftStruct: "ForumPost", schema: ForumPostSchema },
  { swiftStruct: "LikeResponse", schema: LikeResponseSchema },
  { swiftStruct: "SessionProfileResponse", schema: SessionProfileResponseSchema },
  { swiftStruct: "SessionProfile", schema: SessionProfileSchema },
  { swiftStruct: "ArticleDetailResponse", schema: ArticleDetailResponseSchema },
  { swiftStruct: "TeamListResponse", schema: TeamListResponseSchema },
  { swiftStruct: "ProjectionResponse", schema: ProjectionResponseSchema },
  { swiftStruct: "ScheduleFormResponse", schema: ScheduleFormResponseSchema },
  { swiftStruct: "ClutchResponse", schema: ClutchResponseSchema },
  { swiftStruct: "ScoutPoolResponse", schema: ScoutPoolResponseSchema },
  { swiftStruct: "AnalysisListResponse", schema: AnalysisListResponseSchema },
  { swiftStruct: "AnalysisDetailResponse", schema: AnalysisDetailResponseSchema },
  { swiftStruct: "PodcastListResponse", schema: PodcastListResponseSchema },
  { swiftStruct: "PodcastEpisodeResponse", schema: PodcastEpisodeResponseSchema },
  { swiftStruct: "ForumPostsResponse", schema: ForumPostsResponseSchema },
  { swiftStruct: "SearchResponse", schema: SearchResponseSchema },
  { swiftStruct: "WidgetSnapshot", schema: WidgetSnapshotSchema },
  { swiftStruct: "WidgetMatch", schema: WidgetMatchSchema },
  { swiftStruct: "WidgetNewsItem", schema: WidgetNewsItemSchema },
  { swiftStruct: "TransferRadarResponse", schema: TransferRadarResponseSchema },
  { swiftStruct: "TransferRadarItem", schema: TransferRadarItemSchema },
  { swiftStruct: "StoreAccountTokenResponse", schema: StoreAccountTokenResponseSchema },
  { swiftStruct: "StoreEntitlementSyncResponse", schema: StoreEntitlementSyncResponseSchema },
  { swiftStruct: "APNSSubscriptionResponse", schema: APNSSubscriptionResponseSchema },
  { swiftStruct: "FeedConfigResponse", schema: FeedConfigResponseSchema },
  { swiftStruct: "ForumSummaryResponse", schema: ForumSummaryResponseSchema },
] as const;
