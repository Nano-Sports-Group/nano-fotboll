/**
 * lib/billing/upgrade.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Uppgradering PRO → Elite på en befintlig Stripe-prenumeration. Rena beslut — inget nätverk,
 * ingen klocka, inga hemligheter — så att rutten (`/api/billing/upgrade`), sidan
 * (`/konto/uppgradera`) och testerna delar exakt samma regler.
 *
 * Founderns beslut: det outnyttjade av det kunden redan betalat krediteras, och en NY
 * faktureringsperiod till Elite-priset börjar direkt (`billing_cycle_anchor: 'now'`).
 * Under provperioden byts bara priset: ingen debitering nu, första debiteringen blir Elite.
 *
 * Importerar bara rena moduler (relativa sökvägar) så att `tsx --test` kan köra filen.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type Stripe from "stripe";
import {
  COMBO_PRICING,
  SPORT_PRICING,
  isPaidPlan,
  isSubscriptionScope,
  scopeAmountFor,
  type BillingInterval,
  type SubscriptionScope,
} from "../pricing";
import { catalogRef } from "../stripe-catalog";

// ─── Behörighet ──────────────────────────────────────────────────────────────

export type UpgradeMode = "active" | "trialing";

export type IneligibleCode =
  | "no_subscription"
  | "already_elite"
  | "cancel_scheduled"
  | "no_elite_for_scope"
  | "past_due"
  | "bad_status"
  | "unknown_plan";

/** Det beslutet behöver veta om prenumerationen — redan hämtat från Stripe, aldrig från klienten. */
export interface UpgradeSubjectInput {
  status: string;
  /** `metadata.plan`. */
  plan: unknown;
  /** `metadata.vertical`. */
  scope: unknown;
  cancelAtPeriodEnd: boolean;
  /** Stripes `cancel_at` (unix) — en schemalagd uppsägning kan ligga där i stället för i flaggan. */
  cancelAt: number | null;
}

export type UpgradeEligibility =
  | { eligible: true; mode: UpgradeMode; scope: SubscriptionScope }
  | { eligible: false; code: IneligibleCode; httpStatus: 400 | 404 | 409; reason: string };

const NO_ELITE_MESSAGE = "Elite finns inte för hockey än. Din prenumeration går inte att uppgradera.";

/**
 * `null` = användaren har ingen prenumeration på fotboll hos oss (free, eller köpt via App Store / Google Play).
 * Hockey-prenumeration ensam, och deployer där Elite inte säljs (`eliteAvailable` false), är inte berättigade.
 */
export function upgradeEligibility(
  subject: UpgradeSubjectInput | null,
  opts: { eliteAvailable: boolean },
): UpgradeEligibility {
  if (!subject) {
    return {
      eligible: false,
      code: "no_subscription",
      httpStatus: 404,
      reason:
        "Vi hittar ingen prenumeration på webben att uppgradera. Har du köpt PRO i en app byter du plan där köpet gjordes.",
    };
  }
  if (!isPaidPlan(subject.plan)) {
    return { eligible: false, code: "unknown_plan", httpStatus: 409, reason: "Din plan går inte att uppgradera här. Hör av dig till oss så hjälper vi dig." };
  }
  if (subject.plan === "elite") {
    return { eligible: false, code: "already_elite", httpStatus: 409, reason: "Du har redan Elite." };
  }
  const scope: SubscriptionScope = isSubscriptionScope(subject.scope) ? subject.scope : "football";
  if (!opts.eliteAvailable || scope === "hockey") {
    return { eligible: false, code: "no_elite_for_scope", httpStatus: 400, reason: NO_ELITE_MESSAGE };
  }
  if (subject.cancelAtPeriodEnd || subject.cancelAt !== null) {
    return {
      eligible: false,
      code: "cancel_scheduled",
      httpStatus: 409,
      reason: 'Din prenumeration är satt att avslutas. Förnya den under "Hantera prenumeration" på kontosidan, så kan du uppgradera därefter.',
    };
  }
  if (subject.status === "past_due" || subject.status === "unpaid") {
    return {
      eligible: false,
      code: "past_due",
      httpStatus: 409,
      reason: 'Den senaste betalningen gick inte igenom. Uppdatera kortet under "Hantera prenumeration" först.',
    };
  }
  if (subject.status !== "active" && subject.status !== "trialing") {
    return { eligible: false, code: "bad_status", httpStatus: 409, reason: "Din prenumeration är inte aktiv och går inte att uppgradera." };
  }
  return { eligible: true, mode: subject.status, scope };
}

