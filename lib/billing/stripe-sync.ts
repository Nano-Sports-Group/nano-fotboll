import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import type Stripe from "stripe";
import { subscriptionFromInvoice, subscriptionIdFrom } from "@/lib/waitlist/invoice-clerk";
import { applyBillingEvent, auditNote } from "./apply";
import { projectEntitlementsToClerk } from "./project";
import { ownsClerkProjection } from "./products";
import {
  disputeEvent,
  feeEvent,
  invoiceSaleEvent,
  productOfSubscription,
  refundEvent,
  subscriptionEvent,
} from "./stripe-normalize";
import type { ApplyResult, BillingEvent, NormalizeResult } from "./types";

type Clerk = Awaited<ReturnType<typeof clerkClient>>;
/** Det vi behöver av en händelse — så att en egen rutt kan synka utan en riktig Stripe-händelse. */
export type EventRef = Pick<Stripe.Event, "id" | "type" | "created" | "livemode">;

/** Skriv eller logga varför en händelse hoppades över — vi gissar aldrig en produkt eller en ägare. */
async function skip(event: EventRef, reason: string): Promise<null> {
  console.warn(`[stripe-webhook] ${event.type} ${event.id} hoppad: ${reason}`);
  await auditNote("webhook:stripe", "billing.skipped", event.id, { type: event.type, reason });
  return null;
}

async function applyNormalized(event: EventRef, normalized: NormalizeResult<BillingEvent>): Promise<ApplyResult | null> {
  if (!normalized.ok) return skip(event, normalized.reason);
  return applyBillingEvent(normalized.value);
}

/** Vem äger prenumerationen? Metadatan sattes av kassan; kundens metadata är reserv (kunden skapas med clerkUserId). */
export async function resolveClerkUserId(
  stripe: Stripe,
  sub: Stripe.Subscription | null,
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined,
): Promise<string | null> {
  const fromSub = sub?.metadata?.clerkUserId;
  if (fromSub) return fromSub;
  if (!customer) return null;
  const resolved = typeof customer === "string" ? await stripe.customers.retrieve(customer) : customer;
  if ("deleted" in resolved && resolved.deleted) return null;
  return (resolved as Stripe.Customer).metadata?.clerkUserId || null;
}

export function vertical(sub: Stripe.Subscription | null | undefined): string | undefined {
  return sub?.metadata?.vertical;
}

/**
 * `privateMetadata` som kontosidan, kundportalen, värvningskrediten och sport-växlingen läser:
 * stripeCustomerId, stripeSubscriptionId / stripeHockeySubscriptionId och `subscription`-summeringen.
 * Planen skrivs INTE här — den kommer bara ur projektionen.
 */
