/**
 * Klient mot Nano Podcast API (repo nano-podcast, podcast-api.nanosport.se).
 * Kontraktet är nano-podcast/openapi.json. Katalogen är publik; sammanfattningar
 * och frågor kräver användarens Clerk-token (vidarebefordras av /api/podd/...).
 *
 * Upphovsrätt: API:t lämnar aldrig ut hela transkript. Vi visar egna artiklar,
 * sammanfattningar och utdrag om max 25 ord med källa — aldrig mer.
 */
import { SPORT } from "@/lib/vertical";

export const PODCAST_API_URL = (
  process.env.NANO_PODCAST_API_URL ?? "https://podcast-api.nanosport.se"
).replace(/\/$/, "");

export type PodEpisode = {
  id: string;
  podcastId: string;
  title: string;
  description: string | null;
  publishedAt: string | null;
  durationMs: number | null;
  artworkUrl: string | null;
  episodeUrl: string | null;
  processing: {
    state: string;
    transcriptAvailable: boolean;
    searchable: boolean;
  };
};
export type PodLatestEpisode = PodEpisode & {
  podcast: { id: string; title: string; artworkUrl: string | null };
};
export type PodShow = {
  id: string;
  title: string;
  publisher: string | null;
  artworkUrl: string | null;
  websiteUrl: string | null;
  aiFeaturesAvailable: boolean;
  sport: string | null;
};
export type PodArticle = {
  headline: string;
  dek: string;
  body: string;
  quotes: Array<{ text: string; startMs: number; speaker: string | null }>;
  attribution: {
    podcastTitle: string;
    publisher: string | null;
    episodeTitle: string;
    url: string | null;
    publishedAt: string | null;
  };
};
export type PodSummary = {
  type: string;
  status: "pending" | "generating" | "ready" | "failed";
  result: Record<string, unknown> | null;
  error: { code: string; message: string } | null;
};
export type PodAnswer = {
  conversationId: string;
  message: {
    content: string;
    insufficientEvidence: boolean;
    evidence: Array<{ startMs: number; excerpt: string }>;
  };
};

/** Publik katalogläsning, ISR-cachad. null = API nere eller 404 (sidan visar tomt läge). */
async function getPublic<T>(path: string, revalidate = 300): Promise<T | null> {
  try {
    const res = await fetch(`${PODCAST_API_URL}${path}`, {
      next: { revalidate },
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function latestEpisodes(limit = 40): Promise<PodLatestEpisode[]> {
  const r = await getPublic<{ items: PodLatestEpisode[] }>(
    `/v1/episodes?sport=${SPORT}&limit=${limit}`,
    120,
  );
  return r?.items ?? [];
}

export async function listShows(): Promise<PodShow[]> {
  const r = await getPublic<{ items: PodShow[] }>(
    `/v1/podcasts?sport=${SPORT}&limit=100`,
    3600,
  );
  return r?.items ?? [];
}

export const getShow = (id: string) =>
  getPublic<PodShow>(`/v1/podcasts/${encodeURIComponent(id)}`);
export const getEpisode = (id: string) =>
  getPublic<PodEpisode>(`/v1/episodes/${encodeURIComponent(id)}`);

/** Användaranrop: token från Clerk-sessionen, aldrig från klienten. Status och kropp skickas vidare oförändrade. */
export async function callAsUser(
  token: string,
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${PODCAST_API_URL}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

export function formatClock(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
