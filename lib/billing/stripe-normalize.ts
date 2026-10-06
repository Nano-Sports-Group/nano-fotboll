/**
 * lib/billing/stripe-normalize.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Rena funktioner: redan hämtade Stripe-objekt → `BillingEvent`. Inget nätverk, ingen klocka —
 * allt som behövs skickas in, så fixturerna i testerna är hela sanningen.
 *
 * Belopp kommer alltid ur Stripes egna objekt (faktura, återbetalning, balanstransaktion),
 * aldrig ur klienten. Det vi inte vet lämnas null — vi fabricerar aldrig en växelkurs eller
 * ett land.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type Stripe from "stripe";
import { isKnownProduct, productFromStripeMetadata } from "./products";
import type {
  BillingEvent,
  BillingEventSubscription,
  BillingEventTransaction,
  CountryEvidence,
  NormalizeResult,
  SubscriptionStatus,
} from "./types";

const iso = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString();
const environmentOf = (livemode: boolean) => (livemode ? "live" : "test") as "live" | "test";
const upper = (v: string | null | undefined) => (v ? v.toUpperCase() : null);

interface Common {
  clerkUserId: string;
  /** `event.created` (sekunder) — används som event_time så att händelser i oordning kan ignoreras. */
  eventTime: number;
  livemode: boolean;
}

export function stripeStatusToBilling(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "unpaid":
      return "expired";
    case "canceled":
      return "canceled";
    case "paused":
      return "paused";
    // Betalningen kom aldrig igenom: ingen rättighet.
    case "incomplete":
    case "incomplete_expired":
      return "expired";
    default:
      return "expired";
  }
}

/** Produkt ur prenumerationens metadata; reservväg: prisets produkt-id om det är en av våra katalogprodukter. */
export function productOfSubscription(sub: Stripe.Subscription): string | null {
  const fromMeta = productFromStripeMetadata(sub.metadata);
  if (fromMeta) return fromMeta;
  const price = sub.items?.data?.[0]?.price;
  const productRef = price && (typeof price.product === "string" ? price.product : price.product?.id);
  return isKnownProduct(productRef) ? productRef : null;
}

// ─── Prenumeration ───────────────────────────────────────────────────────────

export function subscriptionPart(sub: Stripe.Subscription, eventTime: number): NormalizeResult<BillingEventSubscription> {
  const product = productOfSubscription(sub);
  if (!product) {
    return { ok: false, reason: `okänd produkt för prenumeration ${sub.id} (vertical=${sub.metadata?.vertical ?? "-"}, plan=${sub.metadata?.plan ?? "-"})` };
  }

  const item = sub.items?.data?.[0];
  // Nyare API-versioner har periodgränserna på raden, inte på prenumerationen.
  const periodStart = item?.current_period_start ?? (sub as unknown as { current_period_start?: number }).current_period_start;
  const periodEnd = item?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end;
  const interval = item?.price?.recurring?.interval;
  const latestInvoice = sub.latest_invoice;

  return {
    ok: true,
    value: {
      provider: "stripe",
      provider_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      provider_subscription_id: sub.id,
      provider_transaction_id: typeof latestInvoice === "string" ? latestInvoice : (latestInvoice?.id ?? null),
      product_id: product,
      plan_id: item?.price?.lookup_key ?? (interval ? `${product}_${interval}` : null),
      status: stripeStatusToBilling(sub.status),
      current_period_start: periodStart ? iso(periodStart) : null,
      current_period_end: periodEnd ? iso(periodEnd) : null,
      cancel_at_period_end: sub.cancel_at_period_end || sub.cancel_at != null,
      // Frist vid betalningsfel bestäms av databasen (system_config billing.stripe_past_due_grace_days).
      grace_until: null,
      event_time: iso(eventTime),
      price_amount: item?.price?.unit_amount ?? null,
      price_currency: upper(item?.price?.currency),
      price_interval: interval === "month" || interval === "year" ? interval : null,
      metadata: pickMetadata(sub.metadata),
    },
  };
}

function pickMetadata(meta: Stripe.Metadata | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ["vertical", "plan", "interval", "founder"]) {
    if (meta?.[key] !== undefined) out[key] = meta[key];
  }
  return out;
}

export function subscriptionEvent(sub: Stripe.Subscription, common: Common): NormalizeResult<BillingEvent> {
  const part = subscriptionPart(sub, common.eventTime);
  if (!part.ok) return part;
  return {
    ok: true,
    value: {
      environment: environmentOf(common.livemode),
      actor: "webhook:stripe",
      user: { clerk_user_id: common.clerkUserId, email: null, country: null, country_source: null },
      subscription: part.value,
    },
  };
}

