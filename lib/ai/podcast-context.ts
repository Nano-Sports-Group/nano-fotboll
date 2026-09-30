/**
 * Läsvägen för poddavsnitt. Web GENERERAR inte — sammanfattningen skrivs av
 * athopia-os (`packages/ai-core/src/lib/podcast-summary.ts` via
 * podcast-processor och backfill-skriptet) till
 * `podcasts.metadata.athopia_summary`. Här läses bara cachen.
 *
 * Founderbeslut 2026-09-17: LLM-nycklar hör hemma i os, aldrig i web. Den
 * gamla on-demand-genereringen här kunde därför aldrig fungera i produktion
 * (ANTHROPIC_API_KEY är tom i alla Vercel-miljöer) och är borta.
 */
import "server-only";

import { createClient } from "@supabase/supabase-js";
import { excerptAround } from "@/lib/podcast/rights";
import {
  asMetadataRecord,
  parseAthopiaSummary,
  type AthopiaPodcastSummary,
} from "@/lib/podcast/summary";
import { SPORT } from "@/lib/vertical";

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export type PodcastEpisodeRecord = {
  id: string;
  title: string;
  showName: string | null;
  publishedAt: string | null;
  mentionedTeams: string[];
  topics: string[];
  isTranscribed: boolean;
  summary: AthopiaPodcastSummary | null;
  hasSource: boolean;
};

type PodcastRow = {
  id: string;
  title: string;
  show_name: string | null;
  published_at: string | null;
  mentioned_teams: string[] | null;
  metadata: unknown;
  is_transcribed: boolean;
  transcript: string | null;
};

export async function loadPodcastEpisode(episodeId: string): Promise<PodcastEpisodeRecord | null> {
  const db = getDb();
  const { data } = await db
    .from("podcasts")
    .select("id, title, show_name, published_at, mentioned_teams, metadata, is_transcribed, rss_sources!inner(sport)")
    .eq("rss_sources.sport", SPORT)
    .eq("id", episodeId)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as PodcastRow;
  const meta = asMetadataRecord(row.metadata);
  const topics = Array.isArray(meta.topics)
    ? meta.topics.filter((t): t is string => typeof t === "string")
    : [];

  const { count } = await db
    .from("podcast_chunks")
    .select("id", { count: "exact", head: true })
    .eq("podcast_id", episodeId);

  return {
    id: row.id,
    title: row.title,
    showName: row.show_name,
    publishedAt: row.published_at,
    mentionedTeams: row.mentioned_teams ?? [],
    topics,
    isTranscribed: row.is_transcribed,
    summary: parseAthopiaSummary(row.metadata),
    hasSource: (count ?? 0) > 0 || row.is_transcribed,
  };
}

export async function searchEpisodeChunks(
  episodeId: string,
  query: string,
): Promise<{ quote: string; startSeconds: number | null }[]> {
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return [];
  const db = getDb();
  const { data } = await db
    .from("podcast_chunks")
    .select("text, start_seconds")
    .eq("podcast_id", episodeId)
    // Modellstyrd sökterm: % _ \ är ilike-jokrar och ska matchas bokstavligt.
    .ilike("text", `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
    .limit(6);

  return ((data ?? []) as { text: string; start_seconds: number | null }[]).map((row) => ({
    quote: excerptAround(row.text, q),
    startSeconds: row.start_seconds,
  }));
}

