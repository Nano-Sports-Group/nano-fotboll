/**
 * app/api/webhooks/stripe/route.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Stripe Webhook-handler för Nano Fotboll — mottagare i betalningskärnan
 * (docs/billing/ARCHITECTURE.md §6):
 *
 *   signatur → billing_claim_webhook → hämta om från Stripe → billing_apply_event
 *     → projektion till Clerk → billing_finish_webhook
 *
 * Beslut:
 * - Signaturverifiering via stripe.webhooks.constructEvent() – ALDRIG hoppa över.
 * - Raw body läses med req.text() (Next.js App Router kräver detta).
 * - Webhookar kommer i oordning, så prenumerationen HÄMTAS OM från Stripe i stället för att
 *   tro på payloaden. Belopp läses ur fakturan/återbetalningen hos Stripe, aldrig ur klienten.
 * - Planen (publicMetadata.plan / plans.hockey) skrivs bara av projectEntitlementsToClerk.
 * - Handlerfel → händelsen markeras `failed` och vi svarar 500 så Stripe försöker igen.
 * - Maps och TV bokförs här (huvudboken är kontoomfattande) men deras Clerk-fack ägs av
 *   apparnas egna webhookar och rörs aldrig.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Stripe from "stripe";
import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { logFunnelEvent } from "@/lib/funnel";
import { recordUtmMilestone } from "@/lib/utm-attribution";
import { createServiceClient } from "@/lib/supabase";
import { releaseFounderSeat } from "@/lib/waitlist/cohort";
import { grantReferralCreditsOnFirstPayment } from "@/lib/waitlist/referral";
import {
  clerkUserIdFromSubscription,
  subscriptionFromInvoice,
  subscriptionIdFrom,
} from "@/lib/waitlist/invoice-clerk";
import { claimWebhook, finishWebhook, payloadHash } from "@/lib/billing/apply";
import { ownsClerkProjection } from "@/lib/billing/products";
import {
  handleChargeRefunded,
  handleDisputeCreated,
  handleInvoicePaid,
  syncSubscription,
  vertical,
} from "@/lib/billing/stripe-sync";

type Outcome = "processed" | "ignored";

/** Fotbollsgrenens bieffekter (funnel, trial-milestone, Founder) gäller bara fotboll och kombo — som förut. */
const isFootballFlow = (v: string | undefined) => v === undefined || v === "football" || v === "both";

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

  let claim;
  try {
    claim = await claimWebhook("stripe", event.id, event.type, payloadHash(body));
  } catch (err) {
    // Utan claim vet vi inte om händelsen redan är hanterad — Stripe får försöka igen.
    console.error("[stripe-webhook] claim misslyckades:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Kunde inte registrera händelsen" }, { status: 500 });
  }
  if (claim === "done") return NextResponse.json({ received: true, duplicate: true });
  if (claim === "busy") return NextResponse.json({ error: "Händelsen hanteras redan" }, { status: 409 });

  try {
    const outcome = await handle(stripe, event);
    await finishWebhook("stripe", event.id, outcome);
    return NextResponse.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[stripe-webhook] ${event.type} ${event.id} misslyckades:`, message);
    try {
      await finishWebhook("stripe", event.id, "failed", message);
    } catch (finishError) {
      console.error("[stripe-webhook] kunde inte markera failed:", finishError instanceof Error ? finishError.message : finishError);
    }
    return NextResponse.json({ error: "Händelsen kunde inte hanteras" }, { status: 500 });
  }
}

async function handle(stripe: Stripe, event: Stripe.Event): Promise<Outcome> {
  const clerk = await clerkClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const clerkUserId =
        session.client_reference_id ??
        (session.metadata?.clerkUserId as string | undefined);

      if (!clerkUserId) {
        console.error("[stripe-webhook] Saknar clerkUserId i session", session.id);
        return "ignored";
      }

      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (!subscriptionId) {
        console.warn("[stripe-webhook] Session utan prenumeration", session.id);
        return "ignored";
      }
      if (!session.metadata?.plan) {
        console.warn("[stripe-webhook] Saknar plan i session.metadata", session.id);
      }

      const synced = await syncSubscription(stripe, clerk, subscriptionId, event, { clerkUserId });
      const scope = session.metadata?.vertical;
      if (!synced || !isFootballFlow(scope)) return synced ? "processed" : "ignored";

      const plan = session.metadata?.plan === "elite" ? "elite" : "pro";

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
      return "processed";
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const synced = await syncSubscription(stripe, clerk, subscription.id, event);
      if (!synced) return "ignored";

      if (
        event.type !== "customer.subscription.deleted" &&
        synced.sub.status === "trialing" &&
        isFootballFlow(vertical(synced.sub)) &&
        ownsClerkProjection(vertical(synced.sub))
      ) {
        await recordUtmMilestone({
          event: "trial_start",
          clerkUserId: synced.clerkUserId,
          path: "/prenumerera",
          properties: {
            plan: synced.sub.metadata?.plan === "elite" ? "elite" : "pro",
            source: `subscription.${event.type.split(".").pop()}`,
            subscriptionId: synced.sub.id,
          },
          skipCookie: true,
        });
      }
      console.log(`[stripe-webhook] ${event.type} för ${synced.clerkUserId}`);
      return "processed";
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
        return "processed";
      }
      return "ignored";
    }

    case "invoice.paid":
      return handleInvoicePaid(stripe, clerk, event, event.data.object as Stripe.Invoice);

    /**
     * Betalning misslyckades: prenumerationen blir past_due hos Stripe och hämtas om här.
     * Hur länge åtkomsten består avgör databasen (billing.stripe_past_due_grace_days).
     */
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = subscriptionIdFrom(subscriptionFromInvoice(invoice));
      if (!subscriptionId) return "ignored";
      return (await syncSubscription(stripe, clerk, subscriptionId, event)) ? "processed" : "ignored";
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
      if (!userId) return "ignored";

      const paidSubscriptionId = subscriptionIdFrom(subRef);
      if (paidSubscriptionId) {
        try {
          const paidSub = await stripe.subscriptions.retrieve(paidSubscriptionId);
          if (paidSub.metadata?.vertical === "hockey" || paidSub.metadata?.vertical === "maps") return "ignored";
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
      return "processed";
    }

    case "charge.refunded":
      return handleChargeRefunded(stripe, event, event.data.object as Stripe.Charge);

    case "charge.dispute.created":
      return handleDisputeCreated(stripe, event, event.data.object as Stripe.Dispute);

    default:
      // Ignorera övriga events
      return "ignored";
  }
}
