import "server-only";

import type { clerkClient } from "@clerk/nextjs/server";
import type Stripe from "stripe";
import { ELITE_AVAILABLE, isBillingInterval, isPaidPlan, isSubscriptionScope, type BillingInterval, type PaidPlan, type SubscriptionScope } from "@/lib/pricing";
import { catalogPriceId } from "@/lib/stripe-price";
import {
  buildPreviewParams,
  parseUpgradePreview,
  priceRefFor,
  upgradeEligibility,
  upgradeTarget,
  type IneligibleCode,
  type PriceRef,
  type UpgradeMode,
  type UpgradeTarget,
} from "./upgrade";

type Clerk = Awaited<ReturnType<typeof clerkClient>>;

/**
 * Användarens prenumeration som bär fotboll (omfång `football` eller `both`), hämtad på nytt från Stripe.
 * Samma uppslag som `/api/billing/sports`: id:n ur Clerks privateMetadata, och prenumerationens egen
 * `metadata.clerkUserId` måste vara den inloggade användaren (authz). Okänd eller raderad prenumeration = null.
 */
export async function findFootballSubscription(stripe: Stripe, clerk: Clerk, userId: string): Promise<Stripe.Subscription | null> {
  const user = await clerk.users.getUser(userId);
  const priv = (user.privateMetadata ?? {}) as Record<string, unknown>;
  const ids = [priv.stripeSubscriptionId, priv.stripeHockeySubscriptionId].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );

  for (const id of [...new Set(ids)]) {
    let sub: Stripe.Subscription;
    try {
      sub = await stripe.subscriptions.retrieve(id);
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 404) continue;
      throw err;
    }
    if (sub.metadata?.clerkUserId !== userId) continue;
    if (sub.status === "canceled" || sub.status === "incomplete_expired") continue;
    const scope = isSubscriptionScope(sub.metadata?.vertical) ? sub.metadata.vertical : "football";
    if (scope === "football" || scope === "both") return sub;
  }
  return null;
}

export type UpgradeSubject =
  | { eligible: false; code: IneligibleCode; httpStatus: 400 | 404 | 409; reason: string; currentPlan: PaidPlan | "free" }
  | {
      eligible: true;
      sub: Stripe.Subscription;
      item: Stripe.SubscriptionItem;
      mode: UpgradeMode;
      scope: SubscriptionScope;
      interval: BillingInterval;
      target: UpgradeTarget;
      currentPlan: "pro";
    };

/** Prenumerationen + beslutet om den får uppgraderas. Allt ur Stripe och sessionen — inget från klienten. */
export async function loadUpgradeSubject(stripe: Stripe, clerk: Clerk, userId: string): Promise<UpgradeSubject> {
  const sub = await findFootballSubscription(stripe, clerk, userId);
  const decision = upgradeEligibility(
    sub
      ? {
          status: sub.status,
          plan: sub.metadata?.plan,
          scope: sub.metadata?.vertical,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          cancelAt: sub.cancel_at ?? null,
        }
      : null,
    { eliteAvailable: ELITE_AVAILABLE },
  );
  const currentPlan: PaidPlan | "free" = sub && isPaidPlan(sub.metadata?.plan) ? sub.metadata.plan : "free";
  if (!decision.eligible) return { ...decision, currentPlan };

  const item = sub!.items.data[0];
  if (!item) {
    return { eligible: false, code: "bad_status", httpStatus: 409, reason: "Prenumerationen saknar rad och går inte att uppgradera.", currentPlan };
  }
  const rawInterval = item.price?.recurring?.interval;
  const interval: BillingInterval = isBillingInterval(rawInterval) ? rawInterval : "month";
  return {
    eligible: true,
    sub: sub!,
    item,
    mode: decision.mode,
    scope: decision.scope,
    interval,
    target: upgradeTarget(decision.scope, interval),
    currentPlan: "pro",
  };
}

/** Elite-priset: katalogpriset om det stämmer med koden, annars inline-pris — som kassan och sport-växlingen. */
export async function resolveTargetPrice(
  stripe: Stripe,
  target: UpgradeTarget,
  ensureProduct?: (productId: string, name: string) => Promise<string>,
): Promise<PriceRef> {
  const priceId = await catalogPriceId(stripe, target.lookupKey, target.amountOre, target.interval);
  if (priceId) return priceRefFor(target, priceId, target.productId);
  const productId = ensureProduct ? await ensureProduct(target.productId, target.productName) : target.productId;
  return priceRefFor(target, null, productId);
}

/** Reservväg när katalogprodukten saknas — som i `/api/billing/sports`. */
export async function ensureProduct(stripe: Stripe, productId: string, name: string): Promise<string> {
  try {
    return (await stripe.products.retrieve(productId)).id;
  } catch {
    return (await stripe.products.create({ id: productId, name })).id;
  }
}

export interface UpgradePreviewView {
  eligible: true;
  currentPlan: "pro";
  targetPlan: "elite";
  interval: BillingInterval;
  scope: SubscriptionScope;
  newPriceOre: number;
  creditOre: number;
  amountDueNowOre: number;
  currency: "SEK";
  nextRenewalAt: string | null;
  trialing: boolean;
}

/** Förhandsfakturan hos Stripe med EXAKT de parametrar ändringen kommer att använda. */
export async function previewUpgrade(stripe: Stripe, subject: Extract<UpgradeSubject, { eligible: true }>): Promise<UpgradePreviewView> {
  const price = await resolveTargetPrice(stripe, subject.target);
  const customerId = typeof subject.sub.customer === "string" ? subject.sub.customer : subject.sub.customer.id;
  const invoice = await stripe.invoices.createPreview(
    buildPreviewParams(customerId, subject.sub.id, subject.mode, subject.item.id, price),
  );
  const numbers = parseUpgradePreview(invoice, {
    mode: subject.mode,
    target: subject.target,
    trialEnd: subject.sub.trial_end ?? null,
    nowMs: Date.now(),
  });
  return {
    eligible: true,
    currentPlan: "pro",
    targetPlan: "elite",
    interval: subject.interval,
    scope: subject.scope,
    ...numbers,
    currency: "SEK",
    trialing: subject.mode === "trialing",
  };
}
