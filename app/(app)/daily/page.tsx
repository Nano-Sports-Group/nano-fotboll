/**
 * app/daily/page.tsx — Delbar Nano Fotboll Daily-landning (social / SEO)
 * ─────────────────────────────────────────────────────────────────────────────
 * Publik route: /daily och /daily?lag={slug}. PRO krävs för uppspelning (briefAudio).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { ArrowRight, Headphones, Sparkles } from "lucide-react";
import { DailyPodcastPlayer } from "@/components/team-hub/DailyPodcastPlayer";
import { ProductEventTracker } from "@/components/analytics/ProductEventTracker";
import { TrackedLink } from "@/components/analytics/TrackedLink";
import { UtmActivationTracker } from "@/components/growth/UtmActivationTracker";
import { getDailyEpisodeForShareCached } from "@/lib/team-hub/queries";
import { getUserPlan } from "@/lib/user-plan";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getSiteUrl } from "@/lib/site-url";
import { jsonLd } from "@/lib/json-ld";

export const revalidate = 60;

const SITE = getSiteUrl();
const DAILY_UPGRADE_URL = "/prenumerera?utm_source=daily&utm_medium=player&utm_campaign=daily_pro";

function episodeDescription(title: string, episodeDate: string) {
  const when = episodeDate
    ? new Date(`${episodeDate}T12:00:00`).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm",
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : "idag";
  return `${title} — 7 minuters morgonbrief om Allsvenskan (${when}). Lyssna på Nano Fotboll Daily.`;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lag?: string }>;
}): Promise<Metadata> {
  const { lag } = await searchParams;
  const episode = await getDailyEpisodeForShareCached(lag);
  const title = episode?.title ?? "Nano Fotboll Daily — Allsvenskan idag";
  const description = episode
    ? episodeDescription(episode.title, episode.episode_date)
    : "Daglig 7-minuters brief om Allsvenskan — transfers, xG och det som betyder något. Original från Nano Fotboll.";
  const url = lag ? `${SITE}/daily?lag=${encodeURIComponent(lag)}` : `${SITE}/daily`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      locale: "sv_SE",
      url,
      title,
      description,
      siteName: "Nano Fotboll",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

function DailyEpisodeJsonLd({
  episode,
  pageUrl,
}: {
  episode: NonNullable<Awaited<ReturnType<typeof getDailyEpisodeForShareCached>>>;
  pageUrl: string;
}) {
  const payload = {
    "@context": "https://schema.org",
    "@type": "PodcastEpisode",
    name: episode.title,
    datePublished: episode.episode_date,
    url: pageUrl,
    partOfSeries: {
      "@type": "PodcastSeries",
      name: "Nano Fotboll Daily",
      url: `${SITE}/daily`,
    },
    ...(episode.has_audio
      ? {
          associatedMedia: {
            "@type": "MediaObject",
            contentUrl: `${pageUrl}?listen=1`,
            ...(episode.duration_sec ? { duration: `PT${episode.duration_sec}S` } : {}),
          },
        }
      : {}),
  };

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(payload) }} />
  );
}

/**
 * Auth-beroende del (plan + userId). Clerks auth()/getUserPlan() läser cookies
 * och gör hela render-trädet dynamiskt om de körs ovanför denna gräns — se
 * LCP-utredning. Genom att isolera dem i en egen async-komponent under
 * <Suspense> kan servern flusha den statiska header/h1 (LCP-elementet) direkt
 * medan detta streamas in separat, utan att röra PRO-gate-logiken.
 */
