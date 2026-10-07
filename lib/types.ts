export type SubscriptionTier = "free" | "pro";

export interface UserProfile {
  id: string;
  email?: string | null;
  name?: string | null;
  imageUrl?: string | null;
  subscriptionTier: SubscriptionTier;
  createdAt?: string;
  updatedAt?: string;
}

export type EntityType = "team" | "player" | "coach";

export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  slug: string;
  imageUrl?: string | null;
}

export interface Article {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string | null;
  sourceUrl?: string | null;
  url?: string | null;
  sourceName: string;
  sourceType?: string | null;
  imageUrl: string | null;
  publishedAt: string;
  updatedAt?: string | null;
  importanceScore?: number | null;
  feedScore?: number | null;
  pushPriority?: "none" | "watch" | "team_popup" | "breaking" | null;
  newsTag?: string | null;
  eventType?: string | null;
  sentimentScore?: number | null; // -1..1
  entities: Entity[];
  /** LAUNCH-01 provenance */
  contentOrigin?: "athopia_original" | "third_party_signal" | "licensed" | null;
  rightsStatus?: "owned" | "link_only" | "licensed" | null;
  isAthopiaGenerated?: boolean | null;
}

export interface TeamPushPopup {
  id: string;
  articleId: string | null;
  storyKey: string;
  sport: string;
  teamEntityId: string | null;
  title: string;
  body: string;
  url: string | null;
  importanceScore: number | null;
  feedScore: number | null;
  eventType: string | null;
  newsTag: string | null;
  sourceName: string | null;
  createdAt: string;
}

export interface EntityInsight {
  id: string;
  entityId: string;
  entityName: string;
  entitySlug: string | null;
  insightType: "stat_news_fusion" | "form_context" | "news_pressure" | "pre_match";
  title: string;
  summary: string;
  body: string | null;
  confidence: number;
  severity: "info" | "watch" | "strong";
  sourceArticleIds: string[];
  metricSnapshot: Record<string, unknown>;
  evidence: Record<string, unknown>;
  generatedAt: string;
}

export interface TeamDailyPulse {
  id: string;
  teamEntityId: string;
  teamName: string;
  teamSlug: string | null;
  pulseDate: string;
  headline: string;
  dek: string;
  body: string;
  editorialNote: string | null;
  matchContextLabel: "normal" | "post_match_hold" | "pre_match";
  tone: "measured" | "watch" | "strong";
  sourceArticleIds: string[];
  sourceFixtureIds: number[];
  metricSnapshot: Record<string, unknown>;
  evidence: Record<string, unknown>;
  generatedAt: string;
}

export interface Podcast {
  id: string;
  showName: string;
  title: string;
  audioUrl: string;
  durationSeconds: number;
  publishedAt: string;
  imageUrl?: string | null;
  hasTranscript?: boolean;
  entities: Entity[];
}

export interface PodcastChunk {
  id: string;
  podcastId: string;
  startSeconds: number;
  endSeconds: number;
  text: string;
  entities?: Entity[];
}

export type NarrativeTrend = "rising" | "falling" | "stable";

