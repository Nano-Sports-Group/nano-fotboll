/**
 * GET /api/billing/purchase-options?platform=web|ios|android&country=&appVersion=&storefront=&productType=
 *
 * Servern avgör vilket köpflöde en klient får visa, ur `payment_routing_rules`. Klienten visar bara det
 * den får tillbaka — ingen regel som träffar = `not_available`. Publik (inget konto behövs för att se
 * vilka vägar som finns) men rate-limitad per IP; `read` är fail-open så en Redis-blink inte döljer köpknappen.
 */

import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/ratelimit";
import { parseQuery, z } from "@/lib/validation";
import { resolvePurchaseOptions } from "@/lib/billing/routing";
import { loadRoutingRules } from "@/lib/billing/routing-rules";

const QuerySchema = z.object({
  platform: z.enum(["web", "ios", "android"]),
  country: z.string().regex(/^[A-Za-z]{2}$/).optional(),
  appVersion: z.string().regex(/^\d+(\.\d+){0,3}$/).optional(),
  storefront: z.string().regex(/^[A-Za-z]{2,3}$/).optional(),
  productType: z.string().regex(/^[a-z_]{1,32}$/).optional(),
});

export async function GET(req: Request) {
  const blocked = await enforceRateLimit("read", req);
  if (blocked) return blocked;

  const parsed = parseQuery(req, QuerySchema);
  if (!parsed.ok) return parsed.response;
  const { platform, country, appVersion, storefront, productType } = parsed.data;

  let rules;
  try {
    rules = await loadRoutingRules();
  } catch (error) {
    // Kan vi inte läsa reglerna erbjuder vi inget — hellre ingen köpknapp än en otillåten.
    console.error("[purchase-options]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Kunde inte läsa köpalternativ" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const options = resolvePurchaseOptions(rules, { platform, country, appVersion, storefront, productType });
  return NextResponse.json(
    { platform, country: country?.toUpperCase() ?? null, options },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=60" } },
  );
}
