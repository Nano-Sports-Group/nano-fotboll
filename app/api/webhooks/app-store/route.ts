import { NextResponse } from "next/server";
import {
  verifyAppStoreNotification,
  verifySignedAppStoreRenewal,
  verifySignedAppStoreTransaction,
} from "@/lib/app-store";
import { isStoreKitRevocationNotification } from "@/lib/product-contract";
import {
  revokeStoreKitEntitlement,
  syncStoreKitTransaction,
} from "@/lib/storekit-entitlements";
import { parseBody, z } from "@/lib/validation";
import { claimWebhook, finishWebhook, payloadHash } from "@/lib/billing/apply";

const NotificationSchema = z.object({
  signedPayload: z.string().min(100),
});

export async function POST(req: Request) {
  const parsed = await parseBody(req, NotificationSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const notification = await verifyAppStoreNotification(parsed.data.signedPayload);
    const notificationType = String(notification.notificationType ?? "");

    // Idempotens på Apples egen notis-id. Utan det kan samma notis (Apple skickar om) bokföras två gånger.
    const eventId = notification.notificationUUID;
    if (!eventId) throw new Error("Notification saknar notificationUUID");
    const claim = await claimWebhook("apple", eventId, notificationType, payloadHash(parsed.data.signedPayload));
    if (claim === "done") return NextResponse.json({ received: true, duplicate: true });
    if (claim === "busy") return NextResponse.json({ error: "Händelsen hanteras redan" }, { status: 409 });

    try {
      if (notification.data?.signedTransactionInfo) {
        const transaction = await verifySignedAppStoreTransaction(
          notification.data.signedTransactionInfo,
        );
        await syncStoreKitTransaction(transaction);
      } else if (
        notification.data?.signedRenewalInfo &&
        isStoreKitRevocationNotification(notificationType)
      ) {
        const renewal = await verifySignedAppStoreRenewal(
          notification.data.signedRenewalInfo,
        );
        if (renewal.originalTransactionId) {
          await revokeStoreKitEntitlement(String(renewal.originalTransactionId), notificationType);
        }
      }
      await finishWebhook("apple", eventId, "processed");
      return NextResponse.json({ received: true });
    } catch (handlerError) {
      await finishWebhook("apple", eventId, "failed", handlerError instanceof Error ? handlerError.message : String(handlerError)).catch(() => {});
      throw handlerError;
    }
  } catch (error) {
    console.error("[app-store-webhook]", error);
    return NextResponse.json(
      { error: "Notification verification failed" },
      { status: 400 },
    );
  }
}
