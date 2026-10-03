import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { NyheterRealtimeBanner } from "@/components/NyheterRealtimeBanner";
import { ProductEventTracker } from "@/components/analytics/ProductEventTracker";
import { FeedMatchHero } from "@/components/feed/FeedMatchHero";
import { FixturesTicker } from "@/components/ui/FixturesTicker";
import { TeamPushPopups } from "@/components/news/TeamPushPopups";
import { AthleticFeedHero, AthleticFeedRow } from "@/components/news/AthleticFeed";
import { FeedSortBar, type FeedSort } from "@/components/news/FeedSortBar";
import { PrefetchNextPage } from "@/components/news/PrefetchNextPage";
import { FeedModulesRail } from "@/components/feed/FeedModulesRail";
import { FeedFilterPanel } from "@/components/feed/FeedFilterPanel";
import {
  getFilteredArticles,
  getDiscussionCounts,
  createServerClient,
  isSupabaseConfigured,
  type ArticleSort,
} from "@/lib/supabase";
import { filterStateToParams } from "@/lib/filters";
import { ActiveFilterChips, type FilterChip } from "@/components/feed/ActiveFilterChips";
import { getUserFeedPreferences } from "@/lib/feed/getUserFeedPreferences";
import { absoluteUrl } from "@/lib/site-url";
import { VERTICAL, vertical } from "@/lib/vertical";
import { buildFeedModules } from "@/lib/feed/build-feed-modules";
import { getFeedFilterOptions } from "@/lib/feed/get-allsvenskan-teams";
import {
  extractHeadlineStackIds,
  extractHeadlineStackTitles,
  hasHeadlineStackModule,
} from "@/lib/feed/headline-stack";
import { getUserPlan } from "@/lib/user-plan";
import type { FeedModule } from "@/lib/feed/build-feed-modules";

export const dynamic = "force-dynamic";

const NYHETER_TITLE =
  VERTICAL === "hockey" ? "Flöde — SHL-nyheter 2026/27" : VERTICAL === "golf" ? "Flöde — golfnyheter" : "Flöde — Allsvenskan-nyheter 2026";
const NYHETER_DESCRIPTION =
  VERTICAL === "hockey"
    ? "Dagens SHL-flöde — signalscorerat, AI-kurerat och kopplat till diskussion."
    : VERTICAL === "golf"
      ? "Dagens golfflöde ur svenskt perspektiv — signalscorerat, AI-kurerat och kopplat till diskussion."
      : "Dagens Allsvenskan-flöde — signalscorerat, AI-kurerat och kopplat till diskussion.";

export const metadata: Metadata = {
  title: NYHETER_TITLE,
  description: NYHETER_DESCRIPTION,
  alternates: { canonical: absoluteUrl("/nyheter") },
  openGraph: {
    type: "website",
    locale: "sv_SE",
    url: absoluteUrl("/nyheter"),
    title: NYHETER_TITLE,
    description: NYHETER_DESCRIPTION,
  },
};

const LIMIT = 24;

function parseSort(raw: string | undefined): FeedSort {
  if (raw === "latest" || raw === "important" || raw === "for-you") return raw;
  return "for-you";
}

function Pagination({ page, total, urlBase }: { page: number; total: number; urlBase: string }) {
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  if (totalPages <= 1) return null;
  const prev = page > 1 ? `${urlBase}&page=${page - 1}` : null;
  const next = page < totalPages ? `${urlBase}&page=${page + 1}` : null;
  return (
    <>
      <PrefetchNextPage href={next} />
      <div className="mt-8 flex items-center justify-between text-sm">
        {/* min-h-11: 44px träffyta även om texten är 20px hög (Fitts's Law). */}
        {prev ? (
          <Link
            href={prev}
            className="inline-flex min-h-11 items-center text-pitch-ink hover:underline"
          >
            Föregående
          </Link>
        ) : (
          <span className="inline-flex min-h-11 items-center opacity-40">Föregående</span>
        )}
        <span className="text-muted-foreground font-mono tabular-nums">
          {page} / {totalPages}
        </span>
        {next ? (
          <Link
            href={next}
            className="inline-flex min-h-11 items-center text-pitch-ink hover:underline"
          >
            Nästa
          </Link>
        ) : (
          <span className="inline-flex min-h-11 items-center opacity-40">Nästa</span>
        )}
      </div>
    </>
  );
}

