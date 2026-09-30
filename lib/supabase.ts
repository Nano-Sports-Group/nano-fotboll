import { SPORT, vertical } from "@/lib/vertical";
/**
 * lib/supabase.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Supabase-helpers för Nano Fotboll.
 *
 * Beslut: Vi exporterar två klienter:
 *  - `createServerClient` – används i Server Components och Route Handlers med
 *    service-role key (läser/skriver utan RLS-begränsning).
 *
 * Modulen är server-only. `import "server-only"` nedan är inte kosmetik: utan
 * den drogs hela service-role-fabriken in i klientbundlen (verifierat i
 * .next/static 2026-08-06). Nyckelns VÄRDE läckte inte — Next inlinar bara
 * NEXT_PUBLIC_*, så `env.SUPABASE_SERVICE_ROLE_KEY` blir undefined i
 * webbläsaren — men koden låg där, och ett enda framtida namnbyte till
 * NEXT_PUBLIC_ hade räckt för att läcka den på riktigt. Nu failar bygget i
 * stället om en klientkomponent importerar härifrån.
 *
 * Klientkomponenter som behöver Supabase ska skapa en egen anon-klient; någon
 * `createBrowserClient` finns inte längre exporterad härifrån.
 *
 * Typerna genereras av `pnpm supabase gen types` och importeras från
 * @/types/supabase (skapas manuellt/via Supabase CLI).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { unstable_cache } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import {
  canPublishBody,
  resolveContentOrigin,
  resolveRightsStatus,
} from "@/lib/provenance";
import type {
  AgentLog,
  Article,
  ContentQueueItem,
  Entity,
  EntityInsight,
  Narrative,
  NewsSignal,
  Podcast,
  PodcastChunk,
  PodcastClipHighlight,
  PodcastEpisodeSignal,
  TeamDailyPulse,
  TeamPushPopup,
} from "@/lib/types";
import { listenMetaFromRow } from "@/lib/podcast/spotify";
import { mapImportanceTier } from "@/lib/feed/importance";

// ─── Miljövariabler ────────────────────────────────────────────────────────────
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** Tysta DB-fel var osynliga i prod (audit T8) — logga alltid till Sentry. */
function captureDbError(e: unknown): void {
  Sentry.captureException(e);
}

/** Returnerar true om Supabase är korrekt konfigurerat (inte placeholder) */
export function isSupabaseConfigured(): boolean {
  return (
    supabaseUrl.startsWith("https://") &&
    !supabaseUrl.includes("placeholder") &&
    supabaseServiceRoleKey.length > 20 &&
    !supabaseServiceRoleKey.includes("placeholder")
  );
}

// ─── Server-klient (Server Components / API routes) ────────────────────────────
// Använder service role key – kör aldrig i klienten.
export function createServerClient() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL och SUPABASE_SERVICE_ROLE_KEY måste sättas."
    );
  }
  return createSupabaseClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
    global: {
      fetch: (url: RequestInfo | URL, init?: RequestInit) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 25000);
        return fetch(url, { ...init, signal: controller.signal }).finally(() =>
          clearTimeout(timer)
        );
      },
    },
  });
}

// ─── Service-klient (admin-operationer) ───────────────────────────────────────
// Alias för tydlighet när vi gör writes/admin.
export function createServiceClient() {
  return createServerClient();
}

// Browser-klienten (anon + RLS) bor i lib/supabase-browser.ts — den här
// modulen är server-only och får aldrig nå klientbundlen.

// ─── Typade queries ───────────────────────────────────────────────────────────

