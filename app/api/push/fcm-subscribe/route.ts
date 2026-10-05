import { SPORT } from "@/lib/vertical";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/ratelimit";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { parseBody, z } from "@/lib/validation";

// Android-appens motsvarighet till apns-subscribe. Samma tabell, `platform = 'android'`
// (migration 20261005090000_push_platform). Identiteten kommer ur sessionen, aldrig ur bodyn.

// FCM-registreringstoken: URL-säkra tecken plus kolon, i praktiken 140–200 tecken.
const fcmToken = z.string().regex(/^[A-Za-z0-9_:-]{100,512}$/);

const SubscribeSchema = z.object({
  deviceToken: fcmToken,
  teamIds: z.array(z.string().min(1).max(100)).max(50).default([]),
});

const UnsubscribeSchema = z.object({ deviceToken: fcmToken });

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "DB ej konfigurerad" }, { status: 503 });
  }

  const blocked = await enforceRateLimit("write", req, userId);
  if (blocked) return blocked;

  const parsed = await parseBody(req, SubscribeSchema);
  if (!parsed.ok) return parsed.response;

  const { error } = await createServerClient()
    .from("apns_subscriptions")
    .upsert(
      {
        clerk_user_id: userId,
        device_token: parsed.data.deviceToken,
        team_ids: parsed.data.teamIds,
        sport: SPORT,
        platform: "android",
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "device_token" },
    );

  if (error) {
    console.error("[push/fcm-subscribe POST]", error);
    return NextResponse.json({ error: "Kunde inte registrera enheten" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "DB ej konfigurerad" }, { status: 503 });
  }

  const parsed = await parseBody(req, UnsubscribeSchema);
  if (!parsed.ok) return parsed.response;

  const { error } = await createServerClient()
    .from("apns_subscriptions")
    .delete()
    .eq("clerk_user_id", userId)
    .eq("device_token", parsed.data.deviceToken)
    .eq("sport", SPORT)
    .eq("platform", "android");

  if (error) {
    console.error("[push/fcm-subscribe DELETE]", error);
    return NextResponse.json({ error: "Kunde inte avregistrera enheten" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
