/**
 * lib/billing/apple-normalize.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Ren: Apples verifierade `JWSTransactionDecodedPayload` → `BillingEvent`. Verifieringen mot
 * Apples rotcertifikat sker före (lib/app-store.ts); här finns ingen signatur, bara fält.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { JWSTransactionDecodedPayload } from "@apple/app-store-server-library";
import { milliunitsToMinor } from "./money";
import { productFromAppleProductId } from "./products";
import type { BillingEvent, BillingEventTransaction, CountryEvidence, NormalizeResult, SubscriptionStatus } from "./types";

/**
 * Apples storefront är ISO 3166-1 alpha-3. Tabellen täcker EU-27 + NO, GB, CH, US, AE — marknaderna
 * vi har skäl att tro på. Allt annat blir land null (databasen flaggar posten för granskning) med
 * råvärdet bevarat i `country_evidence`; vi gissar aldrig.
 */
const STOREFRONT_ALPHA2: Record<string, string> = {
  AUT: "AT", BEL: "BE", BGR: "BG", HRV: "HR", CYP: "CY", CZE: "CZ", DNK: "DK", EST: "EE", FIN: "FI",
  FRA: "FR", DEU: "DE", GRC: "GR", HUN: "HU", IRL: "IE", ITA: "IT", LVA: "LV", LTU: "LT", LUX: "LU",
  MLT: "MT", NLD: "NL", POL: "PL", PRT: "PT", ROU: "RO", SVK: "SK", SVN: "SI", ESP: "ES", SWE: "SE",
  NOR: "NO", GBR: "GB", CHE: "CH", USA: "US", ARE: "AE",
};

export function storefrontToCountry(storefront: string | undefined): string | null {
  return (storefront && STOREFRONT_ALPHA2[storefront.toUpperCase()]) || null;
}

const PLATFORM_TAX_REASON = "apple_marketplace — TAX_ADVISER_VERIFICATION_REQUIRED";

export function appleStatus(tx: JWSTransactionDecodedPayload, now: Date): SubscriptionStatus {
  if (tx.revocationDate) return "revoked";
  // Ersatt av en uppgradering: den nya transaktionen bär sanningen, den här är förbrukad.
  if (tx.isUpgraded) return "expired";
  if (tx.expiresDate && tx.expiresDate <= now.getTime()) return "expired";
  return "active";
}

export interface AppleNormalized {
  /** Första händelsen är prenumeration + försäljning; en återkallad transaktion ger även en refund. */
  events: BillingEvent[];
}

export function normalizeAppleTransaction(
  tx: JWSTransactionDecodedPayload,
  clerkUserId: string,
  now: Date = new Date(),
): NormalizeResult<AppleNormalized> {
  const mapped = productFromAppleProductId(tx.productId);
  if (!mapped) return { ok: false, reason: `okänd App Store-produkt ${tx.productId ?? "-"}` };
  if (!tx.originalTransactionId || !tx.transactionId) return { ok: false, reason: "App Store-transaktion saknar id" };

  const environment = tx.environment === "Production" ? "live" : "test";
  const status = appleStatus(tx, now);

  const country = storefrontToCountry(tx.storefront);
  const evidence: CountryEvidence[] = tx.storefront
    ? [{ source: "apple_storefront", value: country ?? tx.storefront.toUpperCase() }]
    : [];

  // Pris i milliunits; saknas pris eller valuta skrivs ingen transaktion (aldrig 0 kr).
  const currency = tx.currency?.toUpperCase();
  const amount = tx.price != null && currency ? milliunitsToMinor(tx.price, currency) : null;

  const base: Omit<BillingEventTransaction, "type" | "provider_transaction_id" | "transaction_date" | "gross_amount" | "original_provider_transaction_id"> = {
    provider: "apple",
    currency: currency ?? "",
    tax_amount: null,
    tax_rate: null,
    tax_type: "platform_collected",
    customer_country: country,
    customer_country_source: country ? "apple_storefront" : null,
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

  const eventTime = new Date(
    tx.isUpgraded ? (tx.purchaseDate ?? now.getTime()) : (tx.signedDate ?? tx.purchaseDate ?? now.getTime()),
  ).toISOString();

  const main: BillingEvent = {
    environment,
    actor: "webhook:apple",
    user: { clerk_user_id: clerkUserId, email: null, country, country_source: country ? "apple_storefront" : null },
    subscription: {
      provider: "apple",
      provider_customer_id: null,
      // Alla förnyelser delar originalTransactionId — det är prenumerationen.
      provider_subscription_id: tx.originalTransactionId,
      provider_transaction_id: tx.transactionId,
      product_id: mapped.product,
      plan_id: tx.productId ?? null,
      status,
      current_period_start: tx.purchaseDate ? new Date(tx.purchaseDate).toISOString() : null,
      current_period_end: tx.expiresDate ? new Date(tx.expiresDate).toISOString() : null,
      cancel_at_period_end: false,
      grace_until: null,
      event_time: eventTime,
      price_amount: amount,
      price_currency: amount != null ? currency! : null,
      price_interval: mapped.interval,
      metadata: { apple_environment: tx.environment ?? null },
    },
  };

  // Gratis provperiod / introduktionserbjudande utan belopp: ingen försäljning.
  if (amount != null && amount > 0) {
    main.transaction = {
      ...base,
      type: "sale",
      provider_transaction_id: tx.transactionId,
      transaction_date: new Date(tx.purchaseDate ?? now.getTime()).toISOString(),
      gross_amount: amount,
      original_provider_transaction_id: null,
    };
  }

  const events = [main];
  if (status === "revoked" && amount != null && amount > 0) {
    events.push({
      environment,
      actor: "webhook:apple",
      user: main.user,
      transaction: {
        ...base,
        type: "refund",
        provider_transaction_id: `refund:${tx.transactionId}`,
        transaction_date: new Date(tx.revocationDate ?? now.getTime()).toISOString(),
        gross_amount: -amount,
        original_provider_transaction_id: tx.transactionId,
      },
    });
  }
  return { ok: true, value: { events } };
}
