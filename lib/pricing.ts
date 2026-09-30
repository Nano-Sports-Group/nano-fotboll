/**
 * lib/pricing.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * En sanningskälla för Nano Fotbolls prismodell. Används av prissidan,
 * create-checkout och (via metadata) Stripe-webhooken.
 *
 * Free / PRO 89 kr / Elite 169 kr — 20 % rabatt på årsplan (var 25 % till
 * 2026-08-17).
 * Belopp lagras i öre (Stripe-konvention).
 *
 * VIKTIGT: Founder är inte längre en boolean här. Potten på 500 platser bor i
 * `public.founder_offer_state` och läses via `lib/founder-offer.ts`. Den här
 * modulen är ren och importeras av klientkomponenter — den får aldrig träffa
 * DB. Funktioner som beror på potten tar `founder: boolean` som argument.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type PaidPlan = "pro" | "elite";
export type BillingInterval = "month" | "year";

export const ANNUAL_DISCOUNT = 0.2;

interface PlanPricing {
  label: string;
  /** Pris per månad i öre. */
  monthly: number;
  /** Pris per år i öre (redan med 20 % rabatt). */
  yearly: number;
}

/**
 * Årspriserna är avrundade till jämna kronor strax UNDER exakt 20 % rabatt —
 * aldrig över, så rabatten vi utlovar alltid är minst den vi ger:
 *   PRO   89×12 = 1068 → −20 % = 854,40 → 849
 *   Elite 169×12 = 2028 → −20 % = 1622,40 → 1619
 *   Founder 69×12 = 828 → −20 % = 662,40 → 659
 */
export const PRICING: Record<PaidPlan, PlanPricing> = {
  pro: { label: "PRO", monthly: 8900, yearly: 84900 },
  elite: { label: "Elite", monthly: 16900, yearly: 161900 },
};

/**
 * Founder-erbjudande: PRO 69 kr/mån FÖR ALLTID för de första 500 i potten.
 * Priset låses i Stripe-prenumerationen vid köp — ingen migrering behövs när
 * erbjudandet stängs.
 *
 * `active` FINNS INTE LÄNGRE. Den var hårdkodad `true` och lovade 69 kr till
 * hela internet oavsett hur många platser som fanns kvar. Använd
 * `isFounderOfferPublic()` i `lib/founder-offer.ts`.
 */
export const FOUNDER_OFFER = {
  cap: 500,
  pricing: { label: "PRO Founder", monthly: 6900, yearly: 65900 } as PlanPricing,
} as const;

/** Stripe trial på nya PRO/Elite-prenumerationer (dagar). */
export const TRIAL_DAYS = 7;

/** Ordinarie listpris PRO/Elite i kr/mån (alltid 89 / 169). */
export function listMonthlyKr(plan: PaidPlan): number {
  return PRICING[plan].monthly / 100;
}

/** PRO-pris i kr/mån för en given betraktare: 69 för founder, annars 89. */
export function proOfferMonthlyKr(founder: boolean): number {
  return (founder ? FOUNDER_OFFER.pricing.monthly : PRICING.pro.monthly) / 100;
}

/** Kort CTA-rad: "69 kr/mån" eller "89 kr/mån". */
export function proPriceLabel(founder: boolean): string {
  return `${proOfferMonthlyKr(founder)} kr/mån`;
}

/**
 * Belopp i öre för en given plan + intervall. Founder-pris gäller enbart PRO
 * och enbart när anroparen uttryckligen säger att betraktaren har rätt till
 * det — aldrig som default. Den defaulten var buggen: `FOUNDER_OFFER.active`
 * gav 69 kr till alla, för alltid.
 */
export function amountFor(
  plan: PaidPlan,
  interval: BillingInterval,
  opts?: { founder: boolean },
): number {
  const p = plan === "pro" && opts?.founder ? FOUNDER_OFFER.pricing : PRICING[plan];
  return interval === "year" ? p.yearly : p.monthly;
}

