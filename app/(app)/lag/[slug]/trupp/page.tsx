import type { Metadata } from "next";
import { loadTeamSection } from "@/lib/team-hub/loadTeamSection";
import { TeamSection } from "@/components/team-hub/TeamSection";
import { ProductEventTracker } from "@/components/analytics/ProductEventTracker";
import { getSiteUrl } from "@/lib/site-url";
import { VERTICAL, vertical } from "@/lib/vertical";
import { getHockeySquad } from "@/lib/team-hub/hockey-squad";
import { HockeySquad } from "@/components/team-hub/HockeySquad";

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { hub } = await loadTeamSection(slug);
  return {
    title: `${hub.team.name} — Trupp | ${vertical.productName}`,
    description: `Spelartrupp och nyckelspelare för ${hub.team.name} i ${hub.team.league}.`,
    alternates: { canonical: `${getSiteUrl()}/lag/${slug}/trupp` },
  };
}

export default async function LagTruppPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { hub, plan, insights } = await loadTeamSection(slug);

  return (
    <div className="max-w-6xl mx-auto pb-6">
      <h1 className="font-bold text-3xl text-foreground mb-6 text-balance">
        TRUPP — {hub.team.name.toUpperCase()}
      </h1>
      <ProductEventTracker
        event="team_hub_tab_selected"
        props={{ team_slug: slug, team_id: hub.team.id, tab: "trupp" }}
      />
      {VERTICAL === "hockey" ? (
        // Hockeyn har egna kolumner (poäng, inga minuter eller betyg) och egen källa.
        <HockeySquad rows={await getHockeySquad(hub.team.sportsmonks_id)} />
      ) : (
        <TeamSection section="trupp" hub={hub} plan={plan} insights={insights} />
      )}
    </div>
  );
}
