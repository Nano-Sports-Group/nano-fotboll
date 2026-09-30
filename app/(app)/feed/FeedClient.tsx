"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import {
  Newspaper,
  MessageSquare,
  Brain,
  Podcast,
  Loader2,
  RefreshCw,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { useFavoriteTeam } from "@/hooks/useFavoriteTeam";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { FeedPaywallBanner } from "@/components/FeedPaywallBanner";
import { ProductEventTracker } from "@/components/analytics/ProductEventTracker";
import { usePullRefresh } from "@/hooks/usePullRefresh";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { FeedSourceBadge } from "@/components/feed/FeedSourceBadge";
import type { FeedItem, FeedItemType } from "@/lib/types";

// ─── Meta ────────────────────────────────────────────────────────────────────

// color = yta (chip-tint), ink = bläck (ikon + etikett ovanpå tinten)
const TYPE_META: Record<FeedItemType, { label: string; color: string; ink: string; icon: React.ElementType }> = {
  news:    { label: "Nyhet",     color: "var(--color-pitch)",       ink: "var(--color-pitch-ink)",       icon: Newspaper },
  forum:   { label: "Forum",     color: "var(--color-cat-forum)",   ink: "var(--color-cat-forum-ink)",   icon: MessageSquare },
  summary: { label: "AI-analys", color: "var(--color-cat-summary)", ink: "var(--color-cat-summary-ink)", icon: Brain },
  podcast: { label: "Podcast",   color: "var(--color-cat-podcast)", ink: "var(--color-cat-podcast-ink)", icon: Podcast },
};

type FilterType = "all" | FeedItemType;

