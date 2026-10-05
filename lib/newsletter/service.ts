import "server-only";

import { createHash } from "crypto";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createServiceClient } from "@/lib/supabase";
import { logFunnelEvent } from "@/lib/funnel";
import { sendNewsletterConfirmEmail } from "@/lib/newsletter/email";
import { newsletterTokenSecret, verifyNewsletterToken } from "@/lib/newsletter/token";
import {
  NEWSLETTER_POLICY_VERSION,
  NEWSLETTER_SPORT,
  newsletterIdentityFromClerk,
  normalizeNewsletterPlan,
  type NewsletterCadence,
  type NewsletterPreferencesPatch,
} from "@/lib/newsletter/schema";

type SubscriberRow =
  Database["public"]["Tables"]["newsletter_subscribers"]["Row"];
type PreferenceRow =
  Database["public"]["Tables"]["newsletter_preferences"]["Row"];
type Database = import("@/types/supabase").Database;

export interface NewsletterTeam {
  id: string;
  slug: string;
  name: string;
}

export interface NewsletterIdentity {
  clerkUserId: string | null;
  email: string;
  plan: "free" | "pro" | "elite";
}

export async function resolveNewsletterIdentity(
  anonymousEmail?: string,
): Promise<NewsletterIdentity | null> {
  const { userId } = await auth();
  if (!userId) {
    const email = anonymousEmail?.trim().toLowerCase();
    return email ? { clerkUserId: null, email, plan: "free" } : null;
  }

  const user = await currentUser();
  if (!user) return null;
  return newsletterIdentityFromClerk({
    id: user.id,
    primaryEmailAddressId: user.primaryEmailAddressId,
    emailAddresses: user.emailAddresses.map((address) => ({
      id: address.id,
      emailAddress: address.emailAddress,
    })),
    publicMetadata: user.publicMetadata as Record<string, unknown>,
  });
}

export async function getNewsletterTeamBySlug(
  teamSlug: string,
): Promise<NewsletterTeam | null> {
  const { data, error } = await createServiceClient()
    .from("entities")
    .select("id,slug,name")
    .eq("sport", NEWSLETTER_SPORT)
    .eq("type", "team")
    .eq("slug", teamSlug)
    .maybeSingle();
  if (error) throw new Error(`Newsletter team lookup failed: ${error.message}`);
  if (!data?.id || !data.slug) return null;
  return { id: String(data.id), slug: String(data.slug), name: String(data.name) };
}

export function newsletterRequestFingerprint(req: Request): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

export function newsletterEmailHash(email: string): string {
  return createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex");
}

