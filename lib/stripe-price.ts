/**
 * lib/stripe-price.ts — hämtar katalogpriset för en prenumeration.
 *
 * Returnerar pris-id:t bara när katalogpriset är aktivt, i SEK, och har exakt det belopp och
 * intervall som lib/pricing.ts säger. Annars `null`, och anroparen bygger priset inline som förut.
 * En katalog som saknas eller har glidit isär får alltså aldrig stoppa ett köp eller dra fel belopp.
 */

import "server-only";
import type Stripe from "stripe";
import type { BillingInterval } from "@/lib/pricing";

export async function catalogPriceId(
  stripe: Stripe,
  lookupKey: string,
  amount: number,
  interval: BillingInterval,
): Promise<string | null> {
  try {
    const { data } = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
    const price = data[0];
    if (!price) {
      console.warn(`[stripe-catalog] ${lookupKey} saknas i Stripe — kör pnpm stripe:catalog --apply`);
      return null;
    }
    if (price.unit_amount !== amount || price.currency !== "sek" || price.recurring?.interval !== interval) {
      console.error(`[stripe-catalog] ${lookupKey} stämmer inte med lib/pricing.ts (${price.unit_amount} ≠ ${amount}) — inline-pris används`);
      return null;
    }
    return price.id;
  } catch (err) {
    console.error("[stripe-catalog] prisuppslag misslyckades:", err instanceof Error ? err.message : err);
    return null;
  }
}