const FILTERS: { key: FilterType; label: string }[] = [
  { key: "all",     label: "Allt"      },
  { key: "news",    label: "Nyheter"   },
  { key: "summary", label: "AI-analys" },
  { key: "forum",   label: "Forum"     },
  { key: "podcast", label: "Podcast"   },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just nu";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// ─── AI Summary Card ─────────────────────────────────────────────────────────

function AISummaryCard({ item }: { item: FeedItem }) {
  return (
    <Link
      href={item.href}
      className="group block rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/8 to-amber-600/4 p-4 transition-colors hover:bg-amber-500/12 active:bg-amber-500/16 touch-manipulation"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wide text-amber-400">
          AI-analys
        </span>
        <span className="text-xs text-muted-foreground ml-auto">{timeAgo(item.time)}</span>
      </div>
      <p className="text-sm font-semibold text-foreground group-hover:text-amber-300 transition-colors line-clamp-3 leading-snug">
        {item.title}
      </p>
      {item.subtitle && (
        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{item.subtitle}</p>
      )}
      <div className="flex items-center gap-1 mt-3 text-xs text-amber-400/70">
        <span>Läs analys</span>
        <ChevronRight className="w-3 h-3" />
      </div>
    </Link>
  );
}

// ─── Carousel Card ────────────────────────────────────────────────────────────

function CarouselCard({
  item,
  index,
  showCluster,
}: {
  item: FeedItem;
  index: number;
  showCluster?: boolean;
}) {
  return (
    <Link
      href={item.href}
      className="group shrink-0 w-[78vw] max-w-[300px] snap-start rounded-2xl border border-border bg-card p-4 flex flex-col justify-between min-h-[120px] touch-manipulation active:bg-muted transition-colors"
    >
      <div>
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <span className="text-xs font-bold text-pitch-ink uppercase tracking-wide">
            #{index + 1}
          </span>
          {(item.sourceCount ?? 0) > 1 || item.importanceTier === "breaking" || item.importanceTier === "major" ? (
            <FeedSourceBadge
              sourceCount={item.sourceCount}
              importanceTier={item.importanceTier}
              showCluster={showCluster}
            />
          ) : item.source ? (
            <>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground truncate">{item.source}</span>
            </>
          ) : null}
        </div>
        <p className="text-sm font-semibold text-foreground line-clamp-3 leading-snug group-hover:text-pitch-ink transition-colors">
          {item.title}
        </p>
      </div>
      <p className="text-xs text-muted-foreground mt-3">{timeAgo(item.time)}</p>
    </Link>
  );
}

function TopNewsCarousel({ items, showCluster }: { items: FeedItem[]; showCluster?: boolean }) {
  if (items.length === 0) return null;
  return (
    <div className="-mx-4 sm:-mx-6">
      <div className="flex items-center justify-between px-4 sm:px-6 mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground text-balance">
          Topbnyheter
        </h2>
        <span className="text-xs text-muted-foreground/50">Swipa →</span>
      </div>
      <div
        className="flex gap-3 overflow-x-auto px-4 sm:px-6 pb-2 snap-x snap-mandatory scroll-smooth"
        style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
      >
        {items.map((item, i) => (
          <CarouselCard key={item.id} item={item} index={i} showCluster={showCluster} />
        ))}
        {/* Trailing spacer so last card isn't flush to edge */}
        <div className="shrink-0 w-4" aria-hidden />
      </div>
    </div>
  );
}

// ─── Filter Tabs ─────────────────────────────────────────────────────────────

function FilterTabs({
  active,
  onChange,
}: {
  active: FilterType;
  onChange: (f: FilterType) => void;
}) {
  return (
    <div
      className="-mx-4 sm:-mx-6 overflow-x-auto"
      style={{ scrollbarWidth: "none" } as React.CSSProperties}
    >
      <div className="flex gap-2 px-4 sm:px-6 pb-1">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={[
              "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors touch-manipulation",
              active === key
                ? "bg-pitch text-white"
                : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-pitch/40",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Feed Item Card ───────────────────────────────────────────────────────────

function FeedItemCard({ item, showCluster }: { item: FeedItem; showCluster?: boolean }) {
  const meta = TYPE_META[item.type];
  const Icon = meta.icon;

  return (
    <Link
      href={item.href}
      className="group flex items-start gap-3 bg-card hover:bg-card/80 active:bg-muted border border-border rounded-xl p-4 transition-colors touch-manipulation"
    >
      <div
        className="mt-0.5 shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
        style={{ backgroundColor: meta.color + "20" }}
      >
        <Icon className="w-4 h-4" style={{ color: meta.ink }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: meta.ink }}>
            {meta.label}
          </span>
          <span className="text-xs text-muted-foreground">{timeAgo(item.time)}</span>
          {(item.sourceCount ?? 0) <= 1 && item.source && (
            <>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground truncate">{item.source}</span>
            </>
          )}
        </div>
        {(item.sourceCount ?? 0) > 1 || item.importanceTier === "breaking" || item.importanceTier === "major" ? (
          <div className="mb-1.5">
            <FeedSourceBadge
              sourceCount={item.sourceCount}
              importanceTier={item.importanceTier}
              showCluster={showCluster}
            />
          </div>
        ) : null}
        <p className="text-sm font-medium text-foreground group-hover:text-pitch-ink transition-colors line-clamp-2">
          {item.title}
        </p>
        {item.subtitle && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.subtitle}</p>
        )}
      </div>
    </Link>
  );
}

const SOFT_PAYWALL_AFTER = 8; // inject banner after this many items

function FeedList({
  items,
  showUpsell,
  showCluster,
}: {
  items: FeedItem[];
  /** Free-användare: mjuk PRO-upsell mitt i flödet — blockerar inget (gaten togs bort 2026-07-10). */
  showUpsell: boolean;
  showCluster?: boolean;
}) {
  const splitAt = showUpsell && items.length > SOFT_PAYWALL_AFTER ? SOFT_PAYWALL_AFTER : -1;

  return (
    <div className="flex flex-col gap-3">
      {items.map((item, i) => (
        <div key={item.id} className="contents">
          {i === splitAt && <FeedPaywallBanner />}
          <FeedItemCard item={item} showCluster={showCluster} />
        </div>
      ))}
    </div>
  );
}

const NEW_POLL_INTERVAL_MS = 90_000;

// ─── API types ────────────────────────────────────────────────────────────────

interface HeroData {
  summary: FeedItem | null;
  topNews: FeedItem[];
}

interface FeedResponse {
  items: FeedItem[];
  hasMore: boolean;
  gated: boolean;
  remainingToday?: number | null;
  isPro?: boolean;
  isElite?: boolean;
}

async function fetchHero(teamSlug: string | null): Promise<HeroData> {
  const qs = new URLSearchParams();
  if (teamSlug) qs.set("team", teamSlug);
  const res = await fetch(`/api/feed/hero?${qs.toString()}`, { cache: "no-store" });
  if (!res.ok) return { summary: null, topNews: [] };
  return (await res.json()) as HeroData;
}

async function fetchFeedPage(teamSlug: string | null, offset: number): Promise<FeedResponse> {
  const qs = new URLSearchParams({ offset: String(offset) });
  if (teamSlug) qs.set("team", teamSlug);
  const res = await fetch(`/api/feed?${qs.toString()}`, { cache: "no-store" });
  if (!res.ok) return { items: [], hasMore: false, gated: false };
  return (await res.json()) as FeedResponse;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function FeedClient({ forceTeam }: { forceTeam?: string } = {}) {
  const { slug: favSlug, isLoaded, needsOnboarding } = useFavoriteTeam();
  const slug = forceTeam ?? favSlug;

  // Hero (AI summary + top 5 news)
  const [hero, setHero] = useState<HeroData | null>(null);
  const [heroLoading, setHeroLoading] = useState(true);

  // Main feed
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const [isPro, setIsPro] = useState(true); // optimistiskt — upsell blinkar inte in för betalande
  const [isElite, setIsElite] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");

  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Hero load ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoaded) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- startar en hämtning; laddnings-/felflaggan sätts synkront innan fetch (synk mot externt system).
    setHeroLoading(true);
    void fetchHero(slug).then((data) => {
      setHero(data);
      setHeroLoading(false);
    });
  }, [isLoaded, slug]);

  // ── Main feed load ─────────────────────────────────────────────────────────
  const load = useCallback(
    async (reset = false) => {
      const currentOffset = reset ? 0 : offset;
      if (reset) setLoading(true);
      else setLoadingMore(true);

      // Consume prefetch from onboarding if available and fresh
      if (reset) {
        try {
          const raw = sessionStorage.getItem("prefetch_feed");
          if (raw) {
            sessionStorage.removeItem("prefetch_feed");
            const cached = JSON.parse(raw) as { slug: string; data: FeedResponse; ts: number };
            if (cached.slug === slug && Date.now() - cached.ts < 30_000) {
              setItems(cached.data.items ?? []);
              setOffset((cached.data.items ?? []).length);
              setHasMore(cached.data.hasMore ?? false);
              setIsPro(cached.data.isPro ?? false);
              setIsElite(cached.data.isElite ?? false);
              setLoading(false);
              setLoadingMore(false);
              return;
            }
          }
        } catch {}
      }

      const { items: newItems, hasMore: more, isPro: pro, isElite: elite } =
        await fetchFeedPage(slug, currentOffset);

      if (reset) {
        setItems(newItems);
        setOffset(newItems.length);
        setNewCount(0);
      } else {
        setItems((prev) => {
          const ids = new Set(prev.map((i) => i.id));
          return [...prev, ...newItems.filter((i) => !ids.has(i.id))];
        });
        setOffset((o) => o + newItems.length);
      }

      setIsPro(pro ?? false);
      setIsElite(elite ?? false);
      setHasMore(more);
      setLoading(false);
      setLoadingMore(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slug, offset],
  );

  useEffect(() => {
    if (!isLoaded) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- startar en hämtning; laddnings-/felflaggan sätts synkront innan fetch (synk mot externt system).
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, slug]);

  // Ny-artikel-detektor: pollar CDN-cachad endpoint istället för Realtime
  // (ingen öppen WebSocket, ingen WAL-decode → lägre Supabase-usage).
  useEffect(() => {
    let cancelled = false;
    let baseline: string | null = null;

    async function check() {
      try {
        const res = await fetch("/api/articles/recent", { cache: "no-store" });
        if (!res.ok) return;
        const { latest } = (await res.json()) as { latest: string | null };
        if (cancelled || !latest) return;
        if (baseline === null) baseline = latest;
        else if (latest > baseline) setNewCount((n) => Math.max(n, 1));
      } catch { /* tyst */ }
    }

    void check();
    const id = setInterval(check, NEW_POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // ── Infinite scroll ────────────────────────────────────────────────────────
  // `rootMargin` är hela poängen: nästa batch hämtas ~1,5 skärmar innan
  // sentinelen är synlig, så användaren aldrig ser en spinner i botten
  // (mobil UX-regel 17). Utan den triggar hämtningen först när scrollen
  // redan tagit slut.
  useEffect(() => {
    if (!bottomRef.current || loadingMore || !hasMore) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry?.isIntersecting) void load(); },
      { rootMargin: "0px 0px 150% 0px", threshold: 0 },
    );
    obs.observe(bottomRef.current);
    return () => obs.disconnect();
  }, [loadingMore, hasMore, load]);

  // Pull-to-refresh går genom app-shellens enda gesthanterare.
  usePullRefresh(async () => {
    await load(true);
    await fetchHero(slug).then(setHero);
  });

  // Tillbaka till flödet landar på samma rad, inte i toppen (regel 16).
  useScrollRestoration(`feed:${slug ?? "all"}`, !loading && items.length > 0);

  if (!isLoaded) return null;

  const teamLabel = slug ? slug.replace(/-/g, " ").toUpperCase() : "ALLSVENSKAN";

  const visibleItems =
    filter === "all" ? items : items.filter((i) => i.type === filter);

  return (
    <>
      <ProductEventTracker event="feed_open" props={{ team: slug ?? "all" }} />
      <ProductEventTracker event="feed_first_view" props={{ team: slug ?? "all" }} once="feed_first_view" />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-bold text-4xl text-foreground leading-none text-balance">MITT FEED</h1>
            <p className="text-sm text-muted-foreground mt-1">{teamLabel}</p>
          </div>
          {!needsOnboarding && (
            <Link
              href="/onboarding"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Byt lag
            </Link>
          )}
        </div>

        {/* New articles badge */}
        {newCount > 0 && (
          <button
            onClick={() => { void load(true); void fetchHero(slug).then(setHero); }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-pitch/10 border border-pitch/30 text-sm text-pitch-ink hover:bg-pitch/20 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            {newCount} ny{newCount > 1 ? "a" : ""} artikel{newCount > 1 ? "ar" : ""}
          </button>
        )}

        {/* AI Summary */}
        {heroLoading ? (
          <div className="h-[130px] rounded-2xl bg-card border border-border skeleton-wave" />
        ) : hero?.summary ? (
          <AISummaryCard item={hero.summary} />
        ) : null}

        {/* Top News Carousel */}
        {heroLoading ? (
          <div className="-mx-4 sm:-mx-6">
            <div className="flex gap-3 px-4 sm:px-6 overflow-hidden">
              {[0, 1, 2].map((i) => (
                <div key={i} className="shrink-0 w-[78vw] max-w-[300px] h-[120px] rounded-2xl bg-card border border-border skeleton-wave" />
              ))}
            </div>
          </div>
        ) : (hero?.topNews ?? []).length > 0 ? (
          <TopNewsCarousel items={hero!.topNews} showCluster={isElite} />
        ) : null}

        {/* Filter tabs */}
        <FilterTabs active={filter} onChange={(f) => setFilter(f)} />

        {/* Main feed */}
        {loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-card border border-border skeleton-wave" />
            ))}
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-sm">Inga{filter !== "all" ? ` ${FILTERS.find((f) => f.key === filter)?.label.toLowerCase()}-` : " "}items ännu.</p>
          </div>
        ) : (
          <FeedList items={visibleItems} showUpsell={!isPro} showCluster={isElite} />
        )}

        <div ref={bottomRef} className="h-4" />

        {loadingMore && (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!hasMore && visibleItems.length > 0 && (
          <p className="text-center text-xs text-muted-foreground py-4">Inga fler items</p>
        )}
      </div>
    </>
  );
}
