/**
 * lib/billing/types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Typerna runt betalningskärnan. `BillingEvent` är EXAKT JSON:en som
 * `billing_apply_event` tar (docs/billing/ARCHITECTURE.md §5). Efter
 * normaliseringen vet ingen kod om köpet kom från Stripe, Apple eller Google.
 *
 * Ren modul: ingen server-only, inga nätverksanrop — importeras av tester.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type BillingProvider = "stripe" | "apple" | "google" | "manual" | "promotional";
export type BillingEnvironment = "live" | "test";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "grace"
  | "paused"
  | "canceled"
  | "expired"
  | "revoked";

export type TransactionType =
  | "sale"
  | "refund"
  | "dispute"
  | "fee"
  | "adjustment"
  | "reversal"
  | "credit_note";

export interface CountryEvidence {
  source: string;
  value: string;
}

export interface BillingEventSubscription {
  provider: BillingProvider;
  provider_customer_id: string | null;
  provider_subscription_id: string;
  provider_transaction_id: string | null;
  product_id: string;
  plan_id: string | null;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  grace_until: string | null;
  event_time: string;
  price_amount: number | null;
  price_currency: string | null;
  price_interval: "month" | "year" | null;
  metadata: Record<string, unknown>;
}

export interface BillingEventTransaction {
  type: TransactionType;
  provider: BillingProvider;
  provider_transaction_id: string;
  transaction_date: string;
  /** ISO 4217, versaler. */
  currency: string;
  /** Minsta enhet; negativt för refund/dispute/fee. */
  gross_amount: number;
  /** Satta = leverantören räknade (Stripe Tax). null = databasen räknar ur vat_rates. */
  tax_amount: number | null;
  tax_rate: number | null;
  /** "platform_collected" när Apple/Google redovisar momsen. */
  tax_type: string | null;
  customer_country: string | null;
  customer_country_source: string | null;
  country_evidence: CountryEvidence[];
  tax_exemption_reason: string | null;
  original_provider_transaction_id: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
  invoice_url: string | null;
  product_id: string | null;
  accounting_currency: string | null;
  accounting_amount: number | null;
  fx_rate: number | null;
  fx_rate_source: string | null;
  fx_timestamp: string | null;
}

export interface BillingEvent {
  environment: BillingEnvironment;
  /** "webhook:stripe", "admin:<id>", "cron:sweep" … */
  actor: string;
  user: {
    clerk_user_id: string;
    email: string | null;
    country: string | null;
    country_source: string | null;
  };
  subscription?: BillingEventSubscription;
  transaction?: BillingEventTransaction;
}

/** Resultatet av en normalisering: ett värde, eller ett skäl till att inget skrivs (loggas, aldrig gissas). */
export type NormalizeResult<T> = { ok: true; value: T } | { ok: false; reason: string };

export const ENTITLEMENT_KEYS = [
  "football_pro",
  "football_elite",
  "hockey_pro",
  "golf_pro",
  "maps_pro",
  "tv_plus",
  "ad_free",
] as const;

export type EntitlementKey = (typeof ENTITLEMENT_KEYS)[number];
export type EntitlementMap = Record<EntitlementKey, boolean>;

export function isEntitlementKey(v: unknown): v is EntitlementKey {
  return typeof v === "string" && (ENTITLEMENT_KEYS as readonly string[]).includes(v);
}

/** Alla kända nycklar, falskt som standard. Okända nycklar från databasen ignoreras. */
export function entitlementMapFrom(active: Iterable<unknown>): EntitlementMap {
  const map = Object.fromEntries(ENTITLEMENT_KEYS.map((k) => [k, false])) as EntitlementMap;
  for (const key of active) if (isEntitlementKey(key)) map[key] = true;
  return map;
}

/** Svaret från `billing_apply_event` (ARCHITECTURE §5). */
export interface ApplyResult {
  user_id: string;
  subscription_id: string | null;
  transaction_id: string | null;
  duplicate_transaction: boolean;
  entitlements_changed: boolean;
  entitlements: Partial<Record<EntitlementKey, boolean>>;
}

export type WebhookClaim = "process" | "done" | "busy";
export type WebhookStatus = "processed" | "failed" | "ignored";
