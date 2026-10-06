import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { isFounderOfferPublic } from "@/lib/founder-offer";
import { isWaitlistMode } from "@/lib/waitlist/mode";
import { SELLS } from "@/lib/pricing";
import { OnboardingClient } from "./OnboardingClient";
import { recordUtmMilestone } from "@/lib/utm-attribution";
import { VERTICAL } from "@/lib/vertical";
import { favoriteFromMeta, onboardingDoneFromMeta } from "@/lib/favorite-meta";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Välkommen | Nano Fotboll",
  description: "Välj ditt lag och anpassa Nano Fotboll efter dig.",
  robots: { index: false, follow: false },
};

/**
 * Polsia 2.0 S2 — growth loop signup attribution.
 * Onboarding is the first cookie-bearing page after signup (Clerk webhook
 * has no browser cookies). Idempotent via utm_events unique indexes.
 */
async function recordUtmSignupIfNeeded(clerkUserId: string): Promise<void> {
  await recordUtmMilestone({
    event: "signup",
    clerkUserId,
    path: "/onboarding",
  });
}

export default async function OnboardingPage() {
  let presetTeam: string | null = null;

  const user = await currentUser();
  if (user) {
    await recordUtmSignupIfNeeded(user.id);
    const meta = user.unsafeMetadata as Record<string, unknown> | undefined;

    // Klar onboarding = ingen onboarding.
    if (onboardingDoneFromMeta(meta, VERTICAL)) redirect("/feed");

    // Kom hen via waitlisten är laget redan valt (speglat i user.created-
    // webhooken). Då hoppar vi lagsteget — men INTE hela onboardingen: hen har
    // aldrig sett push-frågan, och att tysta bort den vore mer överraskande än
    // att visa den. Tidigare redirectade den här raden på `favoriteTeam` och
    // gjorde just det.
    const team = favoriteFromMeta(meta, VERTICAL);
    if (typeof team === "string" && team.length > 0) presetTeam = team;
  }

  // Founder-priset visas bara medan potten är öppen — klienten får aldrig gissa (lib/founder-offer).
  const founderPublic = SELLS && VERTICAL === "football" && !isWaitlistMode() && (await isFounderOfferPublic());
  return <OnboardingClient presetTeam={presetTeam} founderPublic={founderPublic} signedIn={Boolean(user)} />;
}
