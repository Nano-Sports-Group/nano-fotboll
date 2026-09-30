import { SPORT } from "@/lib/vertical";
import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { MessageSquare, Flame, TrendingUp } from "lucide-react";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { ForumSummaryPopupGate } from "@/components/ForumSummaryPopupGate";

export const metadata: Metadata = {
  title: "Forum — Allsvenskan",
  description: "Diskutera Allsvenskan med supportrar från alla 16 lag.",
};

export const dynamic = "force-dynamic";

const ALLSVENSKAN: { slug: string; name: string; abbr: string }[] = [
  { slug: "aik",             name: "AIK",             abbr: "AIK" },
  { slug: "bk-hacken",       name: "BK Häcken",       abbr: "HÄC" },
  { slug: "degerfors-if",    name: "Degerfors IF",    abbr: "DEG" },
  { slug: "djurgardens-if",  name: "Djurgårdens IF",  abbr: "DJU" },
  { slug: "gais",            name: "GAIS",            abbr: "GAI" },
  { slug: "halmstads-bk",    name: "Halmstads BK",    abbr: "HBK" },
  { slug: "hammarby-if",     name: "Hammarby IF",     abbr: "BAJ" },
  { slug: "helsingborgs-if", name: "Helsingborgs IF", abbr: "HIF" },
  { slug: "if-elfsborg",     name: "IF Elfsborg",     abbr: "ELF" },
  { slug: "ifk-goteborg",    name: "IFK Göteborg",    abbr: "IFG" },
  { slug: "ifk-norrkoping",  name: "IFK Norrköping",  abbr: "IFN" },
  { slug: "ifk-varnamo",     name: "IFK Värnamo",     abbr: "VÄR" },
  { slug: "kalmar-ff",       name: "Kalmar FF",       abbr: "KFF" },
  { slug: "malmo-ff",        name: "Malmö FF",        abbr: "MFF" },
  { slug: "mjallby-aif",     name: "Mjällby AIF",     abbr: "MJÄ" },
  { slug: "vasteras-sk",     name: "Västerås SK",     abbr: "VSK" },
];

interface TeamStats {
  slug: string;
  postCount: number;
  lastActivity: string | null;
  hotScore: number;
}

async function getTeamStats(): Promise<Map<string, TeamStats>> {
  const map = new Map<string, TeamStats>();
  if (!isSupabaseConfigured()) return map;
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from("forum_posts")
      .select("team_slug, created_at, hot_score")
      .eq("sport", SPORT)
      .eq("status", "published")
      .is("parent_id", null)
      .order("created_at", { ascending: false })
      .limit(500);

    for (const row of (data ?? []) as any[]) {
      const slug = row.team_slug as string;
      if (!slug) continue;
      const existing = map.get(slug);
      if (!existing) {
        map.set(slug, { slug, postCount: 1, lastActivity: row.created_at, hotScore: row.hot_score ?? 0 });
      } else {
        map.set(slug, {
          ...existing,
          postCount: existing.postCount + 1,
          hotScore: Math.max(existing.hotScore, row.hot_score ?? 0),
        });
      }
    }
  } catch {}
  return map;
}

async function getFollowedSlugs(userId: string | null): Promise<string[]> {
  if (!userId || !isSupabaseConfigured()) return [];
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from("user_feed_config")
      .select("followed_team_ids")
      .eq("clerk_user_id", userId)
      .eq("sport", SPORT)
      .maybeSingle();
    const ids: string[] = (data as any)?.followed_team_ids ?? [];
    if (!ids.length) return [];
    // Resolve UUIDs → slugs via entities
    const { data: entities } = await supabase
      .from("entities")
      .select("id, slug")
      .in("id", ids);
    return ((entities ?? []) as any[]).map((e) => e.slug as string).filter(Boolean);
  } catch {
    return [];
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just nu";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default async function ForumIndexPage() {
  const [statsMap, clerkUser] = await Promise.all([
    getTeamStats(),
    currentUser(),
  ]);

  const followedSlugs = await getFollowedSlugs(clerkUser?.id ?? null);

  // Sort: followed first (in order), then rest alphabetically
  const followed = ALLSVENSKAN.filter((t) => followedSlugs.includes(t.slug));
  const rest = ALLSVENSKAN.filter((t) => !followedSlugs.includes(t.slug));
  const sorted = [...followed, ...rest];

  return (
    <div className="w-full min-h-screen">
      <div className="mx-auto w-full max-w-[900px] px-4 sm:px-6 py-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="font-bold text-3xl text-foreground tracking-tight text-balance">Forum</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Allsvenskan · Välj ett lag och delta i diskussionen
          </p>
        </div>

        {/* Favorites section */}
        {followed.length > 0 && (
          <div className="mb-8">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">
              Mina lag
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {followed.map((team) => (
                <TeamCard key={team.slug} team={team} stats={statsMap.get(team.slug)} isFavorite />
              ))}
            </div>
          </div>
        )}

        {/* All teams grid */}
        {followed.length > 0 && (
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">
            Alla lag
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rest.map((team) => (
            <TeamCard key={team.slug} team={team} stats={statsMap.get(team.slug)} />
          ))}
        </div>
      </div>
      <ForumSummaryPopupGate />
    </div>
  );
}

function TeamCard({
  team,
  stats,
  isFavorite,
}: {
  team: { slug: string; name: string; abbr: string };
  stats?: TeamStats;
  isFavorite?: boolean;
}) {
  const isHot = (stats?.hotScore ?? 0) > 0.7;
  const isActive = !!stats?.lastActivity;

  return (
    <Link
      href={`/forum/${team.slug}`}
      className="group flex items-center gap-4 rounded-2xl border border-border/40 bg-card/30 px-4 py-4 hover:bg-card/60 hover:border-pitch/30 transition-all"
    >
      {/* Avatar */}
      <div
        className={`w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 transition-colors ${
          isFavorite
            ? "bg-pitch/20 text-pitch-ink border border-pitch/30"
            : "bg-muted/50 text-muted-foreground border border-border/30 group-hover:bg-pitch/10 group-hover:text-pitch-ink group-hover:border-pitch/20"
        }`}
      >
        {team.abbr}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate group-hover:text-pitch-ink transition-colors">
          {team.name}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {stats
            ? `${stats.postCount} inlägg${stats.lastActivity ? ` · ${timeAgo(stats.lastActivity)}` : ""}`
            : "Inga inlägg ännu"}
        </p>
      </div>

      {/* Activity indicator */}
      <div className="shrink-0">
        {isHot ? (
          <span className="flex items-center gap-1 text-xs font-medium text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-full">
            <Flame className="w-2.5 h-2.5" /> Het
          </span>
        ) : isActive ? (
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
            <TrendingUp className="w-2.5 h-2.5" /> Aktiv
          </span>
        ) : (
          <MessageSquare className="w-4 h-4 text-muted-foreground/30" />
        )}
      </div>
    </Link>
  );
}
