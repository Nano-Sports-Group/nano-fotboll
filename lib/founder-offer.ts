/**
 * lib/founder-offer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Founder-potten — enda sanningen för om Founder får visas som erbjudande.
 *
 * Potten är en rad i `public.founder_offer_state`, inte en boolean i kod. När
 * `claimed` når `cap` (500) FÖRSVINNER Founder ur all publik UI: landning,
 * /prenumerera, paywall, FAQ, konto, waitlist-hero. Ingen överstruken 69, ingen
 * "full men klicka ändå".
 *
 * Den som redan har `cohort='founder'` får fortfarande 69 i checkout — det är
 * ett låst avtal, inte ett publikt alternativ. Se `app/api/create-checkout`.
 *
 * Server-only: modulen läser DB med service-role. Klientkomponenter tar
 * `founderPublic` som prop från en server parent.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase";
import { FOUNDER_OFFER } from "@/lib/pricing";
import { VERTICAL } from "@/lib/vertical";

export interface FounderPotState {
  cap: number;
  claimed: number;
  remaining: number;
}

/**
 * 30 sekunder, aldrig en timme. Potten styr ett pris — en besökare får inte se
 * "69 kr" en timme efter att plats 500 tog slut. Datacachen överlever deploys,
 * så nyckeln bär ett versionsnummer: ändra formen på värdet → bumpa den.
 */
const CACHE_KEY = ["founder-offer-state-v1"];
const CACHE_SECONDS = 30;

async function readPotUncached(): Promise<FounderPotState> {
  const fallback: FounderPotState = { cap: FOUNDER_OFFER.cap, claimed: FOUNDER_OFFER.cap, remaining: 0 };
  if (!isSupabaseConfigured()) return fallback;

  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("founder_offer_state")
      .select("cap, claimed")
      .eq("id", true)
      .maybeSingle();

    if (error || !data) return fallback;

    const cap = Number((data as { cap: number }).cap) || FOUNDER_OFFER.cap;
    const claimed = Number((data as { claimed: number }).claimed) || 0;
    return { cap, claimed, remaining: Math.max(0, cap - claimed) };
  } catch {
    return fallback;
  }
}

/**
 * Fail-closed: kan vi inte läsa potten visar vi INTE Founder. Ett rabatterat
 * pris som läcker ut vid en DB-blink kostar 20 kr/mån i evighet per kund —
 * en dold Founder-rad kostar ingenting och rättar sig själv vid nästa läsning.
 */
export const getFounderPot = unstable_cache(readPotUncached, CACHE_KEY, {
  revalidate: CACHE_SECONDS,
  tags: ["founder-offer"],
});

/** Claim, reserve och release måste slå hål i 30s-cachen — annars ljuger UI. */
export function invalidateFounderOfferCache(): void {
  revalidateTag("founder-offer", "max");
}

/** Får Founder visas som erbjudande i publik UI? Aldrig på hockey: checkouten där ger aldrig 69. */
export async function isFounderOfferPublic(): Promise<boolean> {
  if (VERTICAL !== "football") return false;
  const pot = await getFounderPot();
  return pot.remaining > 0;
}

/** Antal kvarvarande Founder-platser. */
export async function founderRemaining(): Promise<number> {
  return (await getFounderPot()).remaining;
}

/**
 * "X av 500 platser" — men bara när det finns något att räkna. Under 20
 * claimade är siffran mest brus på en nyöppnad lista, och speccen vill hellre
 * se "500 platser" än "3 av 500".
 */
export function formatSeatsLabel(pot: FounderPotState): string {
  if (pot.claimed < 20) return `${pot.cap} platser`;
  return `${pot.remaining} av ${pot.cap} platser`;
}
