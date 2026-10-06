/**
 * POST /api/billing/sports — lägg till eller ta bort en sport på befintlig prenumeration.
 *
 * Body: { action: "add" | "remove", sport: "football" | "hockey" }
 * - add:    en enskild sport → kombo (Fotboll + Hockey). Priset byts i Stripe med proration.
 * - remove: kombo → den sport som är kvar. Den borttagna sporten blir free direkt.
 * Att ta bort sista sporten är en uppsägning och görs i kundportalen, inte här.
 *
 * Säkerhet: identitet från sessionen, prenumerationen måste ha metadata.clerkUserId
 * === inloggad användare, priset räknas alltid fram här (lib/pricing). Kombo kräver
 * isComboEnabled() — founder har godkänt priset.
 */

import Stripe from "stripe";
import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { enforceRateLimit } from "@/lib/ratelimit";
import {
  COMBO_PRICING,
  SPORT_PRICING,
  isComboEnabled,
  isPaidPlan,
  isSubscriptionScope,
  nextScope,
  scopeAmountFor,
  type BillingInterval,
  type SubscriptionScope,
} from "@/lib/pricing";
import { catalogRef } from "@/lib/stripe-catalog";
import { catalogPriceId } from "@/lib/stripe-price";
import { syncSubscription } from "@/lib/billing/stripe-sync";

/** Reservväg när katalogpriset saknas: Stripe kräver en produkt-id när en prenumerations pris byts. */
async function productFor(stripe: Stripe, productId: string, name: string): Promise<string> {
  try {
    return (await stripe.products.retrieve(productId)).id;
  } catch {
    return (await stripe.products.create({ id: productId, name })).id;
  }
}

export async function POST(req: Request & { headers: Headers }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Logga in först" }, { status: 401 });
  const blocked = await enforceRateLimit("checkout", req, userId);
  if (blocked) return blocked;

  let action: unknown;
  let sport: unknown;
  try {
    ({ action, sport } = (await req.json()) as { action?: unknown; sport?: unknown });
  } catch {
    return NextResponse.json({ error: "Ogiltig begäran" }, { status: 400 });
  }
  if ((action !== "add" && action !== "remove") || (sport !== "football" && sport !== "hockey")) {
    return NextResponse.json({ error: "Ogiltig begäran" }, { status: 400 });
  }
  if (!isComboEnabled()) return NextResponse.json({ error: "Kombo är inte tillgänglig" }, { status: 400 });

  const clerk = await clerkClient();
  const user = await clerk.users.getUser(userId);
  const priv = (user.privateMetadata ?? {}) as Record<string, unknown>;
  // Den prenumeration som ska ändras: vid add = den andra sportens; vid remove = kombon (ligger i båda fälten).
  const candidates = [priv.stripeSubscriptionId, priv.stripeHockeySubscriptionId].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  if (candidates.length === 0) return NextResponse.json({ error: "Ingen aktiv prenumeration" }, { status: 404 });

  // Lazy-init: aldrig module-level (CLAUDE.md).
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-04-22.dahlia" });

  const live: { sub: Stripe.Subscription; scope: SubscriptionScope }[] = [];
  for (const id of [...new Set(candidates)]) {
    const sub = await stripe.subscriptions.retrieve(id);
    if (sub.metadata?.clerkUserId !== userId) continue; // authz: bara egna prenumerationer
    if (sub.status !== "active" && sub.status !== "trialing") continue;
    live.push({ sub, scope: isSubscriptionScope(sub.metadata?.vertical) ? sub.metadata.vertical : "football" });
  }
  // Har man redan sporten (t.ex. två separata prenumerationer) blir "lägg till" dubbeldebitering.
  if (action === "add" && live.some((l) => l.scope === sport || l.scope === "both")) {
    return NextResponse.json({ error: "Du har redan den sporten" }, { status: 409 });
  }

  let subscription: Stripe.Subscription | null = null;
  let target: SubscriptionScope | null = null;
  for (const l of live) {
    const next = nextScope(l.scope, action, sport);
    if (next) {
      subscription = l.sub;
      target = next;
      break;
    }
  }
  if (!subscription || !target) {
    return NextResponse.json({ error: "Ändringen går inte att göra på din prenumeration" }, { status: 409 });
  }

  const currentPlan = isPaidPlan(subscription.metadata?.plan) ? subscription.metadata.plan : "pro";
  // Elite Kombo utan fotboll blir hockey PRO — hockey har ingen Elite.
  const plan = target === "hockey" ? "pro" : currentPlan;
  const item = subscription.items.data[0];
  const interval = (item?.price?.recurring?.interval === "year" ? "year" : "month") as BillingInterval;
  if (!item) return NextResponse.json({ error: "Prenumerationen saknar rad" }, { status: 409 });

  const label = target === "both" ? COMBO_PRICING[plan].label : SPORT_PRICING[target][plan].label;
  const founder = subscription.metadata?.founder === "true";
  // Founder-priset gäller bara fotboll ensam (kombo = ordinarie kombopris), men märket ligger
  // kvar i metadata: tar en founder bort hockey igen får hen tillbaka 69 kr ("för alltid").
  const unitAmount = scopeAmountFor(target, plan, interval, { founder });
  const ref = catalogRef(target, plan, interval, { founder });
  const priceId = await catalogPriceId(stripe, ref.lookupKey, unitAmount, interval);

  await stripe.subscriptions.update(subscription.id, {
    items: [
      priceId
        ? { id: item.id, price: priceId }
        : {
            id: item.id,
            price_data: {
              currency: "sek",
              product: await productFor(stripe, ref.productId, target === "both" ? label : `Nano ${target === "hockey" ? "Hockey" : "Fotboll"} ${label}`),
              unit_amount: unitAmount,
              recurring: { interval },
            },
          },
    ],
    metadata: { ...subscription.metadata, vertical: target, plan },
    proration_behavior: "create_prorations",
  });

  // Webhooken (subscription.updated) gör samma sak, men den borttagna sporten ska försvinna direkt
  // även om webhooken dröjer: bokför och projicera den uppdaterade prenumerationen nu. Idempotent.
  try {
    await syncSubscription(stripe, clerk, subscription.id, {
      id: `sports:${subscription.id}`,
      type: "customer.subscription.updated",
      created: Math.floor(Date.now() / 1000),
      livemode: subscription.livemode,
    });
  } catch (err) {
    console.error("[billing/sports] direktsynk misslyckades, webhooken tar över:", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ ok: true, scope: target, amount: unitAmount, interval });
}
