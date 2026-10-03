import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { FollowButton } from "@/components/golf/FollowButton";
import { StoryList } from "@/components/golf/StoryList";
import { GolfSection, PlayerList } from "@/components/golf/cards";
import { GOLF_TOURS, getTour, playersOnTour } from "@/lib/golf/catalog";
import { golfStories } from "@/lib/golf/stories";
import { absoluteUrl } from "@/lib/site-url";
import { VERTICAL } from "@/lib/vertical";

export const revalidate = 60;
// Bara katalogens slugar finns. Okänd slug ger en riktig 404 (notFound() bakom loading.tsx svarar 200).
export const dynamicParams = false;

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return VERTICAL === "golf" ? GOLF_TOURS.map((t) => ({ slug: t.slug })) : [];
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const tour = getTour((await params).slug);
  if (!tour) return { title: "Touren hittades inte" };
  return {
    title: `${tour.name} – nyheter och svenskar`,
    description: `${tour.name}: ${tour.blurb} Följ touren och de svenska spelarna på Nano Golf.`,
    alternates: { canonical: absoluteUrl(`/golf/tourer/${tour.slug}`) },
  };
}

export default async function GolfTourPage({ params }: { params: Params }) {
  if (VERTICAL !== "golf") notFound();
  const tour = getTour((await params).slug);
  if (!tour) notFound();

  const players = playersOnTour(tour.slug);
  const stories = await golfStories(tour.name);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8 sm:px-8">
      <Link href="/golf/tourer" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Tourer
      </Link>

      <h1 className="mt-2 font-bold text-3xl sm:text-4xl text-foreground text-balance">{tour.name}</h1>
      <p className="mt-3 max-w-xl text-lg text-muted-foreground">{tour.blurb}</p>
      <div className="mt-5">
        <FollowButton kind="tours" slug={tour.slug} name={tour.name} />
      </div>

      {stories.length > 0 && (
        <GolfSection title={`Senaste från ${tour.name}`}>
          <StoryList stories={stories} />
        </GolfSection>
      )}

      {players.length > 0 && (
        <GolfSection title="Spelare vi följer här">
          <PlayerList players={players} />
        </GolfSection>
      )}

      <GolfSection title="Kommer här">
        <div className="rounded-2xl border border-border bg-card p-5 text-sm leading-relaxed text-muted-foreground">
          <p>
            {tour.kind === "tour"
              ? "Tävlingsschema, ledartavlor och resultat kommer med resultatdatan."
              : "Startfält, ställning och resultat kommer med resultatdatan."}{" "}
            Tills dess visar vi inga siffror.
          </p>
        </div>
      </GolfSection>
    </div>
  );
}
