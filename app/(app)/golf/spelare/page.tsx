import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GolfSection, PlayerList } from "@/components/golf/cards";
import { starPlayers, swedishPlayers } from "@/lib/golf/catalog";
import { absoluteUrl } from "@/lib/site-url";
import { VERTICAL } from "@/lib/vertical";

export const metadata: Metadata = {
  title: "Spelare – svenskarna och världsstjärnorna",
  description: "Golfspelarna Nano Golf följer: de svenska spelarna på de stora tourerna, och ett urval av världens mest kända.",
  alternates: { canonical: absoluteUrl("/golf/spelare") },
};

export default function GolfPlayersPage() {
  if (VERTICAL !== "golf") notFound();
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 sm:px-8">
      <h1 className="font-bold text-4xl sm:text-5xl text-foreground text-balance">Spelare</h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Följ de spelare du bryr dig om. Flödet och startsidan utgår från dem när bevakningen startar.
      </p>

      <GolfSection title="Svenskarna" lead="Bevakningens fokus: de svenska spelarna på de stora tourerna.">
        <PlayerList players={swedishPlayers()} />
      </GolfSection>

      <GolfSection title="Världsstjärnor" lead="Ett urval av de mest kända namnen. Listan byggs ut.">
        <PlayerList players={starPlayers()} />
      </GolfSection>
    </div>
  );
}
