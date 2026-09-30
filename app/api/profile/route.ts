import { SPORT, vertical, VERTICAL } from "@/lib/vertical";
import { favoriteFromMeta, withFavorite } from "@/lib/favorite-meta";
import { planForVertical } from "@/lib/plan-for-vertical";
import { auth, currentUser, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { enforceRateLimit } from "@/lib/ratelimit";
import { sanitizeInline } from "@/lib/sanitize";
import { parseBody, z } from "@/lib/validation";
import { jsonContract } from "@/lib/api-contract";
import { SessionProfileResponseSchema } from "@/lib/api-schemas";
import { syncNewsletterProfileTeam } from "@/lib/newsletter/service";

const DeleteAccountSchema = z.object({
  confirmation: z.literal("RADERA"),
});

// GET /api/profile — egen fullständig profil (privat)
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await currentUser();
  if (!isSupabaseConfigured()) return NextResponse.json({ profile: null });

  const { data } = await createServerClient()
    .from("profiles")
    .select("*")
    .eq("clerk_user_id", userId)
    .maybeSingle();
  // Fotbollens favorit bor i profiles.favourite_team_id; hockeyns i Clerk (lib/favorite-meta).
  const favouriteTeamId = VERTICAL === "football" ? data?.favourite_team_id : null;
  const hockeyFavourite =
    VERTICAL === "football" ? null : favoriteFromMeta(user?.unsafeMetadata as Record<string, unknown>, VERTICAL) ?? null;
  const { data: favouriteTeam } = favouriteTeamId
    ? await createServerClient()
        .from("entities")
        .select("slug")
        .eq("id", favouriteTeamId)
        .eq("type", "team")
        .eq("sport", SPORT).eq("metadata->>league", vertical.leagueEntity)
        .maybeSingle()
    : { data: null };

  return jsonContract(SessionProfileResponseSchema, {
    profile: data ?? null,
    favouriteTeamSlug: favouriteTeam?.slug ?? hockeyFavourite,
    email: user?.emailAddresses?.[0]?.emailAddress ?? null,
    firstName: user?.firstName ?? null,
    lastName: user?.lastName ?? null,
    imageUrl: user?.imageUrl ?? null,
    plan: planForVertical(VERTICAL, user?.publicMetadata),
  });
}

