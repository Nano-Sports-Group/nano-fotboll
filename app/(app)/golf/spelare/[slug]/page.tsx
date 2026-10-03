import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { FollowButton } from "@/components/golf/FollowButton";
import { StoryList } from "@/components/golf/StoryList";
import { GolfSection, PlayerList, PlayerMark } from "@/components/golf/cards";
import { GOLF_PLAYERS, getPlayer, getTour, playersOnTour } from "@/lib/golf/catalog";
import { golfStories } from "@/lib/golf/stories";
import { jsonLd } from "@/lib/json-ld";
import { absoluteUrl } from "@/lib/site-url";
import { VERTICAL } from "@/lib/vertical";

export const revalidate = 60;
// Bara katalogens slugar finns. Okänd slug ger en riktig 404 (notFound() bakom loading.tsx svarar 200).
export const dynamicParams = false;

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return VERTICAL === "golf" ? GOLF_PLAYERS.map((p) => ({ slug: p.slug })) : [];
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const player = getPlayer((await params).slug);
  if (!player) return { title: "Spelaren hittades inte" };
  const tour = getTour(player.tour)?.name;
  return {
    title: `${player.name} – nyheter och resultat`,
    description: `${player.name} (${player.country}) spelar på ${tour}. ${player.merit}. Följ spelaren på Nano Golf.`,
    alternates: { canonical: absoluteUrl(`/golf/spelare/${player.slug}`) },
  };
}

export default async function GolfPlayerPage({ params }: { params: Params }) {
  if (VERTICAL !== "golf") notFound();
  const player = getPlayer((await params).slug);
  if (!player) notFound();

  const tour = getTour(player.tour)!;
  const stories = await golfStories(player.name);
  const others = playersOnTour(player.tour).filter((p) => p.slug !== player.slug);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8 sm:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            "@context": "https://schema.org",
            "@type": "Person",
            name: player.name,
            nationality: player.country,
            jobTitle: "Golfspelare",
            url: absoluteUrl(`/golf/spelare/${player.slug}`),
          }),
        }}
      />

      <Link href="/golf/spelare" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Spelare
      </Link>

      <header className="mt-2 flex items-center gap-5">
        <PlayerMark name={player.name} size="lg" />
        <div className="min-w-0">
          <h1 className="font-bold text-3xl sm:text-4xl text-foreground text-balance">{player.name}</h1>
          <p className="mt-1 text-muted-foreground">
            {player.country} ·{" "}
            <Link href={`/golf/tourer/${tour.slug}`} className="text-pitch-ink hover:underline">
              {tour.name}
            </Link>
          </p>
        </div>
      </header>

      <p className="mt-5 text-lg text-foreground">{player.merit}</p>
      <div className="mt-5">
        <FollowButton kind="players" slug={player.slug} name={player.name} />
      </div>

      {stories.length > 0 ? (
        <GolfSection title={`Senaste om ${player.name}`}>
          <StoryList stories={stories} />
        </GolfSection>
      ) : (
        <GolfSection title="Kommer här">
          <div className="rounded-2xl border border-border bg-card p-5 text-sm leading-relaxed text-muted-foreground">
            <p>
              Nyheter om {player.name} visas här när golfbevakningen startar. Tävlingsschema, resultat och form
              kommer med resultatdatan — tills dess visar vi inga siffror.
            </p>
          </div>
        </GolfSection>
      )}

      {others.length > 0 && (
        <GolfSection title={`Fler på ${tour.name}`}>
          <PlayerList players={others} />
        </GolfSection>
      )}
    </div>
  );
}