// ─── Betald faktura → sale ───────────────────────────────────────────────────

export interface InvoiceSaleInput extends Common {
  invoice: Stripe.Invoice;
  subscription: Stripe.Subscription;
  /** Kunden (för Stripe Taxs landsbedömning). Raderad kund = null. */
  customer?: Stripe.Customer | null;
  charge?: Stripe.Charge | null;
  balanceTransaction?: Stripe.BalanceTransaction | null;
}

/** Land i den ordning ARCHITECTURE §7 föreskriver; ALLA tillgängliga bevis sparas, även de som säger emot. */
export function collectCountry(input: {
  customer?: Stripe.Customer | null;
  invoice?: Stripe.Invoice | null;
  charge?: Stripe.Charge | null;
}): { country: string | null; source: string | null; evidence: CountryEvidence[] } {
  const candidates: CountryEvidence[] = [];
  const add = (source: string, value: string | null | undefined) => {
    const v = upper(value);
    if (v) candidates.push({ source, value: v });
  };
  add("stripe_tax", input.customer?.tax?.location?.country);
  add("billing_address", input.invoice?.customer_address?.country);
  add("billing_address", input.charge?.billing_details?.address?.country);
  add("payment_method_country", input.charge?.payment_method_details?.card?.country);

  const primary = candidates[0];
  return { country: primary?.value ?? null, source: primary?.source ?? null, evidence: candidates };
}

/** Moms räknad av Stripe Tax: bara när den var påslagen och faktiskt gav skatterader. */
function providerTax(invoice: Stripe.Invoice): { amount: number; reason: string | null } | null {
  if (!invoice.automatic_tax?.enabled || invoice.automatic_tax.status !== "complete") return null;
  const lines = invoice.total_taxes;
  if (!lines || lines.length === 0) return null;
  const amount = lines.reduce((sum, line) => sum + line.amount, 0);
  const reasons = [...new Set(lines.map((l) => l.taxability_reason).filter((r) => r && r !== "standard_rated"))];
  return { amount, reason: amount === 0 && reasons.length > 0 ? reasons.join(", ") : null };
}

/** Bokföringsvaluta ur Stripes balanstransaktion — bara när den skiljer sig från fakturans och kursen är känd. */
function accountingFrom(
  bt: Stripe.BalanceTransaction | null | undefined,
  transactionCurrency: string,
): Pick<BillingEventTransaction, "accounting_currency" | "accounting_amount" | "fx_rate" | "fx_rate_source" | "fx_timestamp"> {
  const none = { accounting_currency: null, accounting_amount: null, fx_rate: null, fx_rate_source: null, fx_timestamp: null };
  if (!bt || bt.exchange_rate == null) return none;
  if (bt.currency.toUpperCase() === transactionCurrency.toUpperCase()) return none;
  return {
    accounting_currency: bt.currency.toUpperCase(),
    accounting_amount: bt.amount,
    fx_rate: bt.exchange_rate,
    fx_rate_source: "stripe_balance_transaction",
    fx_timestamp: iso(bt.created),
  };
}

const NO_TX_DEFAULTS = {
  tax_amount: null,
  tax_rate: null,
  tax_type: null,
  customer_country: null,
  customer_country_source: null,
  country_evidence: [] as CountryEvidence[],
  tax_exemption_reason: null,
  original_provider_transaction_id: null,
  invoice_id: null,
  invoice_number: null,
  invoice_url: null,
  product_id: null,
  accounting_currency: null,
  accounting_amount: null,
  fx_rate: null,
  fx_rate_source: null,
  fx_timestamp: null,
} satisfies Partial<BillingEventTransaction>;