export interface Narrative {
  id: string;
  topic: string;
  score: number; // 0..1
  description?: string | null;
  body?: string | null;
  sourceCount: number;
  trend: NarrativeTrend;
  sentimentScore?: number | null; // -1..1
  entities: Entity[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentLog {
  id: string;
  createdAt: string;
  agentName: string;
  level: "info" | "warn" | "error";
  message: string;
  meta?: Record<string, unknown> | null;
}

export interface Task {
  id: string;
  createdAt: string;
  status: "queued" | "running" | "succeeded" | "failed";
  name: string;
  meta?: Record<string, unknown> | null;
}

export interface ContentQueueItem {
  id: string;
  createdAt: string;
  status: "pending_classification" | "classified" | "pending_review" | "approved" | "published";
  content_type: "rss_signal" | "carousel" | "x_thread" | "narrative";
  sourceId: string;
  meta?: Record<string, unknown> | null;
}

export interface NewsSignal {
  id: string;
  source_name: string | null;
  source_url: string | null;
  signal_score: number | null;
  importance_tier: "breaking" | "major" | "normal" | "noise" | null;
  source_count?: number | null;
  story_cluster_id?: string | null;
  content: {
    title: string;
    link: string;
    published_at: string | null;
    snippet: string | null;
  };
  created_at: string;
}

export interface Team {
  id: number;
  name: string;
  slug: string;
  logoUrl?: string | null;
}

export interface Player {
  id: number;
  name: string;
  slug: string;
  teamId?: number | null;
  position?: string | null;
  age?: number | null;
  imageUrl?: string | null;
}

export interface Match {
  id: number;
  startingAt: string;
  status: "LIVE" | "FT" | "NS" | string;
  minute?: number | null;
  home: Team;
  away: Team;
  scoreHome?: number | null;
  scoreAway?: number | null;
  details?: {
    possessionHome?: number | null;
    possessionAway?: number | null;
    shotsHome?: number | null;
    shotsAway?: number | null;
  };
}

export interface ForumThread {
  id: string;
  team_id?: string | null;
  team_slug?: string | null;
  title: string;
  content: string;
  author_id: string;
  author_name: string;
  pinned: boolean;
  locked: boolean;
  reply_count: number;
  view_count: number;
  hot_score?: number;
  last_reply_at: string;
  created_at: string;
}

export interface ForumPost {
  id: string;
  content: string;
  images: string[];
  parent_id: string | null;
  root_id: string | null;
  quoted_post_id: string | null;
  depth: number;
  author_id: string;
  author_name: string;
  author_avatar: string | null;
  /** entities.slug för författarens favoritlag — driver "(DIF)" + lagfärgad avatarring */
  author_team?: string | null;
  /** Snapshot av profiles.role vid postningstillfället — driver krönikör-badgen */
  author_role?: string | null;
  sport: string;
  team_slug: string | null;
  like_count: number;
  reply_count: number;
  repost_count: number;
  view_count: number;
  ai_summary: string | null;
  pinned: boolean;
  hot_score: number;
  status: string;
  label?: 'transfer' | 'taktik' | 'match' | 'rykte' | 'diskussion' | null;
  created_at: string;
  replies?: ForumPost[];
  quoted_post?: ForumPost | null;
}

export type FeedItemType = "news" | "forum" | "summary" | "podcast";

export interface FeedItem {
  id: string;
  type: FeedItemType;
  title: string;
  subtitle?: string | null;
  source?: string | null;
  time: string;
  href: string;
  newsTag?: string | null;
  /** Antal oberoende källor (Particle-style) */
  sourceCount?: number | null;
  storyClusterId?: string | null;
  importanceTier?: "breaking" | "major" | "normal" | "noise" | null;
  /** Antal forum-inlägg kopplade till artikeln (valfritt). */
  discussionCount?: number;
  /** Lagen nyheten handlar om (högst tre) — taggar i flödet. Utelämnas när inga är kända. */
  teams?: Array<{ slug: string; name: string }>;
}

/** Publik podd-signal — ingen transkripttext, ingen enclosure-URL. */
export interface PodcastEpisodeSignal {
  id: string;
  title: string;
  showName: string;
  publishedAt: string | null;
  listenUrl: string | null;
  spotifyEpisodeId: string | null;
  spotifyShowId: string | null;
  topics: string[];
  mentionedTeams: string[];
}

/** @deprecated Intern RAG — exponeras inte i UI. */
export interface PodcastClipHighlight {
  id: string;
  podcastId: string;
  podcastTitle: string;
  showName: string;
  audioUrl: string;
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export interface ForumReply {
  id: string;
  thread_id: string;
  content: string;
  author_id: string;
  author_name: string;
  likes: number;
  flagged: boolean;
  created_at: string;
}

export interface Standing {
  team: Team;
  position: number;
  played: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  form: Array<"W" | "D" | "L">;
}