async function writeLegacyPrivateMetadata(clerk: Clerk, clerkUserId: string, sub: Stripe.Subscription): Promise<void> {
  const scope = sub.metadata?.vertical ?? "football";
  const dead = sub.status === "canceled" || sub.status === "incomplete_expired";
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const item = sub.items?.data?.[0];
  const periodEndTs = item?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end;

  const user = await clerk.users.getUser(clerkUserId);
  const current = (user.privateMetadata ?? {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  const set = (key: string, value: unknown) => {
    if (JSON.stringify(current[key] ?? null) !== JSON.stringify(value ?? null)) patch[key] = value;
  };

  set("stripeCustomerId", customerId);

  const hasFootball = scope === "football" || scope === "both";
  const hasHockey = scope === "hockey" || scope === "both";
  if (hasFootball) {
    set("stripeSubscriptionId", dead ? null : sub.id);
    set(
      "subscription",
      dead
        ? null
        : {
            id: sub.id,
            status: sub.status,
            plan: sub.metadata?.plan === "elite" ? "elite" : "pro",
            currentPeriodEnd: periodEndTs ? new Date(periodEndTs * 1000).toISOString() : undefined,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
          },
    );
  } else if (current.stripeSubscriptionId === sub.id) {
    // Omfångsbyte (kombo → hockey): fotbollsfacket släpper prenumerationen.
    set("stripeSubscriptionId", null);
    set("subscription", null);
  }
  if (hasHockey) {
    set("stripeHockeyCustomerId", customerId);
    set("stripeHockeySubscriptionId", dead ? null : sub.id);
  } else if (current.stripeHockeySubscriptionId === sub.id) {
    set("stripeHockeySubscriptionId", null);
  }

  if (Object.keys(patch).length > 0) {
    await clerk.users.updateUserMetadata(clerkUserId, { privateMetadata: patch });
  }
}

export interface SubscriptionSync {
  sub: Stripe.Subscription;
  clerkUserId: string;
  result: ApplyResult | null;
}

/**
 * Hämta prenumerationen på nytt från Stripe (webhookar kommer i oordning — payloaden kan vara
 * gammal), bokför den och projicera rättigheterna till Clerk. Maps/TV bokförs men skriver aldrig Clerk.
 */
export async function syncSubscription(
  stripe: Stripe,
  clerk: Clerk,
  subscriptionId: string,
  event: EventRef,
  extra?: { clerkUserId?: string | null },
): Promise<SubscriptionSync | null> {
  // Läget är hämtat NU, så det stämplas med hämtningstiden — inte med händelsens. Annars kastar
  // databasens oordningsskydd bort färskt läge bara för att händelsen som utlöste hämtningen var gammal.
  const fetchedAt = Date.now() / 1000;
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const clerkUserId = extra?.clerkUserId ?? (await resolveClerkUserId(stripe, sub, sub.customer));
  if (!clerkUserId) {
    await skip(event, `prenumeration ${sub.id} saknar clerkUserId`);
    return null;
  }

  const result = await applyNormalized(
    event,
    subscriptionEvent(sub, { clerkUserId, eventTime: fetchedAt, livemode: event.livemode }),
  );

  if (ownsClerkProjection(vertical(sub))) {
    if (result) await projectEntitlementsToClerk(clerkUserId, result.entitlements);
    await writeLegacyPrivateMetadata(clerk, clerkUserId, sub);
  }
  return { sub, clerkUserId, result };
}

// ─── Betalning bakom en faktura ──────────────────────────────────────────────

/** Debiteringen och balanstransaktionen (avgift, växelkurs) bakom en betald faktura. */
export async function paymentBehindInvoice(
  stripe: Stripe,
  invoice: Stripe.Invoice,
): Promise<{ charge: Stripe.Charge | null; balanceTransaction: Stripe.BalanceTransaction | null }> {
  const none = { charge: null, balanceTransaction: null };
  const payments = await stripe.invoicePayments.list({ invoice: invoice.id, status: "paid", limit: 1 });
  const payment = payments.data[0]?.payment;
  if (!payment) return none; // t.ex. betald med kundsaldo — ingen debitering att hämta avgift från

  let charge: Stripe.Charge | null = null;
  if (payment.type === "payment_intent" && payment.payment_intent) {
    const id = typeof payment.payment_intent === "string" ? payment.payment_intent : payment.payment_intent.id;
    const intent = await stripe.paymentIntents.retrieve(id, { expand: ["latest_charge.balance_transaction"] });
    charge = intent.latest_charge && typeof intent.latest_charge === "object" ? intent.latest_charge : null;
  } else if (payment.type === "charge" && payment.charge) {
    const id = typeof payment.charge === "string" ? payment.charge : payment.charge.id;
    charge = await stripe.charges.retrieve(id, { expand: ["balance_transaction"] });
  }
  const bt = charge?.balance_transaction;
  return { charge, balanceTransaction: bt && typeof bt === "object" ? bt : null };
}

/** `invoice.paid`: försäljningen (med prenumerationens färska läge) och därefter Stripes avgift. */
export async function handleInvoicePaid(stripe: Stripe, clerk: Clerk, event: Stripe.Event, invoice: Stripe.Invoice): Promise<"processed" | "ignored"> {
  const subscriptionId = subscriptionIdFrom(subscriptionFromInvoice(invoice));
  if (!subscriptionId) {
    await skip(event, `faktura ${invoice.id} hör inte till en prenumeration`);
    return "ignored";
  }
  const fetchedAt = Date.now() / 1000;
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const clerkUserId = await resolveClerkUserId(stripe, sub, sub.customer);
  if (!clerkUserId) {
    await skip(event, `faktura ${invoice.id}: ingen clerkUserId`);
    return "ignored";
  }

  const customerRef = invoice.customer;
  const customerObj = customerRef ? await stripe.customers.retrieve(typeof customerRef === "string" ? customerRef : customerRef.id) : null;
  const customer = customerObj && !("deleted" in customerObj && customerObj.deleted) ? (customerObj as Stripe.Customer) : null;

  // Gratis faktura (trial): ingen försäljning, men prenumerationen ska ändå vara aktuell.
  const payment = invoice.total > 0 ? await paymentBehindInvoice(stripe, invoice) : { charge: null, balanceTransaction: null };

  const common = { clerkUserId, eventTime: fetchedAt, livemode: event.livemode };
  const sale = invoiceSaleEvent({ ...common, invoice, subscription: sub, customer, ...payment });
  let result: ApplyResult | null = null;
  if (sale.ok) {
    result = await applyBillingEvent(sale.value);
  } else if (invoice.total > 0) {
    await skip(event, sale.reason);
  }
  if (!result) {
    // 0 kr-faktura: bara prenumerationen.
    const sync = await syncSubscription(stripe, clerk, subscriptionId, event, { clerkUserId });
    return sync ? "processed" : "ignored";
  }

  if (ownsClerkProjection(vertical(sub))) {
    await projectEntitlementsToClerk(clerkUserId, result.entitlements);
    await writeLegacyPrivateMetadata(clerk, clerkUserId, sub);
  }

  if (payment.balanceTransaction) {
    const fee = feeEvent({
      ...common,
      balanceTransaction: payment.balanceTransaction,
      invoiceId: invoice.id,
      productId: productOfSubscription(sub),
    });
    if (fee.ok) await applyBillingEvent(fee.value);
  }
  return "processed";
}

// ─── Återbetalning och tvist ─────────────────────────────────────────────────

/** Fakturan en debitering hörde till, och prenumeration + ägare bakom den. Null = inte ett prenumerationsköp av oss. */
async function originOfCharge(stripe: Stripe, chargeRef: string | Stripe.Charge) {
  const charge = typeof chargeRef === "string" ? await stripe.charges.retrieve(chargeRef) : chargeRef;
  const intentRef = charge.payment_intent;
  const intentId = typeof intentRef === "string" ? intentRef : intentRef?.id;
  if (!intentId) return null;

  const payments = await stripe.invoicePayments.list({ payment: { type: "payment_intent", payment_intent: intentId }, limit: 1 });
  const invoiceRef = payments.data[0]?.invoice;
  const invoiceId = typeof invoiceRef === "string" ? invoiceRef : invoiceRef?.id;
  if (!invoiceId) return null;

  const invoice = await stripe.invoices.retrieve(invoiceId);
  const subscriptionId = subscriptionIdFrom(subscriptionFromInvoice(invoice));
  const sub = subscriptionId ? await stripe.subscriptions.retrieve(subscriptionId) : null;
  const clerkUserId = await resolveClerkUserId(stripe, sub, invoice.customer);
  if (!clerkUserId) return null;
  return { invoiceId, sub, clerkUserId };
}

export async function handleChargeRefunded(stripe: Stripe, event: Stripe.Event, charge: Stripe.Charge): Promise<"processed" | "ignored"> {
  const origin = await originOfCharge(stripe, charge);
  if (!origin) {
    await skip(event, `debitering ${charge.id} saknar faktura eller ägare`);
    return "ignored";
  }
  // Alla återbetalningar på debiteringen — varje refund-id är idempotent i databasen.
  const refunds = await stripe.refunds.list({ charge: charge.id, limit: 100, expand: ["data.balance_transaction"] });
  let applied = 0;
  for (const refund of refunds.data) {
    if (refund.status !== "succeeded") continue;
    const bt = refund.balance_transaction && typeof refund.balance_transaction === "object" ? refund.balance_transaction : null;
    const normalized = refundEvent({
      clerkUserId: origin.clerkUserId,
      eventTime: event.created,
      livemode: event.livemode,
      refund,
      originalInvoiceId: origin.invoiceId,
      productId: origin.sub ? productOfSubscription(origin.sub) : null,
      balanceTransaction: bt,
    });
    const result = await applyNormalized(event, normalized);
    if (result) {
      applied++;
      if (result.entitlements_changed && ownsClerkProjection(vertical(origin.sub))) {
        await projectEntitlementsToClerk(origin.clerkUserId, result.entitlements);
      }
    }
  }
  return applied > 0 ? "processed" : "ignored";
}

export async function handleDisputeCreated(stripe: Stripe, event: Stripe.Event, dispute: Stripe.Dispute): Promise<"processed" | "ignored"> {
  const origin = await originOfCharge(stripe, dispute.charge);
  if (!origin) {
    await skip(event, `tvist ${dispute.id} saknar faktura eller ägare`);
    return "ignored";
  }
  const result = await applyNormalized(
    event,
    disputeEvent({
      clerkUserId: origin.clerkUserId,
      eventTime: event.created,
      livemode: event.livemode,
      dispute,
      originalInvoiceId: origin.invoiceId,
      productId: origin.sub ? productOfSubscription(origin.sub) : null,
    }),
  );
  if (result?.entitlements_changed && ownsClerkProjection(vertical(origin.sub))) {
    await projectEntitlementsToClerk(origin.clerkUserId, result.entitlements);
  }
  return result ? "processed" : "ignored";
}