export default async function NyheterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const visa = (sp.visa as "all" | "ai" | "source") ?? "all";
  const sort = parseSort(sp.sort);
  const urlHasTeamFilter = Boolean(sp.lag);
  const urlHasEventFilter = Boolean(sp.event);
  const teams = sp.lag ? sp.lag.split(",").filter(Boolean) : [];
  const sources = sp.kalla ? sp.kalla.split(",").filter(Boolean) : [];
  const events = sp.event ? sp.event.split(",").filter(Boolean) : [];
  const typer = sp.typ ? sp.typ.split(",").filter(Boolean) : [];

  const prefs = await getUserFeedPreferences();

  // `scope=allsvenskan` = uttryckligen hela ligan. Utan den kunde /nyheter betyda
  // olika saker för olika användare, vilket gjorde att "Alla nyheter" från
  // ligasidan landade i ett lagfiltrerat flöde (produktbrief, problem 3).
  const scope: "allsvenskan" | "personal" =
    sp.scope === "allsvenskan" ? "allsvenskan" : "personal";

  // För dig = personliga defaults. Viktigt/Senaste = hela ligan (ingen lag-forcera).
  const usingPersonalDefaults =
    scope === "personal" &&
    sort === "for-you" &&
    !urlHasTeamFilter &&
    !urlHasEventFilter &&
    visa === "all" &&
    sources.length === 0 &&
    typer.length === 0 &&
    (prefs.favoriteTeamName != null || (prefs.newsTags?.length ?? 0) > 0);

  const effectiveTeams =
    teams.length > 0
      ? teams
      : usingPersonalDefaults && prefs.favoriteTeamName
        ? [prefs.favoriteTeamName]
        : [];

  const effectiveNewsTags =
    typer.length > 0
      ? typer
      : events.length > 0
        ? undefined
        : usingPersonalDefaults
          ? prefs.newsTags ?? undefined
          : undefined;

  const { articles, total } = await getFilteredArticles({
    visa,
    teams: effectiveTeams,
    sources,
    events,
    newsTags: effectiveNewsTags,
    sort: sort as ArticleSort,
    page,
    limit: LIMIT,
  });

  const commentCounts = await getDiscussionCounts(articles.map((a) => a.id));

  const filterOptions = await getFeedFilterOptions();
  // Ingen billig global distinct-källa finns server-side (news_feed saknar
  // en indexerad distinct-väg) — härledd från sidans egna artiklar per spec.

  const showModules = page === 1 && !urlHasTeamFilter && !urlHasEventFilter;
  let modules: FeedModule[] = [];
  if (showModules && isSupabaseConfigured()) {
    try {
      const plan = await getUserPlan();
      modules = await buildFeedModules(createServerClient(), { plan });
    } catch {
      modules = [];
    }
  }
  const suppressHero = showModules && hasHeadlineStackModule(modules);
  const headlineIds = suppressHero ? extractHeadlineStackIds(modules) : new Set<string>();
  const headlineTitles = suppressHero
    ? extractHeadlineStackTitles(modules)
    : new Set<string>();

  const feedArticles =
    headlineIds.size > 0 || headlineTitles.size > 0
      ? articles.filter(
          (a) =>
            !headlineIds.has(a.id) &&
            !headlineTitles.has(a.title.trim().toLowerCase()),
        )
      : articles;

  const filterParams = filterStateToParams({
    visa,
    teams: effectiveTeams,
    sources,
    events,
  });
  if (sort !== "for-you") filterParams.set("sort", sort);
  if (scope === "allsvenskan") filterParams.set("scope", "allsvenskan");
  const urlBase = `/nyheter?${filterParams.toString()}`;

  // Alla filter som faktiskt påverkar resultatet får ett synligt chip. Att ta
  // bort ett chip = en URL utan det filtret; hela ligan nås alltid med ett klick.
  const LEAGUE_HREF = "/nyheter?scope=allsvenskan&sort=latest";
  const chipUrl = (mutate: (p: URLSearchParams) => void): string => {
    const p = filterStateToParams({ visa, teams, sources, events });
    if (typer.length) p.set("typ", typer.join(","));
    if (sort !== "for-you") p.set("sort", sort);
    if (scope === "allsvenskan") p.set("scope", "allsvenskan");
    mutate(p);
    const qs = p.toString();
    return qs ? `/nyheter?${qs}` : "/nyheter";
  };

  // "Visas eftersom du följer X" satts BARA nar personaliseringen faktiskt
  // styr urvalet. Ett explicit lagfilter ar anvandarens eget val och behover
  // ingen forklaring — chipet visar det redan.
  const becauseTeam =
    usingPersonalDefaults && prefs.favoriteTeamName ? prefs.favoriteTeamName : null;

  const activeChips: FilterChip[] = [];
  if (scope === "allsvenskan") {
    activeChips.push({ kind: "Omfång", label: "Hela Allsvenskan", emphasis: true });
  }
  if (usingPersonalDefaults && prefs.favoriteTeamName) {
    activeChips.push({
      kind: "Personaliserat",
      label: `Fokus: ${prefs.favoriteTeamName}`,
      removeHref: LEAGUE_HREF,
      emphasis: true,
    });
  }
  for (const t of teams) {
    activeChips.push({
      kind: "Lag",
      label: t,
      removeHref: chipUrl((p) => {
        const rest = teams.filter((x) => x !== t);
        if (rest.length) p.set("lag", rest.join(","));
        else p.delete("lag");
      }),
    });
  }
  const TYP_ETIKETT: Record<string, string> = {
    transfer: "Transfer",
    match: "Match",
    analysis: "Analys",
    news: "Nyheter",
    injury: "Skador",
  };
  for (const t of typer) {
    activeChips.push({
      kind: "Typ",
      label: TYP_ETIKETT[t] ?? t,
      removeHref: chipUrl((p) => {
        const rest = typer.filter((x) => x !== t);
        if (rest.length) p.set("typ", rest.join(","));
        else p.delete("typ");
      }),
    });
  }
  for (const s of sources) {
    activeChips.push({
      kind: "Källa",
      label: s,
      removeHref: chipUrl((p) => {
        const rest = sources.filter((x) => x !== s);
        if (rest.length) p.set("kalla", rest.join(","));
        else p.delete("kalla");
      }),
    });
  }
  for (const e of events) {
    activeChips.push({
      kind: "Händelse",
      label: e,
      removeHref: chipUrl((p) => {
        const rest = events.filter((x) => x !== e);
        if (rest.length) p.set("event", rest.join(","));
        else p.delete("event");
      }),
    });
  }

  // Hero: first page only — skip when headline_stack already shows top stories
  let heroIndex = -1;
  if (page === 1 && !suppressHero && feedArticles.length > 0) {
    heroIndex = feedArticles.findIndex((a) => !!a.imageUrl && !!a.summary);
    if (heroIndex < 0) heroIndex = feedArticles.findIndex((a) => !!a.imageUrl);
    if (heroIndex < 0) heroIndex = 0;
  }
  const hero = heroIndex >= 0 ? feedArticles[heroIndex] : null;
  const list = hero ? feedArticles.filter((_, i) => i !== heroIndex) : feedArticles;

  const viewTitle =
    scope === "allsvenskan"
      ? sort === "important"
        ? "Allsvenskan — viktigt"
        : "Allsvenskan — senaste"
      : "För dig";

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 py-6 pb-24 md:pb-10 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
      <ProductEventTracker event="nyheter_open" />
      <div className="-mx-4 sm:-mx-6 -mt-6 mb-4 lg:col-span-2">
        <Suspense fallback={null}>
          <FixturesTicker />
        </Suspense>
      </div>

      <div className="min-w-0">
        <div className="mx-auto max-w-2xl">
          {scope === "personal" ? (
            <>
              <NyheterRealtimeBanner />
              <FeedMatchHero />
            </>
          ) : null}

          <header className="mb-5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h1
              className="text-3xl font-bold text-foreground text-balance"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {viewTitle}
            </h1>
            <p className="text-sm text-muted-foreground">
              {total > 0
                ? `${total} ${total === 1 ? "artikel" : "artiklar"}`
                : vertical.paused
                  ? "Bevakningen har inte startat"
                  : "Inga artiklar matchar filtret"}
            </p>
          </header>

          <ProductEventTracker
            event="news_scope_changed"
            props={{
              active_scope: scope,
              sort,
              is_personalized: usingPersonalDefaults,
              team_filters: teams.length,
            }}
          />

          <FeedFilterPanel {...filterOptions} />

          <ActiveFilterChips chips={activeChips} />

          <Suspense fallback={null}>
            <TeamPushPopups />
          </Suspense>

          <Suspense fallback={null}>
            <FeedSortBar sort={sort} scope={scope} visa={visa} />
          </Suspense>

          {showModules ? (
            <div className="lg:hidden">
              <Suspense fallback={null}>
                <FeedModulesRail modules={modules} />
              </Suspense>
            </div>
          ) : null}

          {feedArticles.length === 0 && articles.length === 0 ? (
            vertical.paused ? (
              // Pausad vertikal (golf): flödet är tomt för att intaget inte är påslaget, inte för att ett filter är fel.
              <div className="py-16 text-center text-sm text-muted-foreground">
                <p>Flödet är tomt än. Nyheterna dyker upp här när bevakningen startar.</p>
                <Link href={vertical.leaguePath} className="mt-2 inline-block text-pitch-ink hover:underline">
                  Se vad som kommer
                </Link>
              </div>
            ) : (
              <div className="py-16 text-center text-sm text-muted-foreground">
                <p>Inga artiklar matchade filtret.</p>
                <Link href="/nyheter" className="mt-2 inline-block text-pitch-ink hover:underline">
                  Visa allt
                </Link>
              </div>
            )
          ) : feedArticles.length === 0 && !hero ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <p>Toppnyheter visas ovan — mer i listan snart.</p>
            </div>
          ) : (
            <div>
              {hero ? (
                <AthleticFeedHero
                  article={hero}
                  commentCount={commentCounts[hero.id]}
                  becauseTeam={becauseTeam}
                />
              ) : null}
              <div className={hero ? "mt-0" : ""}>
                {list.map((a, i) => (
                  <AthleticFeedRow
                    key={a.id}
                    article={a}
                    commentCount={commentCounts[a.id]}
                    becauseTeam={becauseTeam}
                    headingLevel={!hero && i === 0 ? "h2" : "h3"}
                  />
                ))}
              </div>
            </div>
          )}

          <Pagination page={page} total={total} urlBase={urlBase} />
        </div>
      </div>

      {showModules ? (
        <aside className="hidden lg:block lg:sticky lg:top-6 lg:self-start">
          <Suspense fallback={null}>
            <FeedModulesRail modules={modules} />
          </Suspense>
        </aside>
      ) : null}
    </div>
  );
}
