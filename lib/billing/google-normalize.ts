/**
 * lib/billing/google-normalize.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Ren: Googles `purchases.subscriptionsv2` (+ valfri `orders`) → `BillingEvent`.
 * Nätverket bor i google-play.ts. Fälten följer Android Publisher API v3.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { googleMoneyToMinor, type GoogleMoney } from "./money";
import { productFromGoogleProductId } from "./products";
import type { BillingEvent, BillingEventTransaction, CountryEvidence, NormalizeResult, SubscriptionStatus } from "./types";

export interface GoogleSubscriptionPurchase {
  regionCode?: string;
  latestOrderId?: string;
  startTime?: string;
  subscriptionState?: string;
  testPurchase?: Record<string, never> | object;
  lineItems?: {
    productId?: string;
    expiryTime?: string;
    autoRenewingPlan?: { recurringPrice?: GoogleMoney };
  }[];
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
}

export interface GoogleOrder {
  orderId?: string;
  state?: string;
  createTime?: string;
  lastEventTime?: string;
  total?: GoogleMoney;
  buyerAddress?: { regionCode?: string };
}

const PLATFORM_TAX_REASON = "google_play_marketplace — TAX_ADVISER_VERIFICATION_REQUIRED";

/** Läser kontotoken som klienten satte vid köpet (`obfuscatedExternalAccountId`). */
export function googleAccountToken(purchase: GoogleSubscriptionPurchase): string | null {
  return purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? null;
}

export interface GoogleNormalized {
  event: BillingEvent;
  /** Orderbelopp saknades: bara prenumerationsdelen skrevs (loggas av anroparen). */
  missingOrderAmount: boolean;
}

export function normalizeGooglePurchase(
  purchase: GoogleSubscriptionPurchase,
  order: GoogleOrder | null,
  clerkUserId: string,
  purchaseToken: string,
  now: Date = new Date(),
  /** Produkttabellen är data i products.ts; injicerbar så att testerna inte beror på vilka Play-produkter som finns. */
  resolveProduct: typeof productFromGoogleProductId = productFromGoogleProductId,
): NormalizeResult<GoogleNormalized> {
  const line = purchase.lineItems?.[0];
  const mapped = resolveProduct(line?.productId);
  if (!mapped) return { ok: false, reason: `okänd Google Play-produkt ${line?.productId ?? "-"}` };

  const state = purchase.subscriptionState ?? "";
  // Ej betalt än: ingen rättighet och ingen rad. RTDN (eller nästa synk) ger ACTIVE.
  if (state === "SUBSCRIPTION_STATE_PENDING") return { ok: false, reason: "köpet väntar på betalning (PENDING)" };

  const expiry = line?.expiryTime ? new Date(line.expiryTime) : null;
  let status: SubscriptionStatus;
  let graceUntil: string | null = null;
  let cancelAtPeriodEnd = false;

  switch (state) {
    case "SUBSCRIPTION_STATE_ACTIVE":
      status = "active";
      break;
    case "SUBSCRIPTION_STATE_IN_GRACE_PERIOD":
      status = "grace";
      graceUntil = expiry ? expiry.toISOString() : null;
      break;
    case "SUBSCRIPTION_STATE_ON_HOLD":
      // Betalningen har fallerat och Google har pausat åtkomsten: ingen åtkomst alls (grace = nu).
      status = "past_due";
      graceUntil = now.toISOString();
      break;
    case "SUBSCRIPTION_STATE_PAUSED":
      status = "paused";
      break;
    case "SUBSCRIPTION_STATE_CANCELED":
      // Uppsagd men betald t.o.m. periodslut: åtkomst kvar, ingen förnyelse.
      status = expiry && expiry.getTime() <= now.getTime() ? "expired" : "active";
      cancelAtPeriodEnd = status === "active";
      break;
    case "SUBSCRIPTION_STATE_EXPIRED":
    case "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED":
      status = "expired";
      break;
    default:
      return { ok: false, reason: `okänt prenumerationsläge ${state || "-"}` };
  }

  const environment = purchase.testPurchase ? "test" : "live";
  const region = purchase.regionCode?.toUpperCase() ?? null;
  const orderRegion = order?.buyerAddress?.regionCode?.toUpperCase() ?? null;
  const evidence: CountryEvidence[] = [];
  if (region) evidence.push({ source: "google_play_country", value: region });
  if (orderRegion && orderRegion !== region) evidence.push({ source: "billing_address", value: orderRegion });

  const recurring = googleMoneyToMinor(line?.autoRenewingPlan?.recurringPrice);
  const orderId = order?.orderId ?? purchase.latestOrderId ?? null;

  const event: BillingEvent = {
    environment,
    actor: "webhook:google",
    user: { clerk_user_id: clerkUserId, email: null, country: region, country_source: region ? "google_play_country" : null },
    subscription: {
      provider: "google",
      provider_customer_id: null,
      // Köptoken är prenumerationens identitet; varje förnyelse får ett nytt order-id.
      provider_subscription_id: purchaseToken,
      provider_transaction_id: orderId,
      product_id: mapped.product,
      plan_id: line?.productId ?? null,
      status,
      current_period_start: purchase.startTime ?? null,
      current_period_end: expiry ? expiry.toISOString() : null,
      cancel_at_period_end: cancelAtPeriodEnd,
      grace_until: graceUntil,
      event_time: now.toISOString(),
      price_amount: recurring?.amount ?? null,
      price_currency: recurring?.currency ?? null,
      price_interval: mapped.interval,
      metadata: { google_state: state },
    },
  };

  const total = googleMoneyToMinor(order?.total);
  if (!total || total.amount <= 0 || !orderId) {
    return { ok: true, value: { event, missingOrderAmount: true } };
  }

  const base: Omit<BillingEventTransaction, "type" | "provider_transaction_id" | "gross_amount" | "original_provider_transaction_id"> = {
    provider: "google",
    transaction_date: order?.createTime ?? now.toISOString(),
    currency: total.currency,
    // Google är säljare mot kunden och redovisar momsen; vår bok tar inte upp den (rådgivarfråga).
    tax_amount: null,
    tax_rate: null,
    tax_type: "platform_collected",
    customer_country: region,
    customer_country_source: region ? "google_play_country" : null,
    country_evidence: evidence,
    tax_exemption_reason: PLATFORM_TAX_REASON,
    invoice_id: null,
    invoice_number: null,
    invoice_url: null,
    product_id: mapped.product,
    accounting_currency: null,
    accounting_amount: null,
    fx_rate: null,
    fx_rate_source: null,
    fx_timestamp: null,
  };

  event.transaction = { ...base, type: "sale", provider_transaction_id: orderId, gross_amount: total.amount, original_provider_transaction_id: null };
  return { ok: true, value: { event, missingOrderAmount: false } };
}

/** Helt återbetald order → en refund som speglar försäljningen (delåterbetalningar hanteras inte automatiskt). */
export function googleRefundEvent(
  sale: BillingEvent,
  order: GoogleOrder,
  now: Date = new Date(),
): BillingEvent | null {
  if (order.state !== "REFUNDED" || !sale.transaction || sale.transaction.type !== "sale") return null;
  return {
    environment: sale.environment,
    actor: sale.actor,
    user: sale.user,
    transaction: {
      ...sale.transaction,
      type: "refund",
      provider_transaction_id: `refund:${sale.transaction.provider_transaction_id}`,
      transaction_date: order.lastEventTime ?? now.toISOString(),
      gross_amount: -sale.transaction.gross_amount,
      original_provider_transaction_id: sale.transaction.provider_transaction_id,
    },
  };
}
