import "server-only";

import { billingDb } from "./db";
import { entitlementMapFrom, type EntitlementMap } from "./types";

/**
 * Användarens aktiva rättigheter ur `user_entitlements` (aktiv och inte utgången).
 * Kastar vid databasfel — rutten svarar 503. Aldrig "sant som standard": en blinkning i
 * databasen får inte ge gratis PRO, och inte heller ta bort betald åtkomst tyst.
 */
export async function getEntitlements(clerkUserId: string): Promise<EntitlementMap> {
  const db = billingDb();

  const { data: user, error: userError } = await db
    .from("billing_users")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (userError) throw new Error(`billing_users: ${userError.message}`);
  if (!user) return entitlementMapFrom([]);

  const now = new Date().toISOString();
  const { data: rows, error } = await db
    .from("user_entitlements")
    .select("entitlement")
    .eq("user_id", (user as { id: string }).id)
    .eq("status", "active")
    .or(`valid_until.is.null,valid_until.gt.${now}`);
  if (error) throw new Error(`user_entitlements: ${error.message}`);

  return entitlementMapFrom(((rows ?? []) as { entitlement: string }[]).map((r) => r.entitlement));
}
