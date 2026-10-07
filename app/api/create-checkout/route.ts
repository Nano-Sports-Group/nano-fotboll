/**
 * app/api/create-checkout/route.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Skapar en Stripe Checkout Session för Nano Fotboll PRO/Elite.
 *
 * Beslut:
 * - Plan (pro/elite) + intervall (month/year) kommer från request-body, valideras
 *   mot lib/pricing.ts. Priset är katalogpriset i Stripe (lib/stripe-catalog.ts, uppslaget på
 *   lookup_key); saknas det eller stämmer det inte med koden byggs priset inline som förut.
 * - clerkUserId + plan + interval sparas i metadata → webhooken sätter rätt plan.
 * - success_url → /konto?checkout=success, cancel_url → /prenumerera.
 *
 * Founder-grinden är den viktiga delen. Tidigare läste den `FOUNDER_OFFER.active`
 * — en hårdkodad `true` — och gav alltså 69 kr/mån för alltid till varje
 * PRO-köpare, i evighet, oavsett hur många av de 500 platserna som fanns kvar.
 * Nu avgör potten och en atomär reservation av en betald plats:
 *
 *   - waitlist-kohort `founder` → 69 kr, även när potten är slut (låst avtal)
 *   - walk-in medan potten är öppen OCH waitlist-läget är av → 69 kr, tar en pott-plats
 *   - WAITLIST_MODE: walk-in får aldrig Founder (befintliga konton ska inte äta kön)
 *   - alla andra, och alla över taket 500 betalda → 89 kr, tyst
 *
 * `metadata.founder` MÅSTE alltid spegla `unit_amount` — Stripe-webhooken sätter
 * Founder-märket på den strängen, och en badge utan rabatt (eller tvärtom) är
 * omöjlig att reda ut i efterhand.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { auth, currentUser } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/ratelimit";
import { logFunnelEvent } from "@/lib/funnel";
import {
  ANNUAL_DISCOUNT,
  TRIAL_DAYS,
  isPaidPlan,
  isBillingInterval,
  type PaidPlan,
  type BillingInterval,
  COMBO_PRICING,
  SPORT_PRICING,
  isComboEnabled,
  scopeAmountFor,
  type SubscriptionScope,
} from "@/lib/pricing";
import { isFounderOfferPublic } from "@/lib/founder-offer";
import { isWaitlistMode } from "@/lib/waitlist/mode";
import {
  claimsPotSeat,
  isEntitledToFounder,
  loadWaitlistByClerkUser,
  releaseFounderSeat,
  reserveFounderSeat,
} from "@/lib/waitlist/cohort";
import { getSiteUrl } from "@/lib/site-url";
import { VERTICAL, vertical } from "@/lib/vertical";
import { catalogRef } from "@/lib/stripe-catalog";
import { catalogPriceId } from "@/lib/stripe-price";
import { getEntitlements } from "@/lib/billing/entitlements";
import { billingDb } from "@/lib/billing/db";
import { getOrCreateStripeCustomer } from "@/lib/billing/stripe-customer";

/** Slås på i system_config (billing.stripe_tax_enabled) när Stripe Tax är konfigurerat. Av = oförändrat beteende. */
async function isStripeTaxEnabled(): Promise<boolean> {
  try {
    const { data } = await billingDb().from("system_config").select("value").eq("key", "billing").maybeSingle();
    return (data as { value?: { stripe_tax_enabled?: unknown } } | null)?.value?.stripe_tax_enabled === true;
  } catch {
    return false;
  }
}

