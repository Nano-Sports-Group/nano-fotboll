/**
 * /api/google-play/purchases — Android-appens väg in.
 *
 * GET  → användarens kontotoken (klienten skickar den som obfuscatedAccountId vid köp).
 * POST → { purchaseToken }: servern hämtar köpet från Google och kräver att det tillhör den här
 *        användaren. Identiteten kommer ur Clerk-sessionen; inget pris eller status läses ur bodyn.
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/ratelimit";
import { isSupabaseConfigured } from "@/lib/supabase";
import { parseBody, z } from "@/lib/validation";
import { jsonContract } from "@/lib/api-contract";
import { StoreAccountTokenResponseSchema } from "@/lib/api-schemas";
import { getOrCreateAccountToken } from "@/lib/billing/store-account";
import { googleAccountToken } from "@/lib/billing/google-normalize";
import { fetchSubscriptionPurchase, isGooglePlayConfigured } from "@/lib/billing/google-play";
import { applyGooglePurchase } from "@/lib/billing/google-sync";
import { getEntitlements } from "@/lib/billing/entitlements";
import { entitlementMapFrom } from "@/lib/billing/types";

const PurchaseSchema = z.object({
  purchaseToken: z.string().min(10).max(2000),
});

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "DB ej konfigurerad" }, { status: 503 });
  }
  try {
    const appAccountToken = await getOrCreateAccountToken(userId);
    return jsonContract(StoreAccountTokenResponseSchema, { appAccountToken });
  } catch (error) {
    console.error("[google-play GET]", error);
    return NextResponse.json({ error: "Kunde inte förbereda köp" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured() || !isGooglePlayConfigured()) {
    return NextResponse.json({ error: "Google Play är inte konfigurerat" }, { status: 503 });
  }

  const blocked = await enforceRateLimit("write", req, userId);
  if (blocked) return blocked;

  const parsed = await parseBody(req, PurchaseSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const [purchase, accountToken] = await Promise.all([
      fetchSubscriptionPurchase(parsed.data.purchaseToken),
      getOrCreateAccountToken(userId),
    ]);
    if (googleAccountToken(purchase)?.toLowerCase() !== accountToken.toLowerCase()) {
      return NextResponse.json(
        { error: "Köpet tillhör inte detta konto", code: "account_mismatch" },
        { status: 403 },
      );
    }

    const { result, skipped } = await applyGooglePurchase(purchase, parsed.data.purchaseToken, userId);
    return NextResponse.json({
      ok: true,
      ...(skipped ? { pending: true } : {}),
      // Ej bokfört än (väntar på betalning): svara med det som gäller just nu, inte en tom karta.
      entitlements: result
        ? entitlementMapFrom(Object.entries(result.entitlements).filter(([, on]) => on).map(([key]) => key))
        : await getEntitlements(userId),
    });
  } catch (error) {
    console.error("[google-play POST]", error);
    return NextResponse.json(
      { error: "Kunde inte verifiera Google Play-köpet", code: "verification_failed" },
      { status: 502 },
    );
  }
}