export function invoiceSaleEvent(input: InvoiceSaleInput): NormalizeResult<BillingEvent> {
  const { invoice, subscription } = input;
  // Trial-fakturor (0 kr) är ingen försäljning — ingen post alls.
  if (invoice.total <= 0) return { ok: false, reason: `faktura ${invoice.id} är 0 kr — ingen transaktion` };

  const sub = subscriptionPart(subscription, input.eventTime);
  if (!sub.ok) return sub;

  const country = collectCountry({ customer: input.customer, invoice, charge: input.charge });
  const tax = providerTax(invoice);
  const currency = invoice.currency.toUpperCase();

  const transaction: BillingEventTransaction = {
    ...NO_TX_DEFAULTS,
    type: "sale",
    provider: "stripe",
    provider_transaction_id: invoice.id!,
    transaction_date: iso(invoice.status_transitions?.paid_at ?? invoice.created),
    currency,
    gross_amount: invoice.total,
    tax_amount: tax ? tax.amount : null,
    tax_exemption_reason: tax?.reason ?? null,
    customer_country: country.country,
    customer_country_source: country.source,
    country_evidence: country.evidence,
    invoice_id: invoice.id!,
    invoice_number: invoice.number ?? null,
    invoice_url: invoice.hosted_invoice_url ?? null,
    product_id: sub.value.product_id,
    ...accountingFrom(input.balanceTransaction, currency),
  };

  return {
    ok: true,
    value: {
      environment: environmentOf(input.livemode),
      actor: "webhook:stripe",
      user: {
        clerk_user_id: input.clerkUserId,
        email: invoice.customer_email ?? null,
        country: country.country,
        country_source: country.source,
      },
      subscription: sub.value,
      transaction,
    },
  };
}

// ─── Avgift (Stripes) ────────────────────────────────────────────────────────

export function feeEvent(
  input: Common & { balanceTransaction: Stripe.BalanceTransaction; invoiceId: string | null; productId: string | null },
): NormalizeResult<BillingEvent> {
  const bt = input.balanceTransaction;
  if (!bt.fee || bt.fee <= 0) return { ok: false, reason: `balanstransaktion ${bt.id} har ingen avgift` };
  return {
    ok: true,
    value: {
      environment: environmentOf(input.livemode),
      actor: "webhook:stripe",
      user: { clerk_user_id: input.clerkUserId, email: null, country: null, country_source: null },
      transaction: {
        ...NO_TX_DEFAULTS,
        type: "fee",
        provider: "stripe",
        // Avgiften redovisas i balanstransaktionens valuta (ofta annan än fakturans).
        provider_transaction_id: bt.id,
        transaction_date: iso(bt.created),
        currency: bt.currency.toUpperCase(),
        gross_amount: -bt.fee,
        invoice_id: input.invoiceId,
        product_id: input.productId,
      },
    },
  };
}

// ─── Återbetalning och tvist ─────────────────────────────────────────────────

export function refundEvent(
  input: Common & {
    refund: Stripe.Refund;
    /** Fakturan som den återbetalade debiteringen hörde till. Utan den går posten inte att knyta till en försäljning. */
    originalInvoiceId: string | null;
    productId: string | null;
    balanceTransaction?: Stripe.BalanceTransaction | null;
  },
): NormalizeResult<BillingEvent> {
  const { refund } = input;
  if (!input.originalInvoiceId) return { ok: false, reason: `återbetalning ${refund.id} saknar faktura — inte en av våra prenumerationsköp` };
  const currency = refund.currency.toUpperCase();
  return {
    ok: true,
    value: {
      environment: environmentOf(input.livemode),
      actor: "webhook:stripe",
      user: { clerk_user_id: input.clerkUserId, email: null, country: null, country_source: null },
      transaction: {
        ...NO_TX_DEFAULTS,
        type: "refund",
        provider: "stripe",
        provider_transaction_id: refund.id,
        transaction_date: iso(refund.created),
        currency,
        gross_amount: -refund.amount,
        original_provider_transaction_id: input.originalInvoiceId,
        invoice_id: input.originalInvoiceId,
        product_id: input.productId,
        ...accountingFrom(input.balanceTransaction, currency),
      },
    },
  };
}

export function disputeEvent(
  input: Common & { dispute: Stripe.Dispute; originalInvoiceId: string | null; productId: string | null },
): NormalizeResult<BillingEvent> {
  const { dispute } = input;
  if (!input.originalInvoiceId) return { ok: false, reason: `tvist ${dispute.id} saknar faktura — inte en av våra prenumerationsköp` };
  return {
    ok: true,
    value: {
      environment: environmentOf(input.livemode),
      actor: "webhook:stripe",
      user: { clerk_user_id: input.clerkUserId, email: null, country: null, country_source: null },
      transaction: {
        ...NO_TX_DEFAULTS,
        type: "dispute",
        provider: "stripe",
        provider_transaction_id: dispute.id,
        transaction_date: iso(dispute.created),
        currency: dispute.currency.toUpperCase(),
        gross_amount: -dispute.amount,
        original_provider_transaction_id: input.originalInvoiceId,
        invoice_id: input.originalInvoiceId,
        product_id: input.productId,
      },
    },
  };
}
