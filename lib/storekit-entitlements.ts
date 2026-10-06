import "server-only";

import type { JWSTransactionDecodedPayload } from "@apple/app-store-server-library";
import type { Plan } from "@/lib/access-rules";
import { planForProduct } from "@/lib/app-store";
import { createServerClient } from "@/lib/supabase";
import { applyBillingEvent } from "@/lib/billing/apply";
import { normalizeAppleTransaction } from "@/lib/billing/apple-normalize";
import { projectEntitlementsToClerk } from "@/lib/billing/project";
import type { ApplyResult } from "@/lib/billing/types";

/**
 * Bokför transaktionen i betalningskärnan (prenumeration + belopp + rättighet) och projicera
 * rättigheterna till Clerk. Den gamla "högsta av stripe/storekit"-planen är borta: rättigheterna
 * räknas ur ALLA prenumerationer, oavsett butik.
 */
async function applyAndProject(transaction: JWSTransactionDecodedPayload, clerkUserId: string): Promise<Plan> {
  const normalized = normalizeAppleTransaction(transaction, clerkUserId);
  if (!normalized.ok) throw new Error(normalized.reason);

  let last: ApplyResult | null = null;
  for (const event of normalized.value.events) last = await applyBillingEvent(event);
  const entitlements = last?.entitlements ?? {};

  const projected = await projectEntitlementsToClerk(clerkUserId, entitlements);
  return projected?.plan ?? (entitlements.football_elite ? "elite" : entitlements.football_pro ? "pro" : "free");
}

export async function computeStoreKitPlanFromDb(
  clerkUserId: string,
): Promise<Plan> {
  const now = new Date().toISOString();
  const { data: activeEntitlements, error } = await createServerClient()
    .from("app_store_entitlements")
    .select("plan")
    .eq("clerk_user_id", clerkUserId)
    .is("revoked_at", null)
    .or(`expires_at.is.null,expires_at.gt.${now}`);

  if (error) throw error;

  if (activeEntitlements?.some((item) => item.plan === "elite")) return "elite";
  if (activeEntitlements?.some((item) => item.plan === "pro")) return "pro";
  return "free";
}

/** Notistyper som tar bort rättigheten direkt; övriga (EXPIRED …) låter perioden löpa ut som förut. */
const HARD_REVOCATIONS = new Set(["REFUND", "REVOKE", "DID_REVOKE"]);

export async function revokeStoreKitEntitlement(
  originalTransactionId: string,
  notificationType?: string,
): Promise<{ userId: string; storekitPlan: Plan; effectivePlan: Plan } | null> {
  const db = createServerClient();
  const { data: row, error: lookupError } = await db
    .from("app_store_entitlements")
    .select("clerk_user_id,product_id,transaction_id,environment,purchased_at,expires_at")
    .eq("original_transaction_id", originalTransactionId)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (!row?.clerk_user_id) return null;

  const revokedAt = new Date().toISOString();
  const { error: updateError } = await db
    .from("app_store_entitlements")
    .update({ revoked_at: revokedAt, updated_at: revokedAt })
    .eq("original_transaction_id", originalTransactionId);
  if (updateError) throw updateError;

  // Notisen bär bara förnyelseinfo, ingen transaktion: bygg den ur raden vi sparade när köpet verifierades.
  // Utan pris blir det en statusändring, ingen ny finansiell post (belopp hämtas aldrig ur luften).
  const now = Date.now();
  const hard = notificationType ? HARD_REVOCATIONS.has(notificationType) : false;
  const expires = row.expires_at ? Date.parse(row.expires_at) : undefined;
  const stored = {
    productId: row.product_id,
    originalTransactionId,
    transactionId: row.transaction_id,
    environment: row.environment,
    purchaseDate: row.purchased_at ? Date.parse(row.purchased_at) : undefined,
    expiresDate: hard ? expires : Math.min(expires ?? now, now),
    revocationDate: hard ? now : undefined,
    signedDate: now,
  } as JWSTransactionDecodedPayload;
  const effectivePlan = await applyAndProject(stored, row.clerk_user_id);

  return {
    userId: row.clerk_user_id,
    storekitPlan: await computeStoreKitPlanFromDb(row.clerk_user_id),
    effectivePlan,
  };
}

export async function syncStoreKitTransaction(
  transaction: JWSTransactionDecodedPayload,
) {
  const productId = transaction.productId;
  const plan = productId ? planForProduct(productId) : null;
  if (
    !plan ||
    !transaction.originalTransactionId ||
    !transaction.transactionId ||
    !transaction.appAccountToken
  ) {
    throw new Error("Incomplete App Store transaction");
  }

  const { data: account, error: accountError } = await createServerClient()
    .from("app_store_accounts")
    .select("clerk_user_id,app_account_token")
    .eq("app_account_token", transaction.appAccountToken)
    .single();
  if (accountError || !account) {
    throw accountError ?? new Error("Unknown App Store account token");
  }

  const revokedAt =
    transaction.revocationDate || transaction.isUpgraded
      ? new Date(transaction.revocationDate ?? Date.now()).toISOString()
      : null;
  const { error: upsertError } = await createServerClient()
    .from("app_store_entitlements")
    .upsert(
      {
        original_transaction_id: transaction.originalTransactionId,
        transaction_id: transaction.transactionId,
        clerk_user_id: account.clerk_user_id,
        app_account_token: account.app_account_token,
        product_id: productId,
        plan,
        environment: String(transaction.environment ?? "Production"),
        purchased_at: transaction.purchaseDate
          ? new Date(transaction.purchaseDate).toISOString()
          : null,
        expires_at: transaction.expiresDate
          ? new Date(transaction.expiresDate).toISOString()
          : null,
        revoked_at: revokedAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "original_transaction_id" },
    );
  if (upsertError) throw upsertError;

  const storekitPlan = await computeStoreKitPlanFromDb(account.clerk_user_id);
  const effectivePlan = await applyAndProject(transaction, account.clerk_user_id);

  return {
    userId: account.clerk_user_id,
    storekitPlan,
    effectivePlan,
    expiresAt: transaction.expiresDate
      ? new Date(transaction.expiresDate).toISOString()
      : null,
  };
}
