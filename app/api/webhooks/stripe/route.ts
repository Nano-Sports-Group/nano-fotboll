/**
 * app/api/webhooks/stripe/route.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Stripe Webhook-handler för Nano Fotboll.
 *
 * Hanterar:
 *  - checkout.session.completed → sätter Clerk publicMetadata.plan='pro|elite'
 *  - customer.subscription.deleted → sätter plan='free'
 *
 * Beslut:
 * - Signaturverifiering via stripe.webhooks.constructEvent() – ALDRIG hoppa över.
 * - Clerk Admin SDK (clerkClient) används server-side för att uppdatera metadata.
 * - Raw body läses med req.text() (Next.js App Router kräver detta).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Stripe from "stripe";
import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { logFunnelEvent } from "@/lib/funnel";
import { updatePlanSource } from "@/lib/entitlements";
import { recordUtmMilestone } from "@/lib/utm-attribution";
import { markNewsletterPlanDirty } from "@/lib/newsletter/service";
import { createServiceClient } from "@/lib/supabase";
import { releaseFounderSeat } from "@/lib/waitlist/cohort";
import { grantReferralCreditsOnFirstPayment } from "@/lib/waitlist/referral";
import {
  clerkUserIdFromSubscription,
  subscriptionFromInvoice,
  subscriptionIdFrom,
} from "@/lib/waitlist/invoice-clerk";
import { writeHockeyPlan } from "@/lib/hockey-plan";

// Lazy — initieras i POST() för att undvika build-time env-fel;

export async function POST(req: Request) {
  // Lazy-init för att undvika build-time krav på env-vars
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-04-22.dahlia",
  });
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Saknar stripe-signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe-webhook] Signaturverifiering misslyckades:", err);
    return NextResponse.json(
      { error: "Ogiltig webhook-signatur" },
      { status: 400 }
    );
  }

  // Nano Maps Pro och Nano TV Plus säljs i samma Stripe-konto men ägs av apparnas egna
  // webhookar (`plans.maps`, `plans.tv`). Utan den här spärren föll ett Maps-köp ner i
  // fotbollsgrenen och gav fotbolls-PRO för 49 kr.
  const eventMeta = (event.data.object as { metadata?: Record<string, string> | null }).metadata;
  if (eventMeta?.vertical === "maps" || eventMeta?.vertical === "tv") {
    return NextResponse.json({ received: true });
  }

  const clerk = await clerkClient();
  async function markNewsletterPlan(clerkUserId: string, plan: string) {
    try {
      await markNewsletterPlanDirty(clerkUserId, plan);
    } catch (error) {
      console.error(
        "[stripe-webhook] newsletter dirty mark failed",
        error instanceof Error ? error.message : "unknown",
      );
    }
  }

  // ─── Hantera events ────────────────────────────────────────────────────────
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const clerkUserId =
        session.client_reference_id ??
        (session.metadata?.clerkUserId as string | undefined);

      if (!clerkUserId) {
        console.error("[stripe-webhook] Saknar clerkUserId i session", session.id);
        break;
      }

      // Kombo: hockeyfacket skrivs här, sedan fortsätter fotbollsgrenen nedan.
      if (session.metadata?.vertical === "both") {
        await writeHockeyPlan(clerk, clerkUserId, session.metadata?.plan === "elite" ? "elite" : "pro", {
          customerId: typeof session.customer === "string" ? session.customer : null,
          subscriptionId: typeof session.subscription === "string" ? session.subscription : null,
        });
      }

      if (session.metadata?.vertical === "hockey") {
        const hockeyPlan = session.metadata?.plan === "elite" ? "elite" : "pro";
        await writeHockeyPlan(clerk, clerkUserId, hockeyPlan, {
          customerId: typeof session.customer === "string" ? session.customer : null,
          subscriptionId: typeof session.subscription === "string" ? session.subscription : null,
        });
        console.log(`[stripe-webhook] Hockey ${hockeyPlan.toUpperCase()} för ${clerkUserId}`);
        break;
      }

      if (!session.metadata?.plan) {
        console.warn("[stripe-webhook] Saknar plan i session.metadata", session.id);
      }
      const plan = session.metadata?.plan === "elite" ? "elite" : "pro";

      const effectivePlan = await updatePlanSource(clerkUserId, "stripe", plan);
      await clerk.users.updateUserMetadata(clerkUserId, {
        privateMetadata: {
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: session.subscription as string,
        },
      });
      await markNewsletterPlan(clerkUserId, effectivePlan);

      // Founder-märket sätts först här: det ska bevisa ett genomfört köp till
      // Founder-pris, inte en plats i en kö. Platsen är redan reserverad i
      // create-checkout, så ingen räknare rörs — bara märket.
      if (session.metadata?.founder === "true") {
        await clerk.users.updateUserMetadata(clerkUserId, {
          publicMetadata: { founder: true },
        });
        // Waitlist-raden speglar samma sak, så admin ser vem som faktiskt köpte.
        try {
          const db = createServiceClient();
          await db.from("waitlist").update({ status: "completed" }).eq("clerk_user_id", clerkUserId);
        } catch {
          // Märket i Clerk är sanningen; spegling är bekvämlighet.
        }
      }

      await logFunnelEvent("checkout_success", clerkUserId, { plan });
      // trial_start skrivs från subscription.* när status === "trialing"
      // (inte här — checkout kan vara direktbetalning utan trial).

      console.log(`[stripe-webhook] ${plan.toUpperCase()} aktiverat för ${clerkUserId}`);
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const clerkUserId = subscription.metadata?.clerkUserId;
      if (!clerkUserId) break;

      // Omfångsbyte (lägg till/ta bort sport): den sport som föll bort blir free.
      const previousScope = (
        (event.data as { previous_attributes?: { metadata?: Record<string, string> } }).previous_attributes?.metadata
      )?.vertical;
      const scope = subscription.metadata?.vertical ?? "football";
      if (previousScope === "both" && scope === "football") {
        await writeHockeyPlan(clerk, clerkUserId, "free", { subscriptionId: null });
      }
      if (previousScope === "both" && scope === "hockey") {
        const effective = await updatePlanSource(clerkUserId, "stripe", "free");
        await clerk.users.updateUserMetadata(clerkUserId, { privateMetadata: { stripeSubscriptionId: null } });
        await markNewsletterPlan(clerkUserId, effective);
      }
      if (scope === "both") {
        const alive = subscription.status === "active" || subscription.status === "trialing";
        await writeHockeyPlan(clerk, clerkUserId, !alive ? "free" : subscription.metadata?.plan === "elite" ? "elite" : "pro", {
          customerId: typeof subscription.customer === "string" ? subscription.customer : null,
          subscriptionId: subscription.id,
        });
      }

      if (subscription.metadata?.vertical === "hockey") {
        const alive = subscription.status === "active" || subscription.status === "trialing";
        const hockeyPlan = !alive ? "free" : subscription.metadata?.plan === "elite" ? "elite" : "pro";
        await writeHockeyPlan(clerk, clerkUserId, hockeyPlan, {
          customerId: typeof subscription.customer === "string" ? subscription.customer : null,
          subscriptionId: subscription.id,
        });
        break;
      }

      const periodEndTs = (subscription as unknown as { current_period_end?: number }).current_period_end;
      const currentPeriodEnd = periodEndTs
        ? new Date(periodEndTs * 1000).toISOString()
        : undefined;

      if (
        subscription.status === "past_due" ||
        subscription.status === "unpaid" ||
        subscription.status === "canceled"
      ) {
        const effectivePlan = await updatePlanSource(clerkUserId, "stripe", "free");
        await clerk.users.updateUserMetadata(clerkUserId, {
          privateMetadata: {
            stripeCustomerId: subscription.customer as string,
            stripeSubscriptionId: subscription.id,
            subscription: {
              id: subscription.id,
              status: subscription.status,
              currentPeriodEnd,
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
            },
          },
        });
        await markNewsletterPlan(clerkUserId, effectivePlan);
      } else if (subscription.status === "active" || subscription.status === "trialing") {
        const plan = subscription.metadata?.plan === "elite" ? "elite" : "pro";
        const effectivePlan = await updatePlanSource(clerkUserId, "stripe", plan);
        await clerk.users.updateUserMetadata(clerkUserId, {
          privateMetadata: {
            stripeCustomerId: subscription.customer as string,
            stripeSubscriptionId: subscription.id,
            subscription: {
              id: subscription.id,
              status: subscription.status,
              plan,
              currentPeriodEnd,
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
            },
          },
        });
        await markNewsletterPlan(clerkUserId, effectivePlan);
        if (subscription.status === "trialing") {
          await recordUtmMilestone({
            event: "trial_start",
            clerkUserId,
            path: "/prenumerera",
            properties: {
              plan,
              source: `subscription.${event.type.split(".").pop()}`,
              subscriptionId: subscription.id,
            },
            skipCookie: true,
          });
        }
      }
      console.log(`[stripe-webhook] subscription.${event.type.split(".").pop()} för ${clerkUserId}`);
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const clerkUserId = subscription.metadata?.clerkUserId;

      if (!clerkUserId) {
        console.error("[stripe-webhook] Saknar clerkUserId i subscription", subscription.id);
        break;
      }

      if (subscription.metadata?.vertical === "hockey" || subscription.metadata?.vertical === "both") {
        await writeHockeyPlan(clerk, clerkUserId, "free", {
          subscriptionId: null,
        });
        console.log(`[stripe-webhook] Hockey-prenumeration avbruten för ${clerkUserId}`);
        // Kombo: fotbollen avslutas också — fortsätt till fotbollsgrenen.
        if (subscription.metadata?.vertical === "hockey") break;
      }

      const effectivePlan = await updatePlanSource(clerkUserId, "stripe", "free");
      await clerk.users.updateUserMetadata(clerkUserId, {
        privateMetadata: {
          stripeSubscriptionId: null,
          subscription: null,
        },
      });
      await markNewsletterPlan(clerkUserId, effectivePlan);

      console.log(`[stripe-webhook] Prenumeration avbruten för ${clerkUserId}`);
      break;
    }

    /**
     * En Founder-plats reserveras när checkouten SKAPAS, så taket aldrig kan
     * passeras av samtidiga köp. Priset är att en övergiven checkout håller en
     * plats — här får den tillbaka.
     */
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.founder === "true") {
        await releaseFounderSeat(session.metadata?.founderClaimedPot === "true");
        console.log(`[stripe-webhook] Founder-plats släppt (utgången checkout ${session.id})`);
      }
      break;
    }

    /**
     * Värvningskredit. Trial-fakturan är 0 kr och faller på `amountPaidOre`-
     * kontrollen inne i granten — den är avsiktligt inte ett filter här, så
     * regeln bor på ett ställe.
     */
    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const subRef = subscriptionFromInvoice(invoice);
      let userId = clerkUserIdFromSubscription(subRef);
      if (!userId) {
        const subscriptionId = subscriptionIdFrom(subRef);
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          userId = sub.metadata?.clerkUserId;
        }
      }
      if (!userId) break;

      const paidSubscriptionId = subscriptionIdFrom(subRef);
      if (paidSubscriptionId) {
        try {
          const paidSub = await stripe.subscriptions.retrieve(paidSubscriptionId);
          if (paidSub.metadata?.vertical === "hockey" || paidSub.metadata?.vertical === "maps") break;
        } catch {
          // Fotbollens värvningskredit får inte blockeras av ett misslyckat uppslag.
        }
      }

      await grantReferralCreditsOnFirstPayment({
        stripe,
        clerk,
        clerkUserId: userId,
        amountPaidOre: invoice.amount_paid ?? 0,
      });
      break;
    }

    default:
      // Ignorera övriga events
      break;
  }

  return NextResponse.json({ received: true });
}