async function DailyAuthArea({
  lag,
  episode,
}: {
  lag?: string;
  episode: Awaited<ReturnType<typeof getDailyEpisodeForShareCached>>;
}) {
  const [plan, { userId }] = await Promise.all([getUserPlan(), auth()]);

  return (
    <>
      <ProductEventTracker event="daily_view" props={{ lag: lag ?? "all", plan }} />
      {userId ? (
        <Suspense fallback={null}>
          <UtmActivationTracker enabled />
        </Suspense>
      ) : null}

      {episode ? (
        <DailyPodcastPlayer episode={episode} plan={plan} />
      ) : (
        <section className="rounded-xl border border-border bg-card px-5 py-8 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-pitch-ink mb-3" aria-hidden />
          <h2 className="text-lg font-semibold text-foreground text-balance">Första avsnittet kommer snart</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {userId
              ? "Nano Fotboll Daily publiceras varje morgon efter granskning. Du får den här så snart första avsnittet är ute."
              : "Nano Fotboll Daily publiceras varje morgon efter granskning. Skapa konto så får du briefen direkt i appen."}
          </p>
        </section>
      )}

      <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
        {!userId ? (
          <TrackedLink
            href={DAILY_UPGRADE_URL}
            event="daily_checkout_click"
            props={{ placement: "hero_cta", lag: lag ?? "all" }}
            className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto justify-center")}
          >
            Lyssna med PRO
            <ArrowRight className="ml-1 h-4 w-4" />
          </TrackedLink>
        ) : plan === "free" ? (
          <TrackedLink
            href={DAILY_UPGRADE_URL}
            event="daily_checkout_click"
            props={{ placement: "hero_cta", lag: lag ?? "all" }}
            className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto justify-center")}
          >
            Lyssna med PRO
            <ArrowRight className="ml-1 h-4 w-4" />
          </TrackedLink>
        ) : (
          <Link
            href="/mitt-lag"
            className={cn(buttonVariants({ size: "lg", variant: "outline" }), "w-full sm:w-auto justify-center")}
          >
            Gå till mitt lag
            <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        )}
        {/* Uppgraderingsknappen visades för alla, även Elite-kunder som redan
            betalar mer än PRO. Erbjud den bara till den som saknar tillgången. */}
        {plan === "free" ? (
          <TrackedLink
            href={DAILY_UPGRADE_URL}
            event="daily_checkout_click"
            props={{ placement: "footer_cta", lag: lag ?? "all" }}
            className={cn(buttonVariants({ size: "lg", variant: "secondary" }), "w-full sm:w-auto justify-center")}
          >
            Uppgradera till PRO
          </TrackedLink>
        ) : null}
      </div>
    </>
  );
}

function DailyAuthAreaFallback() {
  return (
    <>
      <div className="h-40 animate-pulse rounded-xl border border-border bg-card/50" aria-hidden />
      <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
        <div className="h-11 w-full sm:w-40 animate-pulse rounded-2xl bg-card/50" aria-hidden />
        <div className="h-11 w-full sm:w-48 animate-pulse rounded-2xl bg-card/50" aria-hidden />
      </div>
    </>
  );
}

export default async function DailyPage({
  searchParams,
}: {
  searchParams: Promise<{ lag?: string }>;
}) {
  const { lag } = await searchParams;
  // Ingen auth-läsning här — episode-hämtningen är oberoende av inloggning
  // och kan cachas/ISR:as (revalidate=60) precis som resten av headern nedan.
  const episode = await getDailyEpisodeForShareCached(lag);

  const pageUrl = lag ? `${SITE}/daily?lag=${encodeURIComponent(lag)}` : `${SITE}/daily`;
  const teamLabel = lag ? lag.replace(/-/g, " ").toUpperCase() : null;

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8 sm:py-12 pb-24">
      {episode && <DailyEpisodeJsonLd episode={episode} pageUrl={pageUrl} />}

      <header className="mb-8 text-center">
        <p className="inline-flex items-center gap-2 rounded-full border border-pitch/30 bg-pitch/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-pitch-ink">
          <Headphones className="h-3.5 w-3.5" aria-hidden />
          Nano Fotboll Daily
        </p>
        <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight text-foreground text-balance">
          {teamLabel ? `Ditt lag · ${teamLabel}` : "Allsvenskan på 7 minuter"}
        </h1>
        <p className="mt-3 text-sm sm:text-base text-muted-foreground max-w-lg mx-auto leading-relaxed">
          Morgonbrief med det viktigaste från natten och gårdagen — transfers, xG och matchläge.
          100&nbsp;% Athopia-original, inte podd-citat.
        </p>
      </header>

      <Suspense fallback={<DailyAuthAreaFallback />}>
        <DailyAuthArea lag={lag} episode={episode} />
      </Suspense>

      <section className="mt-8 grid gap-3 sm:grid-cols-3 text-center text-sm text-muted-foreground">
        <div className="rounded-lg border border-border bg-card/50 px-3 py-4">
          <p className="font-semibold text-foreground">07:30</p>
          <p className="mt-1 text-xs">Nytt avsnitt varje morgon</p>
        </div>
        <div className="rounded-lg border border-border bg-card/50 px-3 py-4">
          <p className="font-semibold text-foreground">~7 min</p>
          <p className="mt-1 text-xs">Perfekt till pendlingen</p>
        </div>
        <div className="rounded-lg border border-border bg-card/50 px-3 py-4">
          <p className="font-semibold text-foreground">PRO</p>
          <p className="mt-1 text-xs">Lyssna obegränsat</p>
        </div>
      </section>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Dela länken:{" "}
        <Link href="/daily" className="text-pitch-ink hover:underline">
          {SITE.replace(/^https?:\/\//, "")}/daily
        </Link>
        {lag ? (
          <>
            {" "}
            ·{" "}
            <Link href={`/daily?lag=${encodeURIComponent(lag)}`} className="text-pitch-ink hover:underline">
              lagvariant
            </Link>
          </>
        ) : null}
      </p>
    </div>
  );
}
