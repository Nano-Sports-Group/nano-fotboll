import type { Metadata } from "next";
import { loadTeamSection } from "@/lib/team-hub/loadTeamSection";
import { TeamSection } from "@/components/team-hub/TeamSection";
import { ProductEventTracker } from "@/components/analytics/ProductEventTracker";
import { getSiteUrl } from "@/lib/site-url";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { hub } = await loadTeamSection(slug);
  return {
    title: `${hub.team.name} — Matcher | Nano Fotboll`,
    description: `Spelade och kommande matcher för ${hub.team.name} i ${hub.team.league}.`,
    alternates: { canonical: `${getSiteUrl()}/lag/${slug}/matcher` },
  };
}

export default async function LagMatcherPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { hub, plan, insights } = await loadTeamSection(slug);

  return (
    <div className="max-w-6xl mx-auto pb-6">
      <h1 className="font-bold text-3xl text-foreground mb-6 text-balance">
        MATCHER — {hub.team.name.toUpperCase()}
      </h1>
      <ProductEventTracker
        event="team_hub_tab_selected"
        props={{ team_slug: slug, team_id: hub.team.id, tab: "matcher" }}
      />
      <TeamSection section="matcher" hub={hub} plan={plan} insights={insights} />
    </div>
  );
}