// ─── Målpris ─────────────────────────────────────────────────────────────────

export interface UpgradeTarget {
  plan: "elite";
  scope: SubscriptionScope;
  interval: BillingInterval;
  /** Stripe-produktens fasta id (samma i test och live). */
  productId: string;
  /** Katalogpriset slås upp på den här nyckeln (`catalogPriceId`). */
  lookupKey: string;
  /** Öre. Aldrig Founder-pris: Elite är aldrig Founder. */
  amountOre: number;
  /** Namn för en inline-produkt om katalogen saknas. */
  productName: string;
}

export function upgradeTarget(scope: SubscriptionScope, interval: BillingInterval): UpgradeTarget {
  // `founder: false` uttryckligen — och catalogRef ger i vilket fall aldrig `_founder` för Elite.
  const ref = catalogRef(scope, "elite", interval, { founder: false });
  return {
    plan: "elite",
    scope,
    interval,
    productId: ref.productId,
    lookupKey: ref.lookupKey,
    amountOre: scopeAmountFor(scope, "elite", interval, { founder: false }),
    productName: scope === "both" ? COMBO_PRICING.elite.label : `Nano Fotboll ${SPORT_PRICING.football.elite.label}`,
  };
}

// ─── Stripe-parametrar ───────────────────────────────────────────────────────

/** Antingen ett katalogpris eller ett inline-pris, precis som kassan och sport-växlingen gör. */
export type PriceRef = { price: string } | { price_data: { currency: "sek"; product: string; unit_amount: number; recurring: { interval: BillingInterval } } };

export function priceRefFor(target: UpgradeTarget, priceId: string | null, productId: string): PriceRef {
  return priceId
    ? { price: priceId }
    : { price_data: { currency: "sek", product: productId, unit_amount: target.amountOre, recurring: { interval: target.interval } } };
}

/** Det som är gemensamt för förhandsvisningen och själva ändringen — så att beloppet som visas är beloppet som dras. */
export function upgradeChange(mode: UpgradeMode, itemId: string, price: PriceRef) {
  return {
    items: [{ id: itemId, ...price }],
    // Aktiv: kreditera det outnyttjade, starta en ny period nu och fakturera direkt.
    // Provperiod: bara prisbytet; provperiodens slut rörs inte och ingenting debiteras nu.
    proration_behavior: mode === "active" ? ("always_invoice" as const) : ("none" as const),
    ...(mode === "active" ? { billing_cycle_anchor: "now" as const } : {}),
  };
}

/** Parametrar till `stripe.subscriptions.update`. */
export function buildUpdateParams(
  mode: UpgradeMode,
  itemId: string,
  price: PriceRef,
  existingMetadata: Record<string, string>,
): Stripe.SubscriptionUpdateParams {
  return {
    ...upgradeChange(mode, itemId, price),
    // Ett nekat kort ska lämna prenumerationen orörd (Stripe svarar 402 och ändrar ingenting).
    ...(mode === "active" ? { payment_behavior: "error_if_incomplete" as const } : {}),
    // Founder-märket är ett historiskt faktum och följer med; clerkUserId, vertical, interval ligger kvar.
    metadata: { ...existingMetadata, plan: "elite" },
  };
}

/** Parametrar till `stripe.invoices.createPreview` — samma ändring som `buildUpdateParams`. */
export function buildPreviewParams(
  customerId: string,
  subscriptionId: string,
  mode: UpgradeMode,
  itemId: string,
  price: PriceRef,
): Stripe.InvoiceCreatePreviewParams {
  return {
    customer: customerId,
    subscription: subscriptionId,
    subscription_details: upgradeChange(mode, itemId, price),
  };
}