export function isPaidPlan(v: unknown): v is PaidPlan {
  return v === "pro" || v === "elite";
}

export function isBillingInterval(v: unknown): v is BillingInterval {
  return v === "month" || v === "year";
}

/** Formaterar öre → "89 kr" / "66,75 kr". */
export function formatKr(ore: number): string {
  const kr = ore / 100;
  return Number.isInteger(kr) ? `${kr} kr` : `${kr.toFixed(2).replace(".", ",")} kr`;
}

/**
 * Veckopris i hela kronor för ett fakturerat belopp.
 *
 * Intervallet MÅSTE med: ett månadsbelopp fördelas över 12/52 veckor, ett
 * årsbelopp över 52. Utan det blir 849 kr/år till 196 kr/vecka i stället för
 * 16 (facit i speccens Appendix B).
 *
 * `Math.round` avrundar .5 uppåt för positiva tal, vilket är rätt håll —
 * vi vill hellre överdriva veckopriset än undersälja det (marknadsföringslagen).
 */
export function weeklyKr(ore: number, interval: BillingInterval = "month"): number {
  const kr = ore / 100;
  return Math.round(interval === "year" ? kr / 52 : (kr * 12) / 52);
}

/** "16 kr/vecka" — alltid andra rad, aldrig hero. */
export function formatWeeklyKr(ore: number, interval: BillingInterval = "month"): string {
  return `${weeklyKr(ore, interval)} kr/vecka`;
}

/** Pris per månad vid årsplan (öre) — för "motsvarar X kr/mån". */
export function monthlyEquivalent(plan: PaidPlan): number {
  return Math.round(PRICING[plan].yearly / 12);
}

// ── Kombo: Fotboll + Hockey i en prenumeration ───────────────────────────────

/**
 * Kombopris (båda sporterna). FÖRSLAG 2026-09-30, väntar på founder-ja — därför
 * bakom `isComboEnabled()`: inget visas eller säljs förrän flaggan är satt.
 * Årspris = 20 % rabatt på 12 × månad, avrundat nedåt till …9 som övriga planer.
 */
export const COMBO_PRICING: Record<PaidPlan, PlanPricing> = {
  pro: { label: "PRO Kombo", monthly: 12900, yearly: 123900 },
  elite: { label: "Elite Kombo", monthly: 24900, yearly: 238900 },
};

/** Vilka sporter en prenumeration ger. 'both' = kombo. */
export type SubscriptionScope = "football" | "hockey" | "both";

export function isSubscriptionScope(v: unknown): v is SubscriptionScope {
  return v === "football" || v === "hockey" || v === "both";
}

/** Belopp i öre. Founder gäller bara fotbollens PRO — aldrig kombo eller hockey. */
export function scopeAmountFor(
  scope: SubscriptionScope,
  plan: PaidPlan,
  interval: BillingInterval,
  opts?: { founder: boolean },
): number {
  if (scope === "both") {
    const p = COMBO_PRICING[plan];
    return interval === "year" ? p.yearly : p.monthly;
  }
  return amountFor(plan, interval, { founder: scope === "football" && Boolean(opts?.founder) });
}

/** Kombon säljs bara när founder har godkänt priset (NEXT_PUBLIC_COMBO_ENABLED=true). */
export function isComboEnabled(): boolean {
  return process.env.NEXT_PUBLIC_COMBO_ENABLED === "true";
}

/**
 * Nytt omfång när en sport läggs till eller tas bort. `null` = otillåten ändring
 * (lägga till det man redan har, ta bort sista sporten — det är en uppsägning).
 */
export function nextScope(
  current: SubscriptionScope,
  action: "add" | "remove",
  sport: "football" | "hockey",
): SubscriptionScope | null {
  if (action === "add") return current === "both" || current === sport ? null : "both";
  if (current !== "both") return null;
  return sport === "football" ? "hockey" : "football";
}
