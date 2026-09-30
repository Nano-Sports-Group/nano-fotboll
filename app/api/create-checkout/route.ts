/**
 * app/api/create-checkout/route.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Skapar en Stripe Checkout Session för Nano Fotboll PRO/Elite.
 *
 * Beslut:
 * - Plan (pro/elite) + intervall (month/year) kommer från request-body, valideras
 *   mot lib/pricing.ts. Pris byggs via inline price_data (inga Stripe Price-ID:n
 *   behövs i dashboarden).
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

import { auth } from "@clerk/nextjs/server";
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

export async function POST(req: Request & { headers: Headers }) {
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

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "sek",
            product_data: {
              name: combo ? `Nano ${planMeta.label} (Fotboll + Hockey)` : `${vertical.productName} ${planMeta.label}`,
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
