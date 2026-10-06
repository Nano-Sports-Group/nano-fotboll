/**
 * lib/billing/products.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Ren mappning från leverantörens id:n till vår produkt (`billing_products.id`).
 * Okänt → null: anroparen skriver en granskningsnotering och hoppar över.
 * Vi hittar aldrig på en produkt — en felmappad produkt ger rätt pengar på fel rättighet.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { APP_STORE_PRODUCTS } from "../product-contract";

export const PRODUCT = {
  footballPro: "nano_fotboll_pro",
  footballElite: "nano_fotboll_elite",
  hockeyPro: "nano_hockey_pro",
  golfPro: "nano_golf_pro",
  sportPro: "nano_sport_pro",
  sportElite: "nano_sport_elite",
  mapsPro: "nano_maps_pro",
  tvPlus: "nano_tv_plus",
} as const;

const KNOWN_PRODUCTS = new Set<string>(Object.values(PRODUCT));

export function isKnownProduct(id: unknown): id is string {
  return typeof id === "string" && KNOWN_PRODUCTS.has(id);
}

/** Stripe-metadata (`vertical` + `plan`) → produkt. Samma värden som kassan skriver (lib/pricing). */
export function productFromStripeMetadata(meta: Record<string, string | undefined> | null | undefined): string | null {
  // Prenumerationer som skapades innan `vertical` fanns var alltid fotboll — samma default som webhooken hade.
  const vertical = meta?.vertical ?? "football";
  const plan = meta?.plan === "elite" ? "elite" : meta?.plan === "pro" ? "pro" : null;
  switch (vertical) {
    case "football":
      return plan === "elite" ? PRODUCT.footballElite : plan === "pro" ? PRODUCT.footballPro : null;
    case "hockey":
      // Hockey säljer ingen Elite (lib/pricing ELITE_AVAILABLE).
      return plan === "pro" ? PRODUCT.hockeyPro : null;
    case "both":
      return plan === "elite" ? PRODUCT.sportElite : plan === "pro" ? PRODUCT.sportPro : null;
    case "golf":
      return plan === "pro" ? PRODUCT.golfPro : null;
    case "maps":
      return plan === "pro" || plan === null ? PRODUCT.mapsPro : null;
    case "tv":
      return PRODUCT.tvPlus;
    default:
      return null;
  }
}

/** Maps och TV ägs av apparnas egna webhookar — vi bokför dem men skriver aldrig deras Clerk-fack. */
export function ownsClerkProjection(vertical: string | undefined): boolean {
  return vertical !== "maps" && vertical !== "tv";
}

type StoreProduct = { product: string; interval: "month" | "year" };

const APPLE_PRODUCTS: Record<string, StoreProduct> = {
  [APP_STORE_PRODUCTS.proMonthly.id]: { product: PRODUCT.footballPro, interval: "month" },
  [APP_STORE_PRODUCTS.proYearly.id]: { product: PRODUCT.footballPro, interval: "year" },
  [APP_STORE_PRODUCTS.eliteMonthly.id]: { product: PRODUCT.footballElite, interval: "month" },
  [APP_STORE_PRODUCTS.eliteYearly.id]: { product: PRODUCT.footballElite, interval: "year" },
};

export function productFromAppleProductId(productId: string | undefined): StoreProduct | null {
  return (productId && APPLE_PRODUCTS[productId]) || null;
}

/**
 * Google Play-produkter. TOM tills Play-produkterna finns i Play Console (routing-regeln för
 * android är avstängd tills dess). Fyll i `<play-produkt-id>: { product, interval }` när de skapats;
 * ingen annan kod behöver ändras.
 */
const GOOGLE_PRODUCTS: Record<string, StoreProduct> = {};

export function productFromGoogleProductId(productId: string | undefined): StoreProduct | null {
  return (productId && GOOGLE_PRODUCTS[productId]) || null;
}