/** Normaliserad titel-fingerprint — fallback-dedupnyckel när story_cluster_id saknas. */
function titleFingerprint(title: string | null | undefined): string {
  return String(title ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Dedupar rader som delar story_cluster_id (fallback: titel-fingerprint).
 * Behåller den med högst `scoreOf` (t.ex. feed_score/signal_score), och vid
 * lika score den senast publicerade. Bevarar ursprunglig sortordning.
 */
function dedupeByStoryCluster<T>(
  rows: T[],
  keyOf: (row: T) => { clusterId: string | null; title: string | null; publishedAt: string | null },
  scoreOf: (row: T) => number
): T[] {
  const bestByKey = new Map<string, T>();
  const order: string[] = [];
  for (const row of rows) {
    const { clusterId, title, publishedAt } = keyOf(row);
    const key = clusterId ?? `title:${titleFingerprint(title)}`;
    if (!key || key === "title:") {
      // Ingen dedupbar nyckel (tom titel) — behåll som unik rad.
      order.push(`__unique:${order.length}`);
      bestByKey.set(order[order.length - 1], row);
      continue;
    }
    const existing = bestByKey.get(key);
    if (!existing) {
      order.push(key);
      bestByKey.set(key, row);
      continue;
    }
    const existingScore = scoreOf(existing);
    const newScore = scoreOf(row);
    if (
      newScore > existingScore ||
      (newScore === existingScore && (publishedAt ?? "") > (keyOf(existing).publishedAt ?? ""))
    ) {
      bestByKey.set(key, row);
    }
  }
  return order.map((key) => bestByKey.get(key)!).filter(Boolean);
}

function mapEntity(row: any): Entity {
  return {
    id: String(row.id ?? row.entity_id ?? row.slug ?? row.name),
    name: String(row.name ?? ""),
    type: (row.type ?? "team") as Entity["type"],
    slug: String(row.slug ?? ""),
    imageUrl: row.image_url ?? row.imageUrl ?? null,
  };
}

function mapArticle(row: any): Article {
  const slug = row.slug ? String(row.slug) : "";
  const sourceUrl = row.source_url ?? row.sourceUrl ?? row.url ?? null;
  const isAthopiaGenerated = row.is_athopia_generated ?? row.isAthopiaGenerated ?? null;
  const rightsStatus = resolveRightsStatus(row);
  const contentOrigin = resolveContentOrigin(row);
  const canBody = canPublishBody(rightsStatus);
  return {
    id: String(row.id),
    slug,
    title: String(row.title ?? ""),
    summary: canBody ? String(row.summary ?? "") : "",
    content: canBody ? (row.content ?? null) : null,
    sourceUrl,
    url: row.url ?? sourceUrl,
    sourceName: String(row.source_name ?? row.sourceName ?? "Okänd källa"),
    sourceType: row.source_type ?? row.sourceType ?? null,
    imageUrl: row.image_url ?? row.imageUrl ?? null,
    publishedAt: String(row.published_at ?? row.publishedAt ?? new Date().toISOString()),
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
    importanceScore: row.importance_score ?? row.importanceScore ?? null,
    feedScore: row.feed_score ?? row.feedScore ?? null,
    pushPriority: row.push_priority ?? row.pushPriority ?? null,
    newsTag: row.news_tag ?? row.newsTag ?? null,
    eventType: row.event_type ?? row.eventType ?? null,
    sentimentScore: row.sentiment_score ?? row.sentimentScore ?? null,
    entities: Array.isArray(row.entities) ? row.entities.map(mapEntity) : [],
    contentOrigin,
    rightsStatus,
    isAthopiaGenerated,
  };
}

function mapNarrative(row: any): Narrative {
  const score = Number(row.score ?? row.importance_score ?? 0);
  return {
    id: String(row.id),
    topic: String(row.topic ?? row.title ?? ""),
    score: Number.isFinite(score) ? score : 0,
    description: row.description ?? null,
    body: row.generated_text ?? row.body ?? null,
    sourceCount: Number(row.source_count ?? row.sourceCount ?? 0),
    trend: (row.trend ?? "stable") as Narrative["trend"],
    sentimentScore: row.sentiment_score ?? row.sentimentScore ?? null,
    entities: Array.isArray(row.entities) ? row.entities.map(mapEntity) : [],
    createdAt: String(row.created_at ?? row.createdAt ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.updatedAt ?? new Date().toISOString()),
  };
}

function mapEntityInsight(row: any): EntityInsight {
  return {
    id: String(row.id),
    entityId: String(row.entity_id),
    entityName: String(row.entity_name ?? ""),
    entitySlug: row.entity_slug ? String(row.entity_slug) : null,
    insightType: (row.insight_type ?? "stat_news_fusion") as EntityInsight["insightType"],
    title: String(row.title ?? ""),
    summary: String(row.summary ?? ""),
    body: row.body ?? null,
    confidence: Number(row.confidence ?? 0),
    severity: (row.severity ?? "info") as EntityInsight["severity"],
    sourceArticleIds: Array.isArray(row.source_article_ids) ? row.source_article_ids.map(String) : [],
    metricSnapshot: (row.metric_snapshot ?? {}) as Record<string, unknown>,
    evidence: (row.evidence ?? {}) as Record<string, unknown>,
    generatedAt: String(row.generated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

function mapTeamDailyPulse(row: any): TeamDailyPulse {
  return {
    id: String(row.id),
    teamEntityId: String(row.team_entity_id),
    teamName: String(row.team_name ?? ""),
    teamSlug: row.team_slug ? String(row.team_slug) : null,
    pulseDate: String(row.pulse_date ?? ""),
    headline: String(row.headline ?? ""),
    dek: String(row.dek ?? ""),
    body: String(row.body ?? ""),
    editorialNote: row.editorial_note ?? null,
    matchContextLabel: (row.match_context_label ?? "normal") as TeamDailyPulse["matchContextLabel"],
    tone: (row.tone ?? "measured") as TeamDailyPulse["tone"],
    sourceArticleIds: Array.isArray(row.source_article_ids) ? row.source_article_ids.map(String) : [],
    sourceFixtureIds: Array.isArray(row.source_fixture_ids) ? row.source_fixture_ids.map(Number) : [],
    metricSnapshot: (row.metric_snapshot ?? {}) as Record<string, unknown>,
    evidence: (row.evidence ?? {}) as Record<string, unknown>,
    generatedAt: String(row.generated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

function mapPodcast(row: any): Podcast {
  return {
    id: String(row.id),
    showName: String(row.show_name ?? row.showName ?? "Podcast"),
    title: String(row.title ?? ""),
    audioUrl: String(row.audio_url ?? row.audioUrl ?? ""),
    durationSeconds: Number(row.duration_seconds ?? row.durationSeconds ?? 0),
    publishedAt: String(row.published_at ?? row.publishedAt ?? new Date().toISOString()),
    imageUrl: row.image_url ?? row.imageUrl ?? null,
    hasTranscript: !!(row.transcript_html ?? row.has_transcript ?? row.hasTranscript),
    entities: Array.isArray(row.entities) ? row.entities.map(mapEntity) : [],
  };
}

function mapPodcastChunk(row: any): PodcastChunk {
  return {
    id: String(row.id),
    podcastId: String(row.podcast_id ?? row.podcastId ?? ""),
    startSeconds: Number(row.start_seconds ?? row.startSeconds ?? 0),
    endSeconds: Number(row.end_seconds ?? row.endSeconds ?? 0),
    text: String(row.text ?? ""),
    entities: Array.isArray(row.entities) ? row.entities.map(mapEntity) : [],
  };
}

export async function getArticles(
  limit = 12,
  offset = 0,
  teamSlug?: string
): Promise<Article[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createServerClient();
    let q = supabase
      .from("articles")
      .select("*")
      .eq("sport", SPORT)
      .order("published_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (teamSlug) q = q.ilike("title", `%${teamSlug}%`);
    const { data } = await q;
    return (data ?? []).map(mapArticle);
  } catch (e) { captureDbError(e);
    return [];
  }
}

export type ArticleSort = "for-you" | "latest" | "important";

export interface ArticleFilters {
  visa?: "all" | "ai" | "source";
  teams?: string[];
  sources?: string[];
  events?: string[];
  newsTags?: string[];
  /** for-you = feed_score + published (default); latest = published; important = feed_score only */
  sort?: ArticleSort;
  page?: number;
  limit?: number;
}

/**
 * Heta nyheter: klickvelocitet (48h, från source_clicks) blandad med Echos
 * feed_score. Dag 1 signal-drivet; skarpare i takt med att klick flödar in.
 * Lätt: två cachade queries (ISR 300s), ingen per-user-data, ingen join i
 * request-path. Klick aggregeras per url och matchas mot artikelns källa.
 */
/**
 * Antal forumsvar per artikel (Athletic-kroken i feeden).
 * Returnerar {} innan forum_posts.article_id-migrationen är applicerad.
 */
/**
 * Diskussionsräknare per artikel. Cachas 60 s och delas mellan besökare — det
 * är publik räknedata, inget personligt. Utan cache blev det ett extra
 * Supabase-anrop per sidladdning av flödet.
 */
export async function getDiscussionCounts(articleIds: string[]): Promise<Record<string, number>> {
  if (!isSupabaseConfigured() || articleIds.length === 0) return {};
  const nyckel = [...articleIds].sort().join(",");
  return unstable_cache(
    () => fetchDiscussionCounts(articleIds),
    ["discussion-counts", nyckel],
    { revalidate: 60, tags: ["forum"] },
  )();
}

async function fetchDiscussionCounts(articleIds: string[]): Promise<Record<string, number>> {
  if (!isSupabaseConfigured() || articleIds.length === 0) return {};
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("forum_posts")
      .select("article_id")
      .in("article_id", articleIds)
      .eq("status", "published");
    if (error) return {};
    const counts: Record<string, number> = {};
    for (const row of (data ?? []) as { article_id: string | null }[]) {
      if (row.article_id) counts[row.article_id] = (counts[row.article_id] ?? 0) + 1;
    }
    return counts;
  } catch (e) {
    captureDbError(e);
    return {};
  }
}

export const getHotArticles = unstable_cache(
  async (limit = 6): Promise<Article[]> => {
    if (!isSupabaseConfigured()) return [];
    try {
      const supabase = createServerClient();
      const since = new Date(Date.now() - 48 * 3600_000).toISOString();

      // Kandidater: senaste dygnets högst rankade signaler
      const { data: rows } = await supabase
        .from("news_feed")
        .select("*")
        .eq("sport", SPORT)
        .gte("published_at", new Date(Date.now() - 36 * 3600_000).toISOString())
        .order("feed_score", { ascending: false, nullsFirst: false })
        .limit(40);
      if (!rows?.length) return [];

      // Klick per url (48h) — en indexerad, aggregerad query
      const { data: clicks } = await supabase
        .from("source_clicks")
        .select("url")
        .gte("clicked_at", since)
        .limit(5000);
      const clickByUrl = new Map<string, number>();
      for (const c of clicks ?? []) {
        const u = (c as { url: string | null }).url;
        if (u) clickByUrl.set(u, (clickByUrl.get(u) ?? 0) + 1);
      }

      const scored = rows.map((r: any) => {
        const clicksN = clickByUrl.get(r.url) ?? 0;
        // feed_score 0–1 + klickboost (log-dämpad så en viral artikel ej dränker allt)
        const hot = Number(r.feed_score ?? 0) + Math.log1p(clicksN) * 0.35;
        return { row: r, hot };
      });
      scored.sort((a, b) => b.hot - a.hot);
      return scored.slice(0, limit).map((s) => mapArticle(s.row));
    } catch (e) {
      captureDbError(e);
      return [];
    }
  },
  ["hot-articles"],
  { revalidate: 300, tags: ["news"] }
);

/**
 * Flödesfrågan cachas per filterkombination.
 *
 * Innehållet är identiskt för alla besökare — filtren kommer ur URL:en, inte ur
 * sessionen — så det finns inget personligt att läcka mellan användare.
 * Personaliseringen sker en nivå upp (`getUserFeedPreferences` väljer VILKA
 * filter som skickas hit) och cachas inte.
 *
 * Mätt i prod: dynamiska sidor utan cachat datalager låg på ~1,4 s TTFB medan
 * /statistik, som cachar allt, låg på 340 ms. 30 sekunder är samma fönster som
 * CLAUDE.md föreskriver för nyhetsflödet.
 */
export async function getFilteredArticles(
  filters: ArticleFilters = {},
): Promise<{ articles: Article[]; total: number }> {
  const nyckel = JSON.stringify({
    v: filters.visa ?? null,
    t: [...(filters.teams ?? [])].sort(),
    s: [...(filters.sources ?? [])].sort(),
    e: [...(filters.events ?? [])].sort(),
    n: [...(filters.newsTags ?? [])].sort(),
    o: filters.sort ?? null,
    p: filters.page ?? 1,
    l: filters.limit ?? 12,
  });
  return unstable_cache(
    () => fetchFilteredArticles(filters),
    ["filtered-articles", SPORT, nyckel],
    { revalidate: 30, tags: ["news"] },
  )();
}

async function fetchFilteredArticles(filters: ArticleFilters = {}): Promise<{ articles: Article[]; total: number }> {
  if (!isSupabaseConfigured()) return { articles: [], total: 0 };
  try {
    const supabase = createServerClient();
    const limit = filters.limit ?? 12;
    const offset = ((filters.page ?? 1) - 1) * limit;

    const sort = filters.sort ?? "for-you";
    let q = supabase
      .from("news_feed")
      .select("*", { count: "exact" })
      .eq("sport", SPORT)
      .range(offset, offset + limit - 1);

    if (sort === "latest") {
      q = q.order("published_at", { ascending: false, nullsFirst: false });
    } else {
      // for-you + important: signal first, then recency as tie-break
      q = q
        .order("feed_score", { ascending: false, nullsFirst: false })
        .order("published_at", { ascending: false, nullsFirst: false });
    }

    if (filters.visa === "ai") {
      q = q.not("summary", "is", null);
    } else if (filters.visa === "source") {
      q = q.not("source_name", "is", null);
    }

    if (filters.events && filters.events.length > 0) {
      q = q.in("event_type", filters.events);
    }

    if (filters.newsTags && filters.newsTags.length > 0) {
      q = q.in("news_tag", filters.newsTags);
    }

    if (filters.sources && filters.sources.length > 0) {
      q = q.in("source_name", filters.sources);
    }

    // Lagfiltret går via entitetstaggningen, inte via rubriktext. Den gamla
    // varianten (`title.ilike.%Djurgårdens IF%`) hittade 2 av 35 artiklar om
    // laget — allt som skrev "Djurgården", "DIF" eller bara nämnde klubben i
    // brödtexten föll bort. entity_ids är den kanoniska kopplingen och fylls av
    // athopia-os entity resolution.
    if (filters.teams && filters.teams.length > 0) {
      const { data: ents } = await supabase
        .from("entities")
        .select("id")
        .eq("type", "team")
        .or(
          filters.teams
            .map((t) => `name.eq.${t.replace(/[,()]/g, " ")},slug.eq.${t}`)
            .join(","),
        );
      const ids = (ents ?? []).map((e: { id: unknown }) => String(e.id));
      if (ids.length === 0) return { articles: [], total: 0 };
      q = q.overlaps("entity_ids", ids);
    }

    const { data, count } = await q;
    const rows = data ?? [];

    // news_feed exponerar entity_ids (uuid[]) men inte entities — utan denna
    // resolvning var lag-chipsen på /nyheter alltid tomma.
    const allIds = [...new Set(rows.flatMap((r: any) => (r.entity_ids as string[] | null) ?? []))];
    if (allIds.length > 0) {
      const { data: ents } = await supabase
        .from("entities")
        .select("id, name, slug, type")
        .in("id", allIds.slice(0, 300));
      const byId = new Map((ents ?? []).map((e: any) => [String(e.id), e]));
      for (const r of rows as any[]) {
        r.entities = ((r.entity_ids as string[] | null) ?? [])
          .map((id) => byId.get(String(id)))
          .filter((e: any) => e && e.type === "team" && e.slug);
      }
    }

    // Dedupa dubbletter (samma story_cluster_id, t.ex. samma händelse från
    // flera källor) innan render — annars visas samma story flera gånger.
    const deduped = dedupeByStoryCluster(
      rows,
      (r: any) => ({
        clusterId: r.story_cluster_id ?? null,
        title: r.title ?? null,
        publishedAt: r.published_at ?? null,
      }),
      (r: any) => Number(r.feed_score ?? r.importance_score ?? 0)
    );

    return { articles: deduped.map(mapArticle), total: count ?? 0 };
  } catch (e) { captureDbError(e);
    return { articles: [], total: 0 };
  }
}

export async function getActiveSources(): Promise<{ name: string; id: string }[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from("rss_sources")
      .select("id, name")
      .eq("active", true)
      .eq("sport", SPORT)
      .in("category", ["news"])
      .order("name", { ascending: true })
      .limit(100);
    return (data as { id: string; name: string }[]) ?? [];
  } catch (e) { captureDbError(e);
    return [];
  }
}

export async function getArticle(slug: string): Promise<Article | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = createServerClient();
    const { data } = await supabase.from("articles").select("*").eq("slug", slug).eq("sport", SPORT).maybeSingle();
    return data ? mapArticle(data) : null;
  } catch (e) { captureDbError(e);
    return null;
  }
}

// ── Matchanalys (post_match_analysis) — publicerade rader i articles ────────────
// Skrivs av athopia-os post-match-analysis-agenten till content_queue, godkänns i
// athopia-admin (generisk content_queue-approve → articles.status='published').
// slug är tom sträng ('') på dessa rader idag — routen använder id.

export interface PostMatchComparisonSide {
  team: string;
  opponent: string;
  score: string;
  current: {
    xg: number | null;
    pressure: number | null;
    possession: number | null;
    shots: number | null;
    shots_on_target: number | null;
  };
  readable: string[];
}

export interface PostMatchAnalysis {
  id: string;
  title: string;
  summary: string;
  body: string | null;
  sourceName: string;
  publishedAt: string;
  fixtureId: number | null;
  matchName: string | null;
  playedAt: string | null;
  comparisons: PostMatchComparisonSide[];
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapPostMatchAnalysis(row: Record<string, unknown>): PostMatchAnalysis {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const rawComparisons = Array.isArray(metadata.comparisons) ? metadata.comparisons : [];
  const comparisons: PostMatchComparisonSide[] = (rawComparisons as Record<string, unknown>[]).map((c) => {
    const current = (c.current ?? {}) as Record<string, unknown>;
    return {
      team: String(c.team ?? ""),
      opponent: String(c.opponent ?? ""),
      score: String(c.score ?? ""),
      current: {
        xg: numOrNull(current.xg),
        pressure: numOrNull(current.pressure),
        possession: numOrNull(current.possession),
        shots: numOrNull(current.shots),
        shots_on_target: numOrNull(current.shots_on_target),
      },
      readable: Array.isArray(c.readable) ? (c.readable as string[]) : [],
    };
  });

  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    summary: String(row.summary ?? ""),
    body: (row.content as string | null) ?? null,
    sourceName: String(row.source_name ?? "Nano Fotboll AI"),
    publishedAt: String(row.published_at ?? new Date().toISOString()),
    fixtureId: typeof metadata.fixture_id === "number" ? metadata.fixture_id : numOrNull(metadata.fixture_id),
    matchName: typeof metadata.match_name === "string" ? metadata.match_name : null,
    playedAt: typeof metadata.played_at === "string" ? metadata.played_at : null,
    comparisons,
  };
}

/** Publicerad matchanalys via id (slug är tom på dessa AI-genererade rader). */
export async function getPostMatchAnalysis(id: string): Promise<PostMatchAnalysis | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from("articles")
      .select("id,title,summary,content,source_name,published_at,metadata,sport,status")
      .eq("id", id)
      .eq("sport", SPORT)
      .eq("status", "published")
      .filter("metadata->>type", "eq", "post_match_analysis")
      .maybeSingle();
    return data ? mapPostMatchAnalysis(data as Record<string, unknown>) : null;
  } catch (e) { captureDbError(e);
    return null;
  }
}

/** Lista av publicerade matchanalyser, senaste först. */
export async function getPostMatchAnalyses(limit = 20): Promise<PostMatchAnalysis[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from("articles")
      .select("id,title,summary,content,source_name,published_at,metadata,sport,status")
      .eq("sport", SPORT)
      .eq("status", "published")
      .filter("metadata->>type", "eq", "post_match_analysis")
      .order("published_at", { ascending: false })
      .limit(limit);
    // Listan VISAR matchdatum men sorterades på publiceringsdatum, så ordningen
    // såg slumpmässig ut (11 juli, 11 juli, 4 juli, 6 juli, 5 juli). Sortera på
    // det som läsaren faktiskt ser; publiceringsdatum är reserv när matchdatum
    // saknas.
    return (data ?? [])
      .map((row) => mapPostMatchAnalysis(row as Record<string, unknown>))
      .sort((a, b) => {
        const at = new Date(a.playedAt ?? a.publishedAt ?? 0).getTime();
        const bt = new Date(b.playedAt ?? b.publishedAt ?? 0).getTime();
        return bt - at;
      });
  } catch (e) { captureDbError(e);
    return [];
  }
}

export const getNarratives = unstable_cache(
  async (limit = 12): Promise<Narrative[]> => {
    if (!isSupabaseConfigured()) return [];
    try {
      const supabase = createServerClient();
      const { data } = await supabase
        .from("narratives")
        .select("*")
        .eq("sport", SPORT)
        .order("importance_score", { ascending: false, nullsFirst: false })
        .limit(limit);
      return (data ?? []).map(mapNarrative);
    } catch (e) { captureDbError(e);
      return [];
    }
  },
  ["narratives", SPORT],
  { revalidate: 300, tags: ["narratives"] }
);

export async function getEntities(type?: Entity["type"]): Promise<Entity[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createServerClient();
    let q = supabase.from("entities").select("*").order("name", { ascending: true }).limit(100);
    if (type) q = q.eq("type", type);
    // Visa bara Allsvenskan-lag (ej landslag, Camp Sweden, etc.)
    if (type === "team") q = (q as any).eq("sport", SPORT).eq("metadata->>league", vertical.leagueEntity);
    const { data } = await q;
    return (data ?? []).map(mapEntity);
  } catch (e) { captureDbError(e);
    return [];
  }
}

