/**
 * lib/stripe-catalog.ts — Stripes produktkatalog, härledd ur lib/pricing.ts.
 *
 * Beloppen bor i lib/pricing.ts och ingen annanstans. Den här filen säger bara VILKA produkter och
 * priser som ska finnas i Stripe och vad de heter; `pnpm stripe:catalog` skapar dem.
 * Kassan slår upp priset på `lookupKey` (lib/stripe-price.ts) och vägrar använda ett katalogpris
 * vars belopp inte stämmer med koden — då faller den tillbaka på inline-pris. Koden vinner alltid.
 *
 * Ren modul: inga Stripe-anrop, ingen env. Ändras ett pris: ändra lib/pricing.ts, kör
 * `pnpm stripe:catalog --apply` (skapar nytt pris, flyttar nyckeln, arkiverar det gamla).
 * Befintliga prenumeranter ligger kvar på sitt gamla pris.
 */

import {
  COMBO_PRICING,
  FOUNDER_OFFER,
  GOLF_PLANNED_PRICING,
  MAPS_PRICING,
  SPORT_PRICING,
  type BillingInterval,
  type PaidPlan,
  type SubscriptionScope,
} from "./pricing";

export interface CatalogPrice {
  lookupKey: string;
  /** Öre. */
  amount: number;
  interval: BillingInterval;
  nickname: string;
}

export interface CatalogProduct {
  /** Fast id i Stripe — samma i testläge och live. */
  id: string;
  name: string;
  description: string;
  /** `sold: "false"` = finns i katalogen men säljs inte än (kassan nekar). */
  metadata: Record<string, string>;
  prices: CatalogPrice[];
}

interface Amounts {
  monthly: number;
  yearly: number;
}

function pair(id: string, p: Amounts, suffix = "", label = ""): CatalogPrice[] {
  const key = `${id}${suffix ? `_${suffix}` : ""}`;
  const name = label ? `${label} ` : "";
  return [
    { lookupKey: `${key}_month`, amount: p.monthly, interval: "month", nickname: `${name}månadsvis` },
    { lookupKey: `${key}_year`, amount: p.yearly, interval: "year", nickname: `${name}årsvis` },
  ];
}

export const PRODUCT_ID = {
  footballPro: "nano_fotboll_pro",
  footballElite: "nano_fotboll_elite",
  hockeyPro: "nano_hockey_pro",
  golfPro: "nano_golf_pro",
  allPro: "nano_sport_pro",
  allElite: "nano_sport_elite",
  mapsPro: "nano_maps_pro",
} as const;

export const CATALOG: CatalogProduct[] = [
  {
    id: PRODUCT_ID.footballPro,
    name: "Nano Fotboll PRO",
    description: "PRO för svensk fotboll. Nano Maps Pro ingår.",
    metadata: { vertical: "football", plan: "pro", sold: "true" },
    prices: [
      ...pair(PRODUCT_ID.footballPro, SPORT_PRICING.football.pro),
      // Founder: 69 kr för alltid, de första 500. Samma produkt, eget pris — kassan väljer det bara efter potten.
      ...pair(PRODUCT_ID.footballPro, FOUNDER_OFFER.pricing, "founder", "Founder"),
    ],
  },
  {
    id: PRODUCT_ID.footballElite,
    name: "Nano Fotboll Elite",
    description: "Elite för svensk fotboll: allt i PRO plus det djupaste dataskiktet. Nano Maps Pro ingår.",
    metadata: { vertical: "football", plan: "elite", sold: "true" },
    prices: pair(PRODUCT_ID.footballElite, SPORT_PRICING.football.elite),
  },
  {
    id: PRODUCT_ID.hockeyPro,
    name: "Nano Hockey PRO",
    description: "PRO för svensk hockey. Nano Maps Pro ingår.",
    metadata: { vertical: "hockey", plan: "pro", sold: "true" },
    prices: pair(PRODUCT_ID.hockeyPro, SPORT_PRICING.hockey.pro),
  },
  {
    id: PRODUCT_ID.golfPro,
    name: "Nano Golf PRO",
    description: "PRO för golf. Säljs inte än — öppnar när golfens innehåll finns.",
    metadata: { vertical: "golf", plan: "pro", sold: "false" },
    prices: pair(PRODUCT_ID.golfPro, GOLF_PLANNED_PRICING),
  },
  {
    id: PRODUCT_ID.allPro,
    name: "Nano Sport PRO",
    description: "PRO på alla Nanos sporter i en prenumeration: fotboll och hockey nu, golf när den öppnar. Nano Maps Pro ingår.",
    metadata: { vertical: "both", plan: "pro", sold: "true" },
    prices: pair(PRODUCT_ID.allPro, COMBO_PRICING.pro),
  },
  {
    id: PRODUCT_ID.allElite,
    name: "Nano Sport Elite",
    description: "Fotbollens Elite plus PRO på Nanos övriga sporter. Nano Maps Pro ingår.",
    metadata: { vertical: "both", plan: "elite", sold: "true" },
    prices: pair(PRODUCT_ID.allElite, COMBO_PRICING.elite),
  },
  {
    id: PRODUCT_ID.mapsPro,
    name: "Nano Maps Pro",
    description: "Kartspelet utan reklam: egna rundor, grupper och tidigare dagar. Ingår i alla PRO- och Elite-planer.",
    metadata: { vertical: "maps", plan: "pro", sold: "true" },
    prices: pair(PRODUCT_ID.mapsPro, MAPS_PRICING),
  },
];

/** Vilket katalogpris en sportprenumeration ska ligga på. Samma regler som `scopeAmountFor`. */
export function catalogRef(
  scope: SubscriptionScope,
  plan: PaidPlan,
  interval: BillingInterval,
  opts?: { founder: boolean },
): { productId: string; lookupKey: string } {
  const founder = scope === "football" && plan === "pro" && opts?.founder === true;
  const productId =
    scope === "both"
      ? plan === "elite" ? PRODUCT_ID.allElite : PRODUCT_ID.allPro
      : scope === "hockey"
        ? PRODUCT_ID.hockeyPro
        : plan === "elite" ? PRODUCT_ID.footballElite : PRODUCT_ID.footballPro;
  return { productId, lookupKey: `${productId}${founder ? "_founder" : ""}_${interval}` };
}
