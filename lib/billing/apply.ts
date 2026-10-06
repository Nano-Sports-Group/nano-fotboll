import "server-only";

import { createHash } from "node:crypto";
import { billingDb, billingRpc } from "./db";
import type { ApplyResult, BillingEvent, BillingProvider, WebhookClaim, WebhookStatus } from "./types";

/** Hela köpet — prenumeration, post, moms, huvudbok, rättigheter, granskningslogg — i EN databastransaktion. */
export async function applyBillingEvent(event: BillingEvent): Promise<ApplyResult> {
  const result = await billingRpc<ApplyResult | null>("billing_apply_event", { p_event: event });
  if (!result || typeof result !== "object") throw new Error("billing_apply_event returned no result");
  return result;
}

/** sha256 (hex) av råa body — bevis på vad vi fick, inte en nyckel. */
export function payloadHash(rawBody: string): string {
  return createHash("sha256").update(rawBody, "utf8").digest("hex");
}

/** `process` = du äger händelsen, `done` = redan hanterad, `busy` = någon annan håller på. */
export async function claimWebhook(
  provider: BillingProvider,
  eventId: string,
  eventType: string,
  hash: string,
): Promise<WebhookClaim> {
  const claim = await billingRpc<string>("billing_claim_webhook", {
    p_provider: provider,
    p_event_id: eventId,
    p_type: eventType,
    p_hash: hash,
  });
  if (claim !== "process" && claim !== "done" && claim !== "busy") {
    throw new Error(`billing_claim_webhook: oväntat svar ${String(claim)}`);
  }
  return claim;
}

export async function finishWebhook(
  provider: BillingProvider,
  eventId: string,
  status: WebhookStatus,
  error?: string,
): Promise<void> {
  await billingRpc("billing_finish_webhook", {
    p_provider: provider,
    p_event_id: eventId,
    p_status: status,
    p_error: error ? error.slice(0, 500) : null,
  });
}

/**
 * Granskningsnotering för något vi medvetet hoppade över (okänd produkt, okänd ägare). Bäst-möjligt:
 * ett fel här får aldrig fälla webhooken — loggraden i konsolen finns kvar.
 */
export async function auditNote(
  actor: string,
  action: string,
  subjectId: string,
  detail: Record<string, unknown>,
): Promise<void> {
  try {
    const { error } = await billingDb()
      .from("audit_logs")
      .insert({ actor, action, subject_type: "webhook_event", subject_id: subjectId, after: detail });
    if (error) console.error("[billing] audit_logs:", error.message);
  } catch (error) {
    console.error("[billing] audit_logs:", error instanceof Error ? error.message : "okänt fel");
  }
}