export const getPodcasts = unstable_cache(
  async (limit = 24): Promise<Podcast[]> => {
    if (!isSupabaseConfigured()) return [];
    try {
      const supabase = createServerClient();
      const { data } = await supabase
        .from("podcasts")
        .select("*")
        .order("published_at", { ascending: false })
        .limit(limit);
      return (data ?? []).map(mapPodcast);
    } catch (e) { captureDbError(e);
      return [];
    }
  },
  ["podcasts"],
  { revalidate: 600, tags: ["podcasts"] }
);

export async function getPodcast(id: string): Promise<Podcast | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = createServerClient();
    const { data } = await supabase.from("podcasts").select("*").eq("id", id).maybeSingle();
    return data ? mapPodcast(data) : null;
  } catch (e) { captureDbError(e);
    return null;
  }
}

export async function getPodcastChunks(podcastId: string): Promise<PodcastChunk[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from("podcast_chunks")
      .select("*")
      .eq("podcast_id", podcastId)
      .order("start_seconds", { ascending: true })
      .limit(500);
    return (data ?? []).map(mapPodcastChunk);
  } catch (e) { captureDbError(e);
    return [];
  }
}

/** Kuraterade poddavsnitt för lag/match — copyright-säkert (metadata only). */
async function fetchPodcastSignalsForEntities(
  entityKey: string,
  namesJson: string,
  limit: number
): Promise<PodcastEpisodeSignal[]> {
  if (!isSupabaseConfigured() || !entityKey) return [];
  const entityIds = entityKey.split(",").filter(Boolean);
  const teamNames = (JSON.parse(namesJson) as string[]) ?? [];
  const nameLower = teamNames.map((n) => n.toLowerCase()).filter((n) => n.length > 2);

  try {
    const supabase = createServerClient();
    const { data: pods } = await supabase
      .from("podcasts")
      .select("id, title, show_name, published_at, entity_ids, mentioned_teams, metadata, audio_url")
      .order("published_at", { ascending: false })
      .limit(24);

    if (!pods?.length) return [];

    type PodRow = {
      id: string;
      title: string;
      show_name: string | null;
      published_at: string | null;
      entity_ids: string[] | null;
      mentioned_teams: string[] | null;
      metadata: Record<string, unknown> | null;
      audio_url: string | null;
    };

    const entitySet = new Set(entityIds);
    const ranked = (pods as PodRow[])
      .map((pod) => {
        const meta = (pod.metadata ?? {}) as Record<string, unknown>;
        const topics = Array.isArray(meta.topics) ? (meta.topics as string[]) : [];
        const listen = listenMetaFromRow(meta, null, pod.audio_url);
        const overlap = (pod.entity_ids ?? []).some((id) => entitySet.has(id));
        const titleLower = pod.title.toLowerCase();
        const teamMatch =
          nameLower.some((n) => titleLower.includes(n)) ||
          (pod.mentioned_teams ?? []).some((t) => nameLower.includes(t.toLowerCase()));
        const topicMatch = topics.some((t) =>
          nameLower.some((n) => t.toLowerCase().includes(n))
        );
        const score = (overlap ? 4 : 0) + (teamMatch ? 2 : 0) + (topicMatch ? 1 : 0);
        return { pod, listen, topics, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);

    return ranked.slice(0, limit).map(({ pod, listen, topics }) => ({
      id: String(pod.id),
      title: String(pod.title ?? ""),
      showName: String(pod.show_name ?? "Podcast"),
      publishedAt: pod.published_at ?? null,
      listenUrl: listen.listenUrl,
      spotifyEpisodeId: listen.spotifyEpisodeId,
      spotifyShowId: listen.spotifyShowId,
      topics,
      mentionedTeams: pod.mentioned_teams ?? [],
    }));
  } catch (e) {
    captureDbError(e);
    return [];
  }
}

const getPodcastSignalsCached = unstable_cache(
  fetchPodcastSignalsForEntities,
  ["podcast-signals-entities"],
  { revalidate: 300, tags: ["podcasts"] }
);

export async function getPodcastSignalsForEntities(
  entityIds: string[],
  opts: { limit?: number; teamNames?: string[] } = {}
): Promise<PodcastEpisodeSignal[]> {
  if (entityIds.length === 0) return [];
  const entityKey = [...entityIds].sort().join(",");
  return getPodcastSignalsCached(entityKey, JSON.stringify(opts.teamNames ?? []), opts.limit ?? 3);
}

/** @deprecated Use getPodcastSignalsForEntities — clips exposed transcript/audio (removed). */
export async function getPodcastClipsForEntities(
  entityIds: string[],
  opts?: { limit?: number; teamNames?: string[] }
): Promise<PodcastEpisodeSignal[]> {
  return getPodcastSignalsForEntities(entityIds, opts);
}

export async function searchEmbeddings(query: string, sourceType?: string): Promise<Article[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createServerClient();
    // Placeholder: textsökning tills embedding-pipeline är klar.
    let q = supabase
      .from("articles")
      .select("*")
      .eq("sport", SPORT)
      .ilike("title", `%${query}%`)
      .order("published_at", { ascending: false })
      .limit(20);
    if (sourceType) q = q.eq("source_type", sourceType);
    const { data } = await q;
    return (data ?? []).map(mapArticle);
  } catch (e) { captureDbError(e);
    return [];
  }
}

export async function getContentQueue(status?: string): Promise<ContentQueueItem[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createServerClient();
    let q = supabase.from("content_queue").select("*").order("created_at", { ascending: false }).limit(200);
    if (status) q = q.eq("status", status);
    const { data } = await q;
    return (data ?? []) as ContentQueueItem[];
  } catch (e) { captureDbError(e);
    return [];
  }
}

