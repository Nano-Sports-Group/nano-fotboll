import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Headphones, Newspaper, Sunrise, Trophy } from "lucide-react";
import { Following } from "@/components/golf/Following";
import { StoryList } from "@/components/golf/StoryList";
import { GolfSection, PlayerList } from "@/components/golf/cards";
import { GOLF_TOURS, swedishPlayers } from "@/lib/golf/catalog";
import { golfStories } from "@/lib/golf/stories";
import { jsonLd } from "@/lib/json-ld";
import { absoluteUrl, getSiteUrl } from "@/lib/site-url";
import { VERTICAL, vertical } from "@/lib/vertical";

/**
 * Golfens hem. Golf har spelare och tourer, inte lag och serie: startsidan utgår från vilka man
 * följer, med svenskarna i fokus. Den lovar bara det som finns — tomma listor och tabeller visas
 * aldrig, och det som inte är påslaget än står som "kommer", utan datum.
 */
export const revalidate = 120;

export const metadata: Metadata = {
  title: vertical.leagueTitle,
  description: vertical.leagueDescription,
  alternates: { canonical: absoluteUrl("/golf") },
};

const COMING = [
  { icon: Newspaper, title: "Flöde", body: "Nyheter om spelarna och tourerna du följer, värderade efter hur många källor som bekräftar dem." },
  { icon: Sunrise, title: "Golf idag", body: "En genomgång morgon och kväll: vad som hänt, vem som spelar och vad som står på spel." },
  { icon: Headphones, title: vertical.dailyName, body: "Dagens golf som en kort podd att lyssna på vägen till jobbet." },
  { icon: Trophy, title: "Ledartavlor", body: "Ställning och resultat under tävlingsveckorna, med svenskarna utpekade." },
] as const;

const NANO = [
  { href: "https://fotboll.nanosport.se", title: "Nano Fotboll", body: "Allsvenskan, varje dag" },
  { href: "https://hockey.nanosport.se", title: "Nano Hockey", body: "SHL och HockeyAllsvenskan" },
  { href: "https://maps.nanosport.se", title: "Nano Maps", body: "Kartspelet: var hände det?" },
] as const;

const pill =
  "inline-flex min-h-11 items-center rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:border-pitch/40 active:scale-[0.97] touch-manipulation";

export default async function GolfHome() {
  if (VERTICAL !== "golf") notFound();
  const stories = await golfStories();

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 sm:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: vertical.productName,
            url: getSiteUrl(),
            inLanguage: "sv-SE",
            description: vertical.leagueDescription,
          }),
        }}
      />

      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-pitch-ink">{vertical.productName}</p>
        <h1 className="mt-2 font-bold text-5xl text-foreground text-balance">Svensk golf, varje dag.</h1>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Följ svenskarna på de stora tourerna, och de största namnen i världen. Ytan är öppen — bevakningen byggs
          just nu.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/golf/spelare"
            data-cta="primary"
            className="inline-flex min-h-12 items-center rounded-full bg-pitch px-6 text-[15px] font-semibold text-white transition-transform active:scale-[0.97] touch-manipulation"
          >
            Välj spelare att följa
          </Link>
          <Link href="/golf/tourer" className={`${pill} min-h-12 px-6 text-[15px]`}>
            Tourer
          </Link>
        </div>
      </header>

      <GolfSection title="Du följer">
        <Following />
      </GolfSection>

      {stories.length > 0 && (
        <GolfSection title="Senaste">
          <StoryList stories={stories} />
        </GolfSection>
      )}

      <GolfSection title="Svenskarna" lead="Bevakningens fokus. Tryck på plus för att följa.">
        <PlayerList players={swedishPlayers()} />
        <p className="mt-3 text-sm">
          <Link href="/golf/spelare" className="inline-flex min-h-11 items-center text-pitch-ink hover:underline">
            Alla spelare, även världsstjärnorna
          </Link>
        </p>
      </GolfSection>

      <GolfSection title="Tourer och tävlingar">
        <ul className="flex flex-wrap gap-2">
          {GOLF_TOURS.map((tour) => (
            <li key={tour.slug}>
              <Link href={`/golf/tourer/${tour.slug}`} className={pill}>
                {tour.name}
              </Link>
            </li>
          ))}
        </ul>
      </GolfSection>

      <GolfSection title="Det här kommer">
        <ul className="grid gap-3 sm:grid-cols-2">
          {COMING.map(({ icon: Icon, title, body }) => (
            <li key={title} className="rounded-2xl border border-border bg-card p-5">
              <Icon className="h-5 w-5 text-pitch-ink" aria-hidden />
              <p className="mt-3 font-semibold text-foreground">{title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
      </GolfSection>

      <GolfSection title="Mer från Nano Sport">
        <ul className="grid gap-3 sm:grid-cols-3">
          {NANO.map(({ href, title, body }) => (
            <li key={href}>
              <a href={href} className="block h-full rounded-2xl border border-border bg-card p-5 transition-colors hover:border-pitch/40">
                <p className="font-semibold text-foreground">{title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{body}</p>
              </a>
            </li>
          ))}
        </ul>
      </GolfSection>
    </div>
  );
}
