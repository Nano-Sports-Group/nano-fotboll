/**
 * POST /api/webhooks/google-play — Pub/Sub push (Real-time developer notifications).
 *
 * Säkerhet: hemlig token i adressen (?token=, tidskonstant jämförelse mot GOOGLE_PLAY_RTDN_TOKEN).
 * Innehållet i notisen är aldrig sanningen — vi plockar BARA ut `purchaseToken`, hämtar köpet på nytt
 * från Google med tjänstekontot och bokför det vi får där. Ägaren avgörs av köpets
 * `obfuscatedExternalAccountId` (= användarens kontotoken i `app_store_accounts`).
 *
 * Svar: 200 = klart/ignorerat (Pub/Sub slutar skicka), 5xx = Pub/Sub försöker igen.
 */

import { NextResponse } from "next/server";
import { secretsEqual } from "@/lib/secrets";
import { claimWebhook, finishWebhook, payloadHash } from "@/lib/billing/apply";
import { googleAccountToken } from "@/lib/billing/google-normalize";
import { fetchSubscriptionPurchase, isGooglePlayConfigured } from "@/lib/billing/google-play";
import { applyGooglePurchase } from "@/lib/billing/google-sync";
import { userIdForAccountToken } from "@/lib/billing/store-account";

interface PubSubPush {
  message?: { data?: string; messageId?: string };
}

/** `subscriptionNotification` / `voidedPurchaseNotification` / `testNotification` — vi läser bara köptoken. */
function purchaseTokenFrom(data: string): string | null {
  try {
    const json = JSON.parse(Buffer.from(data, "base64").toString("utf8")) as {
      subscriptionNotification?: { purchaseToken?: string };
      voidedPurchaseNotification?: { purchaseToken?: string };
    };
    return json.subscriptionNotification?.purchaseToken ?? json.voidedPurchaseNotification?.purchaseToken ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const expected = process.env.GOOGLE_PLAY_RTDN_TOKEN;
  if (!expected || !isGooglePlayConfigured()) {
    return NextResponse.json({ error: "Google Play är inte konfigurerat" }, { status: 503 });
  }
  const provided = new URL(req.url).searchParams.get("token");
  if (!secretsEqual(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await req.text();
  let push: PubSubPush;
  try {
    push = JSON.parse(raw) as PubSubPush;
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }
  const messageId = push.message?.messageId;
  const data = push.message?.data;
  if (!messageId || !data) return NextResponse.json({ error: "Ogiltigt Pub/Sub-meddelande" }, { status: 400 });

  let claim;
  try {
    claim = await claimWebhook("google", messageId, "rtdn", payloadHash(raw));
  } catch (error) {
    console.error("[google-play-webhook] claim misslyckades:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Kunde inte registrera händelsen" }, { status: 500 });
  }
  if (claim === "done") return NextResponse.json({ received: true, duplicate: true });
  if (claim === "busy") return NextResponse.json({ error: "Händelsen hanteras redan" }, { status: 409 });

  try {
    const purchaseToken = purchaseTokenFrom(data);
    if (!purchaseToken) {
      // Testnotis eller en typ vi inte bokför (t.ex. engångsprodukt) — inget att hämta.
      await finishWebhook("google", messageId, "ignored");
      return NextResponse.json({ received: true });
    }

    const purchase = await fetchSubscriptionPurchase(purchaseToken);
    const accountToken = googleAccountToken(purchase);
    const owner = accountToken ? await userIdForAccountToken(accountToken) : null;
    if (!owner) {
      // Köp utan vår kontotoken (gjort utanför appen, eller före kopplingen) går inte att knyta till en användare.
      await finishWebhook("google", messageId, "ignored", "okänd kontotoken");
      return NextResponse.json({ received: true });
    }

    const { skipped } = await applyGooglePurchase(purchase, purchaseToken, owner);
    await finishWebhook("google", messageId, skipped ? "ignored" : "processed", skipped);
    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[google-play-webhook]", message);
    await finishWebhook("google", messageId, "failed", message).catch(() => {});
    return NextResponse.json({ error: "Händelsen kunde inte hanteras" }, { status: 500 });
  }
}