export async function getAgentLogs(limit = 100): Promise<AgentLog[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createServerClient();
    const { data } = await supabase.from("agent_logs").select("*").order("created_at", { ascending: false }).limit(limit);
    return (data ?? []) as AgentLog[];
  } catch (e) { captureDbError(e);
    return [];
  }
}

// NewsStream/NewsItem och getNewsStream togs bort 2026-08-09: inget importerade
// dem, och NewsItem renderade källans `summary` som teaser utan att gå via
// rättighetsgrinden (canPublishBody) som den levande flödesvägen använder.
// Levande väg: lib/feed/build-feed-modules.ts.

export async function getTeamPushPopups(teamEntityIds: string[], limit = 5): Promise<TeamPushPopup[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createServerClient();
    let q = supabase
      .from("team_push_popups")
      .select("*")
      .order("feed_score", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(limit);
    if (teamEntityIds.length > 0) q = q.in("team_entity_id", teamEntityIds);

    const { data } = await q;

    // Dedupe: samma story kan ligga i flera rader (en per push-batch)
    const seen = new Set<string>();
    const unique = (data ?? []).filter((row: any) => {
      const key = String(row.story_key ?? row.title ?? row.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return unique.map((row: any) => ({
      id: String(row.id),
      articleId: row.article_id ?? null,
      storyKey: String(row.story_key ?? ""),
      sport: String(row.sport ?? SPORT),
      teamEntityId: row.team_entity_id ?? null,
      title: String(row.title ?? ""),
      body: String(row.body ?? ""),
      url: row.url ?? null,
      importanceScore: row.importance_score ?? null,
      feedScore: row.feed_score ?? null,
      eventType: row.event_type ?? null,
      newsTag: row.news_tag ?? null,
      sourceName: row.source_name ?? null,
      createdAt: String(row.created_at ?? new Date().toISOString()),
    }));
  } catch (e) { captureDbError(e);
    return [];
  }
}

async function fetchTeamEntityInsights(teamEntityId: string, limit = 3): Promise<EntityInsight[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from("published_entity_insights")
      .select("*")
      .eq("entity_id", teamEntityId)
      .eq("sport", SPORT)
      .order("confidence", { ascending: false, nullsFirst: false })
      .order("generated_at", { ascending: false })
      // Se dedupeInsightsByTitle: generatorn skriver identiska rader dagligen.
      // Med confidence som primär sortering hamnade tre exemplar av samma
      // analys (0.950) överst, och laghubben renderade samma kort två gånger.
      .limit(Math.max(limit * 4, 12));

    return dedupeInsightsByTitle((data ?? []).map(mapEntityInsight)).slice(0, limit);
  } catch (e) { captureDbError(e);
    return [];
  }
}

// Cache-nyckeln inkluderar teamEntityId — annars delar alla lag samma slot
// (samma buggklass som lib/dashboard/queries.ts getTeamNews).
export async function getTeamEntityInsights(teamEntityId: string, limit = 3): Promise<EntityInsight[]> {
  return unstable_cache(fetchTeamEntityInsights, ["team-entity-insights", teamEntityId], {
    revalidate: 120,
    tags: ["entity-insights"],
  })(teamEntityId, limit);
}

async function fetchTeamAnalysis(teamEntityId: string, limit: number): Promise<EntityInsight[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from("published_entity_insights")
      .select("*")
      .eq("entity_id", teamEntityId)
      .eq("sport", SPORT)
      // Kronologiskt, till skillnad från getTeamEntityInsights som sorterar på
      // confidence. Analysytan är en tidslinje — "senaste analyserna" måste vara
      // senaste, annars ligger en gammal högkonfidensanalys kvar i toppen.
      .order("generated_at", { ascending: false })
      // Generatorn i athopia-os skriver en ny rad varje dygn även när slutsatsen
      // är oförändrad — Djurgården hade tre identiska rader med samma rubrik och
      // samma konfidens. Utan dedup renderades samma analys två gånger på
      // laghubben. Hämta med marginal och vaska fram de unika.
      .limit(Math.max(limit * 4, 12));

    return dedupeInsightsByTitle((data ?? []).map(mapEntityInsight)).slice(0, limit);
  } catch (e) {
    captureDbError(e);
    return [];
  }
}

/**
 * Behåller den senaste av varje rubrik. Raderna kommer redan sorterade
 * kronologiskt, så första förekomsten är den färskaste.
 */
function dedupeInsightsByTitle(insights: EntityInsight[]): EntityInsight[] {
  const sedda = new Set<string>();
  const unika: EntityInsight[] = [];
  for (const i of insights) {
    const nyckel = (i.title ?? "").trim().toLowerCase();
    if (!nyckel || sedda.has(nyckel)) continue;
    sedda.add(nyckel);
    unika.push(i);
  }
  return unika;
}

/** Hela analyshistoriken för ett lag, senaste först. Driver /lag/[slug]/analys. */
export async function getTeamAnalysis(teamEntityId: string, limit = 40): Promise<EntityInsight[]> {
  return unstable_cache(fetchTeamAnalysis, ["team-analysis", teamEntityId], {
    revalidate: 120,
    tags: ["entity-insights"],
  })(teamEntityId, limit);
}

async function fetchArticleRefs(
  ids: string[],
): Promise<{ id: string; title: string; slug: string | null; sourceName: string | null }[]> {
  if (!isSupabaseConfigured() || ids.length === 0) return [];
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from("articles")
      .select("id, title, slug, source_name")
      .eq("sport", SPORT)
      .in("id", ids.slice(0, 20));

    return (data ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id),
      title: String(r.title ?? ""),
      slug: r.slug ? String(r.slug) : null,
      sourceName: r.source_name ? String(r.source_name) : null,
    }));
  } catch (e) {
    captureDbError(e);
    return [];
  }
}

/**
 * Källartiklarna bakom en analys — transparenskravet i produktbriefen.
 * Utan dem är en insikt en påstående utan underlag.
 */
export async function getArticleRefs(ids: string[]) {
  if (ids.length === 0) return [];
  return fetchArticleRefs(ids);
}

async function fetchTeamDailyPulse(teamEntityId: string): Promise<TeamDailyPulse | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from("published_team_daily_pulses")
      .select("*")
      .eq("team_entity_id", teamEntityId)
      .eq("sport", SPORT)
      .order("pulse_date", { ascending: false })
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return data ? mapTeamDailyPulse(data) : null;
  } catch (e) { captureDbError(e);
    return null;
  }
}

export async function getTeamDailyPulse(teamEntityId: string): Promise<TeamDailyPulse | null> {
  return unstable_cache(fetchTeamDailyPulse, ["team-daily-pulse", teamEntityId], {
    revalidate: 120,
    tags: ["team-daily-pulse"],
  })(teamEntityId);
}
