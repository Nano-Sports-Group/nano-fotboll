/**
 * app/mitt-lag/page.tsx — Inloggad startsida (brief-ritual)
 * Brief-first hem: dagens AI-brief + matchdag + widgetstack.
 * Gäst med lokalt lag får ärlig preview (LAUNCH-05).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { Star, ArrowRight, Newspaper, Trophy, Sparkles } from "lucide-react";
import { getPrimaryTeam } from "@/lib/team/getPrimaryTeam";
import { getTeamHub } from "@/lib/team-hub/queries";
import { getTeamEntityInsights } from "@/lib/supabase";
import { AnalysisCard } from "@/components/team-hub/AnalysisCard";
import { getUserPlan } from "@/lib/user-plan";
import { TeamHubBriefRitual } from "@/components/team-hub/TeamHubBriefRitual";
import { TeamBriefHome } from "@/components/mitt-lag/TeamBriefHome";
import { getLatestTeamBrief } from "@/lib/newsletter/team-brief";
import { MatchdayBanner } from "@/components/team-hub/MatchdayBanner";
import { FeedMatchHero } from "@/components/feed/FeedMatchHero";
import { StatNumber } from "@/components/ui/StatNumber";
import { MittLagWidgets } from "@/components/mitt-lag/MittLagWidgets";
import { MittLagGuestPreview } from "@/components/mitt-lag/MittLagGuestPreview";
import { UtmActivationTracker } from "@/components/growth/UtmActivationTracker";
import { getHighlights } from "@/lib/highlights/queries";
import { HighlightRail } from "@/components/highlights/HighlightRail";
import { formLetter, formLabel } from "@/lib/form-letter";
import { VERTICAL, vertical } from "@/lib/vertical";
import { favoriteFromMeta, onboardingDoneFromMeta } from "@/lib/favorite-meta";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Hem — ${vertical.productName} idag`,
  description: "Din dagliga brief, matchdag och snabbvägar till laget.",
};

function homeGreeting(firstName: string | null | undefined): string {
  const hour = Number(
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Stockholm",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
  );
  const name = firstName?.trim().split(/\s+/)[0] || null;

  let phrase: string;
  if (hour >= 5 && hour < 11) phrase = "God morgon";
  else if (hour >= 11 && hour < 17) phrase = "Välkommen tillbaka";
  else if (hour >= 17 && hour < 22) phrase = "God kväll";
  else phrase = "Välkommen";

  return name ? `${phrase}, ${name}` : phrase;
}

export default async function MittLagPage({
  searchParams,
}: {
  searchParams: Promise<{ hub?: string; tab?: string }>;
}) {
  const [primaryTeam, sp, user] = await Promise.all([
    getPrimaryTeam(),
    searchParams,
    currentUser(),
  ]);

  if (primaryTeam?.slug && sp.hub === "1") {
    // Gamla djuplänkar bar sektionen som ?tab=. Sektionerna är riktiga routes
    // nu, så vi översätter i stället för att tappa destinationen.
    const TAB_ROUTES: Record<string, string> = {
      statistik: "/statistik",
      trupp: "/trupp",
      matcher: "/matcher",
      forum: "/forum",
    };
    const tab = typeof sp.tab === "string" ? sp.tab : undefined;
    const suffix = tab && tab !== "oversikt" ? (TAB_ROUTES[tab] ?? "") : "";
    redirect(
      tab === "forum"
        ? `/forum/${primaryTeam.slug}`
        : `/lag/${primaryTeam.slug}${suffix}`,
    );
  }

  if (!primaryTeam?.slug) {
    const meta = user?.unsafeMetadata as Record<string, unknown> | undefined;
    if (user && !favoriteFromMeta(meta, VERTICAL) && !onboardingDoneFromMeta(meta, VERTICAL)) {
      redirect("/onboarding");
    }
    return <MittLagGuestPreview />;
  }

  const plan = await getUserPlan();
  const [hub, teamHighlights, latestInsights, teamBrief] = await Promise.all([
    getTeamHub(primaryTeam.slug),
    getHighlights({ teamEntityId: primaryTeam.id, limit: 8 }),
    getTeamEntityInsights(primaryTeam.id, 1),
    getLatestTeamBrief(primaryTeam.slug, plan),
  ]);

  if (!hub) {
    return <MittLagGuestPreview />;
  }

  // Hub-ytan står aldrig tom när det finns klipp: saknar favoritlaget höjdpunkter
  // faller vi tillbaka till senaste Allsvenskan-klippen.
  const highlights = teamHighlights.length
    ? teamHighlights
    : await getHighlights({ limit: 8 });
  const highlightsTitle = teamHighlights.length
    ? `Höjdpunkter · ${hub.team.name}`
    : "Höjdpunkter · Allsvenskan";

  const greeting = homeGreeting(user?.firstName);

  return (
    // Sidan låg i en 768px-kolumn mitt på skärmen med ~340px tomt på varje sida
    // vid 1440px. Från xl delas den i två spalter: den dagliga ritualen till
    // vänster, stödytorna till höger. Under xl är layouten oförändrad.
    <div className="max-w-3xl xl:max-w-6xl mx-auto px-4 sm:px-6 pb-10 pt-4">
      {user ? (
        <Suspense fallback={null}>
          <UtmActivationTracker enabled />
        </Suspense>
      ) : null}
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Nano Fotboll · {hub.team.name}
          </p>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground mt-1 text-balance">
            {greeting}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Det här behöver du veta om Allsvenskan och {hub.team.name} idag.
          </p>
        </div>
        <Link
          href={`/lag/${hub.team.slug}`}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-pitch/40 transition-colors"
        >
          Hela hubben
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start xl:gap-8">
      <div className="min-w-0">

      {hub.position != null && (
        <Link
          href={`${vertical.leaguePath}/tabell`}
          className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-5 py-4 hover:border-pitch/40 transition-colors"
        >
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Tabellplacering</p>
            <div className="flex items-baseline gap-1.5">
              <StatNumber value={hub.position} className="text-4xl" />
              <span className="text-sm text-muted-foreground">av 16</span>
            </div>
          </div>
          {hub.form.length > 0 && (
            <div className="flex gap-1 shrink-0">
              {hub.form.slice(-5).map((r, i) => (
                <span
                  key={i}
                  title={formLabel(r)}
                  aria-label={formLabel(r)}
                  className={`w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center ${
                    r === "W" ? "bg-success/20 text-success" : r === "L" ? "bg-destructive/20 text-destructive-ink" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {formLetter(r)}
                </span>
              ))}
            </div>
          )}
        </Link>
      )}

      {teamBrief ? (
        <TeamBriefHome brief={teamBrief} teamName={hub.team.name} />
      ) : null}

      <TeamHubBriefRitual pulse={null} dailyEpisode={hub.dailyEpisode} plan={plan} />

      <div className="mb-5">
        <MatchdayBanner
          teamName={hub.team.name}
          recent={hub.recent}
          upcoming={hub.upcoming}
        />
      </div>

      <FeedMatchHero />

      {/* Ingång till analysytan — inte hela flödet, bara den senaste insikten.
          Analysen är Nano Fotbolls egen text och ska synas i den dagliga ritualen. */}
      {latestInsights.length > 0 && (
        <section className="mt-6" aria-labelledby="senaste-analys">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2
              id="senaste-analys"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground text-balance"
            >
              Senaste analysen
            </h2>
            <Link
              href={`/lag/${hub.team.slug}/analys`}
              className="text-xs font-medium text-pitch-ink hover:underline"
            >
              All analys →
            </Link>
          </div>
          <AnalysisCard insight={latestInsights[0]!} />
        </section>
      )}

      </div>

      <aside className="mt-6 xl:mt-0 xl:sticky xl:top-6 min-w-0">
        <MittLagWidgets hub={hub} />
      </aside>
      </div>

      {highlights.length > 0 && (
        <div className="mt-6">
          <HighlightRail highlights={highlights} title={highlightsTitle} />
        </div>
      )}

      {/* Snabbvägar: fyra destinationer, fyra betydelser. Tidigare fanns här två
          länkar till laghubben (headern + "Laghub") och två till /nyheter under
          namnen "Nyheter" och "Ditt flöde" — olika löften, samma resultat. */}
      <nav className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3" aria-label="Snabbvägar">
        <QuickLink
          href={`/lag/${hub.team.slug}/analys`}
          icon={Sparkles}
          title="Analys"
          desc={`Nano Fotbolls egen analys om ${hub.team.name}`}
        />
        <QuickLink
          href={`/lag/${hub.team.slug}/nyheter`}
          icon={Newspaper}
          title={`Nyheter om ${hub.team.name}`}
          desc="Allt som skrivs om laget"
        />
        <QuickLink
          href="/nyheter?scope=allsvenskan&sort=latest"
          icon={Trophy}
          title="Hela Allsvenskan"
          desc="Ofiltrerat ligaflöde"
        />
        <QuickLink
          href={`/forum/${hub.team.slug}`}
          icon={Star}
          title="Forum"
          desc="Diskutera med supportrar"
        />
      </nav>
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  title,
  desc,
}: {
  href: string;
  icon: typeof Star;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:border-pitch/40 transition-colors"
    >
      <Icon className="h-5 w-5 text-pitch-ink mt-0.5 shrink-0" aria-hidden />
      <div>
        <p className="text-sm font-semibold text-foreground group-hover:text-pitch-ink">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </Link>
  );
}
