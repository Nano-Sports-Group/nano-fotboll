import { SPORT } from "@/lib/vertical";
/**
 * lib/waitlist/link-user.ts — kopplar ihop waitlist-raden med Clerk-kontot.
 *
 * Clerks `WaitlistEntry` har ingen metadata. Därför äger Clerk bara e-post-
 * identiteten och vi äger allt annat i `public.waitlist`. När kontot väl finns
 * (`user.created`) speglas laget hit — det är först då Clerk har någonstans att
 * lägga det.
 *
 * Onboarding-effekten: `unsafeMetadata.favoriteTeam` sätts men `onboardingDone`
 * lämnas false. Lagsteget hoppas alltså över medan push-steget står kvar. Att
 * markera hela onboardingen klar hade varit mer överraskande — användaren har
 * aldrig sett push-frågan.
 */

import "server-only";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase";


interface LinkedWaitlist {
  favoriteTeam: string | null;
  cohort: "founder" | "regular" | null;
}

type ClerkLike = {
  users: {
    updateUserMetadata: (
      id: string,
      data: { unsafeMetadata?: Record<string, unknown>; publicMetadata?: Record<string, unknown> },
    ) => Promise<unknown>;
  };
};

/**
 * Kopplar waitlist-raden till kontot och speglar laget till Clerk, `profiles`
 * och `user_feed_config`. Allt är best-effort: ett kontoskapande får aldrig
 * misslyckas för att waitlist-speglingen gjorde det.
 */
export async function linkWaitlistToUser(
  clerk: ClerkLike,
  clerkUserId: string,
  email: string | undefined,
): Promise<LinkedWaitlist | null> {
  if (!email || !isSupabaseConfigured()) return null;

  try {
    const db = createServiceClient();
    const { data } = await db
      .from("waitlist")
      .select("id, favorite_team, cohort, status")
      .eq("email", email.toLowerCase())
      .maybeSingle();

    const row = data as
      | { id: string; favorite_team: string | null; cohort: "founder" | "regular" | null; status: string }
      | null;
    if (!row) return null;

    // `completed` = personen har gått hela vägen från kö till konto. Rader som
    // fortfarande väntar på bekräftelse rör vi inte: de har ingen kohort, och
    // ett konto är inte ett dubbel-opt-in-samtycke.
    const nextStatus =
      row.status === "confirmed" || row.status === "invited" ? "completed" : row.status;

    await db
      .from("waitlist")
      .update({ clerk_user_id: clerkUserId, status: nextStatus })
      .eq("id", row.id);

    if (row.favorite_team) {
      await clerk.users.updateUserMetadata(clerkUserId, {
        unsafeMetadata: { favoriteTeam: row.favorite_team },
        publicMetadata: { founderWaitlist: row.cohort === "founder" },
      });

      // Slug → entities.id. Utan uppslaget blir followed_team_ids en slug och
      // flödet tomt; det felet har vi haft förr.
      const { data: entity } = await db
        .from("entities")
        .select("id")
        .eq("sport", SPORT)
        .eq("type", "team")
        .eq("slug", row.favorite_team)
        .maybeSingle();

      const teamId = (entity as { id: string } | null)?.id;
      if (teamId) {
        await db.from("profiles").update({ favourite_team_id: teamId }).eq("clerk_user_id", clerkUserId);
        await db
          .from("user_feed_config")
          .update({ followed_team_ids: [teamId] })
          .eq("clerk_user_id", clerkUserId)
          .eq("sport", SPORT);
      }
    } else {
      await clerk.users.updateUserMetadata(clerkUserId, {
        publicMetadata: { founderWaitlist: row.cohort === "founder" },
      });
    }

    return { favoriteTeam: row.favorite_team, cohort: row.cohort };
  } catch (error) {
    console.error(
      "[waitlist] koppling till konto misslyckades:",
      error instanceof Error ? error.message : "okänt fel",
    );
    return null;
  }
}

/**
 * GDPR: `delete_user_account` känner inte till waitlist-tabellen (den kom
 * efteråt). Raden anonymiseras i stället för att raderas — `referred_by` pekar
 * på den, och en kaskadradering skulle tysta bort någon annans värvning.
 */
export async function anonymizeWaitlistForUser(clerkUserId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const db = createServiceClient();
    const { data } = await db
      .from("waitlist")
      .select("id")
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle();
    const row = data as { id: string } | null;
    if (!row) return;

    await db
      .from("waitlist")
      .update({
        email: `deleted-${row.id}@invalid.athopia`,
        name: "",
        clerk_user_id: null,
        clerk_waitlist_id: null,
        confirm_token_hash: null,
        status: "revoked",
      })
      .eq("id", row.id);
  } catch (error) {
    console.error(
      "[waitlist] anonymisering misslyckades:",
      error instanceof Error ? error.message : "okänt fel",
    );
  }
}

/**
 * Speglar Clerks waitlist-status till vår rad. Utan detta desyncar en invite
 * gjord direkt i Clerk Dashboard admin-vyn: Clerk säger "invited", vi säger
 * "confirmed", och någon bjuder in samma person igen.
 */
export async function syncClerkWaitlistEntry(entry: {
  id?: string;
  email_address?: string;
  status?: string;
}): Promise<void> {
  const email = entry.email_address?.toLowerCase();
  if (!email || !isSupabaseConfigured()) return;

  const status = entry.status === "invited" ? "invited" : entry.status === "rejected" ? "revoked" : null;
  if (!status) return;

  try {
    const db = createServiceClient();
    const patch: Record<string, unknown> = { status, clerk_waitlist_id: entry.id ?? null };
    if (status === "invited") patch.invited_at = new Date().toISOString();

    // `completed` är slutstation — en Clerk-invite får inte spola tillbaka
    // någon som redan skapat konto.
    await db.from("waitlist").update(patch).eq("email", email).neq("status", "completed");
  } catch (error) {
    console.error(
      "[waitlist] Clerk-entry-synk misslyckades:",
      error instanceof Error ? error.message : "okänt fel",
    );
  }
}
