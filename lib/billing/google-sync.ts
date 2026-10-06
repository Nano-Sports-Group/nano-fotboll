import "server-only";

import { applyBillingEvent } from "./apply";
import { googleRefundEvent, normalizeGooglePurchase, type GoogleSubscriptionPurchase } from "./google-normalize";
import { fetchOrder } from "./google-play";
import { projectEntitlementsToClerk } from "./project";
import type { ApplyResult } from "./types";

/**
 * Bokför ett (redan omhämtat) Google-köp för en känd ägare och projicera rättigheterna.
 * Ägaren är verifierad av anroparen (kontotoken ur köpet) — den här funktionen litar inte på något
 * annat än `purchase`, som alltid kommer direkt från Google.
 */
export async function applyGooglePurchase(
  purchase: GoogleSubscriptionPurchase,
  purchaseToken: string,
  clerkUserId: string,
): Promise<{ result: ApplyResult | null; skipped?: string }> {
  const order = purchase.latestOrderId ? await fetchOrder(purchase.latestOrderId) : null;
  const normalized = normalizeGooglePurchase(purchase, order, clerkUserId, purchaseToken);
  if (!normalized.ok) return { result: null, skipped: normalized.reason };

  const { event, missingOrderAmount } = normalized.value;
  if (missingOrderAmount) {
    console.warn(`[google-play] orderbelopp saknas för ${purchase.latestOrderId ?? "okänd order"} — bara prenumerationen bokförs`);
  }

  let result = await applyBillingEvent(event);
  const refund = order ? googleRefundEvent(event, order) : null;
  if (refund) result = await applyBillingEvent(refund);

  await projectEntitlementsToClerk(clerkUserId, result.entitlements);
  return { result };
}
