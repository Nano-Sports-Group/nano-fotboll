import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import { markNewsletterPlanDirty } from "@/lib/newsletter/service";
import { billingDb } from "./db";
import { entitlementsToClerkPlans } from "./clerk-plans";
import type { EntitlementMap } from "./types";

/**
 * DEN ENDA platsen som skriver `publicMetadata.plan` och `publicMetadata.plans.hockey`.
 * Clerk-metadatan är en projektion av `user_entitlements`, aldrig sanningen: stämmer den inte
 * räknas den om här (webhook, cron-svepet eller en admin-åtgärd). `getUserPlan()` läser den
 * som förut.
 *
 * Skriver bara när något ändrats, och rör aldrig `plans.maps` / `plans.tv`.
 */
export async function projectEntitlementsToClerk(
  clerkUserId: string,
  entitlements: Partial<EntitlementMap>,
): Promise<{ changed: boolean; plan: "free" | "pro" | "elite" } | null> {
  const startedAt = new Date().toISOString();
  const clerk = await clerkClient();

  let user;
  try {
    user = await clerk.users.getUser(clerkUserId);
  } catch (error) {
    // Raderat Clerk-konto: det finns inget att projicera till, och en retry ändrar inget.
    if ((error as { status?: number }).status === 404) {
      console.warn(`[billing] projektion hoppad: Clerk-användaren finns inte (${clerkUserId})`);
      await clearDirty(clerkUserId, startedAt);
      return null;
    }
    throw error;
  }

  const projection = entitlementsToClerkPlans(entitlements, user.publicMetadata as Record<string, unknown>);

  if (projection.changed) {
    await clerk.users.updateUserMetadata(clerkUserId, {
      publicMetadata: {
        ...(projection.footballChanged ? { plan: projection.plan } : {}),
        ...(projection.hockeyChanged ? { plans: projection.plans } : {}),
      },
    });
  }

  if (projection.footballChanged) {
    try {
      await markNewsletterPlanDirty(clerkUserId, projection.plan);
    } catch (error) {
      console.error("[billing] newsletter dirty mark failed", error instanceof Error ? error.message : "unknown");
    }
  }

  await clearDirty(clerkUserId, startedAt);
  return { changed: projection.changed, plan: projection.plan };
}

/** Bara märkningar som fanns FÖRE projektionen släcks — en ny ändring under tiden ska projiceras igen. */
async function clearDirty(clerkUserId: string, startedAt: string): Promise<void> {
  const { error } = await billingDb()
    .from("billing_users")
    .update({ projection_dirty_at: null })
    .eq("clerk_user_id", clerkUserId)
    .lte("projection_dirty_at", startedAt);
  if (error) console.error("[billing] kunde inte släcka projection_dirty_at:", error.message);
}