// PATCH /api/profile — uppdatera egen profil, sync till Clerk + spegla till profiles
export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "DB ej konfigurerad" }, { status: 500 });

  const blocked = await enforceRateLimit("write", req, userId);
  if (blocked) return blocked;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const nickname = typeof body.nickname === "string" ? sanitizeInline(body.nickname) : undefined;
  const bio = typeof body.bio === "string" ? sanitizeInline(body.bio).slice(0, 280) : undefined;
  const firstName = typeof body.firstName === "string" ? body.firstName.trim() : undefined;
  const lastName = typeof body.lastName === "string" ? body.lastName.trim() : undefined;
  const avatarUrl = typeof body.avatar_url === "string" ? body.avatar_url : undefined;
  const favouriteTeamInput =
    typeof body.favourite_team_id === "string"
      ? body.favourite_team_id.trim()
      : undefined;

  // Nickname-validering + unikhet (case-insensitivt, exkl. en själv)
  if (nickname !== undefined && nickname.length > 0) {
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(nickname)) {
      return NextResponse.json(
        { error: "Nickname: 3–20 tecken, endast bokstäver, siffror och _" },
        { status: 400 }
      );
    }
    const { data: taken } = await createServerClient()
      .from("profiles")
      .select("clerk_user_id")
      .ilike("nickname", nickname)
      .neq("clerk_user_id", userId)
      .maybeSingle();
    if (taken) {
      return NextResponse.json({ error: "Nickname är upptaget", field: "nickname" }, { status: 409 });
    }
  }

  let favouriteTeam:
    | { id: string; slug: string }
    | null
    | undefined;
  if (favouriteTeamInput !== undefined) {
    if (!favouriteTeamInput) {
      favouriteTeam = null;
    } else {
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          favouriteTeamInput,
        );
      let teamQuery = createServerClient()
        .from("entities")
        .select("id,slug")
        .eq("type", "team")
        .eq("sport", SPORT).eq("metadata->>league", vertical.leagueEntity);
      teamQuery = isUuid
        ? teamQuery.eq("id", favouriteTeamInput)
        : teamQuery.eq("slug", favouriteTeamInput);
      const { data: team } = await teamQuery.maybeSingle();
      if (!team?.id || !team.slug) {
        return NextResponse.json(
          { error: "Laget hittades inte", field: "favourite_team_id" },
          { status: 400 },
        );
      }
      favouriteTeam = { id: String(team.id), slug: String(team.slug) };
    }
  }

  // Sync namn till Clerk (sanning för auth-fält)
  if (firstName !== undefined || lastName !== undefined) {
    try {
      const client = await clerkClient();
      await client.users.updateUser(userId, {
        ...(firstName !== undefined ? { firstName } : {}),
        ...(lastName !== undefined ? { lastName } : {}),
      });
    } catch {
      return NextResponse.json({ error: "Kunde inte uppdatera namn i Clerk" }, { status: 502 });
    }
  }

  // Spegla publika fält till profiles
  const user = await currentUser();
  const update: Record<string, unknown> = {
    clerk_user_id: userId,
    display_name:
      [firstName ?? user?.firstName, lastName ?? user?.lastName].filter(Boolean).join(" ") || null,
  };
  if (nickname !== undefined) update.nickname = nickname || null;
  if (bio !== undefined) update.bio = bio || null;
  if (avatarUrl !== undefined) update.avatar_url = avatarUrl;
  if (favouriteTeam !== undefined && VERTICAL === "football") {
    update.favourite_team_id = favouriteTeam?.id ?? null;
  }

  const { error } = await createServerClient().from("profiles").upsert(update, { onConflict: "clerk_user_id" });
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Nickname är upptaget", field: "nickname" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (favouriteTeam !== undefined) {
    try {
      const client = await clerkClient();
      const unsafeMetadata = withFavorite(
        user?.unsafeMetadata as Record<string, unknown> | undefined,
        VERTICAL,
        favouriteTeam?.slug ?? null,
      );
      await client.users.updateUserMetadata(userId, { unsafeMetadata });
    } catch {
      return NextResponse.json(
        { error: "Laget sparades men kunde inte synkas till kontot" },
        { status: 502 },
      );
    }

    const { error: feedConfigError } = await createServerClient()
      .from("user_feed_config")
      .upsert(
        {
          clerk_user_id: userId,
          sport: SPORT,
          followed_team_ids: favouriteTeam ? [favouriteTeam.id] : [],
        },
        { onConflict: "clerk_user_id,sport" },
      );
    if (feedConfigError) {
      console.error("[profile PATCH] favorite team feed sync:", feedConfigError);
    }
    try {
      await syncNewsletterProfileTeam(userId, favouriteTeam?.id ?? null);
    } catch (newsletterError) {
      console.error(
        "[profile PATCH] newsletter team sync:",
        newsletterError instanceof Error ? newsletterError.message : "unknown",
      );
    }
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/profile — permanent account deletion for web and iOS.
export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "DB ej konfigurerad" }, { status: 503 });
  }

  const blocked = await enforceRateLimit("write", req, userId);
  if (blocked) return blocked;

  const parsed = await parseBody(req, DeleteAccountSchema);
  if (!parsed.ok) return parsed.response;

  const { error } = await createServerClient().rpc("delete_user_account", {
    p_clerk_user_id: userId,
  });
  if (error) {
    console.error("[profile DELETE] delete_user_account:", error);
    return NextResponse.json(
      { error: "Kunde inte radera kontodata", code: "account_delete_failed" },
      { status: 500 },
    );
  }

  if (process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: "2026-04-22.dahlia",
      });
      const customers = await stripe.customers.search({
        query: `metadata['clerkUserId']:'${userId}'`,
      });
      for (const customer of customers.data) {
        await stripe.customers.del(customer.id);
      }
    } catch (stripeError) {
      console.error("[profile DELETE] Stripe:", stripeError);
      return NextResponse.json(
        {
          error: "Kontodata raderades men betalningsprofilen kunde inte avslutas.",
          code: "stripe_deletion_failed",
        },
        { status: 502 },
      );
    }
  }

  try {
    const client = await clerkClient();
    await client.users.deleteUser(userId);
  } catch (error) {
    console.error("[profile DELETE] Clerk:", error);
    return NextResponse.json(
      {
        error: "Kontodata raderades, men inloggningskontot kunde inte avslutas. Försök igen.",
        code: "identity_delete_failed",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, deleted: true });
}
