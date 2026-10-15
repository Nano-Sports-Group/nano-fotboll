import { SPORT } from "@/lib/vertical";
import type { Metadata } from "next";
import Link from "next/link";
import { TeamNav } from "@/components/team-hub/TeamNav";
import { ChevronLeft } from "lucide-react";
import { currentUser } from "@clerk/nextjs/server";
import { createServerClient, isSupabaseConfigured, getEntities } from "@/lib/supabase";
import { getForumTeamSummary } from "@/lib/forum/summary";
import type { ForumPost } from "@/lib/types";
import ForumSummaryBar from "@/components/forum/ForumSummaryBar";
import ForumDailySummary from "@/components/forum/ForumDailySummary";
import CommunityGuidelines from "@/components/forum/CommunityGuidelines";
import TeamDropdown from "@/components/forum/TeamDropdown";
import NotificationBell from "@/components/forum/NotificationBell";
import ForumClient from "./ForumClient";
import ForumRightSidebar from "@/components/forum/ForumRightSidebar";
import { getUserPlan } from "@/lib/user-plan";
import { BlurPaywall } from "@/components/BlurPaywall";
import { canAccess } from "@/lib/access-rules";
import { ForumSummaryPopupGate } from "@/components/ForumSummaryPopupGate";

export const dynamic = "force-dynamic";



async function getPosts(teamSlug: string): Promise<ForumPost[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createServerClient();
    // Löpande flöde, inte trådar: inlägg och svar i samma ström, senaste överst.
    // Samma modell som /api/forum/posts GET — se den routen för resonemanget.
    const { data } = await supabase
      .from("forum_posts")
      .select("*, parent_post:parent_id(*)")
      .eq("team_slug", teamSlug)
      .eq("sport", SPORT)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(50);
    return (data as ForumPost[]) ?? [];
  } catch {
    return [];
  }
}

async function getAISummary(teamSlug: string): Promise<string | null> {
  return getForumTeamSummary(teamSlug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ teamSlug: string }>;
}): Promise<Metadata> {
  const { teamSlug } = await params;
  const teams = await getEntities("team");
  const name = teams.find((t) => t.slug === teamSlug)?.name ?? teamSlug;
  return {
    title: `${name} · Community | Nano Fotboll`,
    description: `Diskutera ${name} med andra supportrar på Nano Fotboll.`,
  };
}

export default async function ForumTeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamSlug: string }>;
  searchParams: Promise<{ artikel?: string }>;
}) {
  const { teamSlug } = await params;
  const { artikel } = await searchParams;

  // Artikel-länkad compose: /forum/<lag>?artikel=<id> öppnar composern förifylld
  let articlePrefill: { id: string; title: string; slug: string } | null = null;
  if (artikel && isSupabaseConfigured()) {
    try {
      const supabase = createServerClient();
      const { data } = await supabase
        .from("articles")
        .select("id, title, slug")
        .eq("id", artikel)
        .eq("sport", SPORT)
        .maybeSingle();
      if (data) articlePrefill = data as { id: string; title: string; slug: string };
    } catch {
      /* trasigt id → ingen prefill */
    }
  }

  const [posts, aiSummary, allTeams, clerkUser, plan] = await Promise.all([
    getPosts(teamSlug),
    getAISummary(teamSlug),
    getEntities("team"),
    currentUser(),
    getUserPlan(),
  ]);

  // getEntities("team") filtrerar redan på Allsvenskan. Här låg tidigare en
  // handskriven slug-lista ("Allsvenskan 2025") ovanpå den, och den hade glidit
  // ifrån databasen: 8 av 16 klubbar hade fel slug eller saknades —
  // djurgardens-if mot djurgarden, hammarby-if mot hammarby, mjallby-aif mot
  // mjallby, och varken Brommapojkarna eller Sirius fanns med. Följden var att
  // lagnamnet inte gick att slå upp och rubriken föll tillbaka på råslugen:
  // "DJURGARDEN". Listan är borta; entities är källan.
  const allsvenskanTeams = [...allTeams].sort((a, b) =>
    (a.name ?? "").localeCompare(b.name ?? "", "sv"),
  );

  const teamName =
    allsvenskanTeams.find((t) => t.slug === teamSlug)?.name ??
    teamSlug.replace(/-/g, " ").toUpperCase();

  const sidebarTeams = allsvenskanTeams.map(t => ({ slug: t.slug ?? "", name: t.name ?? "" }));
  const showForumSummary = Boolean(aiSummary) && canAccess("forumSummary", plan);
  const forumTeaser = aiSummary
    ? `${aiSummary.slice(0, 120)}${aiSummary.length > 120 ? "…" : ""}`
    : "";

  return (
    <div className="w-full min-h-screen">
      {/* Forumet ligger utanfor /lag-tradet men ar en lagsektion for anvandaren.
          Utan raden har forsvann navigationen sa fort man klickade "Forum" —
          flikraden ska vara stabil genom hela lagflodet. */}
      <TeamNav slug={teamSlug} sticky={false}>
      {/* 3-col grid: left 20% | center 60% | right 20% — collapses to single on mobile */}
      <div className="mx-auto w-full max-w-7xl px-4 xl:px-6">
        <div className="flex gap-6 items-start">

          {/* Main feed column */}
          <div className="flex-1 min-w-0 border-x border-border/40">

            {/* Sticky header — offset by main Header height (h-12 = 3rem) */}
            <div className="sticky top-12 z-30 bg-background/90 backdrop-blur-xl border-b border-border/40 px-4 py-3 flex items-center gap-3">
              <Link
                href="/forum"
                aria-label="Tillbaka till alla forum"
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-800/60 transition-colors shrink-0"
              >
                <ChevronLeft className="w-5 h-5 text-zinc-400" aria-hidden />
              </Link>
              <div className="flex-1 min-w-0">
                <h1 className="font-semibold text-[15px] text-white truncate text-balance">{teamName}</h1>
                <p className="text-[12px] text-muted-foreground">Community</p>
              </div>
              <TeamDropdown teams={sidebarTeams} currentSlug={teamSlug} />
              {clerkUser && <NotificationBell teamSlug={teamSlug} />}
            </div>

            <div className="pb-28">
              {/* AI summarizer — PRO (4h FOMO) */}
              {aiSummary && (
                <div className="px-4 pt-4">
                  <BlurPaywall
                    feature="forumSummary"
                    plan={plan}
                    teamName={teamName}
                    maxHeight="4.5rem"
                    tease="Vad snackas det om just nu — senaste timmarna."
                    preview={
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-pitch-ink">
                          Forum-läget
                        </p>
                        <p className="text-sm text-muted-foreground line-clamp-2">{forumTeaser}</p>
                      </div>
                    }
                  >
                    <ForumSummaryBar summary={aiSummary} />
                  </BlurPaywall>
                </div>
              )}
              <div className="px-4 pt-4 pb-2">
                <CommunityGuidelines />
              </div>

              {/* Feed — no horizontal padding, posts use full-bleed border-b style */}
              <ForumClient
                teamSlug={teamSlug}
                sport={SPORT}
                initialPosts={posts}
                articlePrefill={articlePrefill}
              />
            </div>
          </div>

          {/* Right sidebar — hidden on mobile/tablet */}
          <aside className="hidden lg:block w-[280px] shrink-0 sticky top-4 py-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <ForumRightSidebar
              teamName={teamName}
              teamSlug={teamSlug}
              aiSummary={showForumSummary ? aiSummary : null}
            />
          </aside>

        </div>
      </div>
      </TeamNav>
      <ForumSummaryPopupGate />
    </div>
  );
}
