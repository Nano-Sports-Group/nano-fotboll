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

import { VERTICAL, type VerticalId } from "./vertical";

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
/**
 * Pris per sport (founder-beslut 2026-09-30). Hockey har ingen Elite än — AI-brief,
 * poddar och AI-chatt byggs upp först; PRO är billigare så länge innehållet är tunnare.
 * `hockey.elite` finns bara för att typen ska vara hel: `ELITE_AVAILABLE` stoppar försäljningen.
 */
/** Vertikaler som har ett pris. Golf har inget (founder-beslut saknas) och säljer därför inget. */
export type PricedVertical = Exclude<VerticalId, "golf">;

export const SPORT_PRICING: Record<PricedVertical, Record<PaidPlan, PlanPricing>> = {
  football: {
    pro: { label: "PRO", monthly: 8900, yearly: 84900 },
    elite: { label: "Elite", monthly: 16900, yearly: 161900 },
  },
  hockey: {
    pro: { label: "PRO", monthly: 6900, yearly: 65900 },
    elite: { label: "Elite", monthly: 16900, yearly: 161900 },
  },
};

/**
 * Golfens PRO-pris (2026-10-06): samma som hockey så länge innehållet är tunt. SÄLJS INTE —
 * `SELLS` är false för golf. Finns för katalogen i Stripe och för att "alla sporter" ska ha ett facit.
 */
export const GOLF_PLANNED_PRICING: PlanPricing = { label: "PRO", monthly: 6900, yearly: 65900 };

/**
 * Nano Maps Pro. Speglar `nano-maps/lib/pricing.ts` (eget repo, egen kassa) — ändras det ena ändras
 * det andra. Årsrabatten är 32 %, ett medvetet avsteg från 20 %-regeln (ADR-006).
 * Maps Pro ingår i varje PRO/Elite på en sport (`nano-maps/lib/player.ts`).
 */
export const MAPS_PRICING: PlanPricing = { label: "Maps Pro", monthly: 4900, yearly: 39900 };

/** Den här deployens priser — alla befintliga anropare läser härifrån. */
/** Säljer den här deployen något? Golf: nej — prissidan är dold och kassan nekar. */
export const SELLS: boolean = VERTICAL !== "golf";

// Golf: värdet finns bara för att typen ska vara hel. Det visas aldrig (SELLS = false).
export const PRICING: Record<PaidPlan, PlanPricing> = SPORT_PRICING[VERTICAL === "golf" ? "football" : VERTICAL];

/** Säljs Elite i den här vertikalen? Styr både prissidan och checkout. */
export const ELITE_AVAILABLE: boolean = VERTICAL === "football";

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

// ── Nano Sport: alla sporter i en prenumeration ──────────────────────────────

/**
 * Paketet för alla sporter (hette "Kombo" till 2026-10-06; beloppen är founder-godkända 2026-09-30
 * och oförändrade). I dag fotboll + hockey; golf följer med utan påslag när golfens PRO öppnar.
 * Ett paket, inte en trappa per antal sporter — två val (en sport eller alla) säljer bättre än fyra.
 * Säljs bakom `isComboEnabled()`. Årspris = 20 % rabatt på 12 × månad, avrundat nedåt till …9.
 * I koden heter omfånget fortfarande `both` (Stripe-metadata på befintliga prenumerationer).
 */
export const COMBO_PRICING: Record<PaidPlan, PlanPricing> = {
  pro: { label: "Nano Sport PRO", monthly: 12900, yearly: 122900 },
  // Nano Sport Elite = fotbollens Elite + PRO på övriga sporter (bara fotboll har Elite).
  elite: { label: "Nano Sport Elite", monthly: 20900, yearly: 199900 },
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
  // Omfångets sport avgör priset — inte vilken sajt köpet görs från.
  const p =
    scope === "both"
      ? COMBO_PRICING[plan]
      : scope === "football" && plan === "pro" && opts?.founder
        ? FOUNDER_OFFER.pricing
        : SPORT_PRICING[scope][scope === "hockey" ? "pro" : plan];
  return interval === "year" ? p.yearly : p.monthly;
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
