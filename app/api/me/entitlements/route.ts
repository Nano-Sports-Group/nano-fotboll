/**
 * GET /api/me/entitlements — vad den inloggade användaren har rätt till, ur `user_entitlements`.
 *
 * Plattformsoberoende: webben, iOS och Android läser samma karta ({ football_pro: true, … }) oavsett
 * om köpet gjordes hos Stripe, Apple eller Google. Identiteten kommer ur sessionen. Cachas aldrig —
 * ett köp ska synas direkt. Databasfel ger 503, aldrig en gissad karta.
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getEntitlements } from "@/lib/billing/entitlements";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });

  try {
    return NextResponse.json(await getEntitlements(userId), { headers: NO_STORE });
  } catch (error) {
    console.error("[me/entitlements]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Kunde inte läsa rättigheter" }, { status: 503, headers: NO_STORE });
  }
}