/**
 * Stripe sparar resultatet av en idempotent begäran, även ett nekat kort — ett nytt försök med samma
 * nyckel efter att kortet bytts skulle få det gamla nej:et. Därför ett grovt tidsfönster (2 min) i nyckeln:
 * ett dubbelklick (samma sekund) delar nyckel, ett försök efter kortbyte gör det inte. Det som i övrigt
 * stoppar en dubbeluppgradering är att rutten läser om prenumerationen och svarar 409 när den redan är Elite.
 */
export function upgradeIdempotencyKey(userId: string, subscriptionId: string, periodStart: number, nowMs: number): string {
  return `upgrade-elite:${userId}:${subscriptionId}:${periodStart}:${Math.floor(nowMs / 120_000)}`;
}

// ─── Förhandsvisning ─────────────────────────────────────────────────────────

type LineLike = Pick<Stripe.InvoiceLineItem, "amount" | "parent" | "period">;

function isProration(line: LineLike): boolean {
  const p = line.parent;
  return p?.subscription_item_details?.proration === true || p?.invoice_item_details?.proration === true;
}

export interface UpgradePreviewNumbers {
  newPriceOre: number;
  creditOre: number;
  amountDueNowOre: number;
  /** ISO. */
  nextRenewalAt: string | null;
}

function addInterval(from: Date, interval: BillingInterval): Date {
  const d = new Date(from.getTime());
  if (interval === "year") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

/**
 * Läser ut det kunden ska se ur Stripes förhandsfaktura.
 * - `creditOre` = absolutsumman av de negativa prorationsraderna (det outnyttjade av PRO).
 * - `amountDueNowOre` = fakturans `amount_due`.
 * - Under provperioden debiteras inget nu, så där är både kredit och belopp 0 — hur Stripe än radar upp
 *   den kommande fakturan — och nästa förnyelse är provperiodens slut.
 */
export function parseUpgradePreview(
  invoice: { amount_due: number; lines: { data: LineLike[] } },
  ctx: { mode: UpgradeMode; target: UpgradeTarget; trialEnd: number | null; nowMs: number },
): UpgradePreviewNumbers {
  const lines = invoice.lines.data;

  if (ctx.mode === "trialing") {
    return {
      newPriceOre: ctx.target.amountOre,
      creditOre: 0,
      amountDueNowOre: 0,
      nextRenewalAt: ctx.trialEnd ? new Date(ctx.trialEnd * 1000).toISOString() : null,
    };
  }

  const creditOre = Math.abs(lines.filter((l) => isProration(l) && l.amount < 0).reduce((sum, l) => sum + l.amount, 0));
  const fullPeriodLines = lines.filter((l) => !isProration(l) && l.amount > 0);
  const newPrice = fullPeriodLines.reduce((sum, l) => sum + l.amount, 0);
  const periodEnds = lines.filter((l) => !isProration(l)).map((l) => l.period?.end).filter((e): e is number => typeof e === "number");
  const renewal = periodEnds.length > 0 ? new Date(Math.max(...periodEnds) * 1000) : addInterval(new Date(ctx.nowMs), ctx.target.interval);

  return {
    newPriceOre: newPrice > 0 ? newPrice : ctx.target.amountOre,
    creditOre,
    amountDueNowOre: invoice.amount_due,
    nextRenewalAt: renewal.toISOString(),
  };
}

// ─── Fel från Stripe ─────────────────────────────────────────────────────────

/** Nekat kort (402) — prenumerationen är orörd. */
export function isCardDeclined(err: unknown): boolean {
  const e = err as { type?: unknown; statusCode?: unknown; code?: unknown } | null;
  return !!e && (e.type === "StripeCardError" || e.statusCode === 402 || e.code === "card_declined");
}

export const CARD_DECLINED_MESSAGE =
  'Kortet nekades och din prenumeration är oförändrad. Uppdatera kortet under "Hantera prenumeration" och försök igen.';
