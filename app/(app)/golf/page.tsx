import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Headphones, Newspaper, Sunrise, Trophy } from "lucide-react";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { contentCutoffIso } from "@/lib/content-window";
import { jsonLd } from "@/lib/json-ld";
import { absoluteUrl, getSiteUrl } from "@/lib/site-url";
import { SPORT, VERTICAL, vertical } from "@/lib/vertical";

/**
 * Golfens hem. Golf har spelare och tävlingar, inte lag och serie, så startsidan är en egen
 * yta i stället för ligasidan. Den lovar bara det som finns: tomma listor och tabeller visas
 * aldrig, och det som inte är påslaget än står som "kommer", utan datum.
 */
export const revalidate = 120;

export const metadata: Metadata = {
  title: vertical.leagueTitle,
  description: vertical.leagueDescription,
  alternates: { canonical: absoluteUrl("/golf") },
};

const COMING = [
  { icon: Newspaper, title: "Flöde", body: "Nyheter om svenska spelare och tourerna, värderade efter hur många källor som bekräftar dem." },
  { icon: Sunrise, title: "Golf idag", body: "En genomgång morgon och kväll: vad som hänt, vem som spelar och vad som står på spel." },
  { icon: Headphones, title: vertical.dailyName, body: "Dagens golf som en kort podd att lyssna på vägen till jobbet." },
  { icon: Trophy, title: "Ledartavlor", body: "Resultat och ställning under tävlingsveckorna, när dataleverantören är vald." },
] as const;

const TOURS = ["PGA Tour", "DP World Tour", "LPGA Tour", "Ladies European Tour", "LIV Golf", "Majors", "Ryder Cup", "Solheim Cup"] as const;

/** Svenska spelare bevakningen utgår från. Samma lista som motorns golfkonfiguration, plus damtourerna. */
const PLAYERS = ["Ludvig Åberg", "Alex Norén", "Henrik Stenson", "Maja Stark", "Linn Grant", "Madelene Sagström", "Anna Nordqvist"] as const;

const NANO = [
  { href: "https://fotboll.nanosport.se", title: "Nano Fotboll", body: "Allsvenskan, varje dag" },
  { href: "https://hockey.nanosport.se", title: "Nano Hockey", body: "SHL och HockeyAllsvenskan" },
  { href: "https://maps.nanosport.se", title: "Nano Maps", body: "Kartspelet: var hände det?" },
] as const;

interface Story {
  slug: string;
  title: string;
  summary: string;
}

async function latestStories(): Promise<Story[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data } = await createServerClient()
      .from("articles")
      .select("slug, title, summary")
      .eq("status", "published")
      .eq("is_processed", true)
      .eq("sport", SPORT)
      .gte("published_at", contentCutoffIso())
      .order("published_at", { ascending: false })
      .limit(5);
    return ((data ?? []) as Story[]).filter((a) => a.slug && a.title);
  } catch {
    return [];
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="mb-4 font-semibold text-2xl text-foreground text-balance">{title}</h2>
      {children}
    </section>
  );
}

export default async function GolfHome() {
  if (VERTICAL !== "golf") notFound();
  const stories = await latestStories();

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
          Svenska spelare på de stora tourerna, majors och det som händer däremellan. Ytan är öppen — bevakningen
          byggs just nu.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/sign-up"
            data-cta="primary"
            className="inline-flex min-h-12 items-center rounded-full bg-pitch px-6 text-[15px] font-semibold text-white transition-transform active:scale-[0.97] touch-manipulation"
          >
            Skapa konto — gratis
          </Link>
          <Link
            href="/nyheter"
            className="inline-flex min-h-12 items-center rounded-full border border-border bg-card px-6 text-[15px] font-medium text-foreground transition-colors hover:border-pitch/40 active:scale-[0.97] touch-manipulation"
          >
            Till flödet
          </Link>
        </div>
      </header>

      {stories.length > 0 && (
        <Section title="Senaste">
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {stories.map((story) => (
              <li key={story.slug}>
                <Link href={`/artikel/${story.slug}`} className="block px-5 py-4 transition-colors hover:bg-foreground/[0.03]">
                  <p className="font-semibold text-foreground text-balance">{story.title}</p>
                  {story.summary && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{story.summary}</p>}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Det här kommer">
        <ul className="grid gap-3 sm:grid-cols-2">
          {COMING.map(({ icon: Icon, title, body }) => (
            <li key={title} className="rounded-2xl border border-border bg-card p-5">
              <Icon className="h-5 w-5 text-pitch-ink" aria-hidden />
              <p className="mt-3 font-semibold text-foreground">{title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Tourerna vi följer">
        <ul className="flex flex-wrap gap-2">
          {TOURS.map((tour) => (
            <li key={tour} className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground">
              {tour}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Svenskarna">
        <p className="mb-4 max-w-xl text-muted-foreground">
          Bevakningen utgår från de svenska spelarna. Spelarsidor med resultat och form kommer med ledartavlorna.
        </p>
        <ul className="flex flex-wrap gap-2">
          {PLAYERS.map((player) => (
            <li key={player} className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground">
              {player}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Mer från Nano Sport">
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
      </Section>
    </div>
  );
}
