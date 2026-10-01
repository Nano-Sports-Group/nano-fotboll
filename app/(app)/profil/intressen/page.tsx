import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { InterestSettingsClient } from "./InterestSettingsClient";
import { getUserFeedPreferences } from "@/lib/feed/getUserFeedPreferences";
import { SPORT, vertical } from "@/lib/vertical";

export const metadata: Metadata = {
  title: `Mina intressen — ${vertical.productName}`,
  description: "Välj vilka typer av nyheter som ska prioriteras i ditt flöde.",
};

export default async function IntressenPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const prefs = await getUserFeedPreferences();

  return (
    <div className="mx-auto max-w-lg px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-foreground text-balance">Mina intressen</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Styr vilka typer av nyheter som filtreras i ditt flöde och på /nyheter.
        Statistik och tabeller påverkar inte nyhetsfiltret — de finns under Statistik.
      </p>
      <InterestSettingsClient
        initialSelected={prefs.contentTypes}
        initialNational={prefs.nationalInterest}
        showNational={SPORT === "football"}
      />
    </div>
  );
}