export async function POST(req: Request & { headers: Headers }) {
  // Golf har inget pris än — kassan finns inte där. Först av allt: golf har ingen Stripe-nyckel,
  // och new Stripe() utan nyckel kastar (500 i stället för ett rent nej).
  if (VERTICAL === "golf") {
    return NextResponse.json({ error: "Nano Golf säljer inget än" }, { status: 400 });
  }

  // Lazy-init Stripe för att undvika build-time env-krav
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-04-22.dahlia",
  });

  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      { error: "Du måste vara inloggad för att prenumerera." },
      { status: 401 }
    );
  }

  const blocked = await enforceRateLimit("checkout", req, userId);
  if (blocked) return blocked;

  // Defaults: PRO månadsvis. Body kan override:a.
  let plan: PaidPlan = "pro";
  let interval: BillingInterval = "month";
  let combo = false;
  try {
    const body = (await req.json()) as { plan?: unknown; interval?: unknown; combo?: unknown };
    if (isPaidPlan(body.plan)) plan = body.plan;
    if (isBillingInterval(body.interval)) interval = body.interval;
    combo = body.combo === true;
  } catch {
    // Ingen/ogiltig body → behåll defaults
  }
  // Kombo säljs bara när founder godkänt priset (lib/pricing → isComboEnabled).
  if (combo && !isComboEnabled()) {
    return NextResponse.json({ error: "Kombo är inte tillgänglig" }, { status: 400 });
  }
  // Omfånget kommer från deployen (eller kombo-valet), aldrig fritt ur bodyn.
  const scope: SubscriptionScope = combo ? "both" : VERTICAL;
  // Hockey säljer ingen Elite ensamt (bara i Elite Kombo).
  if (plan === "elite" && scope === "hockey") {
    return NextResponse.json({ error: "Elite finns inte för hockey än" }, { status: 400 });
  }

  // Ett andra köp av något man redan har blir dubbeldebitering. Kollen sker FÖRE Founder-reservationen,
  // så ingen plats behöver släppas på den här vägen. Misslyckas läsningen blockerar vi inte köpet.
  try {
    const owned = await getEntitlements(userId);
    const duplicatesFootball = (scope === "football" || scope === "both") && (owned.football_pro || owned.football_elite);
    const duplicatesHockey = (scope === "hockey" || scope === "both") && owned.hockey_pro;
    if (duplicatesFootball || duplicatesHockey) {
      return NextResponse.json(
        { error: "Du har redan en aktiv prenumeration som täcker det här. Hantera den under Konto." },
        { status: 409 },
      );
    }
  } catch (err) {
    console.error("[create-checkout] kunde inte läsa rättigheter, släpper igenom:", err instanceof Error ? err.message : err);
  }

  const planMeta = combo ? COMBO_PRICING[plan] : SPORT_PRICING[VERTICAL][plan];

  // ── Founder-grind ─────────────────────────────────────────────────────────
  // Elite är aldrig Founder. För PRO: eget avtal (waitlist-kohort) eller
  // walk-in medan potten är öppen — och i båda fallen bara om en betald plats
  // faktiskt gick att reservera.
  let founder = false;
  let claimedPot = false;
  // Hockey får inte ta en plats i fotbollens Founder-pott.
  if (scope === "football" && plan === "pro") {
    const [waitlist, publicFounder] = await Promise.all([
      loadWaitlistByClerkUser(userId),
      isFounderOfferPublic(),
    ]);
    if (
      isEntitledToFounder({
        plan,
        waitlist,
        founderOfferPublic: publicFounder,
        waitlistMode: isWaitlistMode(),
      })
    ) {
      // Walk-in tar en pott-plats; waitlist-founder har redan sin.
      claimedPot = claimsPotSeat(waitlist);
      founder = await reserveFounderSeat(claimedPot);
      if (!founder) claimedPot = false;
    }
  }

  const unitAmount = scopeAmountFor(scope, plan, interval, { founder });
  const founderFlag = String(founder);
  const discountPct = Math.round(ANNUAL_DISCOUNT * 100);

  const base = getSiteUrl();
  const priceId = await catalogPriceId(stripe, catalogRef(scope, plan, interval, { founder }).lookupKey, unitAmount, interval);

  try {
    // EN Stripe-kund per användare (fakturor, portal och återbetalningar samlas på samma kund).
    const email = (await currentUser())?.primaryEmailAddress?.emailAddress ?? null;
    const customer = await getOrCreateStripeCustomer(stripe, userId, email);
    const taxEnabled = await isStripeTaxEnabled();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      // Utan locale följer kassan webbläsarens språk — engelsk telefon gav engelsk kassa.
      locale: "sv",
      ...(taxEnabled
        ? {
            automatic_tax: { enabled: true },
            customer_update: { address: "auto" as const },
            billing_address_collection: "required" as const,
          }
        : {}),
      payment_method_types: ["card"],
      line_items: [
        priceId
          ? { price: priceId, quantity: 1 }
          : {
              price_data: {
                currency: "sek",
                product_data: {
                  name: combo ? `${planMeta.label} (alla sporter)` : `${vertical.productName} ${planMeta.label}`,
                  description:
                    interval === "year"
                      ? `${planMeta.label}-prenumeration, årsvis (${discountPct} % rabatt)`
                      : `${planMeta.label}-prenumeration, månadsvis`,
                },
                unit_amount: unitAmount,
                recurring: { interval },
              },
              quantity: 1,
            },
      ],
      client_reference_id: userId,
      metadata: { clerkUserId: userId, plan, interval, founder: founderFlag, founderClaimedPot: String(claimedPot), vertical: scope },
      success_url: `${base}/konto?checkout=success`,
      cancel_url: `${base}/prenumerera`,
      subscription_data: {
        trial_period_days: TRIAL_DAYS,
        metadata: { clerkUserId: userId, plan, interval, founder: founderFlag, founderClaimedPot: String(claimedPot), vertical: scope },
      },
    });

    await logFunnelEvent("checkout_start", userId, { plan, interval, founder });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    // Sessionen blev aldrig till — då får platsen inte ligga kvar reserverad.
    if (founder) await releaseFounderSeat(claimedPot);
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[create-checkout] STRIPE ERROR:", msg);
    return NextResponse.json(
      { error: "Kunde inte skapa betalningssession. Försök igen om en stund." },
      { status: 500 }
    );
  }
}
