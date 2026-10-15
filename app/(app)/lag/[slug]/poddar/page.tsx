import type { Metadata } from "next";
import { Mic } from "lucide-react";
import { NanoEpisodeList } from "@/components/podcast/NanoEpisodeList";
import { latestEpisodes, teamNames } from "@/lib/podcast/nano-api";
import { vertical } from "@/lib/vertical";

// Lagets poddavsnitt ur Nano Podcast API: lagets egna poddar + avsnitt där laget nämns
// (GET /v1/episodes?team=<slug>, samma slugs som /lag/[slug]). Data cachas i nano-api.
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const name = (await teamNames()).get(slug) ?? slug;
  return {
    title: `${name} — Poddar`,
    description: `Poddavsnitt om ${name} på ${vertical.productName}.`,
  };
}

export default async function LagPodcastsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [names, episodes] = await Promise.all([
    teamNames(),
    latestEpisodes(30, slug),
  ]);
  const teamName = names.get(slug) ?? slug;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="font-bold text-3xl text-foreground mb-6 text-balance">
        Poddar om {teamName}
      </h1>

      {episodes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
          <Mic className="w-10 h-10 opacity-30" />
          <p className="max-w-sm text-center text-sm text-balance">
            Poddavsnitt som handlar om {teamName} samlas här. Inget har hittats
            ännu — hela poddflödet finns under Lyssna.
          </p>
        </div>
      ) : (
        <section>
          <h2 className="sr-only">Avsnitt</h2>
          <NanoEpisodeList episodes={episodes} teamNames={names} />
        </section>
      )}
    </div>
  );
}