export async function subscribeToNewsletter(input: {
  identity: NewsletterIdentity;
  team: NewsletterTeam;
  cadence: NewsletterCadence;
  request: Request;
  source?: string;
}): Promise<{ state: "pending" | "duplicate" }> {
  const db = createServiceClient();
  const now = new Date().toISOString();
  const source = input.source ?? "web_team_landing";
  const existing = await findSubscriber(
    input.identity.clerkUserId,
    input.identity.email,
  );

  let subscriber: SubscriberRow;
  if (existing) {
    const nextStatus =
      existing.status === "unsubscribed"
        ? "pending_confirmation"
        : existing.status;
    const { data, error } = await db
      .from("newsletter_subscribers")
      .update({
        email: input.identity.email,
        clerk_user_id: input.identity.clerkUserId ?? existing.clerk_user_id,
        plan_snapshot: input.identity.plan,
        consent_at: now,
        consent_source: source,
        consent_policy_version: NEWSLETTER_POLICY_VERSION,
        status: nextStatus,
        unsubscribed_at:
          nextStatus === "pending_confirmation" ? null : existing.unsubscribed_at,
        sync_status: "pending",
        last_sync_error: null,
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error || !data) {
      throw new Error(`Newsletter subscriber update failed: ${error?.message}`);
    }
    subscriber = data;
  } else {
    const { data, error } = await db
      .from("newsletter_subscribers")
      .insert({
        email: input.identity.email,
        clerk_user_id: input.identity.clerkUserId,
        plan_snapshot: input.identity.plan,
        consent_at: now,
        consent_source: source,
        consent_policy_version: NEWSLETTER_POLICY_VERSION,
        status: "pending_confirmation",
        sync_status: "pending",
      })
      .select("*")
      .single();
    if (error || !data) {
      throw new Error(`Newsletter subscriber insert failed: ${error?.message}`);
    }
    subscriber = data;
  }

  const { data: existingPreference, error: preferenceReadError } = await db
    .from("newsletter_preferences")
    .select("*")
    .eq("subscriber_id", subscriber.id)
    .eq("sport", NEWSLETTER_SPORT)
    .eq("edition", "team_brief")
    .eq("is_primary", true)
    .maybeSingle();
  if (preferenceReadError) {
    throw new Error(
      `Newsletter preference lookup failed: ${preferenceReadError.message}`,
    );
  }

  const duplicate =
    !!existing &&
    existing.status !== "unsubscribed" &&
    existingPreference?.team_entity_id === input.team.id &&
    existingPreference.cadence === input.cadence &&
    existingPreference.enabled;

  if (existingPreference) {
    const { error } = await db
      .from("newsletter_preferences")
      .update({
        team_entity_id: input.team.id,
        cadence: input.cadence,
        enabled: true,
      })
      .eq("id", existingPreference.id);
    if (error) {
      throw new Error(`Newsletter preference update failed: ${error.message}`);
    }
  } else {
    const { error } = await db.from("newsletter_preferences").insert({
      subscriber_id: subscriber.id,
      sport: NEWSLETTER_SPORT,
      team_entity_id: input.team.id,
      cadence: input.cadence,
      edition: "team_brief",
      enabled: true,
      is_primary: true,
      follow_profile_team: !!input.identity.clerkUserId,
    });
    if (error) {
      throw new Error(`Newsletter preference insert failed: ${error.message}`);
    }
  }

  const { error: consentError } = await db
    .from("newsletter_consent_events")
    .insert({
      subscriber_id: subscriber.id,
      event_type: "consent_submitted",
      source,
      policy_version: NEWSLETTER_POLICY_VERSION,
      email_hash: newsletterEmailHash(input.identity.email),
      request_fingerprint: newsletterRequestFingerprint(input.request),
      metadata: {
        sport: NEWSLETTER_SPORT,
        team_slug: input.team.slug,
        cadence: input.cadence,
      },
    });
  if (consentError) {
    throw new Error(`Newsletter consent audit failed: ${consentError.message}`);
  }

  if (!duplicate) {
    await logFunnelEvent("newsletter_signup_pending", input.identity.clerkUserId, {
      team_slug: input.team.slug,
    });
  }

  // Dubbel bekräftelse: inget brev skickas förrän adressen är bekräftad. Mejlet går även vid en
  // upprepad anmälan — den som tappat bort det första ska kunna be om ett nytt.
  if (subscriber.status === "pending_confirmation") {
    const mail = await sendNewsletterConfirmEmail(input.identity.email, subscriber.id, input.team.name);
    if (mail.sent) {
      await db.from("newsletter_consent_events").insert({
        subscriber_id: subscriber.id,
        event_type: "confirmation_requested",
        source,
        policy_version: NEWSLETTER_POLICY_VERSION,
        email_hash: newsletterEmailHash(input.identity.email),
        metadata: { sport: NEWSLETTER_SPORT, team_slug: input.team.slug },
      });
    }
  }

  return { state: duplicate ? "duplicate" : "pending" };
}

export type NewsletterTokenOutcome = "ok" | "already" | "invalid";

async function subscriberForToken(
  purpose: "confirm" | "unsubscribe",
  token: string,
): Promise<SubscriberRow | null> {
  const id = verifyNewsletterToken(newsletterTokenSecret(), purpose, token);
  if (!id) return null;
  const { data } = await createServiceClient()
    .from("newsletter_subscribers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data ?? null;
}

/** Läser bara: vad skulle hända om länken användes? Länkskannrar får inte bekräfta eller avsluta något. */
export async function peekNewsletterToken(
  purpose: "confirm" | "unsubscribe",
  token: string,
): Promise<NewsletterTokenOutcome> {
  const subscriber = await subscriberForToken(purpose, token);
  if (!subscriber) return "invalid";
  if (purpose === "confirm") return subscriber.status === "pending_confirmation" ? "ok" : subscriber.status === "active" ? "already" : "invalid";
  return subscriber.status === "unsubscribed" ? "already" : "ok";
}

/** Bekräftar adressen. Bara en obekräftad prenumerant blir aktiv — en avslutad väcks aldrig av en gammal länk. */
export async function confirmNewsletterByToken(token: string): Promise<NewsletterTokenOutcome> {
  const subscriber = await subscriberForToken("confirm", token);
  if (!subscriber) return "invalid";
  if (subscriber.status === "active") return "already";
  if (subscriber.status !== "pending_confirmation") return "invalid";
  const db = createServiceClient();
  const now = new Date().toISOString();
  const { error } = await db
    .from("newsletter_subscribers")
    .update({ status: "active", confirmed_at: now, sync_status: "synced", last_sync_error: null })
    .eq("id", subscriber.id)
    .eq("status", "pending_confirmation");
  if (error) throw new Error(`Newsletter confirm failed: ${error.message}`);
  await db.from("newsletter_consent_events").insert({
    subscriber_id: subscriber.id,
    event_type: "confirmed",
    source: "email_link",
    policy_version: NEWSLETTER_POLICY_VERSION,
    email_hash: newsletterEmailHash(String(subscriber.email)),
    metadata: { sport: NEWSLETTER_SPORT },
  });
  await logFunnelEvent("newsletter_confirmed", subscriber.clerk_user_id, {});
  return "ok";
}

/** Avslutar via länken i ett brev, utan inloggning. Går att göra om utan att något händer. */
export async function unsubscribeNewsletterByToken(token: string): Promise<NewsletterTokenOutcome> {
  const subscriber = await subscriberForToken("unsubscribe", token);
  if (!subscriber) return "invalid";
  if (subscriber.status === "unsubscribed") return "already";
  const db = createServiceClient();
  const now = new Date().toISOString();
  const { error: preferenceError } = await db
    .from("newsletter_preferences")
    .update({ enabled: false })
    .eq("subscriber_id", subscriber.id);
  if (preferenceError) throw new Error(`Newsletter disable failed: ${preferenceError.message}`);
  const { error } = await db
    .from("newsletter_subscribers")
    .update({ status: "unsubscribed", unsubscribed_at: now, sync_status: "synced", last_sync_error: null })
    .eq("id", subscriber.id);
  if (error) throw new Error(`Newsletter unsubscribe failed: ${error.message}`);
  await db.from("newsletter_consent_events").insert({
    subscriber_id: subscriber.id,
    event_type: "unsubscribed",
    source: "email_link",
    policy_version: NEWSLETTER_POLICY_VERSION,
    email_hash: newsletterEmailHash(String(subscriber.email)),
    metadata: { sport: NEWSLETTER_SPORT },
  });
  return "ok";
}

/** Studs eller klagomål från Resend: adressen får aldrig fler brev. */
export async function markNewsletterUndeliverable(email: string, status: "bounced" | "complained"): Promise<boolean> {
  const { data, error } = await createServiceClient()
    .from("newsletter_subscribers")
    .update({ status, sync_status: "synced", last_sync_error: null })
    .eq("email", email.trim().toLowerCase())
    .in("status", ["active", "pending_confirmation", "paused"])
    .select("id");
  if (error) throw new Error(`Newsletter undeliverable mark failed: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

export async function getOwnNewsletterPreferences(
  clerkUserId: string,
): Promise<{
  subscriber: SubscriberRow;
  preference: PreferenceRow;
  team: NewsletterTeam | null;
} | null> {
  const db = createServiceClient();
  const { data: subscriber, error } = await db
    .from("newsletter_subscribers")
    .select("*")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (error) throw new Error(`Newsletter subscriber read failed: ${error.message}`);
  if (!subscriber) return null;

  const { data: preference, error: preferenceError } = await db
    .from("newsletter_preferences")
    .select("*")
    .eq("subscriber_id", subscriber.id)
    .eq("sport", NEWSLETTER_SPORT)
    .eq("edition", "team_brief")
    .eq("is_primary", true)
    .maybeSingle();
  if (preferenceError) {
    throw new Error(`Newsletter preference read failed: ${preferenceError.message}`);
  }
  if (!preference) return null;

  const { data: team, error: teamError } = await db
    .from("entities")
    .select("id,slug,name")
    .eq("sport", NEWSLETTER_SPORT)
    .eq("type", "team")
    .eq("id", preference.team_entity_id)
    .maybeSingle();
  if (teamError) throw new Error(`Newsletter team read failed: ${teamError.message}`);

  return {
    subscriber,
    preference,
    team:
      team?.slug && team.id
        ? { id: String(team.id), slug: String(team.slug), name: String(team.name) }
        : null,
  };
}

export async function patchOwnNewsletterPreferences(
  clerkUserId: string,
  patch: NewsletterPreferencesPatch,
): Promise<void> {
  const current = await getOwnNewsletterPreferences(clerkUserId);
  if (!current) throw new NewsletterNotFoundError();

  let teamEntityId = current.preference.team_entity_id;
  if (patch.teamSlug) {
    const team = await getNewsletterTeamBySlug(patch.teamSlug);
    if (!team) throw new NewsletterTeamNotFoundError();
    teamEntityId = team.id;
  } else if (patch.followProfileTeam === true) {
    const profileTeamId = await getProfileTeamId(clerkUserId);
    if (profileTeamId) teamEntityId = profileTeamId;
  }

  const db = createServiceClient();
  const { error } = await db
    .from("newsletter_preferences")
    .update({
      team_entity_id: teamEntityId,
      ...(patch.cadence !== undefined ? { cadence: patch.cadence } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.followProfileTeam !== undefined
        ? { follow_profile_team: patch.followProfileTeam }
        : {}),
    })
    .eq("id", current.preference.id);
  if (error) throw new Error(`Newsletter preference patch failed: ${error.message}`);

  const subscriberUpdate: Database["public"]["Tables"]["newsletter_subscribers"]["Update"] = {
    sync_status: "pending",
    last_sync_error: null,
  };
  if (patch.enabled === false) {
    subscriberUpdate.status = "paused";
  } else if (patch.enabled === true && current.subscriber.status === "paused") {
    subscriberUpdate.status = "active";
  }
  const { error: subscriberError } = await db
    .from("newsletter_subscribers")
    .update(subscriberUpdate)
    .eq("id", current.subscriber.id);
  if (subscriberError) {
    throw new Error(`Newsletter subscriber dirty mark failed: ${subscriberError.message}`);
  }
  await logFunnelEvent("newsletter_preference_changed", clerkUserId, {
    cadence: patch.cadence ?? current.preference.cadence,
    enabled: patch.enabled ?? current.preference.enabled,
  });
}

export async function unsubscribeOwnNewsletter(clerkUserId: string): Promise<void> {
  const current = await getOwnNewsletterPreferences(clerkUserId);
  if (!current) return;
  const db = createServiceClient();
  const now = new Date().toISOString();
  const { error: preferenceError } = await db
    .from("newsletter_preferences")
    .update({ enabled: false })
    .eq("subscriber_id", current.subscriber.id)
    .eq("sport", NEWSLETTER_SPORT);
  if (preferenceError) {
    throw new Error(`Newsletter disable failed: ${preferenceError.message}`);
  }
  const { error } = await db
    .from("newsletter_subscribers")
    .update({
      status: "unsubscribed",
      unsubscribed_at: now,
      sync_status: "pending",
      last_sync_error: null,
    })
    .eq("id", current.subscriber.id);
  if (error) throw new Error(`Newsletter unsubscribe failed: ${error.message}`);
}

export async function linkNewsletterIdentity(input: {
  clerkUserId: string;
  email: string;
  plan: unknown;
}): Promise<void> {
  const subscriber = await findSubscriber(input.clerkUserId, input.email);
  if (!subscriber) return;
  const { error } = await createServiceClient()
    .from("newsletter_subscribers")
    .update({
      clerk_user_id: input.clerkUserId,
      email: input.email.trim().toLowerCase(),
      plan_snapshot: normalizeNewsletterPlan(input.plan),
      sync_status: "pending",
      last_sync_error: null,
    })
    .eq("id", subscriber.id);
  if (error) throw new Error(`Newsletter identity link failed: ${error.message}`);
  await logFunnelEvent("newsletter_to_account", input.clerkUserId, {
    team_linked: true,
  });
}

export async function markNewsletterPlanDirty(
  clerkUserId: string,
  plan: unknown,
): Promise<void> {
  const { error } = await createServiceClient()
    .from("newsletter_subscribers")
    .update({
      plan_snapshot: normalizeNewsletterPlan(plan),
      sync_status: "pending",
      last_sync_error: null,
    })
    .eq("clerk_user_id", clerkUserId);
  if (error) throw new Error(`Newsletter plan dirty mark failed: ${error.message}`);
  const nextPlan = normalizeNewsletterPlan(plan);
  if (nextPlan === "pro" || nextPlan === "elite") {
    await logFunnelEvent("newsletter_to_pro", clerkUserId, { plan: nextPlan });
  }
}

export async function syncNewsletterProfileTeam(
  clerkUserId: string,
  teamEntityId: string | null,
): Promise<void> {
  if (!teamEntityId) return;
  const { data: subscriber, error } = await createServiceClient()
    .from("newsletter_subscribers")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (error) throw new Error(`Newsletter profile sync lookup failed: ${error.message}`);
  if (!subscriber) return;

  const db = createServiceClient();
  const { data: changed, error: preferenceError } = await db
    .from("newsletter_preferences")
    .update({ team_entity_id: teamEntityId })
    .eq("subscriber_id", subscriber.id)
    .eq("sport", NEWSLETTER_SPORT)
    .eq("follow_profile_team", true)
    .select("id");
  if (preferenceError) {
    throw new Error(`Newsletter profile team sync failed: ${preferenceError.message}`);
  }
  if (!changed?.length) return;
  const { error: dirtyError } = await db
    .from("newsletter_subscribers")
    .update({ sync_status: "pending", last_sync_error: null })
    .eq("id", subscriber.id);
  if (dirtyError) {
    throw new Error(`Newsletter profile dirty mark failed: ${dirtyError.message}`);
  }
}

async function findSubscriber(
  clerkUserId: string | null,
  email: string,
): Promise<SubscriberRow | null> {
  const db = createServiceClient();
  if (clerkUserId) {
    const { data, error } = await db
      .from("newsletter_subscribers")
      .select("*")
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle();
    if (error) throw new Error(`Newsletter identity lookup failed: ${error.message}`);
    if (data) return data;
  }
  const { data, error } = await db
    .from("newsletter_subscribers")
    .select("*")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`Newsletter email lookup failed: ${error.message}`);
  return data;
}

async function getProfileTeamId(clerkUserId: string): Promise<string | null> {
  const { data, error } = await createServiceClient()
    .from("profiles")
    .select("favourite_team_id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (error) throw new Error(`Newsletter profile team lookup failed: ${error.message}`);
  return data?.favourite_team_id ? String(data.favourite_team_id) : null;
}

export class NewsletterNotFoundError extends Error {}
export class NewsletterTeamNotFoundError extends Error {}
